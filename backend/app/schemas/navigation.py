from typing import List, Optional
from pydantic import BaseModel, Field


class NavigationStep(BaseModel):
    step_number: int
    instruction: str
    action: str  # start, straight, turn_left, turn_right, slight_left, slight_right, enter_door, stairs, elevator, arrive
    distance_meters: float
    target_node_id: str
    target_label: str
    orientation_degrees: Optional[float] = None
    landmark_cue: Optional[str] = None
    level_name: Optional[str] = None
    is_verified: bool = True


class RouteRequest(BaseModel):
    project_id: str
    start_node_id: str
    destination_node_id: str
    accessible_only: bool = True  # Step-free: avoid stairs & physical hazards
    verified_only: bool = True    # Strict safety constraint: only human-verified topology allowed


class RouteResult(BaseModel):
    project_id: Optional[str] = "unassigned"
    start_node_id: str
    destination_node_id: str
    total_distance_meters: float
    estimated_walking_seconds: int
    accessible: bool
    is_scale_calibrated: bool = True
    is_verified_safe: bool = True
    has_unverified_segments: bool = False
    unverified_warning: Optional[str] = None
    path_node_ids: List[str]
    steps: List[NavigationStep]
    disclaimer: str = "Deterministic indoor route derived from verified spatial topology. Does not simulate physical live positioning without positioning hardware."


class DestinationItem(BaseModel):
    id: str
    label: str
    room_number: Optional[str] = None
    node_type: str
    level_number: int = 1
    level_name: str = "Level 1"
    is_accessible: bool = True
    spoken_aliases: List[str] = []


class DestinationMatchRequest(BaseModel):
    spoken_query: str


class DestinationMatchResponse(BaseModel):
    spoken_query: str
    exact_match: Optional[DestinationItem] = None
    candidates: List[DestinationItem] = []
    is_ambiguous: bool = False
    clarification_prompt: Optional[str] = None
