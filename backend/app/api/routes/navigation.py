import re
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.models.project import FloorPlan, Project
from app.models.spatial import SpatialEdge, SpatialNode
from app.schemas.navigation import (
    DestinationItem,
    DestinationMatchRequest,
    DestinationMatchResponse,
    RouteRequest,
    RouteResult,
)
from app.services.navigation.router import find_accessible_route

router = APIRouter()


@router.post("/route", response_model=RouteResult, summary="Calculate accessible indoor route")
def calculate_route(payload: RouteRequest, db: Session = Depends(get_db)):
    nodes = db.query(SpatialNode).filter(SpatialNode.project_id == payload.project_id).all()
    edges = db.query(SpatialEdge).filter(SpatialEdge.project_id == payload.project_id).all()

    if not nodes:
        raise HTTPException(
            status_code=404,
            detail="No spatial nodes found for this project. Ensure the floor plan has been analyzed and confirmed.",
        )

    # Check if scale is calibrated on associated floor plans
    fps = db.query(FloorPlan).filter(FloorPlan.project_id == payload.project_id).all()
    is_scale_calibrated = any(fp.is_scale_calibrated for fp in fps) if fps else True

    try:
        result = find_accessible_route(
            nodes=nodes,
            edges=edges,
            start_node_id=payload.start_node_id,
            destination_node_id=payload.destination_node_id,
            accessible_only=payload.accessible_only,
            verified_only=payload.verified_only,
            is_scale_calibrated=is_scale_calibrated,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{project_id}/destinations", response_model=List[DestinationItem], summary="List verified destinations for voice selection")
def get_verified_destinations(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    # Strictly filter human-verified nodes as safe navigation destinations
    nodes = (
        db.query(SpatialNode)
        .filter(SpatialNode.project_id == project_id, SpatialNode.is_user_verified == True)
        .all()
    )

    items: List[DestinationItem] = []
    for n in nodes:
        # Build phonetic / voice aliases
        aliases = [n.label.lower()]
        if n.room_number:
            aliases.append(n.room_number.lower())
            aliases.append(f"room {n.room_number.lower()}")
            # Spell out numbers e.g. "101" -> "one zero one"
            num_words = " ".join({"0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine"}.get(c, c) for c in n.room_number)
            aliases.append(f"room {num_words}")
            aliases.append(num_words)

        if n.node_type == "restroom":
            aliases.extend(["bathroom", "washroom", "toilet", "wc"])
        elif n.node_type in ("entrance", "exit"):
            aliases.extend(["door", "way out", "entrance", "exit", "main door"])
        elif n.node_type in ("stairs", "stairwell"):
            aliases.extend(["staircase", "steps"])
        elif n.node_type == "elevator":
            aliases.extend(["lift"])
        elif n.node_type == "reception":
            aliases.extend(["front desk", "help desk", "information"])

        items.append(
            DestinationItem(
                id=n.id,
                label=n.label,
                room_number=n.room_number,
                node_type=n.node_type,
                level_number=n.level_number or 1,
                level_name=n.level_name or "Level 1",
                is_accessible=n.is_accessible,
                spoken_aliases=list(set(aliases)),
            )
        )

    return items


@router.post("/{project_id}/match-destination", response_model=DestinationMatchResponse, summary="Match spoken voice query to verified destinations")
def match_spoken_destination(
    project_id: str,
    payload: DestinationMatchRequest,
    db: Session = Depends(get_db),
):
    query = payload.spoken_query.strip().lower()
    if not query:
        return DestinationMatchResponse(spoken_query=payload.spoken_query, candidates=[], is_ambiguous=False)

    # Normalize query by stripping filler words like "take me to", "navigate to", "go to", "where is"
    clean_query = re.sub(r"^(take me to|navigate to|go to|where is|i want to go to|find)\s+", "", query).strip()

    destinations = get_verified_destinations(project_id, db)
    if not destinations:
        return DestinationMatchResponse(
            spoken_query=payload.spoken_query,
            candidates=[],
            is_ambiguous=False,
            clarification_prompt="No verified destinations exist in this building yet.",
        )

    # 1. Exact or Alias Match
    exact_matches = []
    for d in destinations:
        if clean_query == d.label.lower() or (d.room_number and clean_query == d.room_number.lower()):
            exact_matches.append(d)
        elif any(alias == clean_query for alias in d.spoken_aliases):
            exact_matches.append(d)

    if len(exact_matches) == 1:
        return DestinationMatchResponse(
            spoken_query=payload.spoken_query,
            exact_match=exact_matches[0],
            candidates=exact_matches,
            is_ambiguous=False,
        )
    elif len(exact_matches) > 1:
        labels_str = " and ".join(f"'{m.label}'" for m in exact_matches[:3])
        return DestinationMatchResponse(
            spoken_query=payload.spoken_query,
            exact_match=None,
            candidates=exact_matches,
            is_ambiguous=True,
            clarification_prompt=f"Found multiple matching locations: {labels_str}. Please select which one you want.",
        )

    # 2. Substring & Keyword Matching
    keyword_matches = []
    query_tokens = set(re.findall(r"\w+", clean_query))

    for d in destinations:
        # Check if query is in label or any alias
        if clean_query in d.label.lower() or any(clean_query in alias for alias in d.spoken_aliases):
            keyword_matches.append(d)
            continue

        # Check token intersection
        dest_tokens = set(re.findall(r"\w+", d.label.lower()))
        if d.room_number:
            dest_tokens.add(d.room_number.lower())
        overlap = query_tokens.intersection(dest_tokens)
        if overlap:
            keyword_matches.append(d)

    # Deduplicate keyword matches
    unique_candidates = {c.id: c for c in keyword_matches}.values()
    candidate_list = list(unique_candidates)

    if len(candidate_list) == 1:
        return DestinationMatchResponse(
            spoken_query=payload.spoken_query,
            exact_match=candidate_list[0],
            candidates=candidate_list,
            is_ambiguous=False,
        )
    elif len(candidate_list) > 1:
        labels_str = ", ".join(f"'{c.label}'" for c in candidate_list[:3])
        return DestinationMatchResponse(
            spoken_query=payload.spoken_query,
            exact_match=None,
            candidates=candidate_list,
            is_ambiguous=True,
            clarification_prompt=f"We found {len(candidate_list)} possible destinations ({labels_str}). Which would you like to navigate to?",
        )

    return DestinationMatchResponse(
        spoken_query=payload.spoken_query,
        exact_match=None,
        candidates=[],
        is_ambiguous=False,
        clarification_prompt=f"Could not find a verified location matching '{clean_query}'. Please try speaking a room name or room number.",
    )
