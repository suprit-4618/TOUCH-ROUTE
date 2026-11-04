from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class Point2D(BaseModel):
    x: float = Field(..., description="X coordinate in pixels")
    y: float = Field(..., description="Y coordinate in pixels")


class FloorPlanBase(BaseModel):
    name: str = Field(..., max_length=255)
    scale_meters_per_pixel: Optional[float] = 0.05


class FloorPlanRead(FloorPlanBase):
    id: str
    project_id: str
    original_filename: str
    file_path: str
    file_size: int
    mime_type: str
    width: Optional[int] = None
    height: Optional[int] = None
    processed_file_path: Optional[str] = None
    processed_width: Optional[int] = None
    processed_height: Optional[int] = None
    is_scale_calibrated: bool = False
    calibration_metadata: Optional[str] = None
    preprocessing_metadata: Optional[str] = None
    analysis_status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FloorPlanUploadResponse(BaseModel):
    id: str
    project_id: str
    name: str
    filename: str
    file_size_bytes: int
    mime_type: str
    width: Optional[int] = None
    height: Optional[int] = None
    status: str
    message: str


class PreprocessRequest(BaseModel):
    enhance_contrast: bool = Field(True, description="Apply CLAHE adaptive contrast enhancement")
    denoise: bool = Field(True, description="Apply bilateral edge-preserving smoothing")
    sharpen_edges: bool = Field(True, description="Sharpen structural wall lines")
    max_dimension: Optional[int] = Field(2800, description="Max dimension in pixels to cap excessive scans")


class PreprocessResponse(BaseModel):
    floorplan_id: str
    original_dimensions: Dict[str, int]
    processed_dimensions: Dict[str, int]
    preprocessing_steps: List[str]
    contrast_metric: float
    status: str
    processed_image_url: str


class ScaleCalibrationRequest(BaseModel):
    # Either provide two points with known real-world distance:
    point1: Optional[Point2D] = None
    point2: Optional[Point2D] = None
    known_distance_meters: Optional[float] = Field(None, gt=0, description="Real world distance between points in meters")
    # Or manual direct input:
    manual_scale_meters_per_pixel: Optional[float] = Field(None, gt=0, description="Direct meters per pixel value")


class ScaleCalibrationResponse(BaseModel):
    floorplan_id: str
    scale_meters_per_pixel: float
    pixels_per_meter: float
    pixel_distance_measured: Optional[float] = None
    known_distance_meters: Optional[float] = None
    is_scale_calibrated: bool
    status: str
    message: str
