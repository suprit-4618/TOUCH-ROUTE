import pytest
from app.database.session import SessionLocal
from app.models.project import Project
from app.models.spatial import SpatialEdge, SpatialNode
from app.api.routes.navigation import match_spoken_destination
from app.schemas.navigation import DestinationMatchRequest
from app.services.navigation.router import find_accessible_route


@pytest.fixture
def voice_nav_project():
    db = SessionLocal()
    p = Project(
        name="Civic Accessibility Center",
        building_name="Civic Hall",
        is_demo=False,
        status="ready",
    )
    db.add(p)
    db.commit()
    db.refresh(p)

    # Level 1 Nodes
    n_entrance = SpatialNode(
        project_id=p.id,
        label="Main Step-Free Entrance",
        node_type="entrance",
        x=100.0,
        y=500.0,
        level_number=1,
        level_name="Ground Floor",
        is_user_verified=True,
        is_accessible=True,
    )
    n_corridor = SpatialNode(
        project_id=p.id,
        label="Central Corridor",
        node_type="corridor",
        x=250.0,
        y=500.0,
        level_number=1,
        level_name="Ground Floor",
        is_user_verified=True,
        is_accessible=True,
    )
    n_restroom_north = SpatialNode(
        project_id=p.id,
        label="Restroom North",
        room_number="101-A",
        node_type="restroom",
        x=250.0,
        y=350.0,
        level_number=1,
        level_name="Ground Floor",
        is_user_verified=True,
        is_accessible=True,
    )
    n_restroom_south = SpatialNode(
        project_id=p.id,
        label="Restroom South",
        room_number="101-B",
        node_type="restroom",
        x=250.0,
        y=650.0,
        level_number=1,
        level_name="Ground Floor",
        is_user_verified=True,
        is_accessible=True,
    )
    n_elevator_1 = SpatialNode(
        project_id=p.id,
        label="Passenger Elevator",
        node_type="elevator",
        x=400.0,
        y=500.0,
        level_number=1,
        level_name="Ground Floor",
        is_user_verified=True,
        is_accessible=True,
    )

    # Level 2 Nodes
    n_elevator_2 = SpatialNode(
        project_id=p.id,
        label="Passenger Elevator Level 2",
        node_type="elevator",
        x=400.0,
        y=500.0,
        level_number=2,
        level_name="Level 2",
        is_user_verified=True,
        is_accessible=True,
    )
    n_audiology = SpatialNode(
        project_id=p.id,
        label="Audiology & Hearing Suite",
        room_number="204",
        node_type="room",
        x=600.0,
        y=500.0,
        level_number=2,
        level_name="Level 2",
        is_user_verified=True,
        is_accessible=True,
    )

    db.add_all([
        n_entrance,
        n_corridor,
        n_restroom_north,
        n_restroom_south,
        n_elevator_1,
        n_elevator_2,
        n_audiology,
    ])
    db.commit()

    # Edges
    e1 = SpatialEdge(project_id=p.id, source_node_id=n_entrance.id, target_node_id=n_corridor.id, distance_meters=6.0, edge_type="corridor", is_user_verified=True, is_accessible=True)
    e2 = SpatialEdge(project_id=p.id, source_node_id=n_corridor.id, target_node_id=n_restroom_north.id, distance_meters=7.5, edge_type="door", is_user_verified=True, is_accessible=True)
    e3 = SpatialEdge(project_id=p.id, source_node_id=n_corridor.id, target_node_id=n_restroom_south.id, distance_meters=7.5, edge_type="door", is_user_verified=True, is_accessible=True)
    e4 = SpatialEdge(project_id=p.id, source_node_id=n_corridor.id, target_node_id=n_elevator_1.id, distance_meters=7.0, edge_type="corridor", is_user_verified=True, is_accessible=True)
    # Vertical elevator transition
    e_lift = SpatialEdge(project_id=p.id, source_node_id=n_elevator_1.id, target_node_id=n_elevator_2.id, distance_meters=4.0, edge_type="elevator", is_inter_floor=True, is_user_verified=True, is_accessible=True)
    e5 = SpatialEdge(project_id=p.id, source_node_id=n_elevator_2.id, target_node_id=n_audiology.id, distance_meters=10.0, edge_type="door", is_user_verified=True, is_accessible=True)

    db.add_all([e1, e2, e3, e4, e_lift, e5])
    db.commit()

    yield p.id, {
        "entrance": n_entrance,
        "restroom_north": n_restroom_north,
        "restroom_south": n_restroom_south,
        "audiology": n_audiology,
    }

    # Clean up
    del_p = db.query(Project).filter(Project.id == p.id).first()
    if del_p:
        db.delete(del_p)
        db.commit()
    db.close()


def test_deterministic_voice_instruction_generation(voice_nav_project):
    project_id, nodes = voice_nav_project
    db = SessionLocal()
    try:
        all_nodes = db.query(SpatialNode).filter(SpatialNode.project_id == project_id).all()
        all_edges = db.query(SpatialEdge).filter(SpatialEdge.project_id == project_id).all()

        route = find_accessible_route(
            nodes=all_nodes,
            edges=all_edges,
            start_node_id=nodes["entrance"].id,
            destination_node_id=nodes["audiology"].id,
            accessible_only=True,
            verified_only=True,
            is_scale_calibrated=True,
        )

        assert route.is_verified_safe is True
        assert len(route.steps) >= 4

        # Check step 1: starting instruction
        assert "Start from Main Step-Free Entrance" in route.steps[0].instruction
        assert route.steps[0].action == "start"

        # Check elevator vertical transition instruction
        elevator_step = next(s for s in route.steps if s.action == "elevator")
        assert "Take the elevator up from Ground Floor to Level 2" in elevator_step.instruction

        # Check final destination arrival
        last_step = route.steps[-1]
        assert "Arrive at your destination: Audiology & Hearing Suite" in last_step.instruction
        assert last_step.action == "arrive"

    finally:
        db.close()


def test_uncalibrated_scale_relative_cues(voice_nav_project):
    project_id, nodes = voice_nav_project
    db = SessionLocal()
    try:
        all_nodes = db.query(SpatialNode).filter(SpatialNode.project_id == project_id).all()
        all_edges = db.query(SpatialEdge).filter(SpatialEdge.project_id == project_id).all()

        route = find_accessible_route(
            nodes=all_nodes,
            edges=all_edges,
            start_node_id=nodes["entrance"].id,
            destination_node_id=nodes["restroom_north"].id,
            accessible_only=True,
            verified_only=True,
            is_scale_calibrated=False,  # Uncalibrated blueprint
        )

        assert route.is_scale_calibrated is False
        assert route.total_distance_meters == 0.0

        # Instructions must NOT contain fake metric estimates (e.g. "X meters")
        for s in route.steps[1:]:
            assert "meters" not in s.instruction
            assert s.distance_meters == 0.0

    finally:
        db.close()


def test_voice_destination_matching_exact_and_ambiguous(voice_nav_project):
    project_id, _ = voice_nav_project
    db = SessionLocal()
    try:
        # 1. Exact speech query: "audiology"
        res1 = match_spoken_destination(
            project_id=project_id,
            payload=DestinationMatchRequest(spoken_query="take me to audiology"),
            db=db,
        )
        assert res1.is_ambiguous is False
        assert res1.exact_match is not None
        assert "Audiology" in res1.exact_match.label

        # 2. Ambiguous speech query: "restroom" (matches North and South)
        res2 = match_spoken_destination(
            project_id=project_id,
            payload=DestinationMatchRequest(spoken_query="where is the restroom"),
            db=db,
        )
        assert res2.is_ambiguous is True
        assert res2.exact_match is None
        assert len(res2.candidates) == 2
        assert "found" in (res2.clarification_prompt or "").lower()

        # 3. Room number query: "204"
        res3 = match_spoken_destination(
            project_id=project_id,
            payload=DestinationMatchRequest(spoken_query="navigate to room 204"),
            db=db,
        )
        assert res3.is_ambiguous is False
        assert res3.exact_match is not None
        assert res3.exact_match.room_number == "204"

        # 4. Unknown location query
        res4 = match_spoken_destination(
            project_id=project_id,
            payload=DestinationMatchRequest(spoken_query="cafeteria buffet"),
            db=db,
        )
        assert res4.exact_match is None
        assert len(res4.candidates) == 0

    finally:
        db.close()
