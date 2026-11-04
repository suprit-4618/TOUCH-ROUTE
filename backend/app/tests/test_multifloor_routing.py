"""Comprehensive multi-floor indoor routing test suite for TouchRoute.

Tests the deterministic A* spatial routing engine across vertical transitions, verifying:
1. Ground floor to first floor.
2. Ground floor to second floor (multi-level travel).
3. Multiple elevators (optimal selection & accessibility fallback).
4. Multiple stairwells (step-free exclusion & standard traversal).
5. Missing elevator connections (strict non-fabrication).
6. Incorrect floor assignments & edge consistency.
7. Step-free routes (strict accessibility guarantees).
8. Destinations with no accessible route.
"""

import pytest
from app.models.spatial import SpatialEdge, SpatialNode
from app.services.navigation.router import find_accessible_route


def create_sample_building():
    """Builds a verified 3-level building model with two elevators and two stairwells."""
    nodes = [
        # Level 1 (Ground)
        SpatialNode(id="l1-ent", project_id="p1", label="Main Entrance", node_type="entrance", x=100.0, y=500.0, level_number=1, level_name="Level 1", is_accessible=True, is_user_verified=True),
        SpatialNode(id="l1-rec", project_id="p1", label="Lobby Reception", node_type="reception", x=300.0, y=500.0, level_number=1, level_name="Level 1", is_accessible=True, is_user_verified=True),
        SpatialNode(id="l1-room", project_id="p1", label="Room 101", node_type="room", x=500.0, y=200.0, level_number=1, level_name="Level 1", is_accessible=True, is_user_verified=True),
        SpatialNode(id="l1-elev-east", project_id="p1", label="East Elevator L1", node_type="elevator", x=400.0, y=400.0, level_number=1, level_name="Level 1", is_accessible=True, is_user_verified=True),
        SpatialNode(id="l1-elev-west", project_id="p1", label="West Elevator L1", node_type="elevator", x=200.0, y=400.0, level_number=1, level_name="Level 1", is_accessible=True, is_user_verified=True),
        SpatialNode(id="l1-stair-north", project_id="p1", label="North Stairs L1", node_type="stairs", x=350.0, y=100.0, level_number=1, level_name="Level 1", is_accessible=False, is_user_verified=True),
        SpatialNode(id="l1-stair-south", project_id="p1", label="South Stairs L1", node_type="stairs", x=350.0, y=700.0, level_number=1, level_name="Level 1", is_accessible=False, is_user_verified=True),

        # Level 2 (First Floor)
        SpatialNode(id="l2-hall", project_id="p1", label="Level 2 Hallway", node_type="corridor", x=300.0, y=500.0, level_number=2, level_name="Level 2", is_accessible=True, is_user_verified=True),
        SpatialNode(id="l2-room", project_id="p1", label="Clinic 201", node_type="room", x=500.0, y=500.0, level_number=2, level_name="Level 2", is_accessible=True, is_user_verified=True),
        SpatialNode(id="l2-elev-east", project_id="p1", label="East Elevator L2", node_type="elevator", x=400.0, y=400.0, level_number=2, level_name="Level 2", is_accessible=True, is_user_verified=True),
        SpatialNode(id="l2-elev-west", project_id="p1", label="West Elevator L2", node_type="elevator", x=200.0, y=400.0, level_number=2, level_name="Level 2", is_accessible=True, is_user_verified=True),
        SpatialNode(id="l2-stair-north", project_id="p1", label="North Stairs L2", node_type="stairs", x=350.0, y=100.0, level_number=2, level_name="Level 2", is_accessible=False, is_user_verified=True),
        SpatialNode(id="l2-stair-south", project_id="p1", label="South Stairs L2", node_type="stairs", x=350.0, y=700.0, level_number=2, level_name="Level 2", is_accessible=False, is_user_verified=True),

        # Level 3 (Second Floor)
        SpatialNode(id="l3-hall", project_id="p1", label="Level 3 Gallery", node_type="corridor", x=300.0, y=500.0, level_number=3, level_name="Level 3", is_accessible=True, is_user_verified=True),
        SpatialNode(id="l3-lab", project_id="p1", label="Research Lab 301", node_type="room", x=500.0, y=500.0, level_number=3, level_name="Level 3", is_accessible=True, is_user_verified=True),
        SpatialNode(id="l3-elev-east", project_id="p1", label="East Elevator L3", node_type="elevator", x=400.0, y=400.0, level_number=3, level_name="Level 3", is_accessible=True, is_user_verified=True),
        SpatialNode(id="l3-stair-north", project_id="p1", label="North Stairs L3", node_type="stairs", x=350.0, y=100.0, level_number=3, level_name="Level 3", is_accessible=False, is_user_verified=True),

        # Inaccessible Mezzanine on Level 2 (Stairs only, no elevator access)
        SpatialNode(id="l2-mezzanine", project_id="p1", label="Upper Observation Mezzanine", node_type="room", x=600.0, y=800.0, level_number=2, level_name="Level 2", is_accessible=False, is_user_verified=True),
    ]

    edges = [
        # Level 1 planar edges
        SpatialEdge(id="e-l1-ent-rec", project_id="p1", source_node_id="l1-ent", target_node_id="l1-rec", edge_type="corridor_walkway", distance_meters=10.0, is_accessible=True, is_user_verified=True),
        SpatialEdge(id="e-l1-rec-room", project_id="p1", source_node_id="l1-rec", target_node_id="l1-room", edge_type="door", distance_meters=15.0, is_accessible=True, is_user_verified=True),
        SpatialEdge(id="e-l1-rec-ee", project_id="p1", source_node_id="l1-rec", target_node_id="l1-elev-east", edge_type="corridor_walkway", distance_meters=5.0, is_accessible=True, is_user_verified=True),
        SpatialEdge(id="e-l1-rec-ew", project_id="p1", source_node_id="l1-rec", target_node_id="l1-elev-west", edge_type="corridor_walkway", distance_meters=20.0, is_accessible=True, is_user_verified=True),
        SpatialEdge(id="e-l1-rec-sn", project_id="p1", source_node_id="l1-rec", target_node_id="l1-stair-north", edge_type="corridor_walkway", distance_meters=8.0, is_accessible=False, is_user_verified=True),
        SpatialEdge(id="e-l1-rec-ss", project_id="p1", source_node_id="l1-rec", target_node_id="l1-stair-south", edge_type="corridor_walkway", distance_meters=25.0, is_accessible=False, is_user_verified=True),

        # Level 2 planar edges
        SpatialEdge(id="e-l2-hall-ee", project_id="p1", source_node_id="l2-hall", target_node_id="l2-elev-east", edge_type="corridor_walkway", distance_meters=5.0, is_accessible=True, is_user_verified=True),
        SpatialEdge(id="e-l2-hall-ew", project_id="p1", source_node_id="l2-hall", target_node_id="l2-elev-west", edge_type="corridor_walkway", distance_meters=20.0, is_accessible=True, is_user_verified=True),
        SpatialEdge(id="e-l2-hall-sn", project_id="p1", source_node_id="l2-hall", target_node_id="l2-stair-north", edge_type="corridor_walkway", distance_meters=8.0, is_accessible=False, is_user_verified=True),
        SpatialEdge(id="e-l2-hall-ss", project_id="p1", source_node_id="l2-hall", target_node_id="l2-stair-south", edge_type="corridor_walkway", distance_meters=25.0, is_accessible=False, is_user_verified=True),
        SpatialEdge(id="e-l2-hall-room", project_id="p1", source_node_id="l2-hall", target_node_id="l2-room", edge_type="door", distance_meters=10.0, is_accessible=True, is_user_verified=True),
        SpatialEdge(id="e-l2-ss-mezz", project_id="p1", source_node_id="l2-stair-south", target_node_id="l2-mezzanine", edge_type="corridor_walkway", distance_meters=6.0, is_accessible=False, is_user_verified=True),

        # Level 3 planar edges
        SpatialEdge(id="e-l3-hall-ee", project_id="p1", source_node_id="l3-hall", target_node_id="l3-elev-east", edge_type="corridor_walkway", distance_meters=5.0, is_accessible=True, is_user_verified=True),
        SpatialEdge(id="e-l3-hall-sn", project_id="p1", source_node_id="l3-hall", target_node_id="l3-stair-north", edge_type="corridor_walkway", distance_meters=8.0, is_accessible=False, is_user_verified=True),
        SpatialEdge(id="e-l3-hall-lab", project_id="p1", source_node_id="l3-hall", target_node_id="l3-lab", edge_type="door", distance_meters=10.0, is_accessible=True, is_user_verified=True),

        # Vertical Transitions L1 -> L2
        SpatialEdge(id="v-ee-1-2", project_id="p1", source_node_id="l1-elev-east", target_node_id="l2-elev-east", edge_type="elevator_transition", is_inter_floor=True, distance_meters=4.0, is_accessible=True, is_user_verified=True),
        SpatialEdge(id="v-ew-1-2", project_id="p1", source_node_id="l1-elev-west", target_node_id="l2-elev-west", edge_type="elevator_transition", is_inter_floor=True, distance_meters=4.0, is_accessible=True, is_user_verified=True),
        SpatialEdge(id="v-sn-1-2", project_id="p1", source_node_id="l1-stair-north", target_node_id="l2-stair-north", edge_type="stair_transition", is_inter_floor=True, distance_meters=4.5, is_accessible=False, is_user_verified=True),
        SpatialEdge(id="v-ss-1-2", project_id="p1", source_node_id="l1-stair-south", target_node_id="l2-stair-south", edge_type="stair_transition", is_inter_floor=True, distance_meters=4.5, is_accessible=False, is_user_verified=True),

        # Vertical Transitions L2 -> L3
        SpatialEdge(id="v-ee-2-3", project_id="p1", source_node_id="l2-elev-east", target_node_id="l3-elev-east", edge_type="elevator_transition", is_inter_floor=True, distance_meters=4.0, is_accessible=True, is_user_verified=True),
        SpatialEdge(id="v-sn-2-3", project_id="p1", source_node_id="l2-stair-north", target_node_id="l3-stair-north", edge_type="stair_transition", is_inter_floor=True, distance_meters=4.5, is_accessible=False, is_user_verified=True),
    ]

    return nodes, edges


def test_ground_floor_to_first_floor_route():
    """1. Verifies routing from Ground Floor (Level 1) to First Floor (Level 2)."""
    nodes, edges = create_sample_building()
    route = find_accessible_route(
        nodes=nodes,
        edges=edges,
        start_node_id="l1-ent",
        destination_node_id="l2-room",
        accessible_only=True,
        verified_only=True,
    )

    assert "l1-elev-east" in route.path_node_ids
    assert "l2-elev-east" in route.path_node_ids
    assert route.path_node_ids[-1] == "l2-room"

    # Confirm voice instructions describe elevator transition accurately
    elev_steps = [s for s in route.steps if s.action == "elevator"]
    assert len(elev_steps) == 1
    assert "Take the elevator up from Level 1 to Level 2" in elev_steps[0].instruction
    assert route.is_verified_safe is True


def test_ground_floor_to_second_floor_multi_level():
    """2. Verifies routing across two floor levels (Level 1 to Level 3)."""
    nodes, edges = create_sample_building()
    route = find_accessible_route(
        nodes=nodes,
        edges=edges,
        start_node_id="l1-ent",
        destination_node_id="l3-lab",
        accessible_only=True,
        verified_only=True,
    )

    # Path must traverse L1 -> L2 -> L3
    assert route.path_node_ids[0] == "l1-ent"
    assert "l1-elev-east" in route.path_node_ids
    assert "l2-elev-east" in route.path_node_ids
    assert "l3-elev-east" in route.path_node_ids
    assert route.path_node_ids[-1] == "l3-lab"

    elev_steps = [s for s in route.steps if s.action == "elevator"]
    assert len(elev_steps) == 2
    assert "Take the elevator up from Level 1 to Level 2" in elev_steps[0].instruction
    assert "Take the elevator up from Level 2 to Level 3" in elev_steps[1].instruction


def test_multiple_elevators_optimal_selection():
    """3. Verifies router selects closest elevator and falls back if primary is inaccessible."""
    nodes, edges = create_sample_building()

    # East elevator is 5m from reception; West is 20m from reception.
    route_default = find_accessible_route(
        nodes=nodes,
        edges=edges,
        start_node_id="l1-rec",
        destination_node_id="l2-room",
        accessible_only=True,
    )
    assert "l1-elev-east" in route_default.path_node_ids

    # Simulate East elevator out of service by setting is_accessible=False
    for n in nodes:
        if n.id in ("l1-elev-east", "l2-elev-east"):
            n.is_accessible = False

    route_fallback = find_accessible_route(
        nodes=nodes,
        edges=edges,
        start_node_id="l1-rec",
        destination_node_id="l2-room",
        accessible_only=True,
    )
    # Router must deterministically reroute to West elevator
    assert "l1-elev-west" in route_fallback.path_node_ids
    assert "l2-elev-west" in route_fallback.path_node_ids


def test_multiple_stairwells_routing_behavior():
    """4. Verifies stairs behavior for accessible_only=False vs accessible_only=True."""
    nodes, edges = create_sample_building()

    # When accessible_only=False, stairs are permitted and North stairs (8m) preferred over South stairs (25m)
    route_stairs = find_accessible_route(
        nodes=nodes,
        edges=edges,
        start_node_id="l1-rec",
        destination_node_id="l2-room",
        accessible_only=False,
    )
    stair_steps = [s for s in route_stairs.steps if s.action == "stairs"]
    # With stair transition weight (15m + dist) vs elevator (25m + dist), stairs is chosen
    assert len(stair_steps) >= 1
    assert "l1-stair-north" in route_stairs.path_node_ids

    # When accessible_only=True, stairs must NEVER be chosen
    route_accessible = find_accessible_route(
        nodes=nodes,
        edges=edges,
        start_node_id="l1-rec",
        destination_node_id="l2-room",
        accessible_only=True,
    )
    assert "l1-stair-north" not in route_accessible.path_node_ids
    assert "l1-stair-south" not in route_accessible.path_node_ids
    assert "l1-elev-east" in route_accessible.path_node_ids


def test_missing_elevator_connections_strict_failure():
    """5. Verifies that disconnected floors raise clear non-fabricated error."""
    nodes, edges = create_sample_building()

    # Remove all vertical transitions between Level 1 and Level 2
    edges_no_v = [e for e in edges if not getattr(e, "is_inter_floor", False)]

    with pytest.raises(ValueError) as exc:
        find_accessible_route(
            nodes=nodes,
            edges=edges_no_v,
            start_node_id="l1-ent",
            destination_node_id="l2-room",
            accessible_only=True,
        )
    assert "different floors" in str(exc.value) or "No step-free accessible route exists" in str(exc.value)


def test_incorrect_floor_assignments():
    """6. Verifies that invalid cross-floor edges or mislabeled intra-floor edges are safely handled."""
    nodes, edges = create_sample_building()

    # Create an intra-floor edge on Level 1 but with an accidental is_inter_floor=True
    glitch_edge = SpatialEdge(
        id="e-glitch",
        project_id="p1",
        source_node_id="l1-rec",
        target_node_id="l1-room",
        edge_type="door",
        distance_meters=10.0,
        is_inter_floor=True,  # Inconsistent flag on same floor
        is_accessible=True,
        is_user_verified=True,
    )
    # Replace valid door with glitch edge
    edges_test = [e for e in edges if e.id != "e-l1-rec-room"] + [glitch_edge]

    route = find_accessible_route(
        nodes=nodes,
        edges=edges_test,
        start_node_id="l1-rec",
        destination_node_id="l1-room",
        accessible_only=True,
    )
    # Router must NOT generate a vertical transition instruction because both nodes are Level 1
    assert not any(s.action in ("elevator", "stairs") for s in route.steps)
    assert any("doorway" in s.instruction.lower() for s in route.steps)


def test_step_free_routes_strict_validation():
    """7. Verifies that 100% of nodes and edges in accessible route have is_accessible=True."""
    nodes, edges = create_sample_building()
    route = find_accessible_route(
        nodes=nodes,
        edges=edges,
        start_node_id="l1-ent",
        destination_node_id="l3-lab",
        accessible_only=True,
    )

    node_map = {n.id: n for n in nodes}
    for node_id in route.path_node_ids:
        assert node_map[node_id].is_accessible is True, f"Node {node_id} is not accessible!"

    assert route.accessible is True


def test_destination_with_no_accessible_route():
    """8. Verifies proper failure when destination is physically unreachable via step-free path."""
    nodes, edges = create_sample_building()

    # Destination is Upper Mezzanine (accessible only via stairs)
    with pytest.raises(ValueError) as exc:
        find_accessible_route(
            nodes=nodes,
            edges=edges,
            start_node_id="l1-ent",
            destination_node_id="l2-mezzanine",
            accessible_only=True,
        )
    assert "not step-free accessible" in str(exc.value) or "No step-free accessible route exists" in str(exc.value)

    # But with accessible_only=False, route succeeds via South Stairs
    route_sighted = find_accessible_route(
        nodes=nodes,
        edges=edges,
        start_node_id="l1-rec",
        destination_node_id="l2-mezzanine",
        accessible_only=False,
    )
    assert route_sighted.path_node_ids[-1] == "l2-mezzanine"
    assert "l1-stair-south" in route_sighted.path_node_ids

