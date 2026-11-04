import pytest
from app.models.spatial import SpatialNode, SpatialEdge
from app.services.navigation.router import find_accessible_route, calculate_turn_direction


def test_turn_direction_calculation():
    assert calculate_turn_direction(0, 0) == "straight"
    assert calculate_turn_direction(0, 90) == "turn_right"
    assert calculate_turn_direction(0, 270) == "turn_left"
    assert calculate_turn_direction(90, 180) == "turn_right"


def test_verified_route_calculation():
    # Setup test graph with human-verified nodes and edges
    n1 = SpatialNode(id="n1", project_id="p1", label="Entrance", node_type="entrance", x=0.0, y=0.0, is_accessible=True, is_user_verified=True)
    n2 = SpatialNode(id="n2", project_id="p1", label="Corridor Jct", node_type="corridor", x=0.0, y=10.0, is_accessible=True, is_user_verified=True)
    n3 = SpatialNode(id="n3", project_id="p1", label="Room 101", node_type="room", x=10.0, y=10.0, is_accessible=True, is_user_verified=True)

    e1 = SpatialEdge(id="e1", project_id="p1", source_node_id="n1", target_node_id="n2", distance_meters=10.0, is_accessible=True, is_user_verified=True)
    e2 = SpatialEdge(id="e2", project_id="p1", source_node_id="n2", target_node_id="n3", distance_meters=10.0, is_accessible=True, is_user_verified=True)

    route = find_accessible_route(
        nodes=[n1, n2, n3],
        edges=[e1, e2],
        start_node_id="n1",
        destination_node_id="n3",
        accessible_only=True,
        verified_only=True,
    )

    assert route.path_node_ids == ["n1", "n2", "n3"]
    assert route.total_distance_meters == 20.0
    assert route.is_verified_safe is True
    assert route.has_unverified_segments is False
    assert len(route.steps) >= 2


def test_unverified_node_rejected_by_default():
    # n3 is unverified AI detection
    n1 = SpatialNode(id="n1", project_id="p1", label="Entrance", node_type="entrance", x=0.0, y=0.0, is_accessible=True, is_user_verified=True)
    n2 = SpatialNode(id="n2", project_id="p1", label="Room Unverified", node_type="room", x=10.0, y=0.0, is_accessible=True, is_user_verified=False)
    e1 = SpatialEdge(id="e1", project_id="p1", source_node_id="n1", target_node_id="n2", distance_meters=10.0, is_accessible=True, is_user_verified=False)

    # verified_only=True must raise safety exception
    with pytest.raises(ValueError) as exc:
        find_accessible_route(
            nodes=[n1, n2],
            edges=[e1],
            start_node_id="n1",
            destination_node_id="n2",
            verified_only=True,
        )
    assert "human-verified" in str(exc.value)

    # verified_only=False returns route but flags it as unverified
    route = find_accessible_route(
        nodes=[n1, n2],
        edges=[e1],
        start_node_id="n1",
        destination_node_id="n2",
        verified_only=False,
    )
    assert route.is_verified_safe is False
    assert route.has_unverified_segments is True
    assert "CAUTION" in route.unverified_warning
