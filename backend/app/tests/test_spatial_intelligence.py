import json
import pytest
from app.models.spatial import SpatialEdge, SpatialNode
from app.schemas.spatial import (
    BoundingBox,
    ConnectionEntity,
    RoomEntity,
    SpatialCoordinate,
    StructuredSpatialAnalysis,
    WaypointEntity,
)
from app.services.ai.gemini_provider import GeminiProvider
from app.services.navigation.router import find_accessible_route
from app.services.spatial.coordinates import CoordinateTransformer
from app.services.spatial.validator import SpatialAnalysisValidator


def test_coordinate_transformation_normalization():
    # Original blueprint is 2400 x 1800. Processed image is 1200 x 900.
    transformer = CoordinateTransformer(
        orig_width=2400,
        orig_height=1800,
        proc_width=1200,
        proc_height=900,
        scale_meters_per_pixel=0.04,
    )

    # 1. Normalized coord (0.5, 0.5) must translate to original (1200.0, 900.0)
    orig_x, orig_y = transformer.normalized_to_original(0.5, 0.5)
    assert orig_x == 1200.0
    assert orig_y == 900.0

    # 2. Processed pixel coord (600, 450) must translate to original (1200.0, 900.0)
    proc_x, proc_y = transformer.processed_to_original(600, 450)
    assert proc_x == 1200.0
    assert proc_y == 900.0

    # 3. Out of boundary coordinate (> 1.0) must clamp cleanly to original bounds
    clamped_x, clamped_y = transformer.normalized_to_original(1.2, -0.1)
    assert clamped_x == 2400.0
    assert clamped_y == 0.0

    # 4. Metric distance calculation: 250 original pixels * 0.04 m/px = 10.0 meters
    dist = transformer.calculate_distance_meters((100, 100), (350, 100))
    assert dist == 10.0


def test_spatial_analysis_parsing_and_validation():
    transformer = CoordinateTransformer(orig_width=1600, orig_height=1200)
    validator = SpatialAnalysisValidator(transformer=transformer, confidence_threshold=0.7)

    # Synthetic structured spatial analysis payload
    analysis_data = StructuredSpatialAnalysis(
        building_name="Science Hall",
        level_name="Ground Floor",
        level_number=1,
        rooms=[
            RoomEntity(
                id="room_101",
                name="Physics Lab",
                type="classroom",
                room_number="101",
                coordinates=[SpatialCoordinate(x=0.3, y=0.4)],
                confidence=0.95,
                is_accessible=True,
            ),
            RoomEntity(
                id="room_102",
                name="Chemistry Lab",
                type="classroom",
                room_number="102",
                coordinates=[SpatialCoordinate(x=0.7, y=0.4)],
                confidence=0.92,
                is_accessible=True,
            ),
            # Low confidence room (should be filtered out by threshold)
            RoomEntity(
                id="room_uncertain",
                name="Uncertain Storage",
                type="room",
                coordinates=[SpatialCoordinate(x=0.5, y=0.5)],
                confidence=0.45,
            ),
        ],
        entrances=[
            WaypointEntity(
                id="ent_main",
                label="Main Entrance",
                type="entrance",
                x=0.1,
                y=0.4,
                confidence=0.98,
                is_accessible=True,
            )
        ],
        exits=[
            WaypointEntity(
                id="exit_east",
                label="East Emergency Exit",
                type="exit",
                x=0.9,
                y=0.4,
                confidence=0.94,
                is_accessible=True,
            )
        ],
        stairs=[],
        elevators=[],
        connections=[
            ConnectionEntity(
                id="c1",
                source_id="ent_main",
                target_id="room_101",
                connection_type="door",
                confidence=0.9,
            ),
            ConnectionEntity(
                id="c2",
                source_id="room_101",
                target_id="room_102",
                connection_type="corridor_walkway",
                confidence=0.88,
            ),
        ],
        uncertainty_notes=["Dim lighting in south wing scan"],
    )

    nodes, edges, report = validator.process_and_validate(analysis_data, project_id="p1")

    # Verify low-confidence room was excluded
    assert len(nodes) == 4  # room_101, room_102, ent_main, exit_east
    assert not any(n["id"] == "room_uncertain" for n in nodes)

    # Verify original pixel coordinates
    node_map = {n["id"]: n for n in nodes}
    assert node_map["room_101"]["x"] == 480.0  # 0.3 * 1600
    assert node_map["room_101"]["y"] == 480.0  # 0.4 * 1200
    assert node_map["ent_main"]["x"] == 160.0  # 0.1 * 1600

    # Strict safety check: All AI detections must start with is_user_verified=False
    assert all(n["is_user_verified"] is False for n in nodes)
    assert all(e["is_user_verified"] is False for e in edges)

    # Verify topological connections created
    assert len(edges) == 2
    assert report.valid_nodes == 4


def test_duplicate_entity_deduplication():
    transformer = CoordinateTransformer(orig_width=1000, orig_height=1000)
    validator = SpatialAnalysisValidator(transformer=transformer)

    # Two detected nodes with identical label in close proximity (10px)
    analysis_data = StructuredSpatialAnalysis(
        building_name="Duplicate Test",
        rooms=[
            RoomEntity(
                id="r1",
                name="Restroom Accessible",
                type="restroom",
                coordinates=[SpatialCoordinate(x=0.50, y=0.50)],
                confidence=0.80,
            ),
            RoomEntity(
                id="r2",
                name="Restroom Accessible",
                type="restroom",
                coordinates=[SpatialCoordinate(x=0.51, y=0.51)],  # only 10px away
                confidence=0.95,
            ),
        ],
    )

    nodes, edges, report = validator.process_and_validate(analysis_data)
    # Deduplicator must merge into single higher confidence node
    assert len(nodes) == 1
    assert report.duplicates_merged == 1
    assert nodes[0]["confidence"] == 0.95


def test_orphaned_node_detection():
    transformer = CoordinateTransformer(orig_width=1000, orig_height=1000)
    validator = SpatialAnalysisValidator(transformer=transformer)

    analysis_data = StructuredSpatialAnalysis(
        building_name="Orphan Test",
        rooms=[
            RoomEntity(id="r1", name="Room A", type="room", coordinates=[SpatialCoordinate(x=0.2, y=0.2)], confidence=0.9),
            RoomEntity(id="r2", name="Disconnected Room B", type="room", coordinates=[SpatialCoordinate(x=0.8, y=0.8)], confidence=0.9),
        ],
        connections=[],  # No doors or walkways
    )

    nodes, edges, report = validator.process_and_validate(analysis_data)
    assert len(report.connectivity_warnings) >= 2
    assert any("has no detected door" in w for w in report.connectivity_warnings)


def test_multi_floor_stair_elevator_routing():
    # Setup Floor 1 & Floor 2 nodes
    n1 = SpatialNode(id="f1_ent", project_id="p1", label="Floor 1 Entrance", node_type="entrance", x=100, y=100, level_number=1, level_name="Level 1", is_accessible=True, is_user_verified=True)
    n2 = SpatialNode(id="f1_elev", project_id="p1", label="Floor 1 Elevator", node_type="elevator", x=300, y=100, level_number=1, level_name="Level 1", is_accessible=True, is_user_verified=True)
    n3 = SpatialNode(id="f2_elev", project_id="p1", label="Floor 2 Elevator", node_type="elevator", x=300, y=100, level_number=2, level_name="Level 2", is_accessible=True, is_user_verified=True)
    n4 = SpatialNode(id="f2_suite", project_id="p1", label="Floor 2 Dental Suite", node_type="room", x=500, y=100, level_number=2, level_name="Level 2", is_accessible=True, is_user_verified=True)

    # Connections
    e1 = SpatialEdge(id="e1", project_id="p1", source_node_id="f1_ent", target_node_id="f1_elev", distance_meters=10.0, is_accessible=True, is_user_verified=True)
    # Inter-floor elevator edge
    e2 = SpatialEdge(id="e2", project_id="p1", source_node_id="f1_elev", target_node_id="f2_elev", distance_meters=4.0, is_accessible=True, is_inter_floor=True, edge_type="elevator_transit", is_user_verified=True)
    e3 = SpatialEdge(id="e3", project_id="p1", source_node_id="f2_elev", target_node_id="f2_suite", distance_meters=8.0, is_accessible=True, is_user_verified=True)

    route = find_accessible_route(
        nodes=[n1, n2, n3, n4],
        edges=[e1, e2, e3],
        start_node_id="f1_ent",
        destination_node_id="f2_suite",
        accessible_only=True,
        verified_only=True,
    )

    assert route.path_node_ids == ["f1_ent", "f1_elev", "f2_elev", "f2_suite"]
    assert any("elevator" in step.instruction.lower() for step in route.steps)
    assert route.is_verified_safe is True


def test_ai_provider_missing_key_failure():
    provider = GeminiProvider(api_key="")
    coro = provider.analyze_floor_plan(image_bytes=b"dummy", mime_type="image/png")
    with pytest.raises(ValueError) as exc:
        coro.send(None)
    assert "Gemini API key is not configured" in str(exc.value)
