from datetime import datetime
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class BoundingBox(BaseModel):
    min_x: float = 0.0
    min_y: float = 0.0
    max_x: float = 1.0
    max_y: float = 1.0

    @model_validator(mode="before")
    @classmethod
    def normalize_box(cls, data: Any) -> Any:
        if isinstance(data, (list, tuple)) and len(data) >= 4:
            try:
                return {
                    "min_x": float(data[0] if data[0] is not None else 0.0),
                    "min_y": float(data[1] if data[1] is not None else 0.0),
                    "max_x": float(data[2] if data[2] is not None else 1.0),
                    "max_y": float(data[3] if data[3] is not None else 1.0),
                }
            except (TypeError, ValueError):
                return {"min_x": 0.0, "min_y": 0.0, "max_x": 1.0, "max_y": 1.0}
        if isinstance(data, dict):
            try:
                return {
                    "min_x": float(data.get("min_x") if data.get("min_x") is not None else 0.0),
                    "min_y": float(data.get("min_y") if data.get("min_y") is not None else 0.0),
                    "max_x": float(data.get("max_x") if data.get("max_x") is not None else 1.0),
                    "max_y": float(data.get("max_y") if data.get("max_y") is not None else 1.0),
                }
            except (TypeError, ValueError):
                return {"min_x": 0.0, "min_y": 0.0, "max_x": 1.0, "max_y": 1.0}
        return {"min_x": 0.0, "min_y": 0.0, "max_x": 1.0, "max_y": 1.0}


class SpatialCoordinate(BaseModel):
    x: float = 0.0
    y: float = 0.0

    @model_validator(mode="before")
    @classmethod
    def normalize_coord(cls, data: Any) -> Any:
        if isinstance(data, (list, tuple)) and len(data) >= 2:
            try:
                return {
                    "x": float(data[0] if data[0] is not None else 0.0),
                    "y": float(data[1] if data[1] is not None else 0.0),
                }
            except (TypeError, ValueError):
                return {"x": 0.0, "y": 0.0}
        if isinstance(data, dict):
            try:
                return {
                    "x": float(data.get("x") if data.get("x") is not None else 0.0),
                    "y": float(data.get("y") if data.get("y") is not None else 0.0),
                }
            except (TypeError, ValueError):
                return {"x": 0.0, "y": 0.0}
        return {"x": 0.0, "y": 0.0}


class RoomEntity(BaseModel):
    id: str
    name: str
    type: str = "room"  # reception, office, conference, restroom, corridor, clinic, etc.
    room_number: Optional[str] = None
    coordinates: List[SpatialCoordinate] = Field(default_factory=list)
    bounding_box: Optional[BoundingBox] = None
    confidence: float = 1.0
    is_accessible: bool = True
    is_user_verified: bool = False
    notes: Optional[str] = None

    @field_validator("id", mode="before")
    @classmethod
    def clean_id(cls, v):
        return str(v or f"room_{uuid.uuid4().hex[:6]}")

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, v):
        return str(v or "Unlabeled Room")

    @field_validator("confidence", mode="before")
    @classmethod
    def clean_confidence(cls, v):
        if v is None:
            return 1.0
        try:
            return float(v)
        except (TypeError, ValueError):
            return 1.0

    @field_validator("is_accessible", mode="before")
    @classmethod
    def clean_accessible(cls, v):
        if v is None:
            return True
        return bool(v)

    @field_validator("type", mode="before")
    @classmethod
    def clean_type(cls, v):
        return str(v or "room")

    @field_validator("coordinates", mode="before")
    @classmethod
    def clean_coordinates(cls, v):
        if not v or not isinstance(v, list):
            return []
        cleaned = []
        for item in v:
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                cleaned.append({"x": item[0], "y": item[1]})
            elif isinstance(item, dict):
                cleaned.append(item)
            elif isinstance(item, SpatialCoordinate):
                cleaned.append(item)
            elif hasattr(item, "x") and hasattr(item, "y"):
                cleaned.append({"x": item.x, "y": item.y})
        return cleaned


class ConnectionEntity(BaseModel):
    id: str
    source_id: str
    target_id: str
    connection_type: str = "door"  # door, corridor_walkway, stair_transition, elevator_transition
    distance_meters: float = 1.5
    confidence: float = 1.0
    is_accessible: bool = True
    is_inter_floor: bool = False
    is_user_verified: bool = False

    @field_validator("distance_meters", mode="before")
    @classmethod
    def clean_distance(cls, v):
        if v is None:
            return 1.5
        try:
            return float(v)
        except (TypeError, ValueError):
            return 1.5

    @field_validator("confidence", mode="before")
    @classmethod
    def clean_confidence(cls, v):
        if v is None:
            return 1.0
        try:
            return float(v)
        except (TypeError, ValueError):
            return 1.0

    @field_validator("connection_type", mode="before")
    @classmethod
    def clean_connection_type(cls, v):
        return str(v or "door")

    @field_validator("is_accessible", mode="before")
    @classmethod
    def clean_accessible(cls, v):
        if v is None:
            return True
        return bool(v)


class WaypointEntity(BaseModel):
    id: str = "wp_0"
    label: str = "Waypoint"
    type: str = "entrance"  # entrance, exit, stairs, elevator, reception, restroom
    x: float = 0.0
    y: float = 0.0
    bounding_box: Optional[BoundingBox] = None
    is_accessible: bool = True
    confidence: float = 1.0
    notes: Optional[str] = None

    @field_validator("id", mode="before")
    @classmethod
    def clean_id(cls, v):
        return str(v or f"wp_{uuid.uuid4().hex[:6]}")

    @field_validator("label", mode="before")
    @classmethod
    def clean_label(cls, v):
        return str(v or "Waypoint")

    @field_validator("x", "y", mode="before")
    @classmethod
    def clean_xy(cls, v):
        try:
            return float(v if v is not None else 0.0)
        except (TypeError, ValueError):
            return 0.0

    @field_validator("confidence", mode="before")
    @classmethod
    def clean_confidence(cls, v):
        if v is None:
            return 1.0
        try:
            return float(v)
        except (TypeError, ValueError):
            return 1.0

    @field_validator("is_accessible", mode="before")
    @classmethod
    def clean_accessible(cls, v):
        if v is None:
            return True
        return bool(v)

    @field_validator("type", mode="before")
    @classmethod
    def clean_type(cls, v):
        return str(v or "entrance")


class StructuredSpatialAnalysis(BaseModel):
    building_name: str = "Floor Plan"
    level_name: str = "Level 1"
    level_number: int = 1
    rooms: List[RoomEntity] = Field(default_factory=list)
    connections: List[ConnectionEntity] = Field(default_factory=list)
    entrances: List[WaypointEntity] = Field(default_factory=list)
    exits: List[WaypointEntity] = Field(default_factory=list)
    doors: List[WaypointEntity] = Field(default_factory=list)
    stairs: List[WaypointEntity] = Field(default_factory=list)
    elevators: List[WaypointEntity] = Field(default_factory=list)
    unidentified_features: List[Dict[str, Any]] = Field(default_factory=list)
    uncertainty_notes: List[str] = Field(default_factory=list)

    @field_validator("building_name", mode="before")
    @classmethod
    def clean_building(cls, v):
        return str(v or "Floor Plan")

    @field_validator("level_name", mode="before")
    @classmethod
    def clean_level_name(cls, v):
        return str(v or "Level 1")

    @field_validator("level_number", mode="before")
    @classmethod
    def clean_level_number(cls, v):
        try:
            return int(v if v is not None else 1)
        except (TypeError, ValueError):
            return 1

    @field_validator("rooms", "connections", "entrances", "exits", "doors", "stairs", "elevators", "unidentified_features", "uncertainty_notes", mode="before")
    @classmethod
    def clean_lists(cls, v):
        if v is None:
            return []
        if isinstance(v, list):
            return v
        return []


# --- API Node Schemas ---

class SpatialNodeBase(BaseModel):
    label: str = Field(..., min_length=1, max_length=255)
    node_type: str = Field(..., description="room, corridor, door, entrance, exit, stairs, elevator, restroom, reception")
    room_number: Optional[str] = None
    x: float = Field(..., description="X coordinate in original blueprint pixels")
    y: float = Field(..., description="Y coordinate in original blueprint pixels")
    is_accessible: bool = True
    level_number: int = 1
    level_name: str = "Level 1"
    notes: Optional[str] = None


class SpatialNodeCreate(SpatialNodeBase):
    project_id: str
    floor_plan_id: Optional[str] = None
    bounding_box: Optional[str] = None
    polygon_points: Optional[str] = None
    is_user_verified: bool = False
    confidence: float = 1.0
    detection_source: str = "manual_entry"


class SpatialNodeUpdate(BaseModel):
    label: Optional[str] = None
    node_type: Optional[str] = None
    room_number: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    bounding_box: Optional[str] = None
    polygon_points: Optional[str] = None
    is_accessible: Optional[bool] = None
    is_geometry_validated: Optional[bool] = None
    is_user_verified: Optional[bool] = None
    level_number: Optional[int] = None
    level_name: Optional[str] = None
    notes: Optional[str] = None


class SpatialNodeRead(SpatialNodeBase):
    id: str
    project_id: str
    floor_plan_id: Optional[str] = None
    bounding_box: Optional[str] = None
    polygon_points: Optional[str] = None
    detection_source: str
    is_geometry_validated: bool
    is_user_verified: bool
    confidence: float
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- API Edge Schemas ---

class SpatialEdgeBase(BaseModel):
    source_node_id: str
    target_node_id: str
    distance_meters: float = 1.0
    edge_type: str = "door"
    is_accessible: bool = True
    is_inter_floor: bool = False
    level_number: int = 1


class SpatialEdgeCreate(SpatialEdgeBase):
    project_id: str
    source_floor_id: Optional[str] = None
    target_floor_id: Optional[str] = None
    confidence: float = 1.0
    detection_source: str = "manual_entry"
    is_user_verified: bool = False


class SpatialEdgeUpdate(BaseModel):
    distance_meters: Optional[float] = None
    edge_type: Optional[str] = None
    is_accessible: Optional[bool] = None
    is_geometry_validated: Optional[bool] = None
    is_user_verified: Optional[bool] = None
    is_inter_floor: Optional[bool] = None


class SpatialEdgeRead(SpatialEdgeBase):
    id: str
    project_id: str
    source_floor_id: Optional[str] = None
    target_floor_id: Optional[str] = None
    confidence: float
    detection_source: str
    is_geometry_validated: bool
    is_user_verified: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Analysis & Execution Payloads ---

class SpatialValidationReport(BaseModel):
    valid_nodes: int
    invalid_geometry_resolved: int
    duplicates_merged: int
    boundary_clamped_nodes: int
    connectivity_warnings: List[str] = Field(default_factory=list)
    uncertainty_notes: List[str] = Field(default_factory=list)


class AIInterpretationRequest(BaseModel):
    floorplan_id: str
    provider: Optional[str] = None  # "gemini" | "nvidia"
    building_name_hint: Optional[str] = None
    level_name: Optional[str] = "Level 1"
    level_number: Optional[int] = 1
    confidence_threshold: float = Field(0.70, ge=0.0, le=1.0)


class AIInterpretationResponse(BaseModel):
    project_id: str
    floorplan_id: str
    floor_plan_id: Optional[str] = None
    level_number: int = 1
    model_used: str
    provider: str = "gemini"
    elements_detected_count: Optional[int] = None
    nodes_persisted_count: Optional[int] = None
    edges_persisted_count: Optional[int] = None
    nodes_detected: int
    edges_detected: int
    geometry_validation_errors: List[str] = Field(default_factory=list)
    nodes: List[SpatialNodeRead]
    edges: List[SpatialEdgeRead]
    validation_report: SpatialValidationReport
    status: str = "completed"
    message: str = "Floor plan spatial interpretation generated and validated."


class BatchVerifyRequest(BaseModel):
    project_id: str
    node_ids: Optional[List[str]] = None
    edge_ids: Optional[List[str]] = None
    verify_all_validated: bool = False


class BatchVerifyResponse(BaseModel):
    project_id: str
    verified_nodes_count: int
    verified_edges_count: int
    unverified_nodes_count: int
    safe_for_navigation: bool
    message: str
