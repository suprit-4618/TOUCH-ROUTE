import json
import logging
import math
from typing import Dict, List, Optional, Set, Tuple
from app.schemas.spatial import (
    BoundingBox,
    ConnectionEntity,
    RoomEntity,
    SpatialValidationReport,
    StructuredSpatialAnalysis,
    WaypointEntity,
)
from app.services.spatial.coordinates import CoordinateTransformer

logger = logging.getLogger(__name__)


class SpatialAnalysisValidator:
    """Validates, sanitizes, deduplicates and transforms AI-detected spatial entities."""

    def __init__(self, transformer: CoordinateTransformer, confidence_threshold: float = 0.65):
        self.transformer = transformer
        self.confidence_threshold = confidence_threshold

    def process_and_validate(
        self,
        raw_analysis: StructuredSpatialAnalysis,
        floor_plan_id: Optional[str] = None,
        project_id: Optional[str] = None,
    ) -> Tuple[List[Dict], List[Dict], SpatialValidationReport]:
        """Validates AI entities, transforms coordinates to original blueprint space, and checks topology."""
        validated_nodes: List[Dict] = []
        validated_edges: List[Dict] = []
        warnings: List[str] = []
        uncertainties: List[str] = list(raw_analysis.uncertainty_notes or [])

        boundary_clamped_count = 0
        duplicates_merged_count = 0
        invalid_geom_count = 0

        node_id_map: Dict[str, Dict] = {}

        # 1. Process Rooms
        for room in raw_analysis.rooms:
            if room.confidence < self.confidence_threshold:
                uncertainties.append(f"Room '{room.name}' excluded due to low confidence ({room.confidence:.2f} < {self.confidence_threshold})")
                continue

            # Determine centroid coordinates
            cx, cy = self._extract_centroid(room)
            clamped_x, clamped_y = self.transformer.clamp_point(cx, cy)
            if clamped_x != cx or clamped_y != cy:
                boundary_clamped_count += 1

            # Transform bounding box if present
            bbox_str = None
            if room.bounding_box:
                transformed_bbox = self.transformer.bounding_box_to_original(
                    room.bounding_box.min_x,
                    room.bounding_box.min_y,
                    room.bounding_box.max_x,
                    room.bounding_box.max_y,
                    is_normalized=self._is_normalized_coord(room.bounding_box.max_x),
                )
                bbox_str = json.dumps(transformed_bbox.model_dump())

            node_data = {
                "id": room.id,
                "project_id": project_id,
                "floor_plan_id": floor_plan_id,
                "label": room.name or f"Room {room.room_number or ''}".strip(),
                "node_type": room.type or "room",
                "room_number": room.room_number,
                "x": clamped_x,
                "y": clamped_y,
                "bounding_box": bbox_str,
                "polygon_points": json.dumps([[p.x, p.y] for p in room.coordinates]) if room.coordinates else None,
                "detection_source": "ai_detection",
                "is_geometry_validated": True,
                "is_user_verified": False,  # Strict safety requirement
                "confidence": round(room.confidence, 3),
                "is_accessible": room.is_accessible,
                "level_number": raw_analysis.level_number or 1,
                "level_name": raw_analysis.level_name or "Level 1",
                "notes": room.notes,
            }
            node_id_map[room.id] = node_data

        # 2. Process Waypoints (Entrances, Exits, Doors, Stairs, Elevators)
        all_waypoints = (
            [("entrance", w) for w in raw_analysis.entrances] +
            [("exit", w) for w in raw_analysis.exits] +
            [("door", w) for w in getattr(raw_analysis, "doors", [])] +
            [("stairs", w) for w in raw_analysis.stairs] +
            [("elevator", w) for w in raw_analysis.elevators]
        )

        for w_type, waypoint in all_waypoints:
            if waypoint.confidence < self.confidence_threshold:
                uncertainties.append(f"{w_type.title()} '{waypoint.label}' excluded due to low confidence ({waypoint.confidence:.2f})")
                continue

            wx, wy = self._transform_point(waypoint.x, waypoint.y)
            clamped_x, clamped_y = self.transformer.clamp_point(wx, wy)
            if clamped_x != wx or clamped_y != wy:
                boundary_clamped_count += 1

            # Ensure unique ID
            wp_id = waypoint.id if waypoint.id not in node_id_map else f"{waypoint.id}_{w_type}"

            # Step-free accessibility evaluation
            is_step_free = waypoint.is_accessible
            if w_type == "stairs":
                is_step_free = False  # Stairs are never step-free

            node_data = {
                "id": wp_id,
                "project_id": project_id,
                "floor_plan_id": floor_plan_id,
                "label": waypoint.label,
                "node_type": w_type,
                "room_number": None,
                "x": clamped_x,
                "y": clamped_y,
                "bounding_box": None,
                "polygon_points": None,
                "detection_source": "ai_detection",
                "is_geometry_validated": True,
                "is_user_verified": False,
                "confidence": round(waypoint.confidence, 3),
                "is_accessible": is_step_free,
                "level_number": raw_analysis.level_number or 1,
                "level_name": raw_analysis.level_name or "Level 1",
                "notes": waypoint.notes,
            }
            node_id_map[wp_id] = node_data

        # 3. Deduplicate spatially overlapping nodes
        raw_nodes_list = list(node_id_map.values())
        deduped_nodes, duplicates_merged_count = self._deduplicate_nodes(raw_nodes_list)
        active_node_ids = {n["id"] for n in deduped_nodes}

        # 4. Process Connections and Build Topological Edges
        connected_node_ids: Set[str] = set()

        for conn in raw_analysis.connections:
            # Validate source and target exist
            if conn.source_id not in active_node_ids or conn.target_id not in active_node_ids:
                warnings.append(f"Connection '{conn.id}' skipped: endpoint '{conn.source_id}' or '{conn.target_id}' was not detected.")
                continue

            if conn.source_id == conn.target_id:
                invalid_geom_count += 1
                continue

            source_node = next(n for n in deduped_nodes if n["id"] == conn.source_id)
            target_node = next(n for n in deduped_nodes if n["id"] == conn.target_id)

            # Compute real geometric distance
            calc_dist = self.transformer.calculate_distance_meters(
                (source_node["x"], source_node["y"]),
                (target_node["x"], target_node["y"]),
            )
            # Use computed Euclidean distance if plausible (>0.5m), else fallback to connection reported distance
            dist = calc_dist if calc_dist >= 0.5 else max(conn.distance_meters, 1.0)

            edge_data = {
                "id": conn.id,
                "project_id": project_id,
                "source_node_id": conn.source_id,
                "target_node_id": conn.target_id,
                "distance_meters": dist,
                "edge_type": conn.connection_type or "door",
                "confidence": round(conn.confidence, 3),
                "detection_source": "ai_detection",
                "is_geometry_validated": True,
                "is_user_verified": False,  # Safety rule: human verification required
                "is_accessible": conn.is_accessible and source_node["is_accessible"] and target_node["is_accessible"],
                "is_inter_floor": conn.is_inter_floor,
                "level_number": raw_analysis.level_number or 1,
            }
            validated_edges.append(edge_data)
            connected_node_ids.add(conn.source_id)
            connected_node_ids.add(conn.target_id)

        # 5. Check for Orphaned Nodes (rooms with no door/corridor link)
        # Infer geometric doorway connections where doors penetrate space boundaries
        inferred_door_edges = self._infer_geometric_doorway_connections(
            nodes=deduped_nodes,
            existing_edges=validated_edges,
            project_id=project_id,
            level_number=raw_analysis.level_number or 1,
        )
        for ie in inferred_door_edges:
            validated_edges.append(ie)
            connected_node_ids.add(ie["source_node_id"])
            connected_node_ids.add(ie["target_node_id"])

        for node in deduped_nodes:
            if node["id"] not in connected_node_ids:
                warnings.append(f"Node '{node['label']}' ({node['id']}) has no detected door or pathway connection.")

        report = SpatialValidationReport(
            valid_nodes=len(deduped_nodes),
            invalid_geometry_resolved=invalid_geom_count,
            duplicates_merged=duplicates_merged_count,
            boundary_clamped_nodes=boundary_clamped_count,
            connectivity_warnings=warnings,
            uncertainty_notes=uncertainties,
        )

        return deduped_nodes, validated_edges, report

    def _is_normalized_coord(self, val: float) -> bool:
        """Determines if a coordinate value is in 0.0 - 1.0 normalized space."""
        return 0.0 <= val <= 1.0

    def _transform_point(self, x: float, y: float) -> Tuple[float, float]:
        if self._is_normalized_coord(x) and self._is_normalized_coord(y):
            return self.transformer.normalized_to_original(x, y)
        else:
            return self.transformer.processed_to_original(x, y)

    def _extract_centroid(self, room: RoomEntity) -> Tuple[float, float]:
        # If coordinates polygon provided, compute centroid
        if room.coordinates and len(room.coordinates) > 0:
            avg_x = sum(p.x for p in room.coordinates) / len(room.coordinates)
            avg_y = sum(p.y for p in room.coordinates) / len(room.coordinates)
            return self._transform_point(avg_x, avg_y)

        # If bounding box provided, compute center
        if room.bounding_box:
            mid_x = (room.bounding_box.min_x + room.bounding_box.max_x) / 2.0
            mid_y = (room.bounding_box.min_y + room.bounding_box.max_y) / 2.0
            return self._transform_point(mid_x, mid_y)

        # Default fallback to center of blueprint
        return (self.transformer.orig_w / 2.0, self.transformer.orig_h / 2.0)

    def _deduplicate_nodes(self, nodes: List[Dict]) -> Tuple[List[Dict], int]:
        """Merges duplicate nodes that are within 25 original pixels and have matching labels/types or are both doors."""
        deduped: List[Dict] = []
        merged_count = 0

        for node in nodes:
            is_dup = False
            for existing in deduped:
                dx = node["x"] - existing["x"]
                dy = node["y"] - existing["y"]
                dist = math.hypot(dx, dy)

                same_label = node["label"].lower() == existing["label"].lower()
                same_type = node["node_type"] == existing["node_type"]
                both_doors = node["node_type"] in ("door", "entrance", "exit") and existing["node_type"] in ("door", "entrance", "exit")

                # Overlapping doors or spaces within 25px are merged
                if dist < 25.0 and (same_label or same_type or both_doors):
                    # Keep the one with higher confidence
                    if node["confidence"] > existing["confidence"]:
                        existing["confidence"] = node["confidence"]
                        existing["label"] = node["label"]
                    merged_count += 1
                    is_dup = True
                    break

            if not is_dup:
                deduped.append(node)

        return deduped, merged_count

    def _distance_point_to_box_perimeter(self, px: float, py: float, bbox: Dict[str, float]) -> Tuple[float, str, str]:
        """Calculates distance from point to closest perimeter wall of a bounding box.

        Returns (min_distance_px, wall_name, orientation).
        Wall names: 'north', 'south', 'west', 'east'.
        Wall orientations: 'horizontal' (north/south), 'vertical' (west/east).
        """
        min_x = bbox.get("min_x", 0.0)
        min_y = bbox.get("min_y", 0.0)
        max_x = bbox.get("max_x", 0.0)
        max_y = bbox.get("max_y", 0.0)

        # Distance to North segment [(min_x, min_y), (max_x, min_y)]
        closest_n_x = max(min_x, min(px, max_x))
        dist_n = math.hypot(px - closest_n_x, py - min_y)

        # Distance to South segment [(min_x, max_y), (max_x, max_y)]
        closest_s_x = max(min_x, min(px, max_x))
        dist_s = math.hypot(px - closest_s_x, py - max_y)

        # Distance to West segment [(min_x, min_y), (min_x, max_y)]
        closest_w_y = max(min_y, min(py, max_y))
        dist_w = math.hypot(px - min_x, py - closest_w_y)

        # Distance to East segment [(max_x, min_y), (max_x, max_y)]
        closest_e_y = max(min_y, min(py, max_y))
        dist_e = math.hypot(px - max_x, py - closest_e_y)

        walls = [
            (dist_n, "north", "horizontal"),
            (dist_s, "south", "horizontal"),
            (dist_w, "west", "vertical"),
            (dist_e, "east", "vertical"),
        ]
        walls.sort(key=lambda w: w[0])
        return walls[0]

    def _distance_point_to_polygon_perimeter(self, px: float, py: float, points: List[List[float]]) -> Tuple[float, str, str]:
        """Calculates exact Euclidean distance from point to closest segment of a polygon."""
        if not points or len(points) < 2:
            return float("inf"), "none", "unspecified"

        min_dist = float("inf")
        best_wall = "perimeter"
        best_orient = "unspecified"

        for i in range(len(points)):
            p1 = points[i]
            p2 = points[(i + 1) % len(points)]
            x1, y1 = p1[0], p1[1]
            x2, y2 = p2[0], p2[1]

            dx = x2 - x1
            dy = y2 - y1
            seg_len_sq = dx * dx + dy * dy
            if seg_len_sq < 1e-6:
                d = math.hypot(px - x1, py - y1)
            else:
                t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / seg_len_sq))
                proj_x = x1 + t * dx
                proj_y = y1 + t * dy
                d = math.hypot(px - proj_x, py - proj_y)

            if d < min_dist:
                min_dist = d
                if abs(dx) >= abs(dy):
                    best_orient = "horizontal"
                    best_wall = "north" if (y1 + y2) / 2.0 > py else "south"
                else:
                    best_orient = "vertical"
                    best_wall = "west" if (x1 + x2) / 2.0 > px else "east"

        return min_dist, best_wall, best_orient

    def _infer_geometric_doorway_connections(
        self,
        nodes: List[Dict],
        existing_edges: List[Dict],
        project_id: Optional[str],
        level_number: int,
    ) -> List[Dict]:
        """Infers doorway connectivity based strictly on geometric evidence (door position on wall perimeter).

        Rule: Never connects spaces based on centroid proximity alone.
        Only creates connections when a physical door/entrance node is located within 35px of a space boundary.
        """
        inferred_edges: List[Dict] = []
        connected_pairs: Set[Tuple[str, str]] = set()
        for e in existing_edges:
            connected_pairs.add((e["source_node_id"], e["target_node_id"]))
            connected_pairs.add((e["target_node_id"], e["source_node_id"]))

        door_nodes = [n for n in nodes if n["node_type"] in ("door", "entrance", "exit")]
        space_nodes = [n for n in nodes if n["node_type"] not in ("door", "hazard")]

        for d in door_nodes:
            dx, dy = d["x"], d["y"]
            adjacent_spaces: List[Tuple[Dict, str, str]] = []

            for s in space_nodes:
                if s["id"] == d["id"]:
                    continue
                # Floor level check
                if s.get("level_number", 1) != level_number:
                    continue

                bbox = None
                if s.get("bounding_box"):
                    try:
                        bbox = json.loads(s["bounding_box"]) if isinstance(s["bounding_box"], str) else s["bounding_box"]
                    except Exception:
                        bbox = None

                poly_pts = None
                if s.get("polygon_points"):
                    try:
                        poly_pts = json.loads(s["polygon_points"]) if isinstance(s["polygon_points"], str) else s["polygon_points"]
                    except Exception:
                        poly_pts = None

                # Strict geometric boundary evaluation: bounding box or polygon boundary
                if bbox and isinstance(bbox, dict):
                    dist_to_wall, wall_name, orientation = self._distance_point_to_box_perimeter(dx, dy, bbox)
                    if dist_to_wall <= 35.0:  # ~1.5m in blueprint pixels
                        adjacent_spaces.append((s, wall_name, orientation))
                elif poly_pts and isinstance(poly_pts, list):
                    dist_to_wall, wall_name, orientation = self._distance_point_to_polygon_perimeter(dx, dy, poly_pts)
                    if dist_to_wall <= 35.0:
                        adjacent_spaces.append((s, wall_name, orientation))
                # Note: No fallback to centroid proximity. If no boundary geometry exists, no connection is inferred.

            # Connect door to each geometrically adjacent space
            for s, wall_name, orientation in adjacent_spaces:
                pair = (d["id"], s["id"])
                if pair not in connected_pairs:
                    dist_m = self.transformer.calculate_distance_meters((dx, dy), (s["x"], s["y"]))
                    edge_id = f"inferred_door_{d['id']}_{s['id']}"
                    edge_data = {
                        "id": edge_id,
                        "project_id": project_id,
                        "source_node_id": d["id"],
                        "target_node_id": s["id"],
                        "distance_meters": max(round(dist_m, 2), 0.5),
                        "edge_type": "door",
                        "confidence": round(d.get("confidence", 0.9) * 0.95, 3),
                        "detection_source": "geometry_validation",
                        "is_geometry_validated": True,
                        "is_user_verified": False,
                        "is_accessible": d.get("is_accessible", True) and s.get("is_accessible", True),
                        "is_inter_floor": False,
                        "level_number": level_number,
                    }
                    inferred_edges.append(edge_data)
                    connected_pairs.add((d["id"], s["id"]))
                    connected_pairs.add((s["id"], d["id"]))

        return inferred_edges

