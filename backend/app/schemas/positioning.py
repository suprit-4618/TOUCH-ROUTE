from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class PositioningState(str, Enum):
    INITIALIZING = "INITIALIZING"
    POSITION_CONFIRMED = "POSITION_CONFIRMED"
    POSITION_ESTIMATED = "POSITION_ESTIMATED"
    POSITION_UNCERTAIN = "POSITION_UNCERTAIN"
    POSITION_LOST = "POSITION_LOST"
    RELOCALIZATION_REQUIRED = "RELOCALIZATION_REQUIRED"


class PositionUpdatePayload(BaseModel):
    session_id: str
    project_id: str
    estimated_x: float
    estimated_y: float
    current_level: int = 1
    heading_degrees: float = 0.0
    step_count: int = 0
    active_step_index: int = 0
    route_node_ids: Optional[List[str]] = None
    provider_source: str = "sensor_pdr"  # sensor_pdr, simulation, manual_anchor


class RelocalizeRequest(BaseModel):
    session_id: str
    project_id: str
    confirmed_node_id: Optional[str] = None
    marker_code: Optional[str] = None


class PositionUpdateResult(BaseModel):
    session_id: str
    state: PositioningState
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    snapped_x: float
    snapped_y: float
    cross_track_error_meters: float
    along_track_distance_meters: float
    nearest_node_id: Optional[str] = None
    nearest_node_label: Optional[str] = None
    distance_to_next_landmark_meters: Optional[float] = None
    next_landmark_label: Optional[str] = None
    current_step_index: int = 0
    instruction: Optional[str] = None
    is_uncertain: bool = False
    safety_alert: Optional[str] = None
    relocalization_prompt: Optional[str] = None
    provider_type: str = "map_snapped"
    disclaimer: str = (
        "Indoor position estimate based on dead-reckoning and map constraints. "
        "Confidence is continuously monitored; uncertainty triggers an immediate safe stop warning."
    )

