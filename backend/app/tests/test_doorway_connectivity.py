"""Comprehensive doorway connectivity test suite for TouchRoute.

Tests geometric doorway extraction, wall orientation detection, and graph topology:
1. Doorway-to-room association on room perimeter wall.
2. Doorway-to-corridor association.
3. Door orientation detection (horizontal wall vs vertical wall).
4. Overlapping doors deduplication.
5. Multiple doors into the same space (e.g. conference room with 2 separate doors).
6. Rejection of centroid proximity without boundary evidence (strict safety).
7. Non-rectangular polygon boundary doorway association.
"""

import json
import pytest
from app.schemas.spatial import (
    BoundingBox,
    ConnectionEntity,
    RoomEntity,
    SpatialCoordinate,
    StructuredSpatialAnalysis,
    WaypointEntity,
)
from app.services.spatial.coordinates import CoordinateTransformer
from app.services.spatial.validator import SpatialAnalysisValidator


@pytest.fixture
def transformer():
    return CoordinateTransformer(orig_width=1000, orig_height=1000)


@pytest.fixture
def validator(transformer):
    return SpatialAnalysisValidator(transformer=transformer, confidence_threshold=0.6)


def test_doorway_to_room_and_corridor_association(validator):
    """1 & 2. Verifies that a doorway located on the boundary between Room 101 and the Corridor connects to both."""
    analysis = StructuredSpatialAnalysis(
        building_name="Test Facility",
        rooms=[
            RoomEntity(
                id="room-101",
                name="Consultation Office",
                room_number="101",
                bounding_box=BoundingBox(min_x=100.0, min_y=100.0, max_x=300.0, max_y=300.0),
                confidence=0.95,
            ),
            RoomEntity(
                id="corridor-1",
                name="Main Hallway",
                bounding_box=BoundingBox(min_x=300.0, min_y=50.0, max_x=500.0, max_y=500.0),
                confidence=0.95,
            ),
        ],
        doors=[
            # Doorway on the shared wall at X=300.0 (East wall of Room 101, West wall of Corridor)
            WaypointEntity(
                id="door-1",
                label="Office Doorway",
                type="door",
                x=300.0,
                y=200.0,
                confidence=0.92,
            )
        ],
    )

    nodes, edges, report = validator.process_and_validate(analysis)

    door_nodes = [n for n in nodes if n["node_type"] == "door"]
    assert len(door_nodes) == 1
    d_id = door_nodes[0]["id"]

    # Door must be connected to BOTH room-101 and corridor-1
    connected_targets = set()
    for e in edges:
        if e["source_node_id"] == d_id:
            connected_targets.add(e["target_node_id"])
        elif e["target_node_id"] == d_id:
            connected_targets.add(e["source_node_id"])

    assert "room-101" in connected_targets
    assert "corridor-1" in connected_targets


def test_door_wall_orientation_detection(validator):
    """3. Verifies detection of horizontal (North/South) and vertical (West/East) wall orientations."""
    bbox = {"min_x": 100.0, "min_y": 100.0, "max_x": 300.0, "max_y": 300.0}

    # North wall door (horizontal wall, py = min_y = 100.0)
    dist_n, wall_n, orient_n = validator._distance_point_to_box_perimeter(200.0, 102.0, bbox)
    assert wall_n == "north"
    assert orient_n == "horizontal"
    assert dist_n == pytest.approx(2.0)

    # South wall door (horizontal wall, py = max_y = 300.0)
    dist_s, wall_s, orient_s = validator._distance_point_to_box_perimeter(200.0, 298.0, bbox)
    assert wall_s == "south"
    assert orient_s == "horizontal"
    assert dist_s == pytest.approx(2.0)

    # West wall door (vertical wall, px = min_x = 100.0)
    dist_w, wall_w, orient_w = validator._distance_point_to_box_perimeter(98.0, 200.0, bbox)
    assert wall_w == "west"
    assert orient_w == "vertical"
    assert dist_w == pytest.approx(2.0)

    # East wall door (vertical wall, px = max_x = 300.0)
    dist_e, wall_e, orient_e = validator._distance_point_to_box_perimeter(302.0, 200.0, bbox)
    assert wall_e == "east"
    assert orient_e == "vertical"
    assert dist_e == pytest.approx(2.0)


def test_overlapping_doors_deduplication(validator):
    """4. Verifies that duplicate door detections within 25px are merged, retaining highest confidence."""
    analysis = StructuredSpatialAnalysis(
        building_name="Test Facility",
        doors=[
            WaypointEntity(id="d1", label="Door 1", type="door", x=200.0, y=100.0, confidence=0.75),
            WaypointEntity(id="d2", label="Doorway North", type="door", x=204.0, y=102.0, confidence=0.94),
        ],
    )

    nodes, edges, report = validator.process_and_validate(analysis)
    door_nodes = [n for n in nodes if n["node_type"] == "door"]

    assert len(door_nodes) == 1
    assert door_nodes[0]["confidence"] == 0.94
    assert report.duplicates_merged == 1


def test_multiple_doors_between_spaces(validator):
    """5. Verifies that multiple legitimate doors into a large space are both preserved and connected."""
    analysis = StructuredSpatialAnalysis(
        building_name="Lecture Hall Complex",
        rooms=[
            RoomEntity(
                id="auditorium",
                name="Grand Auditorium",
                bounding_box=BoundingBox(min_x=100.0, min_y=100.0, max_x=600.0, max_y=500.0),
                confidence=0.98,
            )
        ],
        doors=[
            # West Entry Door (at X=100, Y=250)
            WaypointEntity(id="door-west", label="West Entrance Door", type="door", x=100.0, y=250.0, confidence=0.95),
            # East Entry Door (at X=600, Y=250) - separated by 500px (> 25px threshold)
            WaypointEntity(id="door-east", label="East Entrance Door", type="door", x=600.0, y=250.0, confidence=0.95),
        ],
    )

    nodes, edges, report = validator.process_and_validate(analysis)
    door_nodes = [n for n in nodes if n["node_type"] == "door"]

    # Both distinct doors must be retained
    assert len(door_nodes) == 2
    assert report.duplicates_merged == 0

    # Both doors must connect to the auditorium
    connected_to_aud = [e for e in edges if e["target_node_id"] == "auditorium" or e["source_node_id"] == "auditorium"]
    assert len(connected_to_aud) == 2


def test_rejection_of_centroid_proximity_without_boundary(validator):
    """6. Verifies that spaces WITHOUT bounding geometry are NOT connected based on centroid proximity."""
    # Room with centroid at (200, 200) but NO bounding box and NO polygon
    analysis = StructuredSpatialAnalysis(
        building_name="Safety Test",
        rooms=[
            RoomEntity(
                id="no-geom-room",
                name="Vague Space",
                coordinates=[SpatialCoordinate(x=200.0, y=200.0)],
                bounding_box=None,
                confidence=0.90,
            )
        ],
        doors=[
            # Door at (220, 200) - 20px from centroid
            WaypointEntity(id="door-near-centroid", label="Door X", type="door", x=220.0, y=200.0, confidence=0.90)
        ],
    )

    nodes, edges, report = validator.process_and_validate(analysis)

    # In TouchRoute safety rules, centroid proximity alone CANNOT create an inferred door edge
    inferred_edges = [e for e in edges if "inferred_door" in e["id"]]
    assert len(inferred_edges) == 0


def test_polygon_boundary_doorway_association(validator):
    """7. Verifies doorway association for non-rectangular L-shaped room with polygon coordinates."""
    # L-shaped room polygon: [(100, 100), (400, 100), (400, 250), (250, 250), (250, 400), (100, 400)]
    poly_pts = [
        SpatialCoordinate(x=100.0, y=100.0),
        SpatialCoordinate(x=400.0, y=100.0),
        SpatialCoordinate(x=400.0, y=250.0),
        SpatialCoordinate(x=250.0, y=250.0),
        SpatialCoordinate(x=250.0, y=400.0),
        SpatialCoordinate(x=100.0, y=400.0),
    ]

    analysis = StructuredSpatialAnalysis(
        building_name="L-Shaped Suite",
        rooms=[
            RoomEntity(
                id="l-room",
                name="Executive Suite",
                coordinates=poly_pts,
                bounding_box=None,
                confidence=0.95,
            )
        ],
        doors=[
            # Doorway on the segment (250, 250) to (250, 400) at (252, 320)
            WaypointEntity(id="poly-door", label="Inner Patio Door", type="door", x=252.0, y=320.0, confidence=0.90)
        ],
    )

    nodes, edges, report = validator.process_and_validate(analysis)

    # Door must successfully connect to l-room via polygon perimeter test
    assert any(e["source_node_id"] == "poly-door" and e["target_node_id"] == "l-room" for e in edges)

