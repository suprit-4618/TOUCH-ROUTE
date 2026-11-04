import math
from typing import Dict, List, Optional, Tuple
from app.schemas.spatial import BoundingBox, SpatialCoordinate


class CoordinateTransformer:
    """Transforms coordinates between processed-image space, normalized AI space, and original blueprint space."""

    def __init__(
        self,
        orig_width: int,
        orig_height: int,
        proc_width: Optional[int] = None,
        proc_height: Optional[int] = None,
        scale_meters_per_pixel: float = 0.05,
    ):
        self.orig_w = float(max(orig_width, 1))
        self.orig_h = float(max(orig_height, 1))
        self.proc_w = float(proc_width or orig_width)
        self.proc_h = float(proc_height or orig_height)
        self.scale_m_per_px = scale_meters_per_pixel

        # Transformation ratios
        self.scale_x_proc_to_orig = self.orig_w / self.proc_w
        self.scale_y_proc_to_orig = self.orig_h / self.proc_h

    def normalized_to_original(self, norm_x: float, norm_y: float) -> Tuple[float, float]:
        """Converts [0.0, 1.0] normalized coordinate to original blueprint pixels."""
        x = norm_x * self.orig_w
        y = norm_y * self.orig_h
        return self.clamp_point(x, y)

    def processed_to_original(self, proc_x: float, proc_y: float) -> Tuple[float, float]:
        """Converts processed-image pixel coordinates to original blueprint pixels."""
        x = proc_x * self.scale_x_proc_to_orig
        y = proc_y * self.scale_y_proc_to_orig
        return self.clamp_point(x, y)

    def clamp_point(self, x: float, y: float) -> Tuple[float, float]:
        """Clamps coordinate within original blueprint pixel boundaries."""
        clamped_x = max(0.0, min(self.orig_w, x))
        clamped_y = max(0.0, min(self.orig_h, y))
        return round(clamped_x, 1), round(clamped_y, 1)

    def bounding_box_to_original(
        self,
        min_x: float,
        min_y: float,
        max_x: float,
        max_y: float,
        is_normalized: bool = True,
    ) -> BoundingBox:
        """Transforms bounding box coordinates to original blueprint pixels."""
        if is_normalized:
            p1_x, p1_y = self.normalized_to_original(min_x, min_y)
            p2_x, p2_y = self.normalized_to_original(max_x, max_y)
        else:
            p1_x, p1_y = self.processed_to_original(min_x, min_y)
            p2_x, p2_y = self.processed_to_original(max_x, max_y)

        return BoundingBox(
            min_x=min(p1_x, p2_x),
            min_y=min(p1_y, p2_y),
            max_x=max(p1_x, p2_x),
            max_y=max(p1_y, p2_y),
        )

    def calculate_distance_meters(self, p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
        """Calculates real-world Euclidean distance in meters between two original pixel coordinates."""
        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]
        pixel_dist = math.sqrt(dx * dx + dy * dy)
        return round(pixel_dist * self.scale_m_per_px, 2)

