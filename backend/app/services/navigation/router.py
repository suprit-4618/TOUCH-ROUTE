import math
from typing import Dict, List, Optional, Tuple
import networkx as nx
from app.models.spatial import SpatialNode, SpatialEdge
from app.schemas.navigation import NavigationStep, RouteResult


def calculate_turn_direction(angle1: float, angle2: float) -> str:
    """Calculate relative turn direction from two bearing angles in degrees."""
    diff = (angle2 - angle1 + 180) % 360 - 180
    if -25 <= diff <= 25:
        return "straight"
    elif 25 < diff <= 65:
        return "slight_right"
    elif 65 < diff <= 125:
        return "turn_right"
    elif diff > 125:
        return "sharp_right"
    elif -65 <= diff < -25:
        return "slight_left"
    elif -125 <= diff < -65:
        return "turn_left"
    else:
        return "sharp_left"


def find_accessible_route(
    nodes: List[SpatialNode],
    edges: List[SpatialEdge],
    start_node_id: str,
    destination_node_id: str,
    accessible_only: bool = True,
    verified_only: bool = True,
    is_scale_calibrated: bool = True,
) -> RouteResult:
    """Computes deterministic A* path over spatial graph with strict human-verification safety checks."""
    node_map = {n.id: n for n in nodes}
    if start_node_id not in node_map or destination_node_id not in node_map:
        raise ValueError("Start or destination location does not exist in the spatial graph.")

    start_node = node_map[start_node_id]
    dest_node = node_map[destination_node_id]

    if verified_only:
        if not start_node.is_user_verified or not dest_node.is_user_verified:
            raise ValueError(
                "Cannot compute safe route: One or both endpoints have not been human-verified. "
                "For visual impairment safety, only verified locations can be used for confirmed navigation."
            )

    if accessible_only:
        if not getattr(start_node, "is_accessible", True):
            raise ValueError(f"Cannot calculate accessible route: Starting location '{start_node.label}' is not step-free accessible.")
        if not getattr(dest_node, "is_accessible", True):
            raise ValueError(f"Cannot calculate accessible route: Destination '{dest_node.label}' is not step-free accessible.")

    # Build NetworkX undirected graph
    G = nx.Graph()
    for n in nodes:
        if verified_only and not n.is_user_verified:
            continue
        if accessible_only and not getattr(n, "is_accessible", True):
            # Strict safety: inaccessible nodes (e.g. stairs, obstacles) excluded from step-free navigation
            continue

        G.add_node(
            n.id,
            label=n.label or f"{n.node_type.title()} Space",
            x=n.x,
            y=n.y,
            node_type=n.node_type,
            level_number=getattr(n, 'level_number', 1),
            level_name=getattr(n, 'level_name', 'Level 1'),
            is_user_verified=n.is_user_verified,
            is_accessible=n.is_accessible,
        )

    edge_lookup: Dict[Tuple[str, str], SpatialEdge] = {}

    for e in edges:
        if verified_only and not e.is_user_verified:
            continue
        if accessible_only and not e.is_accessible:
            continue
        # If either node was filtered out, skip
        if e.source_node_id not in G.nodes or e.target_node_id not in G.nodes:
            continue

        # Compute realistic edge weights:
        # Vertical transitions incur physical cost (elevator wait/board time ~25m equivalent; stair climb ~15m equivalent)
        base_dist = e.distance_meters if is_scale_calibrated else 3.0
        src_floor = getattr(node_map.get(e.source_node_id), 'level_number', 1) or 1
        tgt_floor = getattr(node_map.get(e.target_node_id), 'level_number', 1) or 1
        is_vertical = (src_floor != tgt_floor) or getattr(e, 'is_inter_floor', False) or (e.edge_type in ('stair_transition', 'elevator_transition'))

        if is_vertical and src_floor != tgt_floor:
            is_elevator = (e.edge_type == 'elevator_transition') or (
                node_map[e.source_node_id].node_type == 'elevator' and node_map[e.target_node_id].node_type == 'elevator'
            )
            vertical_penalty = 25.0 if is_elevator else 15.0
            edge_weight = base_dist + vertical_penalty
        else:
            edge_weight = base_dist

        G.add_edge(
            e.source_node_id,
            e.target_node_id,
            weight=edge_weight,
            edge_type=e.edge_type,
            is_inter_floor=(src_floor != tgt_floor),
            is_user_verified=e.is_user_verified,
        )
        edge_lookup[(e.source_node_id, e.target_node_id)] = e
        edge_lookup[(e.target_node_id, e.source_node_id)] = e

    if start_node_id not in G or destination_node_id not in G:
        start_lvl = getattr(start_node, 'level_number', 1) or 1
        dest_lvl = getattr(dest_node, 'level_number', 1) or 1
        if start_lvl != dest_lvl:
            raise ValueError(
                f"Selected locations are on different floors (Level {start_lvl} to Level {dest_lvl}) and no accessible vertical transition connects them in the graph."
            )
        raise ValueError("Selected locations are not connected within the verified navigation graph.")

    # Euclidean distance heuristic for A* (admissible: floor penalty <= actual vertical transition cost)
    def heuristic(u, v):
        n1 = node_map[u]
        n2 = node_map[v]
        dx = n1.x - n2.x
        dy = n1.y - n2.y
        l1 = getattr(n1, 'level_number', None) or 1
        l2 = getattr(n2, 'level_number', None) or 1
        floor_penalty = abs(l1 - l2) * 15.0
        scale_factor = 0.05 if is_scale_calibrated else 0.02
        return math.sqrt(dx * dx + dy * dy) * scale_factor + floor_penalty

    try:
        path = nx.astar_path(
            G,
            source=start_node_id,
            target=destination_node_id,
            heuristic=heuristic,
            weight="weight",
        )
    except nx.NetworkXNoPath:
        start_lvl = getattr(start_node, 'level_number', 1)
        dest_lvl = getattr(dest_node, 'level_number', 1)
        if start_lvl != dest_lvl:
            if accessible_only:
                raise ValueError(
                    f"No step-free accessible route exists between Level {start_lvl} and Level {dest_lvl}. "
                    "An accessible elevator connection is required."
                )
            else:
                raise ValueError(
                    f"No vertical route connects Level {start_lvl} and Level {dest_lvl}. "
                    "No stair or elevator transition exists between these floors."
                )
        if verified_only:
            raise ValueError("No human-verified accessible route exists between these locations. Please inspect connections in the Spatial Map Editor.")
        else:
            raise ValueError("No accessible path found between the selected locations.")

    # Calculate steps and geometric turn-by-turn instructions
    steps: List[NavigationStep] = []
    total_dist = 0.0
    has_unverified = False

    first_node = node_map[path[0]]
    if not first_node.is_user_verified:
        has_unverified = True

    first_label = (first_node.label or "").strip() or f"{first_node.node_type.title()}"
    first_level = getattr(first_node, 'level_name', 'Level 1') or 'Level 1'

    steps.append(
        NavigationStep(
            step_number=1,
            instruction=f"Start from {first_label} on {first_level}.",
            action="start",
            distance_meters=0.0,
            target_node_id=first_node.id,
            target_label=first_label,
            landmark_cue=f"Starting at {first_label}",
            level_name=first_level,
            is_verified=first_node.is_user_verified,
        )
    )

    prev_bearing: Optional[float] = None

    for i in range(len(path) - 1):
        curr_id = path[i]
        next_id = path[i + 1]
        curr_node = node_map[curr_id]
        next_node = node_map[next_id]

        curr_label = (curr_node.label or "").strip() or f"{curr_node.node_type.title()}"
        next_label = (next_node.label or "").strip() or f"{next_node.node_type.title()}"

        edge_obj = edge_lookup.get((curr_id, next_id))
        if edge_obj and not edge_obj.is_user_verified:
            has_unverified = True
        if not next_node.is_user_verified:
            has_unverified = True

        dist = edge_obj.distance_meters if (edge_obj and is_scale_calibrated) else 3.0
        total_dist += dist

        # Multi-floor transit (elevator / stairs)
        curr_floor = getattr(curr_node, 'level_number', None) or 1
        next_floor = getattr(next_node, 'level_number', None) or 1
        curr_level_name = getattr(curr_node, 'level_name', f'Level {curr_floor}')
        next_level_name = getattr(next_node, 'level_name', f'Level {next_floor}')

        if curr_floor != next_floor:
            transit_type = "elevator" if (next_node.node_type == "elevator" or curr_node.node_type == "elevator") else "stairs"
            action = transit_type
            direction = "up" if next_floor > curr_floor else "down"
            if transit_type == "elevator":
                instruction = f"Take the elevator {direction} from {curr_level_name} to {next_level_name}."
                landmark_cue = f"Ride elevator to {next_level_name}"
            else:
                instruction = f"Take the stairs {direction} from {curr_level_name} to {next_level_name}."
                landmark_cue = f"Take stairs to {next_level_name}"
            curr_bearing = 0.0
        else:
            # Planar geometric bearing
            dx = next_node.x - curr_node.x
            dy = next_node.y - curr_node.y
            curr_bearing = math.degrees(math.atan2(dx, -dy)) % 360

            # Distance phrasing
            if is_scale_calibrated:
                meters_text = f" for approximately {max(1, int(round(dist)))} meters"
            else:
                meters_text = ""

            # Check if traversing through a door
            is_door = (edge_obj and getattr(edge_obj, "edge_type", "") == "door") or next_node.node_type == "door"

            if prev_bearing is None:
                action = "enter_door" if is_door else "straight"
                if is_door:
                    instruction = f"Pass through the doorway toward {next_label}{meters_text}."
                else:
                    instruction = f"Proceed forward along the walkway toward {next_label}{meters_text}."
                landmark_cue = f"Approaching {next_label}"
            else:
                turn = calculate_turn_direction(prev_bearing, curr_bearing)
                action = turn
                if turn == "straight":
                    if is_door:
                        instruction = f"Continue straight through the doorway toward {next_label}{meters_text}."
                    else:
                        instruction = f"Continue straight along the corridor toward {next_label}{meters_text}."
                elif turn in ("turn_left", "slight_left"):
                    instruction = f"Turn left at {curr_label} and move forward toward {next_label}{meters_text}."
                elif turn in ("turn_right", "slight_right"):
                    instruction = f"Turn right at {curr_label} and move forward toward {next_label}{meters_text}."
                else:
                    instruction = f"Turn at {curr_label} toward {next_label}{meters_text}."

                landmark_cue = f"Approaching doorway to {next_label}" if is_door else f"Approaching {next_label}"

        # Arriving at destination
        if i == len(path) - 2:
            instruction += f" Arrive at your destination: {next_label}."
            action = "arrive"
            landmark_cue = f"Destination: {next_label}"

        steps.append(
            NavigationStep(
                step_number=len(steps) + 1,
                instruction=instruction,
                action=action,
                distance_meters=round(dist, 1) if is_scale_calibrated else 0.0,
                target_node_id=next_node.id,
                target_label=next_label,
                orientation_degrees=round(curr_bearing, 1),
                landmark_cue=landmark_cue,
                level_name=next_level_name,
                is_verified=next_node.is_user_verified and (edge_obj.is_user_verified if edge_obj else False),
            )
        )
        prev_bearing = curr_bearing

    est_seconds = int(total_dist / 1.0) if is_scale_calibrated else int(len(steps) * 8)
    is_safe = not has_unverified

    warning = None
    if has_unverified:
        warning = "CAUTION: This route includes unconfirmed AI predictions. It is NOT verified as safe for visually impaired travelers until confirmed by human building staff."

    return RouteResult(
        project_id=first_node.project_id or "unassigned",
        start_node_id=start_node_id,
        destination_node_id=destination_node_id,
        total_distance_meters=round(total_dist, 1) if is_scale_calibrated else 0.0,
        estimated_walking_seconds=est_seconds,
        accessible=accessible_only,
        is_scale_calibrated=is_scale_calibrated,
        is_verified_safe=is_safe,
        has_unverified_segments=has_unverified,
        unverified_warning=warning,
        path_node_ids=path,
        steps=steps,
    )
