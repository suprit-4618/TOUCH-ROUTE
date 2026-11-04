import pytest
from app.api.routes.analysis import (
    batch_verify_elements,
    create_spatial_edge,
    create_spatial_node,
    delete_spatial_edge,
    delete_spatial_node,
    get_spatial_edges,
    get_spatial_nodes,
    update_spatial_edge,
    update_spatial_node,
)
from app.database.session import SessionLocal
from app.models.project import Project
from app.schemas.spatial import (
    BatchVerifyRequest,
    SpatialEdgeCreate,
    SpatialEdgeUpdate,
    SpatialNodeCreate,
    SpatialNodeUpdate,
)


@pytest.fixture
def project_context():
    db = SessionLocal()
    p = Project(
        name="Spatial Analysis Test Facility",
        building_name="Tower 1",
        is_demo=False,
        status="draft",
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    proj_id = p.id
    db.close()
    yield proj_id
    # Clean up
    db = SessionLocal()
    del_p = db.query(Project).filter(Project.id == proj_id).first()
    if del_p:
        db.delete(del_p)
        db.commit()
    db.close()


def test_spatial_crud_and_batch_verification(project_context):
    db = SessionLocal()
    try:
        # 1. Create two spatial nodes (AI suggestions: is_user_verified=False)
        node_req1 = SpatialNodeCreate(
            project_id=project_context,
            label="Room 201 - Audiology",
            node_type="room",
            room_number="201",
            x=200.0,
            y=150.0,
            is_accessible=True,
            is_user_verified=False,
            level_number=2,
            level_name="Level 2",
        )
        n1 = create_spatial_node(node_req1, db=db)
        assert n1.id is not None
        assert n1.is_user_verified is False

        node_req2 = SpatialNodeCreate(
            project_id=project_context,
            label="Main Corridor 2A",
            node_type="corridor",
            x=350.0,
            y=150.0,
            is_accessible=True,
            is_user_verified=False,
            level_number=2,
            level_name="Level 2",
        )
        n2 = create_spatial_node(node_req2, db=db)
        assert n2.id is not None

        # 2. Create edge between them
        edge_req = SpatialEdgeCreate(
            project_id=project_context,
            source_node_id=n1.id,
            target_node_id=n2.id,
            distance_meters=7.5,
            edge_type="door",
            is_accessible=True,
            is_user_verified=False,
            level_number=2,
        )
        edge = create_spatial_edge(edge_req, db=db)
        assert edge.id is not None
        assert edge.is_user_verified is False

        # 3. Update node (rename and mark user verified)
        update_node_req = SpatialNodeUpdate(
            label="Room 201 - Audiology & Speech",
            room_number="201-A",
            is_user_verified=True,
        )
        updated_n1 = update_spatial_node(n1.id, payload=update_node_req, db=db)
        assert updated_n1.label == "Room 201 - Audiology & Speech"
        assert updated_n1.room_number == "201-A"
        assert updated_n1.is_user_verified is True

        # 4. Batch verify remaining unverified elements
        batch_req = BatchVerifyRequest(
            project_id=project_context,
            verify_all_validated=True,
        )
        batch_res = batch_verify_elements(batch_req, db=db)
        assert batch_res.verified_nodes_count >= 1
        assert batch_res.verified_edges_count >= 1

        # 5. Delete edge and nodes
        delete_spatial_edge(edge.id, db=db)
        delete_spatial_node(n1.id, db=db)
        delete_spatial_node(n2.id, db=db)

        # Confirm deletion
        remaining_nodes = get_spatial_nodes(project_context, db=db)
        assert len(remaining_nodes) == 0

    finally:
        db.close()

