import json
import logging
import uuid
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.core.config import settings
from app.database.session import get_db
from app.models.project import FloorPlan, Project
from app.models.spatial import SpatialEdge, SpatialNode
from app.schemas.spatial import (
    AIInterpretationRequest,
    AIInterpretationResponse,
    BatchVerifyRequest,
    BatchVerifyResponse,
    SpatialEdgeCreate,
    SpatialEdgeRead,
    SpatialEdgeUpdate,
    SpatialNodeCreate,
    SpatialNodeRead,
    SpatialNodeUpdate,
)
from app.services.ai.factory import get_ai_provider
from app.services.spatial.coordinates import CoordinateTransformer
from app.services.spatial.validator import SpatialAnalysisValidator

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{project_id}/nodes", response_model=List[SpatialNodeRead], summary="List spatial nodes for a project")
def get_spatial_nodes(
    project_id: str,
    floor_plan_id: Optional[str] = Query(default=None),
    level_number: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(SpatialNode).filter(SpatialNode.project_id == project_id)
    if isinstance(floor_plan_id, str) and floor_plan_id.strip():
        query = query.filter(SpatialNode.floor_plan_id == floor_plan_id)
    if isinstance(level_number, int):
        query = query.filter(SpatialNode.level_number == level_number)
    return query.all()


@router.get("/{project_id}/edges", response_model=List[SpatialEdgeRead], summary="List spatial topological edges for a project")
def get_spatial_edges(
    project_id: str,
    level_number: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(SpatialEdge).filter(SpatialEdge.project_id == project_id)
    if isinstance(level_number, int):
        query = query.filter(SpatialEdge.level_number == level_number)
    return query.all()


@router.post("/interpret", response_model=AIInterpretationResponse, summary="Extract structured spatial entities using AI Vision Provider")
async def interpret_floor_plan(
    payload: AIInterpretationRequest,
    db: Session = Depends(get_db),
):
    fp = db.query(FloorPlan).filter(FloorPlan.id == payload.floorplan_id).first()
    if not fp:
        raise HTTPException(status_code=404, detail="Floor plan not found.")

    project = db.query(Project).filter(Project.id == fp.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    # Read preprocessed image if available, else raw file
    img_path = Path(fp.processed_file_path if (fp.processed_file_path and Path(fp.processed_file_path).exists()) else fp.file_path)
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Floor plan image file is missing from disk.")

    with open(img_path, "rb") as f:
        img_bytes = f.read()

    # Query AI Provider
    ai_provider = get_ai_provider(payload.provider)
    mime_type = "image/png" if img_path.suffix.lower() == ".png" else fp.mime_type
    building_hint = payload.building_name_hint or project.building_name

    try:
        raw_analysis = await ai_provider.analyze_floor_plan(
            image_bytes=img_bytes,
            mime_type=mime_type,
            building_hint=building_hint,
        )
    except Exception as e:
        logger.error(f"AI Interpretation failed: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"AI Provider error during floor plan interpretation: {str(e)}",
        )

    # Initialize Coordinate Transformer
    orig_w = fp.width or 1600
    orig_h = fp.height or 1200
    proc_w = fp.processed_width or orig_w
    proc_h = fp.processed_height or orig_h
    scale = fp.scale_meters_per_pixel or 0.05

    transformer = CoordinateTransformer(
        orig_width=orig_w,
        orig_height=orig_h,
        proc_width=proc_w,
        proc_height=proc_h,
        scale_meters_per_pixel=scale,
    )

    # Validate, clamp, and build topological graph
    validator = SpatialAnalysisValidator(
        transformer=transformer,
        confidence_threshold=payload.confidence_threshold,
    )

    validated_nodes, validated_edges, report = validator.process_and_validate(
        raw_analysis=raw_analysis,
        floor_plan_id=fp.id,
        project_id=project.id,
    )

    # Persist detected nodes to database
    db_nodes = []
    for nd in validated_nodes:
        # Check if node already exists by ID
        existing = db.query(SpatialNode).filter(SpatialNode.id == nd["id"]).first()
        if existing:
            for k, v in nd.items():
                setattr(existing, k, v)
            db_nodes.append(existing)
        else:
            new_node = SpatialNode(**nd)
            db.add(new_node)
            db_nodes.append(new_node)

    # Persist detected edges
    db_edges = []
    for ed in validated_edges:
        existing_e = db.query(SpatialEdge).filter(SpatialEdge.id == ed["id"]).first()
        if existing_e:
            for k, v in ed.items():
                setattr(existing_e, k, v)
            db_edges.append(existing_e)
        else:
            new_edge = SpatialEdge(**ed)
            db.add(new_edge)
            db_edges.append(new_edge)

    # Update floor plan status
    fp.raw_analysis = json.dumps(raw_analysis.model_dump())
    fp.analysis_status = "ready_for_ai"
    project.status = "analyzing"

    db.commit()

    # Refresh instances
    for n in db_nodes:
        db.refresh(n)
    for e in db_edges:
        db.refresh(e)

    return AIInterpretationResponse(
        project_id=project.id,
        floorplan_id=fp.id,
        floor_plan_id=fp.id,
        level_number=fp.level_number or 1,
        model_used=ai_provider.name(),
        provider=ai_provider.name(),
        nodes_detected=len(db_nodes),
        edges_detected=len(db_edges),
        elements_detected_count=len(db_nodes) + len(db_edges),
        nodes_persisted_count=len(db_nodes),
        edges_persisted_count=len(db_edges),
        geometry_validation_errors=report.connectivity_warnings,
        nodes=[SpatialNodeRead.model_validate(n) for n in db_nodes],
        edges=[SpatialEdgeRead.model_validate(e) for e in db_edges],
        validation_report=report,
        status="completed",
        message=f"Detected {len(db_nodes)} spatial nodes and {len(db_edges)} connections.",
    )


@router.post("/nodes", response_model=SpatialNodeRead, status_code=status.HTTP_201_CREATED, summary="Create a manual spatial node in the editor")
def create_spatial_node(payload: SpatialNodeCreate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    new_node = SpatialNode(
        id=str(uuid.uuid4()),
        project_id=payload.project_id,
        floor_plan_id=payload.floor_plan_id,
        label=payload.label,
        node_type=payload.node_type,
        room_number=payload.room_number,
        x=payload.x,
        y=payload.y,
        bounding_box=payload.bounding_box,
        polygon_points=payload.polygon_points,
        detection_source="manual_entry",
        is_geometry_validated=True,
        is_user_verified=payload.is_user_verified,
        confidence=payload.confidence,
        is_accessible=payload.is_accessible,
        level_number=payload.level_number,
        level_name=payload.level_name,
        notes=payload.notes,
    )
    db.add(new_node)
    db.commit()
    db.refresh(new_node)
    return new_node


@router.patch("/nodes/{node_id}", response_model=SpatialNodeRead, summary="Update an existing spatial node")
def update_spatial_node(
    node_id: str,
    payload: SpatialNodeUpdate,
    db: Session = Depends(get_db),
):
    node = db.query(SpatialNode).filter(SpatialNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Spatial node not found.")

    update_dict = payload.model_dump(exclude_unset=True)
    for field, val in update_dict.items():
        setattr(node, field, val)

    db.commit()
    db.refresh(node)
    return node


@router.delete("/nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a spatial node")
def delete_spatial_node(node_id: str, db: Session = Depends(get_db)):
    node = db.query(SpatialNode).filter(SpatialNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Spatial node not found.")
    db.delete(node)
    db.commit()
    return None


@router.post("/edges", response_model=SpatialEdgeRead, status_code=status.HTTP_201_CREATED, summary="Create a topological connection between nodes")
def create_spatial_edge(payload: SpatialEdgeCreate, db: Session = Depends(get_db)):
    source = db.query(SpatialNode).filter(SpatialNode.id == payload.source_node_id).first()
    target = db.query(SpatialNode).filter(SpatialNode.id == payload.target_node_id).first()
    if not source or not target:
        raise HTTPException(status_code=400, detail="Source or target spatial node does not exist.")

    new_edge = SpatialEdge(
        id=str(uuid.uuid4()),
        project_id=payload.project_id,
        source_node_id=payload.source_node_id,
        target_node_id=payload.target_node_id,
        distance_meters=payload.distance_meters,
        edge_type=payload.edge_type,
        confidence=payload.confidence,
        detection_source="manual_entry",
        is_geometry_validated=True,
        is_user_verified=payload.is_user_verified,
        is_accessible=payload.is_accessible,
        is_inter_floor=payload.is_inter_floor,
        level_number=payload.level_number,
    )
    db.add(new_edge)
    db.commit()
    db.refresh(new_edge)
    return new_edge


@router.patch("/edges/{edge_id}", response_model=SpatialEdgeRead, summary="Update an existing connection")
def update_spatial_edge(
    edge_id: str,
    payload: SpatialEdgeUpdate,
    db: Session = Depends(get_db),
):
    edge = db.query(SpatialEdge).filter(SpatialEdge.id == edge_id).first()
    if not edge:
        raise HTTPException(status_code=404, detail="Spatial connection not found.")

    update_dict = payload.model_dump(exclude_unset=True)
    for field, val in update_dict.items():
        setattr(edge, field, val)

    db.commit()
    db.refresh(edge)
    return edge


@router.delete("/edges/{edge_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a spatial connection")
def delete_spatial_edge(edge_id: str, db: Session = Depends(get_db)):
    edge = db.query(SpatialEdge).filter(SpatialEdge.id == edge_id).first()
    if not edge:
        raise HTTPException(status_code=404, detail="Spatial connection not found.")
    db.delete(edge)
    db.commit()
    return None


@router.post("/batch-verify", response_model=BatchVerifyResponse, summary="Batch confirm human verification of spatial elements")
def batch_verify_elements(payload: BatchVerifyRequest, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    nodes_query = db.query(SpatialNode).filter(SpatialNode.project_id == payload.project_id)
    edges_query = db.query(SpatialEdge).filter(SpatialEdge.project_id == payload.project_id)

    if payload.node_ids:
        nodes_query = nodes_query.filter(SpatialNode.id.in_(payload.node_ids))
    elif payload.verify_all_validated:
        nodes_query = nodes_query.filter(SpatialNode.is_geometry_validated == True)

    if payload.edge_ids:
        edges_query = edges_query.filter(SpatialEdge.id.in_(payload.edge_ids))
    elif payload.verify_all_validated:
        edges_query = edges_query.filter(SpatialEdge.is_geometry_validated == True)

    verified_nodes = nodes_query.all()
    verified_edges = edges_query.all()

    for n in verified_nodes:
        n.is_user_verified = True
    for e in verified_edges:
        e.is_user_verified = True

    # Check remaining unverified count in the project
    total_unverified = (
        db.query(SpatialNode)
        .filter(SpatialNode.project_id == payload.project_id, SpatialNode.is_user_verified == False)
        .count()
    )

    if total_unverified == 0 and len(verified_nodes) > 0:
        project.status = "verified"

    db.commit()

    return BatchVerifyResponse(
        project_id=project.id,
        verified_nodes_count=len(verified_nodes),
        verified_edges_count=len(verified_edges),
        unverified_nodes_count=total_unverified,
        safe_for_navigation=(total_unverified == 0),
        message=f"Human verification updated: {len(verified_nodes)} nodes and {len(verified_edges)} connections verified.",
    )
