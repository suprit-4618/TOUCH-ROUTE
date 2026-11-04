from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.models.project import Project, FloorPlan
from app.models.spatial import SpatialNode, SpatialEdge
from app.models.tactile import TactileJob
from app.schemas.project import (
    ProjectCreate,
    ProjectDetail,
    ProjectStats,
    ProjectSummary,
    ProjectUpdate,
)

router = APIRouter()


@router.get("", response_model=List[ProjectSummary], summary="List all navigation projects")
def list_projects(
    include_demo: bool = Query(False, description="Whether to include demonstration sample projects"),
    status: Optional[str] = Query(None, description="Filter by status (e.g. verified, draft)"),
    db: Session = Depends(get_db),
):
    query = db.query(Project)
    if not include_demo:
        query = query.filter(Project.is_demo == False)
    if status:
        query = query.filter(Project.status == status)

    projects = query.order_by(Project.created_at.desc()).all()
    results = []
    for p in projects:
        fp_count = db.query(FloorPlan).filter(FloorPlan.project_id == p.id).count()
        node_count = db.query(SpatialNode).filter(SpatialNode.project_id == p.id).count()
        verified_count = (
            db.query(SpatialNode)
            .filter(SpatialNode.project_id == p.id, SpatialNode.is_user_verified == True)
            .count()
        )
        results.append(
            ProjectSummary(
                id=p.id,
                name=p.name,
                description=p.description,
                building_name=p.building_name,
                address=p.address,
                is_demo=p.is_demo,
                status=p.status,
                floor_plans_count=fp_count,
                spatial_nodes_count=node_count,
                verified_nodes_count=verified_count,
                created_at=p.created_at,
                updated_at=p.updated_at,
            )
        )
    return results


@router.get("/stats", response_model=ProjectStats, summary="Dashboard metrics and project statistics")
def get_project_stats(db: Session = Depends(get_db)):
    total = db.query(Project).filter(Project.is_demo == False).count()
    demo = db.query(Project).filter(Project.is_demo == True).count()
    verified = db.query(Project).filter(Project.is_demo == False, Project.status == "verified").count()
    accessible_routes = (
        db.query(SpatialEdge)
        .join(Project, SpatialEdge.project_id == Project.id)
        .filter(Project.is_demo == False, SpatialEdge.is_accessible == True)
        .count()
    )
    tactile_maps = (
        db.query(TactileJob)
        .join(Project, TactileJob.project_id == Project.id)
        .filter(Project.is_demo == False, TactileJob.status == "completed")
        .count()
    )
    return ProjectStats(
        total_projects=total,
        demo_projects=demo,
        verified_buildings=verified,
        total_accessible_routes=accessible_routes,
        print_ready_tactile_maps=tactile_maps,
    )


@router.post("", response_model=ProjectSummary, status_code=status.HTTP_201_CREATED, summary="Create a new navigation project")
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    new_project = Project(
        name=payload.name,
        description=payload.description,
        building_name=payload.building_name,
        address=payload.address,
        is_demo=payload.is_demo,
        status="draft",
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)

    return ProjectSummary(
        id=new_project.id,
        name=new_project.name,
        description=new_project.description,
        building_name=new_project.building_name,
        address=new_project.address,
        is_demo=new_project.is_demo,
        status=new_project.status,
        floor_plans_count=0,
        spatial_nodes_count=0,
        verified_nodes_count=0,
        created_at=new_project.created_at,
        updated_at=new_project.updated_at,
    )


@router.get("/{project_id}", response_model=ProjectDetail, summary="Get project detail")
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    fps = db.query(FloorPlan).filter(FloorPlan.project_id == project.id).all()
    nodes = db.query(SpatialNode).filter(SpatialNode.project_id == project.id).all()
    verified_count = sum(1 for n in nodes if n.is_user_verified)

    fps_data = [
        {
            "id": f.id,
            "name": f.name,
            "original_filename": f.original_filename,
            "file_size": f.file_size,
            "mime_type": f.mime_type,
            "width": f.width,
            "height": f.height,
            "scale_meters_per_pixel": f.scale_meters_per_pixel,
            "is_scale_calibrated": f.is_scale_calibrated,
            "processed_file_path": f.processed_file_path,
            "analysis_status": f.analysis_status,
            "created_at": f.created_at.isoformat(),
        }
        for f in fps
    ]

    nodes_data = [
        {
            "id": n.id,
            "label": n.label,
            "node_type": n.node_type,
            "room_number": n.room_number,
            "x": n.x,
            "y": n.y,
            "is_accessible": n.is_accessible,
            "is_user_verified": n.is_user_verified,
            "confidence": n.confidence,
            "notes": n.notes,
        }
        for n in nodes
    ]

    return ProjectDetail(
        id=project.id,
        name=project.name,
        description=project.description,
        building_name=project.building_name,
        address=project.address,
        is_demo=project.is_demo,
        status=project.status,
        floor_plans_count=len(fps),
        spatial_nodes_count=len(nodes),
        verified_nodes_count=verified_count,
        created_at=project.created_at,
        updated_at=project.updated_at,
        floor_plans=fps_data,
        spatial_nodes=nodes_data,
    )


@router.put("/{project_id}", response_model=ProjectSummary, summary="Update project")
def update_project(project_id: str, payload: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(project, field, val)

    db.commit()
    db.refresh(project)

    fp_count = db.query(FloorPlan).filter(FloorPlan.project_id == project.id).count()
    node_count = db.query(SpatialNode).filter(SpatialNode.project_id == project.id).count()
    verified_count = (
        db.query(SpatialNode)
        .filter(SpatialNode.project_id == project.id, SpatialNode.is_user_verified == True)
        .count()
    )

    return ProjectSummary(
        id=project.id,
        name=project.name,
        description=project.description,
        building_name=project.building_name,
        address=project.address,
        is_demo=project.is_demo,
        status=project.status,
        floor_plans_count=fp_count,
        spatial_nodes_count=node_count,
        verified_nodes_count=verified_count,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete project")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    db.commit()
    return None

