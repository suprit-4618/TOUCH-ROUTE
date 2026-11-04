import io
import numpy as np
import pytest
from PIL import Image
from app.database.session import SessionLocal
from app.models.project import FloorPlan, Project
from app.models.spatial import SpatialEdge, SpatialNode
from app.services.vision.processor import preprocess_floor_plan
from app.services.spatial.coordinates import CoordinateTransformer
from app.services.spatial.validator import SpatialAnalysisValidator
from app.services.navigation.router import find_accessible_route
from app.schemas.spatial import (
    BoundingBox,
    ConnectionEntity,
    RoomEntity,
    SpatialCoordinate,
    StructuredSpatialAnalysis,
    WaypointEntity,
)


@pytest.fixture
def sample_blueprint_project():
    db = SessionLocal()
    # Create test project
    p = Project(
        name="Metropolitan Accessibility Hub",
        building_name="Central Library",
        is_demo=False,
        status="draft",
    )
    db.add(p)
    db.commit()
    db.refresh(p)

    # Create dummy blueprint image (1200 x 800)
    img_arr = np.full((800, 1200, 3), 250, dtype=np.uint8)
    # Draw walls and doorways
    img_arr[50:750, 50:60] = 30  # West wall
    img_arr[50:750, 1140:1150] = 30  # East wall
    img_arr[50:60, 50:1150] = 30  # North wall
    img_arr[740:750, 50:1150] = 30  # South wall
    # Dividing corridor wall with doorway
    img_arr[400:410, 50:500] = 30
    img_arr[400:410, 600:1150] = 30  # Gap at 500-600 is doorway

    pil_img = Image.fromarray(img_arr)
    buf = io.BytesIO()
    pil_img.save(buf, format="PNG")
    raw_bytes = buf.getvalue()

    # Preprocess with OpenCV
    proc_img, proc_meta = preprocess_floor_plan(
        img=img_arr,
        enhance_contrast=True,
        denoise=True,
        sharpen_edges=True,
        max_dimension=1600,
    )

    # Save floor plan record
    fp = FloorPlan(
        project_id=p.id,
        name="Ground Level - Braille Collection",
        original_filename="ground_floor.png",
        file_path="uploads/test_ground_floor.png",
        file_size=len(raw_bytes),
        mime_type="image/png",
        width=1200,
        height=800,
        scale_meters_per_pixel=0.045,  # 1px = 4.5cm
        is_scale_calibrated=True,
        analysis_status="ready_for_ai",
        level_number=1,
        level_name="Ground Level",
    )
    db.add(fp)
    db.commit()
    db.refresh(fp)

    yield p, fp, raw_bytes

    # Cleanup
    db = SessionLocal()
    del_p = db.query(Project).filter(Project.id == p.id).first()
    if del_p:
        db.delete(del_p)
        db.commit()
    db.close()


def test_end_to_end_stage3_spatial_intelligence(sample_blueprint_project):
    project, floor_plan, raw_bytes = sample_blueprint_project
    db = SessionLocal()

    try:
        # Simulate structured AI Vision response with normalized coordinates (0.0 - 1.0)
        ai_data = StructuredSpatialAnalysis(
            building_name="Central Library",
            level_name="Ground Level",
            level_number=1,
            rooms=[
                RoomEntity(
                    id="corridor_central",
                    name="Central Circulation Corridor",
                    type="corridor",
                    coordinates=[SpatialCoordinate(x=0.45, y=0.45)],  # (540px, 360px)
                    confidence=0.92,
                    is_accessible=True,
                ),
                RoomEntity(
                    id="room_braille",
                    name="Tactile & Braille Reading Room",
                    type="room",
                    room_number="101",
                    coordinates=[SpatialCoordinate(x=0.75, y=0.25)],  # (900px, 200px)
                    bounding_box=BoundingBox(min_x=0.60, min_y=0.10, max_x=0.90, max_y=0.40),
                    confidence=0.94,
                    is_accessible=True,
                ),
            ],
            entrances=[
                WaypointEntity(
                    id="entrance_main",
                    label="Main Step-Free Entrance",
                    type="entrance",
                    x=0.10,  # (120px)
                    y=0.45,  # (360px)
                    confidence=0.98,
                    is_accessible=True,
                )
            ],
            connections=[
                ConnectionEntity(
                    id="conn_1",
                    source_id="entrance_main",
                    target_id="corridor_central",
                    connection_type="corridor",
                    confidence=0.95,
                ),
                ConnectionEntity(
                    id="conn_2",
                    source_id="corridor_central",
                    target_id="room_braille",
                    connection_type="door",
                    confidence=0.91,
                ),
            ],
        )

        # Validate and transform coordinates
        transformer = CoordinateTransformer(
            orig_width=floor_plan.width,
            orig_height=floor_plan.height,
            scale_meters_per_pixel=floor_plan.scale_meters_per_pixel,
        )
        validator = SpatialAnalysisValidator(
            transformer=transformer,
            confidence_threshold=0.70,
        )

        val_nodes, val_edges, report = validator.process_and_validate(
            raw_analysis=ai_data,
            floor_plan_id=floor_plan.id,
            project_id=project.id,
        )

        assert len(val_nodes) == 3
        assert len(val_edges) == 2
        assert report.valid_nodes == 3

        # Verify transformed coordinates match original blueprint space (1200 x 800)
        entrance = next(n for n in val_nodes if "entrance" in n["label"].lower())
        assert abs(entrance["x"] - 120.0) < 1.0
        assert abs(entrance["y"] - 360.0) < 1.0
        assert entrance["is_geometry_validated"] is True
        assert entrance["is_user_verified"] is False  # AI predictions are unverified by default

        # Persist to database
        db_nodes = []
        for n_dict in val_nodes:
            db_node = SpatialNode(**n_dict)
            db.add(db_node)
            db_nodes.append(db_node)
        db.commit()

        for e_dict in val_edges:
            db_edge = SpatialEdge(**e_dict)
            db.add(db_edge)
        db.commit()

        # Find entrance and braille room in persisted DB nodes
        db_entrance = next(n for n in db_nodes if "entrance" in n.label.lower())
        db_braille = next(n for n in db_nodes if "braille" in n.label.lower())

        # Test safety constraint: unverified routing rejection
        db_edges = db.query(SpatialEdge).filter(SpatialEdge.project_id == project.id).all()
        with pytest.raises(ValueError) as exc:
            find_accessible_route(
                nodes=db_nodes,
                edges=db_edges,
                start_node_id=db_entrance.id,
                destination_node_id=db_braille.id,
                verified_only=True,
            )
        assert "not been human-verified" in str(exc.value)

        # Human verifies all nodes (e.g. via Batch Verification in the Spatial Map Editor)
        for n in db_nodes:
            n.is_user_verified = True
        for e in db_edges:
            e.is_user_verified = True
        db.commit()

        # Now verified navigation route calculates cleanly!
        route = find_accessible_route(
            nodes=db_nodes,
            edges=db_edges,
            start_node_id=db_entrance.id,
            destination_node_id=db_braille.id,
            verified_only=True,
        )
        assert route.accessible is True
        assert route.is_verified_safe is True
        assert route.has_unverified_segments is False
        assert len(route.steps) > 0
        assert route.total_distance_meters > 0

    finally:
        db.close()
