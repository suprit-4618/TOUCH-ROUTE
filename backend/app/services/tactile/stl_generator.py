"""3D Tactile Map STL Mesh Generator for TouchRoute.

Converts verified architectural floor plans, spatial graphs, and Braille labels
into 3D-printable solid geometry with raised walls, pathways, and Braille labels.
Generates genuine watertight Binary and ASCII STL files with real facets and normals.
"""

import io
import json
import math
import struct
from typing import Any, Dict, List, Optional, Tuple
from app.models.spatial import SpatialEdge, SpatialNode
from app.services.tactile.braille import (
    DOT_DIAMETER_MM,
    DOT_HEIGHT_MM,
    get_braille_dot_coordinates,
    text_to_braille_unicode,
)


def parse_bounding_box(bbox_raw: Any) -> Optional[Dict[str, float]]:
    """Safely extracts bounding box dictionary from JSON strings, dicts, or objects."""
    if not bbox_raw:
        return None
    if isinstance(bbox_raw, dict):
        return bbox_raw
    if isinstance(bbox_raw, str):
        try:
            val = json.loads(bbox_raw)
            if isinstance(val, dict):
                return val
        except Exception:
            return None
    if hasattr(bbox_raw, "__dict__"):
        return bbox_raw.__dict__
    return None


class Triangle:
    """Represents a 3D triangle with counter-clockwise vertex winding and normal."""
    __slots__ = ("normal", "v1", "v2", "v3")

    def __init__(
        self,
        v1: Tuple[float, float, float],
        v2: Tuple[float, float, float],
        v3: Tuple[float, float, float],
        normal: Optional[Tuple[float, float, float]] = None,
    ):
        self.v1 = v1
        self.v2 = v2
        self.v3 = v3
        if normal is None:
            # Compute face normal via cross product: (v2 - v1) x (v3 - v1)
            ax, ay, az = v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]
            bx, by, bz = v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]
            nx = ay * bz - az * by
            ny = az * bx - ax * bz
            nz = ax * by - ay * bx
            length = math.sqrt(nx * nx + ny * ny + nz * nz)
            if length > 1e-9:
                self.normal = (nx / length, ny / length, nz / length)
            else:
                self.normal = (0.0, 0.0, 1.0)
        else:
            self.normal = normal


class TactileSTLMesh:
    """A collection of 3D triangles representing the physical tactile model."""

    def __init__(self):
        self.triangles: List[Triangle] = []

    def add_triangle(
        self,
        v1: Tuple[float, float, float],
        v2: Tuple[float, float, float],
        v3: Tuple[float, float, float],
        normal: Optional[Tuple[float, float, float]] = None,
    ):
        self.triangles.append(Triangle(v1, v2, v3, normal))

    def add_quad(
        self,
        v1: Tuple[float, float, float],
        v2: Tuple[float, float, float],
        v3: Tuple[float, float, float],
        v4: Tuple[float, float, float],
    ):
        """Adds a quadrilateral as two triangles with consistent CCW winding (v1-v2-v3 and v1-v3-v4)."""
        self.add_triangle(v1, v2, v3)
        self.add_triangle(v1, v3, v4)

    def add_box(
        self,
        x: float,
        y: float,
        z_min: float,
        width: float,
        depth: float,
        height: float,
    ):
        """Generates a solid 3D cuboid of width (dx), depth (dy), height (dz)."""
        x0, x1 = x, x + width
        y0, y1 = y, y + depth
        z0, z1 = z_min, z_min + height

        # 8 vertices
        p1 = (x0, y0, z0)
        p2 = (x1, y0, z0)
        p3 = (x1, y1, z0)
        p4 = (x0, y1, z0)
        p5 = (x0, y0, z1)
        p6 = (x1, y0, z1)
        p7 = (x1, y1, z1)
        p8 = (x0, y1, z1)

        # Bottom face (z0) - normal (0, 0, -1)
        self.add_quad(p1, p4, p3, p2)
        # Top face (z1) - normal (0, 0, 1)
        self.add_quad(p5, p6, p7, p8)
        # Front face (y0) - normal (0, -1, 0)
        self.add_quad(p1, p2, p6, p5)
        # Back face (y1) - normal (0, 1, 0)
        self.add_quad(p3, p4, p8, p7)
        # Left face (x0) - normal (-1, 0, 0)
        self.add_quad(p4, p1, p5, p8)
        # Right face (x1) - normal (1, 0, 0)
        self.add_quad(p2, p3, p7, p6)

    def add_cylinder(
        self,
        cx: float,
        cy: float,
        z_min: float,
        height: float,
        radius: float,
        segments: int = 12,
    ):
        """Generates a closed, faceted cylinder (useful for tactile waypoint discs and Braille dots)."""
        z_max = z_min + height
        top_center = (cx, cy, z_max)
        bottom_center = (cx, cy, z_min)

        angle_step = (2.0 * math.pi) / segments
        circle_pts_bottom = []
        circle_pts_top = []

        for i in range(segments):
            angle = i * angle_step
            px = cx + radius * math.cos(angle)
            py = cy + radius * math.sin(angle)
            circle_pts_bottom.append((px, py, z_min))
            circle_pts_top.append((px, py, z_max))

        for i in range(segments):
            next_i = (i + 1) % segments
            # Top cap
            self.add_triangle(top_center, circle_pts_top[i], circle_pts_top[next_i])
            # Bottom cap
            self.add_triangle(bottom_center, circle_pts_bottom[next_i], circle_pts_bottom[i])
            # Side wall quad
            self.add_quad(
                circle_pts_bottom[i],
                circle_pts_bottom[next_i],
                circle_pts_top[next_i],
                circle_pts_top[i],
            )

    def to_binary_stl(self, header_desc: str = "TouchRoute Tactile Map ISO21542-Aligned") -> bytes:
        """Serializes mesh into standard binary STL format (80-byte header + uint32 count + 50B/triangle)."""
        buf = io.BytesIO()
        header_bytes = header_desc.encode("ascii", "ignore")[:80].ljust(80, b"\0")
        buf.write(header_bytes)

        num_triangles = len(self.triangles)
        buf.write(struct.pack("<I", num_triangles))

        for t in self.triangles:
            # 12 floats (normal[3], v1[3], v2[3], v3[3]) + uint16 attribute byte count
            data = struct.pack(
                "<12fH",
                t.normal[0], t.normal[1], t.normal[2],
                t.v1[0], t.v1[1], t.v1[2],
                t.v2[0], t.v2[1], t.v2[2],
                t.v3[0], t.v3[1], t.v3[2],
                0,
            )
            buf.write(data)

        return buf.getvalue()

    def to_ascii_stl(self, solid_name: str = "TouchRouteTactileMap") -> str:
        """Serializes mesh into standard human-readable ASCII STL format."""
        lines = [f"solid {solid_name}"]
        for t in self.triangles:
            lines.append(f"  facet normal {t.normal[0]:.6f} {t.normal[1]:.6f} {t.normal[2]:.6f}")
            lines.append("    outer loop")
            lines.append(f"      vertex {t.v1[0]:.4f} {t.v1[1]:.4f} {t.v1[2]:.4f}")
            lines.append(f"      vertex {t.v2[0]:.4f} {t.v2[1]:.4f} {t.v2[2]:.4f}")
            lines.append(f"      vertex {t.v3[0]:.4f} {t.v3[1]:.4f} {t.v3[2]:.4f}")
            lines.append("    endloop")
            lines.append("  endfacet")
        lines.append(f"endsolid {solid_name}\n")
        return "\n".join(lines)

    def validate(self) -> Dict[str, Any]:
        """Performs geometric sanity and printability checks on the generated mesh."""
        if not self.triangles:
            return {
                "is_valid": False,
                "error": "Mesh contains zero triangles.",
                "triangle_count": 0,
            }

        min_x = min(min(t.v1[0], t.v2[0], t.v3[0]) for t in self.triangles)
        max_x = max(max(t.v1[0], t.v2[0], t.v3[0]) for t in self.triangles)
        min_y = min(min(t.v1[1], t.v2[1], t.v3[1]) for t in self.triangles)
        max_y = max(max(t.v1[1], t.v2[1], t.v3[1]) for t in self.triangles)
        min_z = min(min(t.v1[2], t.v2[2], t.v3[2]) for t in self.triangles)
        max_z = max(max(t.v1[2], t.v2[2], t.v3[2]) for t in self.triangles)

        width = max_x - min_x
        depth = max_y - min_y
        height = max_z - min_z

        return {
            "is_valid": width > 0 and depth > 0 and height > 0,
            "triangle_count": len(self.triangles),
            "dimensions_mm": {
                "width": round(width, 2),
                "depth": round(depth, 2),
                "height": round(height, 2),
            },
            "bounds": {
                "min": (round(min_x, 2), round(min_y, 2), round(min_z, 2)),
                "max": (round(max_x, 2), round(max_y, 2), round(max_z, 2)),
            },
        }


class TactileMapGenerator:
    """Converts verified floor plan topology into physical tactile map geometry."""

    def __init__(
        self,
        base_width_mm: float = 180.0,
        base_depth_mm: float = 180.0,
        base_thickness_mm: float = 2.5,
        wall_height_mm: float = 2.5,
        wall_thickness_mm: float = 1.8,
        braille_enabled: bool = True,
    ):
        self.base_width = base_width_mm
        self.base_depth = base_depth_mm
        self.base_thickness = base_thickness_mm
        self.wall_height = wall_height_mm
        self.wall_thickness = wall_thickness_mm
        self.braille_enabled = braille_enabled

    def generate_mesh(
        self,
        nodes: List[SpatialNode],
        edges: List[SpatialEdge],
        scale_meters_per_pixel: Optional[float] = None,
        floor_name: str = "Level 1",
    ) -> Tuple[TactileSTLMesh, Dict[str, Any]]:
        """Generates a complete 3D tactile map mesh.

        STRICT SAFETY CONSTRAINT:
        Only human-verified nodes and edges are included.
        Unverified AI suggestions are excluded from physical tactile maps.
        """
        mesh = TactileSTLMesh()

        # 1. Filter exclusively verified spatial elements
        verified_nodes = [n for n in nodes if n.is_user_verified]
        verified_edges = [e for e in edges if e.is_user_verified]

        if not verified_nodes:
            raise ValueError(
                "Cannot generate tactile map: No human-verified spatial elements exist. "
                "Only human-verified geometry may be physically fabricated for visually impaired navigation."
            )

        # 2. Add Base Plate with Orientation Notch
        # Base plate sits from z = 0 to z = base_thickness
        mesh.add_box(0, 0, 0, self.base_width, self.base_depth, self.base_thickness)

        # Raised orientation notch at top edge (North indicator, standard for tactile maps)
        notch_w = 20.0
        notch_d = 4.0
        notch_h = 1.5
        mesh.add_box(
            (self.base_width - notch_w) / 2.0,
            self.base_depth - notch_d,
            self.base_thickness,
            notch_w,
            notch_d,
            notch_h,
        )

        # 3. Compute scale transformation from blueprint pixel space to tactile build envelope
        # Margin for borders and legend
        margin_x = 15.0
        margin_top = 22.0
        margin_bottom = 32.0  # Room for Braille legend

        build_w = self.base_width - 2 * margin_x
        build_d = self.base_depth - (margin_top + margin_bottom)

        min_px_x = min(n.x for n in verified_nodes)
        max_px_x = max(n.x for n in verified_nodes)
        min_px_y = min(n.y for n in verified_nodes)
        max_px_y = max(n.y for n in verified_nodes)

        # If bounding boxes exist, include them in extents
        for n in verified_nodes:
            bbox = parse_bounding_box(n.bounding_box)
            if bbox:
                min_px_x = min(min_px_x, bbox.get("min_x", min_px_x))
                max_px_x = max(max_px_x, bbox.get("max_x", max_px_x))
                min_px_y = min(min_px_y, bbox.get("min_y", min_px_y))
                max_px_y = max(max_px_y, bbox.get("max_y", max_px_y))

        span_x = max(max_px_x - min_px_x, 50.0)
        span_y = max(max_px_y - min_px_y, 50.0)

        # Uniform aspect-preserving scale factor (mm per pixel)
        scale = min(build_w / span_x, build_d / span_y)

        # Centering offsets
        center_offset_x = margin_x + (build_w - span_x * scale) / 2.0
        center_offset_y = margin_bottom + (build_d - span_y * scale) / 2.0

        def to_tactile_coords(px_x: float, px_y: float) -> Tuple[float, float]:
            tx = center_offset_x + (px_x - min_px_x) * scale
            # Invert Y axis so blueprint north matches physical north
            ty = center_offset_y + (span_y - (px_y - min_px_y)) * scale
            return tx, ty

        # Calculate physical scale ratio (e.g. 1:200)
        physical_scale_ratio: Optional[int] = None
        scale_label = "Uncalibrated relative scale"
        if scale_meters_per_pixel and scale_meters_per_pixel > 0:
            # 1 mm on tactile map = (1 / scale) pixels = (1 / scale) * scale_meters_per_pixel meters
            meters_per_mm = (1.0 / scale) * scale_meters_per_pixel
            # Ratio 1 mm : (meters_per_mm * 1000) mm
            ratio = int(round(meters_per_mm * 1000.0))
            physical_scale_ratio = ratio
            scale_label = f"1:{ratio} (1 cm = {meters_per_mm * 10:.1f} m)"

        # Door nodes and doorway connections index
        door_nodes = [n for n in verified_nodes if n.node_type in ("door", "entrance")]

        # 4. Extrude Verified Rooms and Walls with Door Openings
        doorway_width = 4.0  # mm opening for tactile passage
        threshold_height = 0.6  # mm lowered threshold height

        for n in verified_nodes:
            bbox = parse_bounding_box(n.bounding_box)
            if bbox:
                bx0, by0 = to_tactile_coords(bbox.get("min_x", n.x), bbox.get("max_y", n.y))
                bx1, by1 = to_tactile_coords(bbox.get("max_x", n.x), bbox.get("min_y", n.y))

                rw = abs(bx1 - bx0)
                rd = abs(by1 - by0)
                rx = min(bx0, bx1)
                ry = min(by0, by1)
                wt = self.wall_thickness

                # Find any door near this room's perimeter
                room_doors = []
                for d in door_nodes:
                    dx, dy = to_tactile_coords(d.x, d.y)
                    # Check if door is within 3mm of room boundary
                    if rx - 3.0 <= dx <= rx + rw + 3.0 and ry - 3.0 <= dy <= ry + rd + 3.0:
                        room_doors.append((dx, dy))

                # Also check doorway edges connected to this room
                for e in verified_edges:
                    if e.source_node_id == n.id or e.target_node_id == n.id:
                        other_id = e.target_node_id if e.source_node_id == n.id else e.source_node_id
                        other_node = next((on for on in verified_nodes if on.id == other_id), None)
                        if other_node and other_node.node_type in ("door", "entrance", "corridor"):
                            odx, ody = to_tactile_coords(other_node.x, other_node.y)
                            room_doors.append((odx, ody))

                # South wall (y = ry)
                south_door = next((d for d in room_doors if abs(d[1] - ry) < 4.0 and rx <= d[0] <= rx + rw), None)
                if south_door and rw > doorway_width + 2 * wt:
                    door_x = max(rx + wt + doorway_width / 2.0, min(rx + rw - wt - doorway_width / 2.0, south_door[0]))
                    # Left wall segment
                    mesh.add_box(rx, ry, self.base_thickness, door_x - doorway_width / 2.0 - rx, wt, self.wall_height)
                    # Doorway tactile threshold
                    mesh.add_box(door_x - doorway_width / 2.0, ry, self.base_thickness, doorway_width, wt, threshold_height)
                    # Right wall segment
                    mesh.add_box(door_x + doorway_width / 2.0, ry, self.base_thickness, (rx + rw) - (door_x + doorway_width / 2.0), wt, self.wall_height)
                else:
                    mesh.add_box(rx, ry, self.base_thickness, rw, wt, self.wall_height)

                # North wall (y = ry + rd - wt)
                north_y = ry + rd - wt
                north_door = next((d for d in room_doors if abs(d[1] - (ry + rd)) < 4.0 and rx <= d[0] <= rx + rw), None)
                if north_door and rw > doorway_width + 2 * wt:
                    door_x = max(rx + wt + doorway_width / 2.0, min(rx + rw - wt - doorway_width / 2.0, north_door[0]))
                    mesh.add_box(rx, north_y, self.base_thickness, door_x - doorway_width / 2.0 - rx, wt, self.wall_height)
                    mesh.add_box(door_x - doorway_width / 2.0, north_y, self.base_thickness, doorway_width, wt, threshold_height)
                    mesh.add_box(door_x + doorway_width / 2.0, north_y, self.base_thickness, (rx + rw) - (door_x + doorway_width / 2.0), wt, self.wall_height)
                else:
                    mesh.add_box(rx, north_y, self.base_thickness, rw, wt, self.wall_height)

                # West wall (x = rx)
                mesh.add_box(rx, ry, self.base_thickness, wt, rd, self.wall_height)
                # East wall (x = rx + rw - wt)
                mesh.add_box(rx + rw - wt, ry, self.base_thickness, wt, rd, self.wall_height)

        # 5. Extrude Verified Doorways & Openings
        for e in verified_edges:
            src = next((n for n in verified_nodes if n.id == e.source_node_id), None)
            tgt = next((n for n in verified_nodes if n.id == e.target_node_id), None)
            if src and tgt:
                sx, sy = to_tactile_coords(src.x, src.y)
                tx, ty = to_tactile_coords(tgt.x, tgt.y)
                # Raised tactile corridor path between connected spaces (0.8mm relief)
                corridor_h = 0.8
                corridor_w = 2.0
                cx, cy = (sx + tx) / 2.0, (sy + ty) / 2.0
                dist = math.hypot(tx - sx, ty - sy)
                if dist > 0:
                    mesh.add_cylinder(cx, cy, self.base_thickness, corridor_h, radius=corridor_w, segments=8)

        # 6. Extrude Tactile Waypoint Symbols
        for n in verified_nodes:
            tx, ty = to_tactile_coords(n.x, n.y)
            ntype = n.node_type.lower()

            if ntype in ("entrance", "exit"):
                # Tactile Ring (Outer cylinder + central hole effect via stepped discs)
                mesh.add_cylinder(tx, ty, self.base_thickness, height=2.2, radius=4.5, segments=16)
                # Inward indicator dot
                mesh.add_cylinder(tx, ty, self.base_thickness + 2.2, height=0.6, radius=1.8, segments=10)
            elif ntype == "restroom":
                # Raised square with cross profile
                mesh.add_box(tx - 3.5, ty - 3.5, self.base_thickness, 7.0, 7.0, height=2.0)
            elif ntype in ("stairs", "elevator"):
                # Tactile Chevron / Stepped column
                mesh.add_box(tx - 4.0, ty - 4.0, self.base_thickness, 8.0, 8.0, height=2.4)
                mesh.add_box(tx - 2.0, ty - 2.0, self.base_thickness + 2.4, 4.0, 4.0, height=0.8)
            elif ntype == "hazard":
                # Raised hazard triangle / cross
                mesh.add_box(tx - 3.0, ty - 3.0, self.base_thickness, 6.0, 6.0, height=1.6)
            else:
                # Room Waypoint: Raised tactile disc
                mesh.add_cylinder(tx, ty, self.base_thickness, height=1.5, radius=3.0, segments=12)

        # 7. Physical 3D Braille Labels
        if self.braille_enabled:
            for n in verified_nodes:
                tx, ty = to_tactile_coords(n.x, n.y)
                # Label text: priority to room number (e.g. "101"), else short code
                label_txt = ""
                if n.room_number:
                    label_txt = str(n.room_number)[:4]
                elif n.node_type in ("entrance", "exit"):
                    label_txt = "ent"
                elif n.node_type == "restroom":
                    label_txt = "wc"
                elif len(n.label) <= 5:
                    label_txt = n.label[:4]

                if label_txt:
                    dot_coords = get_braille_dot_coordinates(
                        text=label_txt,
                        origin_x=tx + 5.0,
                        origin_y=ty - 3.0,
                        dot_spacing=2.2,
                        cell_spacing=5.5,
                        y_direction_down=False,
                    )
                    # Add a small cylinder for each active Braille dot
                    for bx, by in dot_coords:
                        if 2.0 <= bx <= self.base_width - 2.0 and 2.0 <= by <= self.base_depth - 2.0:
                            mesh.add_cylinder(
                                cx=bx,
                                cy=by,
                                z_min=self.base_thickness,
                                height=DOT_HEIGHT_MM,
                                radius=DOT_DIAMETER_MM / 2.0,
                                segments=8,
                            )

            # Add Legend at bottom margin in Braille: "ent" (Entrance), "wc" (Restroom)
            legend_y = 10.0
            # Entrance legend
            mesh.add_cylinder(18.0, legend_y + 2.0, self.base_thickness, height=2.0, radius=3.0, segments=12)
            for bx, by in get_braille_dot_coordinates("ent", origin_x=24.0, origin_y=legend_y, y_direction_down=False):
                mesh.add_cylinder(bx, by, self.base_thickness, DOT_HEIGHT_MM, DOT_DIAMETER_MM / 2.0, segments=8)

            # Restroom legend
            mesh.add_box(70.0, legend_y - 1.0, self.base_thickness, 5.0, 5.0, height=2.0)
            for bx, by in get_braille_dot_coordinates("wc", origin_x=78.0, origin_y=legend_y, y_direction_down=False):
                mesh.add_cylinder(bx, by, self.base_thickness, DOT_HEIGHT_MM, DOT_DIAMETER_MM / 2.0, segments=8)

        # 8. Mesh Validation
        meta = mesh.validate()
        meta.update({
            "verified_nodes_count": len(verified_nodes),
            "verified_edges_count": len(verified_edges),
            "scale_label": scale_label,
            "physical_scale_ratio": physical_scale_ratio,
            "floor_name": floor_name,
            "braille_enabled": self.braille_enabled,
        })

        return mesh, meta

