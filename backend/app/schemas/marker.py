from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class LocationMarkerBase(BaseModel):
    project_id: str
    spatial_node_id: str
    floor_plan_id: Optional[str] = None
    marker_code: str = Field(..., description="Unique alphanumeric identifier, e.g. TR-HOSP-G-ENT")
    marker_type: str = Field("dual", description="Marker physical type: 'nfc', 'qr', or 'dual'")
    level_number: int = 1
    level_name: str = "Ground Floor"
    location_description: str = Field(..., description="Spoken and plain-text location summary")
    tactile_identifier: Optional[str] = Field(None, description="Physical Braille plaque location notes")
    is_active: bool = True


class LocationMarkerCreate(LocationMarkerBase):
    pass


class LocationMarkerUpdate(BaseModel):
    location_description: Optional[str] = None
    tactile_identifier: Optional[str] = None
    marker_type: Optional[str] = None
    is_active: Optional[bool] = None


class LocationMarkerResponse(LocationMarkerBase):
    id: str
    building_name: Optional[str] = None
    node_label: Optional[str] = None
    node_type: Optional[str] = None
    room_number: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MarkerResolutionResult(BaseModel):
    """
    Returned upon tapping an NFC tag or scanning a QR access point.
    Critically establishes a single known verified location at that instant.
    """
    success: bool = True
    marker_id: str
    marker_code: str
    marker_type: str
    project_id: str
    building_name: str
    floor_plan_id: Optional[str] = None
    level_number: int
    level_name: str
    spatial_node_id: str
    node_label: str
    node_type: str
    room_number: Optional[str] = None
    x: float
    y: float
    location_description: str
    tactile_identifier: Optional[str] = None
    voice_announcement: str
    disclaimer: str = (
        "An NFC or QR scan establishes your known location at this marker only. "
        "It does not continuously track you after leaving the marker."
    )
