from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.models.marker import LocationMarker
from app.models.project import Project
from app.models.spatial import SpatialNode
from app.schemas.marker import (
    LocationMarkerCreate,
    LocationMarkerResponse,
    LocationMarkerUpdate,
    MarkerResolutionResult,
)

router = APIRouter()


@router.get(
    "/resolve/{marker_code}",
    response_model=MarkerResolutionResult,
    summary="Resolve an NFC tag or QR access code to an exact spatial location",
)
def resolve_marker(marker_code: str, db: Session = Depends(get_db)):
    """
    CRITICAL ACCESS POINT RESOLUTION:
    When a visitor taps an NFC tag or scans a QR code at a hospital entrance or doorway,
    this endpoint instantly resolves the marker code into a verified starting location.
    
    Safety Guarantee: An NFC/QR scan establishes a confirmed location at this instant,
    but does NOT continuously track the visitor after leaving the marker.
    """
    clean_code = marker_code.strip().upper()
    marker = (
        db.query(LocationMarker)
        .filter(LocationMarker.marker_code == clean_code, LocationMarker.is_active == True)
        .first()
    )
    if not marker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Location marker '{marker_code}' was not found or is inactive.",
        )

    project = db.query(Project).filter(Project.id == marker.project_id).first()
    node = db.query(SpatialNode).filter(SpatialNode.id == marker.spatial_node_id).first()

    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The spatial node associated with this marker no longer exists.",
        )

    building_name = project.building_name if project else "Facility"
    voice_msg = (
        f"Location confirmed. You are at {node.label}, "
        f"{marker.level_name or 'Ground Floor'} of {building_name}."
    )

    return MarkerResolutionResult(
        success=True,
        marker_id=marker.id,
        marker_code=marker.marker_code,
        marker_type=marker.marker_type,
        project_id=marker.project_id,
        building_name=building_name,
        floor_plan_id=marker.floor_plan_id,
        level_number=marker.level_number,
        level_name=marker.level_name,
        spatial_node_id=node.id,
        node_label=node.label,
        node_type=node.node_type,
        room_number=node.room_number,
        x=node.x,
        y=node.y,
        location_description=marker.location_description,
        tactile_identifier=marker.tactile_identifier,
        voice_announcement=voice_msg,
    )


@router.get(
    "/project/{project_id}",
    response_model=List[LocationMarkerResponse],
    summary="List all NFC/QR markers for a project",
)
def list_project_markers(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    markers = (
        db.query(LocationMarker)
        .filter(LocationMarker.project_id == project_id)
        .order_by(LocationMarker.level_number.asc(), LocationMarker.marker_code.asc())
        .all()
    )

    results = []
    for m in markers:
        node = db.query(SpatialNode).filter(SpatialNode.id == m.spatial_node_id).first()
        res = LocationMarkerResponse(
            id=m.id,
            project_id=m.project_id,
            floor_plan_id=m.floor_plan_id,
            spatial_node_id=m.spatial_node_id,
            marker_code=m.marker_code,
            marker_type=m.marker_type,
            level_number=m.level_number,
            level_name=m.level_name,
            location_description=m.location_description,
            tactile_identifier=m.tactile_identifier,
            is_active=m.is_active,
            building_name=project.building_name,
            node_label=node.label if node else "Unknown Space",
            node_type=node.node_type if node else "room",
            room_number=node.room_number if node else None,
            x=node.x if node else None,
            y=node.y if node else None,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )
        results.append(res)
    return results


@router.post(
    "",
    response_model=LocationMarkerResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new physical NFC/QR access marker",
)
def create_marker(payload: LocationMarkerCreate, db: Session = Depends(get_db)):
    # Check node exists and is human verified
    node = db.query(SpatialNode).filter(SpatialNode.id == payload.spatial_node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Target spatial node does not exist.")

    if not node.is_user_verified:
        raise HTTPException(
            status_code=400,
            detail="Cannot assign access marker to an unverified node. Human verification is required.",
        )

    # Check for duplicate code
    existing = (
        db.query(LocationMarker)
        .filter(LocationMarker.marker_code == payload.marker_code.strip().upper())
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Marker code '{payload.marker_code}' is already registered.",
        )

    marker = LocationMarker(
        project_id=payload.project_id,
        floor_plan_id=payload.floor_plan_id or node.floor_plan_id,
        spatial_node_id=payload.spatial_node_id,
        marker_code=payload.marker_code.strip().upper(),
        marker_type=payload.marker_type,
        level_number=payload.level_number or node.level_number,
        level_name=payload.level_name or node.level_name,
        location_description=payload.location_description,
        tactile_identifier=payload.tactile_identifier,
        is_active=payload.is_active,
    )
    db.add(marker)
    db.commit()
    db.refresh(marker)

    project = db.query(Project).filter(Project.id == marker.project_id).first()

    return LocationMarkerResponse(
        id=marker.id,
        project_id=marker.project_id,
        floor_plan_id=marker.floor_plan_id,
        spatial_node_id=marker.spatial_node_id,
        marker_code=marker.marker_code,
        marker_type=marker.marker_type,
        level_number=marker.level_number,
        level_name=marker.level_name,
        location_description=marker.location_description,
        tactile_identifier=marker.tactile_identifier,
        is_active=marker.is_active,
        building_name=project.building_name if project else "Facility",
        node_label=node.label,
        node_type=node.node_type,
        room_number=node.room_number,
        x=node.x,
        y=node.y,
        created_at=marker.created_at,
        updated_at=marker.updated_at,
    )


@router.delete("/{marker_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a marker")
def delete_marker(marker_id: str, db: Session = Depends(get_db)):
    marker = db.query(LocationMarker).filter(LocationMarker.id == marker_id).first()
    if not marker:
        raise HTTPException(status_code=404, detail="Marker not found.")
    db.delete(marker)
    db.commit()
    return None

