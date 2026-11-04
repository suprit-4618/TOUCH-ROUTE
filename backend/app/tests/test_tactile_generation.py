import struct
import pytest
from app.models.spatial import SpatialEdge, SpatialNode
from app.services.tactile.pdf_generator import generate_tactile_pdf
from app.services.tactile.stl_generator import TactileMapGenerator, TactileSTLMesh
from app.services.tactile.svg_generator import generate_tactile_svg


@pytest.fixture
def sample_verified_spatial_data():
    nodes = [
        SpatialNode(
            id="node-entrance",
            project_id="proj-1",
            label="Main Step-Free Entrance",
            node_type="entrance",
            x=100.0,
            y=400.0,
            bounding_box={"min_x": 80.0, "min_y": 380.0, "max_x": 120.0, "max_y": 420.0},
            is_user_verified=True,
            is_accessible=True,
            level_number=1,
            level_name="Ground Floor",
        ),
        SpatialNode(
            id="node-restroom",
            label="Accessible Restroom",
            node_type="restroom",
            x=300.0,
            y=400.0,
            room_number="102",
            bounding_box={"min_x": 270.0, "min_y": 370.0, "max_x": 330.0, "max_y": 430.0},
            is_user_verified=True,
            is_accessible=True,
            level_number=1,
            level_name="Ground Floor",
        ),
        SpatialNode(
            id="node-clinic",
            label="Audiology Room",
            node_type="room",
            room_number="103",
            x=500.0,
            y=200.0,
            bounding_box={"min_x": 450.0, "min_y": 150.0, "max_x": 550.0, "max_y": 250.0},
            is_user_verified=True,
            is_accessible=True,
            level_number=1,
            level_name="Ground Floor",
        ),
        # Unverified AI prediction (Must be excluded from physical map)
        SpatialNode(
            id="node-unverified-hall",
            label="Unconfirmed Storage Closet",
            node_type="room",
            x=800.0,
            y=200.0,
            is_user_verified=False,
            is_accessible=False,
        ),
    ]

    edges = [
        SpatialEdge(
            id="edge-1",
            project_id="proj-1",
            source_node_id="node-entrance",
            target_node_id="node-restroom",
            distance_meters=8.0,
            edge_type="corridor",
            is_user_verified=True,
            is_accessible=True,
        ),
        SpatialEdge(
            id="edge-2",
            project_id="proj-1",
            source_node_id="node-restroom",
            target_node_id="node-clinic",
            distance_meters=12.0,
            edge_type="door",
            is_user_verified=True,
            is_accessible=True,
        ),
        SpatialEdge(
            id="edge-unverified",
            project_id="proj-1",
            source_node_id="node-clinic",
            target_node_id="node-unverified-hall",
            distance_meters=15.0,
            edge_type="corridor",
            is_user_verified=False,
        ),
    ]

    return nodes, edges


def test_tactile_stl_generation_and_mesh_validity(sample_verified_spatial_data):
    nodes, edges = sample_verified_spatial_data

    generator = TactileMapGenerator(
        base_width_mm=180.0,
        base_depth_mm=180.0,
        base_thickness_mm=2.5,
        wall_height_mm=2.5,
        braille_enabled=True,
    )

    mesh, meta = generator.generate_mesh(
        nodes=nodes,
        edges=edges,
        scale_meters_per_pixel=0.05,
        floor_name="Ground Floor",
    )

    # 1. Validation checks
    assert meta["is_valid"] is True
    assert meta["triangle_count"] > 200  # Genuine 3D solid model has hundreds/thousands of facets
    assert meta["dimensions_mm"]["width"] > 0
    assert meta["dimensions_mm"]["depth"] > 0
    assert meta["dimensions_mm"]["height"] >= 2.5

    # 2. Strict verification safety: unverified node was excluded
    assert meta["verified_nodes_count"] == 3
    assert meta["verified_edges_count"] == 2

    # 3. Scale preservation
    assert "1:" in meta["scale_label"]
    assert meta["physical_scale_ratio"] is not None
    assert meta["physical_scale_ratio"] > 0

    # 4. Binary STL export validity
    stl_bytes = mesh.to_binary_stl()
    assert len(stl_bytes) >= 84  # 80 byte header + 4 byte count
    num_triangles = struct.unpack("<I", stl_bytes[80:84])[0]
    assert num_triangles == len(mesh.triangles)
    assert len(stl_bytes) == 84 + num_triangles * 50

    # 5. ASCII STL export validity
    ascii_stl = mesh.to_ascii_stl()
    assert ascii_stl.startswith("solid TouchRouteTactileMap")
    assert ascii_stl.strip().endswith("endsolid TouchRouteTactileMap")
    assert "facet normal" in ascii_stl
    assert "vertex" in ascii_stl


def test_tactile_generation_rejects_unverified_floor_plans():
    # Only unverified nodes
    nodes = [
        SpatialNode(
            id="n1",
            project_id="p1",
            label="Unverified Room",
            node_type="room",
            x=100.0,
            y=100.0,
            is_user_verified=False,
        )
    ]
    edges = []

    generator = TactileMapGenerator()
    with pytest.raises(ValueError) as exc:
        generator.generate_mesh(nodes, edges)
    assert "No human-verified spatial elements exist" in str(exc.value)


def test_tactile_svg_generation(sample_verified_spatial_data):
    nodes, edges = sample_verified_spatial_data
    svg = generate_tactile_svg(
        nodes=nodes,
        edges=edges,
        width_mm=180.0,
        height_mm=180.0,
        scale_meters_per_pixel=0.05,
        building_name="City Hall",
        floor_name="Ground Level",
        braille_enabled=True,
    )

    assert svg.startswith("<svg")
    assert svg.strip().endswith("</svg>")
    assert "NORTH (TACTILE NOTCH)" in svg
    assert 'id="tactile-walls"' in svg
    assert 'id="tactile-symbols"' in svg
    assert 'id="braille-labels"' in svg
    assert 'class="braille-dot"' in svg


def test_tactile_pdf_reference_sheet_generation(sample_verified_spatial_data):
    nodes, edges = sample_verified_spatial_data
    pdf_bytes = generate_tactile_pdf(
        nodes=nodes,
        edges=edges,
        building_name="City Hall",
        floor_name="Ground Level",
        scale_label="1:200 (1 cm = 2.0 m)",
        physical_scale_ratio=200,
        base_dimensions_mm="180 x 180 x 2.5 mm",
    )

    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 1000
    # PDF magic byte signature
    assert pdf_bytes.startswith(b"%PDF-")


def test_tactile_generation_with_json_string_bounding_box_and_doorways():
    """Verify that bounding_box as a JSON string (SQLAlchemy Column(Text)) parses correctly and doorway geometry succeeds."""
    import json
    nodes = [
        SpatialNode(
            id="node-room-1",
            project_id="p-1",
            label="Examination Room 1",
            node_type="room",
            room_number="101",
            x=200.0,
            y=200.0,
            bounding_box=json.dumps({"min_x": 100.0, "min_y": 100.0, "max_x": 300.0, "max_y": 300.0}),
            is_user_verified=True,
            is_accessible=True,
        ),
        SpatialNode(
            id="node-door-1",
            project_id="p-1",
            label="Room 1 Door",
            node_type="door",
            x=200.0,
            y=102.0,
            is_user_verified=True,
            is_accessible=True,
        ),
    ]
    edges = [
        SpatialEdge(
            id="edge-1",
            project_id="p-1",
            source_node_id="node-room-1",
            target_node_id="node-door-1",
            edge_type="door",
            is_user_verified=True,
            is_accessible=True,
        )
    ]

    generator = TactileMapGenerator(base_width_mm=180.0, base_depth_mm=180.0)
    mesh, meta = generator.generate_mesh(nodes, edges, scale_meters_per_pixel=0.05)

    assert meta["is_valid"] is True
    assert meta["triangle_count"] > 100
    assert len(mesh.triangles) > 100

    # Test SVG generation with JSON string bounding box
    svg = generate_tactile_svg(nodes, edges, width_mm=180.0, height_mm=180.0)
    assert "<svg" in svg
    assert 'class="wall"' in svg

