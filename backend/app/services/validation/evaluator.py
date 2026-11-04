import math
import networkx as nx
from typing import Any, Dict, List, Optional, Set, Tuple
from app.models.spatial import SpatialEdge, SpatialNode
from app.services.navigation.router import find_accessible_route
from app.services.spatial.coordinates import CoordinateTransformer
from app.services.validation.schemas import (
    FloorPlanGroundTruth,
    GroundTruthRoom,
    ValidationMetricReport,
)


class FloorPlanEvaluator:
    """Rigorous evaluation harness for testing external and synthetic floor plans against ground truth."""

    def __init__(self, match_distance_threshold_px: float = 60.0):
        self.match_threshold_px = match_distance_threshold_px

    def evaluate(
        self,
        ground_truth: FloorPlanGroundTruth,
        detected_nodes: List[SpatialNode],
        detected_edges: List[SpatialEdge],
        transformer: Optional[CoordinateTransformer] = None,
    ) -> ValidationMetricReport:
        orig_w = ground_truth.original_dimensions["width"]
        orig_h = ground_truth.original_dimensions["height"]

        # 1. Coordinate Transformation Accuracy Check
        coord_accuracy_pct = 100.0
        max_px_error = 0.0
        if transformer:
            errors = []
            for r in ground_truth.rooms:
                norm_x = r.center_x / float(orig_w)
                norm_y = r.center_y / float(orig_h)
                back_x, back_y = transformer.normalized_to_original(norm_x, norm_y)
                err = math.hypot(back_x - r.center_x, back_y - r.center_y)
                errors.append(err)
            if errors:
                max_px_error = max(errors)
                avg_err = sum(errors) / len(errors)
                diag = math.hypot(orig_w, orig_h)
                coord_accuracy_pct = max(0.0, 100.0 - (avg_err / diag) * 100.0)

        # 2. Room Detection Matching (Floor-aware greedy match by Euclidean distance)
        gt_rooms = ground_truth.rooms
        manual_count = len(gt_rooms)
        detected_rooms = [n for n in detected_nodes if n.node_type in ("room", "entrance", "exit", "restroom", "reception")]
        detected_count = len(detected_rooms)

        matched_gt_ids: Set[str] = set()
        matched_det_ids: Set[str] = set()
        gt_to_det_map: Dict[str, str] = {}  # gt_id -> det_id
        label_to_node_id: Dict[str, str] = {}  # gt_label -> det_id

        # Greedy match on same floor level
        candidates = []
        for gtr in gt_rooms:
            gtr_lvl = getattr(gtr, "level_number", 1)
            for dn in detected_rooms:
                dn_lvl = getattr(dn, "level_number", 1)
                if dn_lvl != gtr_lvl:
                    continue
                dist = math.hypot(dn.x - gtr.center_x, dn.y - gtr.center_y)
                if dist <= self.match_threshold_px:
                    candidates.append((dist, gtr.id, dn.id, gtr.label))

        candidates.sort(key=lambda x: x[0])
        for dist, gtr_id, dn_id, gtr_label in candidates:
            if gtr_id not in matched_gt_ids and dn_id not in matched_det_ids:
                matched_gt_ids.add(gtr_id)
                matched_det_ids.add(dn_id)
                gt_to_det_map[gtr_id] = dn_id
                label_to_node_id[gtr_label.lower()] = dn_id

        # Also map nodes with matching labels on same floor if spatial match missed
        for gtr in gt_rooms:
            if gtr.id not in matched_gt_ids:
                gtr_lvl = getattr(gtr, "level_number", 1)
                for dn in detected_rooms:
                    if dn.id not in matched_det_ids and getattr(dn, "level_number", 1) == gtr_lvl:
                        if dn.label.strip().lower() == gtr.label.strip().lower() or (
                            gtr.room_number and dn.room_number and str(dn.room_number).lower() == str(gtr.room_number).lower()
                        ):
                            matched_gt_ids.add(gtr.id)
                            matched_det_ids.add(dn.id)
                            gt_to_det_map[gtr_id] = dn.id
                            label_to_node_id[gtr.label.lower()] = dn.id
                            break

        correct_detections = len(matched_gt_ids)
        incorrect_detections = max(0, detected_count - correct_detections)
        missed_detections = max(0, manual_count - correct_detections)

        precision = (correct_detections / detected_count) if detected_count > 0 else 0.0
        recall = (correct_detections / manual_count) if manual_count > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

        # 3. Door Connectivity Accuracy
        door_accuracy = 1.0
        if ground_truth.doors:
            verified_doors = 0
            for gd in ground_truth.doors:
                src_node_id = label_to_node_id.get(gd.source_label.lower())
                tgt_node_id = label_to_node_id.get(gd.target_label.lower())
                if src_node_id and tgt_node_id:
                    # Check if an edge or door passage connects them directly or via intermediate door node
                    connected = any(
                        (e.source_node_id == src_node_id and e.target_node_id == tgt_node_id)
                        or (e.source_node_id == tgt_node_id and e.target_node_id == src_node_id)
                        for e in detected_edges
                    )
                    if not connected:
                        # Check 2-hop through a doorway node
                        door_intermediary = any(
                            any((e1.source_node_id == src_node_id and e1.target_node_id == d_node.id) or (e1.source_node_id == d_node.id and e1.target_node_id == src_node_id) for e1 in detected_edges)
                            and any((e2.source_node_id == tgt_node_id and e2.target_node_id == d_node.id) or (e2.source_node_id == d_node.id and e2.target_node_id == tgt_node_id) for e2 in detected_edges)
                            for d_node in detected_nodes if d_node.node_type in ("door", "corridor")
                        )
                        connected = door_intermediary

                    if connected:
                        verified_doors += 1
            door_accuracy = round(verified_doors / len(ground_truth.doors), 4)

        # 4. Corridor Connectivity Accuracy
        corridor_accuracy = 1.0
        if ground_truth.corridors:
            corridor_checks = 0
            corridor_passes = 0
            for corr in ground_truth.corridors:
                for target_lbl in corr.connects_to:
                    corridor_checks += 1
                    t_id = label_to_node_id.get(target_lbl.lower())
                    if t_id:
                        # Find if corridor links to this target
                        links = any(
                            e.source_node_id == t_id or e.target_node_id == t_id
                            for e in detected_edges
                        )
                        if links:
                            corridor_passes += 1
            if corridor_checks > 0:
                corridor_accuracy = round(corridor_passes / corridor_checks, 4)

        # 5. Multi-Floor Transition Correctness
        multi_floor_accuracy = 1.0
        if ground_truth.multi_floor_transitions:
            mf_passed = 0
            for mf in ground_truth.multi_floor_transitions:
                # Find matching node on level_from
                from_node = next(
                    (
                        n for n in detected_nodes
                        if n.node_type == mf.node_type
                        and getattr(n, "level_number", 1) == mf.level_from
                        and (mf.label.lower() in n.label.lower() or n.label.lower() in mf.label.lower())
                    ),
                    None,
                )
                # Find matching node on level_to
                to_node = next(
                    (
                        n for n in detected_nodes
                        if n.node_type == mf.node_type
                        and getattr(n, "level_number", 1) == mf.level_to
                        and (mf.label.lower() in n.label.lower() or n.label.lower() in mf.label.lower())
                    ),
                    None,
                )
                if from_node and to_node:
                    # Check for direct inter-floor edge connecting them
                    has_inter_floor = any(
                        (
                            (e.source_node_id == from_node.id and e.target_node_id == to_node.id)
                            or (e.source_node_id == to_node.id and e.target_node_id == from_node.id)
                        )
                        and (e.is_inter_floor or e.edge_type in ("stair_transition", "elevator_transition"))
                        for e in detected_edges
                    )
                    # Verify accessibility specification matches (elevators must be step-free, stairs must not)
                    access_matches = (from_node.is_accessible == mf.is_accessible) and (to_node.is_accessible == mf.is_accessible)
                    if has_inter_floor and access_matches:
                        mf_passed += 1
            multi_floor_accuracy = round(mf_passed / len(ground_truth.multi_floor_transitions), 4)

        # 6. Graph Connectivity & Orphan Detection
        graph_errors: List[str] = []
        node_ids = {n.id for n in detected_nodes}
        edge_node_ids = set()
        for e in detected_edges:
            edge_node_ids.add(e.source_node_id)
            edge_node_ids.add(e.target_node_id)

        orphans = [n.label for n in detected_nodes if n.id not in edge_node_ids and n.node_type not in ("hazard",)]
        if orphans:
            graph_errors.append(f"Orphaned spatial nodes without connections: {', '.join(orphans[:4])}")

        # Connected components analysis
        G = nx.Graph()
        for n in detected_nodes:
            G.add_node(n.id)
        for e in detected_edges:
            G.add_edge(e.source_node_id, e.target_node_id)

        if len(detected_nodes) > 1 and G.number_of_edges() > 0:
            num_components = nx.number_connected_components(G)
            if num_components > 1:
                graph_errors.append(f"Graph is fragmented into {num_components} disconnected spatial subgraphs.")

        # 7. Deterministic Route Correctness
        route_correctness = 1.0
        if ground_truth.test_routes:
            routes_solved = 0
            for tr in ground_truth.test_routes:
                start_id = label_to_node_id.get(tr.start_label.lower())
                dest_id = label_to_node_id.get(tr.dest_label.lower())
                if not start_id or not dest_id:
                    # Endpoints not detected in spatial graph
                    continue

                try:
                    # Verify route via deterministic router
                    route_res = find_accessible_route(
                        nodes=detected_nodes,
                        edges=detected_edges,
                        start_node_id=start_id,
                        destination_node_id=dest_id,
                        accessible_only=tr.accessible_required,
                        verified_only=False,  # In testing, evaluate topology regardless of human verification flag
                        is_scale_calibrated=ground_truth.scale_meters_per_pixel is not None,
                    )
                    if tr.expect_solvable and len(route_res.steps) >= 2:
                        routes_solved += 1
                except Exception:
                    if not tr.expect_solvable:
                        # Correctly refused impassable route
                        routes_solved += 1

            route_correctness = round(routes_solved / len(ground_truth.test_routes), 4)

        # 8. Summary Status
        audit_notes: List[str] = []
        if f1 >= 0.80 and route_correctness >= 0.80 and door_accuracy >= 0.75:
            status = "PASS"
        elif f1 >= 0.60 and route_correctness >= 0.50:
            status = "MARGINAL"
            audit_notes.append("Marginal room recognition or routing success. Human verification required before use.")
        else:
            status = "FAIL"
            audit_notes.append("Spatial detection precision/recall or route solving failed minimum threshold.")

        if ground_truth.dataset_type == "synthetic":
            audit_notes.append("Dataset Type: Synthetic Benchmark (Algorithmic reference geometry).")
        else:
            audit_notes.append("Dataset Type: Real-World Architectural Blueprint.")

        return ValidationMetricReport(
            test_id=ground_truth.test_id,
            dataset_type=ground_truth.dataset_type,
            building_name=ground_truth.building_name,
            original_dimensions=ground_truth.original_dimensions,
            scale_meters_per_pixel=ground_truth.scale_meters_per_pixel,
            manual_rooms_count=manual_count,
            detected_rooms_count=detected_count,
            correct_detections=correct_detections,
            incorrect_detections=incorrect_detections,
            missed_detections=missed_detections,
            detection_precision=round(precision, 4),
            detection_recall=round(recall, 4),
            detection_f1=round(f1, 4),
            door_connectivity_accuracy=door_accuracy,
            corridor_connectivity_accuracy=corridor_accuracy,
            multi_floor_transition_correctness=multi_floor_accuracy,
            graph_connectivity_errors=graph_errors,
            coordinate_transformation_accuracy=round(coord_accuracy_pct, 2),
            max_coordinate_pixel_error=round(max_px_error, 2),
            route_correctness=route_correctness,
            summary_status=status,
            audit_notes=audit_notes,
        )
