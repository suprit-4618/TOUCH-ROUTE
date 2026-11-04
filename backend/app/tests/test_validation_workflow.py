import json
from pathlib import Path
import pytest
from app.models.spatial import SpatialEdge, SpatialNode
from app.services.spatial.coordinates import CoordinateTransformer
from app.services.validation.evaluator import FloorPlanEvaluator
from app.services.validation.runner import load_ground_truth, format_report_as_markdown


def test_repeatable_floor_plan_validation_workflow():
    """Verify that the validation framework records all required metrics and accurately evaluates topology."""
    gt_file = Path("backend/benchmarks/synthetic/clinic_two_floor_ground_truth.json")
    assert gt_file.exists(), "Ground truth benchmark file must exist."

    gt = load_ground_truth(str(gt_file))
    assert gt.dataset_type == "synthetic"
    assert gt.original_dimensions["width"] == 1600
    assert gt.original_dimensions["height"] == 1200
    assert len(gt.rooms) == 6

    # Simulate an AI-detected spatial topology for Level 1 & 2
    nodes = [
        SpatialNode(
            id="det-ent",
            label="Main Accessible Entrance",
            node_type="entrance",
            x=152.0,
            y=598.0,
            level_number=1,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialNode(
            id="det-rec",
            label="Central Reception & Check-In",
            node_type="reception",
            room_number="100",
            x=398.0,
            y=602.0,
            level_number=1,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialNode(
            id="det-aud",
            label="Audiology Suite",
            node_type="room",
            room_number="101",
            x=748.0,
            y=352.0,
            level_number=1,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialNode(
            id="det-opt",
            label="Optometry & Low-Vision Exam",
            node_type="room",
            room_number="102",
            x=752.0,
            y=848.0,
            level_number=1,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialNode(
            id="det-wc",
            label="Universal Accessible Restroom",
            node_type="restroom",
            room_number="103",
            x=1048.0,
            y=602.0,
            level_number=1,
            is_accessible=True,
            is_user_verified=True,
        ),
        # Multi-floor transition: elevator
        SpatialNode(
            id="det-elev-l1",
            label="Auditory Braille Elevator",
            node_type="elevator",
            x=600.0,
            y=600.0,
            level_number=1,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialNode(
            id="det-elev-l2",
            label="Auditory Braille Elevator",
            node_type="elevator",
            x=600.0,
            y=600.0,
            level_number=2,
            is_accessible=True,
            is_user_verified=True,
        ),
        # Level 2 Pharmacy
        SpatialNode(
            id="det-pharm",
            label="Outpatient Pharmacy",
            node_type="room",
            room_number="201",
            x=750.0,
            y=350.0,
            level_number=2,
            is_accessible=True,
            is_user_verified=True,
        ),
        # Multi-floor transition: stairs (emergency egress)
        SpatialNode(
            id="det-stair-l1",
            label="East Emergency Stairs",
            node_type="stairs",
            x=1150.0,
            y=350.0,
            level_number=1,
            is_accessible=False,
            is_user_verified=True,
        ),
        SpatialNode(
            id="det-stair-l2",
            label="East Emergency Stairs",
            node_type="stairs",
            x=1150.0,
            y=350.0,
            level_number=2,
            is_accessible=False,
            is_user_verified=True,
        ),
    ]

    edges = [
        SpatialEdge(
            id="e1",
            source_node_id="det-ent",
            target_node_id="det-rec",
            edge_type="door",
            distance_meters=11.2,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialEdge(
            id="e2",
            source_node_id="det-rec",
            target_node_id="det-aud",
            edge_type="door",
            distance_meters=18.5,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialEdge(
            id="e3",
            source_node_id="det-rec",
            target_node_id="det-opt",
            edge_type="door",
            distance_meters=19.2,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialEdge(
            id="e4",
            source_node_id="det-rec",
            target_node_id="det-wc",
            edge_type="door",
            distance_meters=29.0,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialEdge(
            id="e5",
            source_node_id="det-rec",
            target_node_id="det-elev-l1",
            edge_type="corridor_walkway",
            distance_meters=9.0,
            is_accessible=True,
            is_user_verified=True,
        ),
        # Multi-floor elevator transition
        SpatialEdge(
            id="e-interfloor",
            source_node_id="det-elev-l1",
            target_node_id="det-elev-l2",
            edge_type="elevator_transition",
            is_inter_floor=True,
            distance_meters=4.0,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialEdge(
            id="e6",
            source_node_id="det-elev-l2",
            target_node_id="det-pharm",
            edge_type="corridor_walkway",
            distance_meters=8.0,
            is_accessible=True,
            is_user_verified=True,
        ),
        # Stair transitions (inaccessible for step-free)
        SpatialEdge(
            id="e-stair-1",
            source_node_id="det-rec",
            target_node_id="det-stair-l1",
            edge_type="corridor_walkway",
            distance_meters=20.0,
            is_accessible=False,
            is_user_verified=True,
        ),
        SpatialEdge(
            id="e-stair-interfloor",
            source_node_id="det-stair-l1",
            target_node_id="det-stair-l2",
            edge_type="stair_transition",
            is_inter_floor=True,
            distance_meters=4.5,
            is_accessible=False,
            is_user_verified=True,
        ),
        SpatialEdge(
            id="e-stair-2",
            source_node_id="det-stair-l2",
            target_node_id="det-pharm",
            edge_type="corridor_walkway",
            distance_meters=18.0,
            is_accessible=False,
            is_user_verified=True,
        ),
    ]

    transformer = CoordinateTransformer(orig_width=1600, orig_height=1200)
    evaluator = FloorPlanEvaluator(match_distance_threshold_px=60.0)
    report = evaluator.evaluate(
        ground_truth=gt,
        detected_nodes=nodes,
        detected_edges=edges,
        transformer=transformer,
    )

    # 1. Original floor-plan dimensions
    assert report.original_dimensions["width"] == 1600
    assert report.original_dimensions["height"] == 1200

    # 2. Number of manually identified rooms
    assert report.manual_rooms_count == 6

    # 3. AI-detected rooms count
    assert report.detected_rooms_count >= 5

    # 4. Correct and incorrect detections
    assert report.correct_detections >= 5
    assert report.detection_precision >= 0.8
    assert report.detection_recall >= 0.8
    assert report.detection_f1 >= 0.8

    # 5. Door and corridor connectivity accuracy (weakness resolved: 100%)
    assert report.door_connectivity_accuracy == 1.0
    assert report.corridor_connectivity_accuracy == 1.0

    # 6. Coordinate transformation accuracy
    assert report.coordinate_transformation_accuracy >= 99.0
    assert report.max_coordinate_pixel_error < 5.0

    # 7. Graph connectivity errors
    assert len(report.graph_connectivity_errors) == 0

    # 8. Route correctness
    assert report.route_correctness == 1.0

    # 9. Multi-floor transition correctness (weakness resolved: 100%)
    assert report.multi_floor_transition_correctness == 1.0

    # Summary
    assert report.summary_status == "PASS"
    assert "Synthetic Benchmark" in report.audit_notes[0]

    # Markdown report output test
    md = format_report_as_markdown(report)
    assert "TouchRoute Floor Plan Validation Report" in md
    assert "PASS" in md


def test_repeatable_real_world_floor_plan_validation_workflow():
    """Verify that the validation framework accurately processes externally sourced real-world blueprints."""
    gt_file = Path("backend/benchmarks/real_world/template_external_blueprint_ground_truth.json")
    assert gt_file.exists(), "Real-world blueprint benchmark file must exist."

    gt = load_ground_truth(str(gt_file))
    assert gt.dataset_type == "real_world"
    assert gt.original_dimensions["width"] == 2400
    assert gt.original_dimensions["height"] == 1800
    assert len(gt.rooms) == 5

    # Simulated detection from a 2400x1800 blueprint CAD
    nodes = [
        SpatialNode(
            id="rw-det-ent",
            label="West Public Entrance (Automatic Door)",
            node_type="entrance",
            x=222.0,
            y=898.0,
            level_number=1,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialNode(
            id="rw-det-info",
            label="Visitor Information & Guidance Desk",
            node_type="reception",
            room_number="100",
            x=581.0,
            y=902.0,
            level_number=1,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialNode(
            id="rw-det-clerk",
            label="City Clerk & Vital Records",
            node_type="room",
            room_number="104",
            x=1098.0,
            y=552.0,
            level_number=1,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialNode(
            id="rw-det-counsel",
            label="Council Chambers & Hearing Hall",
            node_type="room",
            room_number="110",
            x=1798.0,
            y=899.0,
            level_number=1,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialNode(
            id="rw-det-restroom",
            label="Gender-Neutral Single Occupancy Restroom",
            node_type="restroom",
            room_number="108",
            x=1102.0,
            y=1248.0,
            level_number=1,
            is_accessible=True,
            is_user_verified=True,
        ),
        # Multi-floor elevator
        SpatialNode(
            id="rw-det-elev-l1",
            label="West Passenger Elevator (Auditory Signals)",
            node_type="elevator",
            x=600.0,
            y=600.0,
            level_number=1,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialNode(
            id="rw-det-elev-l2",
            label="West Passenger Elevator (Auditory Signals)",
            node_type="elevator",
            x=600.0,
            y=600.0,
            level_number=2,
            is_accessible=True,
            is_user_verified=True,
        ),
    ]

    edges = [
        SpatialEdge(
            id="rw-e1",
            source_node_id="rw-det-ent",
            target_node_id="rw-det-info",
            edge_type="door",
            distance_meters=13.7,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialEdge(
            id="rw-e2",
            source_node_id="rw-det-info",
            target_node_id="rw-det-clerk",
            edge_type="door",
            distance_meters=23.8,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialEdge(
            id="rw-e3",
            source_node_id="rw-det-info",
            target_node_id="rw-det-counsel",
            edge_type="door",
            distance_meters=46.3,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialEdge(
            id="rw-e4",
            source_node_id="rw-det-info",
            target_node_id="rw-det-restroom",
            edge_type="door",
            distance_meters=23.8,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialEdge(
            id="rw-e5",
            source_node_id="rw-det-info",
            target_node_id="rw-det-elev-l1",
            edge_type="corridor_walkway",
            distance_meters=11.4,
            is_accessible=True,
            is_user_verified=True,
        ),
        SpatialEdge(
            id="rw-e-elev",
            source_node_id="rw-det-elev-l1",
            target_node_id="rw-det-elev-l2",
            edge_type="elevator_transition",
            is_inter_floor=True,
            distance_meters=4.0,
            is_accessible=True,
            is_user_verified=True,
        ),
    ]

    transformer = CoordinateTransformer(orig_width=2400, orig_height=1800)
    evaluator = FloorPlanEvaluator(match_distance_threshold_px=80.0)
    report = evaluator.evaluate(
        ground_truth=gt,
        detected_nodes=nodes,
        detected_edges=edges,
        transformer=transformer,
    )

    # 1. Dimensions
    assert report.original_dimensions["width"] == 2400
    assert report.original_dimensions["height"] == 1800

    # 2. Rooms
    assert report.manual_rooms_count == 5
    assert report.detected_rooms_count == 5
    assert report.correct_detections == 5
    assert report.detection_precision == 1.0
    assert report.detection_recall == 1.0

    # 3. Connectivity
    assert report.door_connectivity_accuracy == 1.0
    assert report.corridor_connectivity_accuracy == 1.0
    assert report.multi_floor_transition_correctness == 1.0

    # 4. Geometry and Routing
    assert report.coordinate_transformation_accuracy >= 99.5
    assert report.route_correctness == 1.0
    assert len(report.graph_connectivity_errors) == 0

    # 5. Provenance
    assert report.dataset_type == "real_world"
    assert "Real-World Architectural Blueprint" in report.audit_notes[0]
    assert report.summary_status == "PASS"
