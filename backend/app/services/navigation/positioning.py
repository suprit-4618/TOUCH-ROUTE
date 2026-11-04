import math
from typing import Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from app.models.marker import LocationMarker
from app.models.project import FloorPlan, Project
from app.models.spatial import SpatialNode
from app.schemas.positioning import (
    PositioningState,
    PositionUpdatePayload,
    PositionUpdateResult,
    RelocalizeRequest,
)


def point_to_segment_distance(
    px: float, py: float,
    x1: float, y1: float,
    x2: float, y2: float
) -> Tuple[float, float, float]:
    """
    Computes orthogonal projection of (px, py) onto line segment (x1, y1)-(x2, y2).
    Returns (nearest_x, nearest_y, distance).
    """
    dx = x2 - x1
    dy = y2 - y1
    segment_len_sq = dx * dx + dy * dy

    if segment_len_sq == 0:
        dist = math.hypot(px - x1, py - y1)
        return x1, y1, dist

    # Parameter t of the closest point on infinite line
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / segment_len_sq))
    nearest_x = x1 + t * dx
    nearest_y = y1 + t * dy
    dist = math.hypot(px - nearest_x, py - nearest_y)
    return nearest_x, nearest_y, dist


class IndoorPositioningEngine:
    """
    Provider-independent positioning and map-matching service.
    Separates continuous spatial localization from static route calculation.
    Enforces strict safety halts on spatial uncertainty.
    """

    def process_position_update(
        self,
        db: Session,
        payload: PositionUpdatePayload,
    ) -> PositionUpdateResult:
        # Fetch route nodes if provided, else all project nodes
        nodes: List[SpatialNode] = []
        if payload.route_node_ids and len(payload.route_node_ids) > 0:
            nodes_by_id = {
                n.id: n
                for n in db.query(SpatialNode)
                .filter(SpatialNode.id.in_(payload.route_node_ids))
                .all()
            }
            # Maintain path order
            nodes = [nodes_by_id[nid] for nid in payload.route_node_ids if nid in nodes_by_id]
        else:
            nodes = (
                db.query(SpatialNode)
                .filter(SpatialNode.project_id == payload.project_id)
                .all()
            )

        if not nodes:
            return PositionUpdateResult(
                session_id=payload.session_id,
                state=PositioningState.RELOCALIZATION_REQUIRED,
                confidence_score=0.0,
                snapped_x=payload.estimated_x,
                snapped_y=payload.estimated_y,
                cross_track_error_meters=99.0,
                along_track_distance_meters=0.0,
                is_uncertain=True,
                safety_alert="No verified building nodes found to match position.",
                relocalization_prompt="Please scan a nearby NFC/QR marker to establish location.",
            )

        # Scale calibration factor
        floor_plan = (
            db.query(FloorPlan)
            .filter(FloorPlan.project_id == payload.project_id, FloorPlan.level_number == payload.current_level)
            .first()
        )
        scale_m_per_px = floor_plan.scale_meters_per_pixel if (floor_plan and floor_plan.scale_meters_per_pixel) else 0.05

        # 1. Snap to nearest route segment or node
        best_snapped_x = payload.estimated_x
        best_snapped_y = payload.estimated_y
        min_dist_px = float("inf")
        nearest_node = nodes[0]

        # First find nearest node
        for n in nodes:
            dist = math.hypot(payload.estimated_x - n.x, payload.estimated_y - n.y)
            if dist < min_dist_px:
                min_dist_px = dist
                nearest_node = n

        # Check line segments if route is defined
        if len(nodes) >= 2:
            seg_min_dist = float("inf")
            for i in range(len(nodes) - 1):
                n1, n2 = nodes[i], nodes[i + 1]
                # Only check segments on same floor
                if getattr(n1, 'level_number', 1) != payload.current_level:
                    continue
                nx, ny, dist = point_to_segment_distance(
                    payload.estimated_x, payload.estimated_y,
                    n1.x, n1.y, n2.x, n2.y
                )
                if dist < seg_min_dist:
                    seg_min_dist = dist
                    best_snapped_x = nx
                    best_snapped_y = ny
            if seg_min_dist < float("inf"):
                min_dist_px = seg_min_dist
        else:
            best_snapped_x = nearest_node.x
            best_snapped_y = nearest_node.y

        cross_track_error_m = round(min_dist_px * scale_m_per_px, 2)

        # 2. Safety Confidence and State Machine
        state = PositioningState.POSITION_ESTIMATED
        confidence = 0.90
        is_uncertain = False
        safety_alert = None
        relocalization_prompt = None

        if cross_track_error_m <= 1.5:
            state = PositioningState.POSITION_ESTIMATED
            confidence = max(0.85, 1.0 - (cross_track_error_m * 0.1))
        elif cross_track_error_m <= 3.5:
            state = PositioningState.POSITION_ESTIMATED
            confidence = max(0.65, 0.85 - ((cross_track_error_m - 1.5) * 0.1))
        elif cross_track_error_m <= 6.0:
            state = PositioningState.POSITION_UNCERTAIN
            confidence = 0.45
            is_uncertain = True
            safety_alert = "Position uncertain: Significant deviation from verified route detected."
            relocalization_prompt = (
                "I'm not confident about your current location. Please stop at a safe place. "
                f"Can you confirm if you are near '{nearest_node.label}'?"
            )
        else:
            state = PositioningState.POSITION_LOST
            confidence = 0.15
            is_uncertain = True
            safety_alert = "Navigation paused: Route deviation exceeds safe limits. Halting guidance."
            relocalization_prompt = (
                "You have drifted away from the accessible route. Please stop immediately. "
                "Scan the nearest wall marker or request assistance."
            )

        # Distance to next landmark along route
        distance_to_next_m = None
        next_landmark_label = None
        if len(nodes) > payload.active_step_index + 1:
            next_node = nodes[payload.active_step_index + 1]
            dist_px = math.hypot(best_snapped_x - next_node.x, best_snapped_y - next_node.y)
            distance_to_next_m = round(dist_px * scale_m_per_px, 1)
            next_landmark_label = next_node.label

        return PositionUpdateResult(
            session_id=payload.session_id,
            state=state,
            confidence_score=round(confidence, 2),
            snapped_x=round(best_snapped_x, 2),
            snapped_y=round(best_snapped_y, 2),
            cross_track_error_meters=cross_track_error_m,
            along_track_distance_meters=round(payload.step_count * 0.75, 1),  # average 0.75m per stride
            nearest_node_id=nearest_node.id,
            nearest_node_label=nearest_node.label,
            distance_to_next_landmark_meters=distance_to_next_m,
            next_landmark_label=next_landmark_label,
            current_step_index=payload.active_step_index,
            is_uncertain=is_uncertain,
            safety_alert=safety_alert,
            relocalization_prompt=relocalization_prompt,
            provider_type=payload.provider_source,
        )

    def relocalize(
        self,
        db: Session,
        payload: RelocalizeRequest,
    ) -> PositionUpdateResult:
        """
        Re-establishes position at a confirmed landmark or scanned NFC/QR marker.
        Immediately restores POSITION_CONFIRMED with 1.0 confidence.
        """
        target_node = None
        marker_desc = None

        if payload.marker_code:
            marker = (
                db.query(LocationMarker)
                .filter(LocationMarker.marker_code == payload.marker_code.strip())
                .first()
            )
            if marker:
                target_node = db.query(SpatialNode).filter(SpatialNode.id == marker.spatial_node_id).first()
                marker_desc = marker.location_description

        if not target_node and payload.confirmed_node_id:
            target_node = db.query(SpatialNode).filter(SpatialNode.id == payload.confirmed_node_id).first()

        if not target_node:
            return PositionUpdateResult(
                session_id=payload.session_id,
                state=PositioningState.RELOCALIZATION_REQUIRED,
                confidence_score=0.0,
                snapped_x=0.0,
                snapped_y=0.0,
                cross_track_error_meters=0.0,
                along_track_distance_meters=0.0,
                is_uncertain=True,
                safety_alert="Relocalization failed: Landmark or marker could not be resolved.",
                relocalization_prompt="Please scan a valid marker or select from the department list.",
            )

        announcement = f"Location confirmed. You are at {target_node.label}."
        if marker_desc:
            announcement += f" ({marker_desc})"

        return PositionUpdateResult(
            session_id=payload.session_id,
            state=PositioningState.POSITION_CONFIRMED,
            confidence_score=1.0,
            snapped_x=target_node.x,
            snapped_y=target_node.y,
            cross_track_error_meters=0.0,
            along_track_distance_meters=0.0,
            nearest_node_id=target_node.id,
            nearest_node_label=target_node.label,
            is_uncertain=False,
            instruction=f"Location re-established. Resume your route from {target_node.label}.",
            provider_type="marker_confirmed",
        )


positioning_engine = IndoorPositioningEngine()
