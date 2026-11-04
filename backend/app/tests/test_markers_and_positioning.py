import pytest
from app.database.session import SessionLocal
from app.models.marker import LocationMarker
from app.models.project import Project
from app.models.spatial import SpatialEdge, SpatialNode
from app.schemas.marker import LocationMarkerCreate
from app.schemas.positioning import (
    PositioningState,
    PositionUpdatePayload,
    RelocalizeRequest,
)
from app.services.navigation.positioning import positioning_engine
from app.services.navigation.router import find_accessible_route


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_hospital_test_fixture(db_session):
    """Explicit test fixture: seeds hospital test dataset for automated testing only."""
    from app.database.seed import seed_hospital_demonstration
    seed_hospital_demonstration(db_session)


def test_hospital_demonstration_data_seeded(db_session):
    """Verifies that Metropolitan General Hospital is seeded with 3 floors and 7 markers."""
    hosp = db_session.query(Project).filter(Project.id == "demo-metro-hospital").first()
    assert hosp is not None
    assert hosp.is_demo is True
    assert hosp.status == "verified"

    # Verify 3 floors
    assert len(hosp.floor_plans) == 3

    # Verify markers
    markers = db_session.query(LocationMarker).filter(LocationMarker.project_id == "demo-metro-hospital").all()
    assert len(markers) >= 7

    marker_codes = [m.marker_code for m in markers]
    assert "TR-HOSP-G-ENT" in marker_codes
    assert "TR-HOSP-G-REC" in marker_codes
    assert "TR-HOSP-G-ELEV" in marker_codes
    assert "TR-HOSP-1-CARD" in marker_codes


def test_marker_resolution_contract(client):
    """Verifies GET /api/v1/markers/resolve/{marker_code} returns verified starting node."""
    resp = client.get("/api/v1/markers/resolve/TR-HOSP-G-ENT")
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["marker_code"] == "TR-HOSP-G-ENT"
    assert data["building_name"] == "City Hospital Main Complex"
    assert data["node_label"] == "Main Entrance (Accessible Portico)"
    assert data["level_number"] == 1
    assert "Location confirmed" in data["voice_announcement"]
    assert "does not continuously track you" in data["disclaimer"]


def test_invalid_marker_code_returns_404(client):
    """Verifies nonexistent marker codes return HTTP 404."""
    resp = client.get("/api/v1/markers/resolve/NONEXISTENT_CODE")
    assert resp.status_code == 404


def test_multi_floor_accessible_route_to_cardiology(db_session):
    """Verifies accessible step-free route from Ground Entrance to First Floor Cardiology."""
    nodes = db_session.query(SpatialNode).filter(SpatialNode.project_id == "demo-metro-hospital").all()
    edges = db_session.query(SpatialEdge).filter(SpatialEdge.project_id == "demo-metro-hospital").all()

    route = find_accessible_route(
        nodes=nodes,
        edges=edges,
        start_node_id="node-hosp-g-entrance",
        destination_node_id="node-hosp-1-cardiology",
        accessible_only=True,
        verified_only=True,
    )

    assert route.accessible is True
    assert route.total_distance_meters > 0
    # Must use elevator transition, not stairs
    actions = [s.action for s in route.steps]
    assert "elevator" in actions
    assert "stairs" not in actions

    # Instructions contain elevator and cardiology
    full_text = " ".join(s.instruction for s in route.steps)
    assert "elevator" in full_text.lower()
    assert "cardiology" in full_text.lower()


def test_positioning_on_track_high_confidence(db_session):
    """Verifies positioning on verified route maintains POSITION_ESTIMATED with confidence > 0.8."""
    payload = PositionUpdatePayload(
        session_id="test-session-1",
        project_id="demo-metro-hospital",
        estimated_x=220.0,
        estimated_y=600.0,
        current_level=1,
        step_count=2,
        active_step_index=0,
        route_node_ids=["node-hosp-g-entrance", "node-hosp-g-reception", "node-hosp-g-elevator"],
    )

    res = positioning_engine.process_position_update(db_session, payload)
    assert res.state == PositioningState.POSITION_ESTIMATED
    assert res.confidence_score >= 0.85
    assert res.is_uncertain is False
    assert res.safety_alert is None


def test_positioning_uncertainty_triggers_safety_halt(db_session):
    """Verifies cross-track drift triggers POSITION_UNCERTAIN with explicit safety warning prompt."""
    # Drift 80px off path (80px * 0.05m/px = 4.0 meters off route)
    payload = PositionUpdatePayload(
        session_id="test-session-2",
        project_id="demo-metro-hospital",
        estimated_x=300.0,
        estimated_y=680.0,
        current_level=1,
        step_count=5,
        active_step_index=0,
        route_node_ids=["node-hosp-g-entrance", "node-hosp-g-reception"],
    )

    res = positioning_engine.process_position_update(db_session, payload)
    assert res.state == PositioningState.POSITION_UNCERTAIN
    assert res.is_uncertain is True
    assert res.confidence_score <= 0.60
    assert "not confident about your current location" in res.relocalization_prompt


def test_positioning_lost_demands_relocalization(db_session):
    """Verifies severe deviation (>6.0m) shifts to POSITION_LOST and demands safe halt."""
    # Drift 200px off path (200px * 0.05m/px = 10.0 meters off route)
    payload = PositionUpdatePayload(
        session_id="test-session-3",
        project_id="demo-metro-hospital",
        estimated_x=300.0,
        estimated_y=800.0,
        current_level=1,
        step_count=10,
        active_step_index=0,
        route_node_ids=["node-hosp-g-entrance", "node-hosp-g-reception"],
    )

    res = positioning_engine.process_position_update(db_session, payload)
    assert res.state == PositioningState.POSITION_LOST
    assert res.is_uncertain is True
    assert "Navigation paused" in res.safety_alert


def test_relocalize_via_marker_restores_confidence(db_session):
    """Verifies relocalization via NFC/QR marker resets state to POSITION_CONFIRMED at 1.0 confidence."""
    req = RelocalizeRequest(
        session_id="test-session-3",
        project_id="demo-metro-hospital",
        marker_code="TR-HOSP-G-REC",
    )

    res = positioning_engine.relocalize(db_session, req)
    assert res.state == PositioningState.POSITION_CONFIRMED
    assert res.confidence_score == 1.0
    assert res.is_uncertain is False
    assert res.nearest_node_id == "node-hosp-g-reception"
    assert "Location re-established" in res.instruction

