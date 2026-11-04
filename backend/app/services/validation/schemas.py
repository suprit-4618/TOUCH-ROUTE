from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class GroundTruthRoom(BaseModel):
    id: str
    label: str
    room_number: Optional[str] = None
    node_type: str = "room"
    center_x: float
    center_y: float
    bounding_box: Optional[Dict[str, float]] = None
    level_number: int = 1
    is_accessible: bool = True


class GroundTruthDoor(BaseModel):
    id: str
    source_label: str
    target_label: str
    connection_type: str = "door"
    is_accessible: bool = True


class GroundTruthCorridor(BaseModel):
    id: str
    label: str
    connects_to: List[str]


class GroundTruthMultiFloor(BaseModel):
    id: str
    node_type: Literal["stairs", "elevator"]
    label: str
    level_from: int
    level_to: int
    is_accessible: bool = True


class GroundTruthRoute(BaseModel):
    id: str
    start_label: str
    dest_label: str
    accessible_required: bool = True
    expect_solvable: bool = True
    expected_waypoints: Optional[List[str]] = None


class FloorPlanGroundTruth(BaseModel):
    test_id: str
    dataset_type: Literal["synthetic", "real_world"]
    building_name: str
    floor_name: str
    original_dimensions: Dict[str, int]  # {"width": int, "height": int}
    scale_meters_per_pixel: Optional[float] = None
    rooms: List[GroundTruthRoom]
    doors: List[GroundTruthDoor] = []
    corridors: List[GroundTruthCorridor] = []
    multi_floor_transitions: List[GroundTruthMultiFloor] = []
    test_routes: List[GroundTruthRoute] = []


class ValidationMetricReport(BaseModel):
    test_id: str
    dataset_type: Literal["synthetic", "real_world"]
    building_name: str
    original_dimensions: Dict[str, int]
    scale_meters_per_pixel: Optional[float]

    # Room detection metrics
    manual_rooms_count: int
    detected_rooms_count: int
    correct_detections: int
    incorrect_detections: int
    missed_detections: int
    detection_precision: float
    detection_recall: float
    detection_f1: float

    # Connectivity metrics
    door_connectivity_accuracy: float
    corridor_connectivity_accuracy: float
    multi_floor_transition_correctness: float
    graph_connectivity_errors: List[str]

    # Geometric & Routing accuracy
    coordinate_transformation_accuracy: float  # Percentage (e.g. 99.8%)
    max_coordinate_pixel_error: float
    route_correctness: float  # Percentage of test routes correctly solved

    summary_status: Literal["PASS", "MARGINAL", "FAIL"]
    audit_notes: List[str]

