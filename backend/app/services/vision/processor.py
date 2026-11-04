import logging
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


def load_floor_plan_image(file_path: Path, mime_type: Optional[str] = None) -> Tuple[np.ndarray, Dict[str, Any]]:
    """Loads a PNG, JPG, JPEG, or PDF floor plan and returns an OpenCV BGR image array."""
    file_path = Path(file_path)
    if not file_path.exists():
        raise FileNotFoundError(f"Floor plan file not found: {file_path}")

    ext = file_path.suffix.lower()
    meta: Dict[str, Any] = {
        "source_format": ext,
        "is_pdf": False,
        "page_count": 1,
    }

    # Handle PDF format via PyMuPDF (fitz)
    if ext == ".pdf" or mime_type == "application/pdf":
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(str(file_path))
            meta["is_pdf"] = True
            meta["page_count"] = len(doc)
            if len(doc) == 0:
                raise ValueError("PDF contains no pages.")
            
            # Render first page at 200 DPI for sharp architectural wall lines
            page = doc[0]
            zoom = 200.0 / 72.0
            matrix = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            
            # Convert pixmap buffer to numpy array
            img_np = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 3)
            # PyMuPDF is RGB, convert to OpenCV BGR
            img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
            doc.close()
            return img_bgr, meta
        except Exception as e:
            logger.error(f"Failed to rasterize PDF: {e}")
            raise ValueError(f"Could not render PDF floor plan: {str(e)}")

    # Handle raster image formats (PNG, JPG, JPEG)
    try:
        # First attempt OpenCV imread
        img = cv2.imread(str(file_path))
        if img is not None:
            return img, meta
        
        # Fallback to Pillow for indexed/palette or CMYK images
        pil_img = Image.open(file_path)
        if pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")
        img_np = np.array(pil_img)
        img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
        return img_bgr, meta
    except Exception as e:
        logger.error(f"Failed to load image: {e}")
        raise ValueError(f"Could not load image format '{ext}': {str(e)}")


def preprocess_floor_plan(
    img: np.ndarray,
    enhance_contrast: bool = True,
    denoise: bool = True,
    sharpen_edges: bool = True,
    max_dimension: int = 2800,
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """Applies real OpenCV operations: aspect-preserving downscale, denoising, CLAHE contrast, and edge sharpening."""
    orig_h, orig_w = img.shape[:2]
    steps_applied: List[str] = []

    working = img.copy()

    # 1. Scale down if oversized while preserving aspect ratio
    max_dim = max(orig_w, orig_h)
    if max_dim > max_dimension:
        scale = max_dimension / float(max_dim)
        new_w = int(round(orig_w * scale))
        new_h = int(round(orig_h * scale))
        working = cv2.resize(working, (new_w, new_h), interpolation=cv2.INTER_AREA)
        steps_applied.append(f"Resized from {orig_w}x{orig_h} to {new_w}x{new_h} (scale: {scale:.2f})")
    else:
        new_w, new_h = orig_w, orig_h
        steps_applied.append(f"Preserved original dimensions {orig_w}x{orig_h}")

    # 2. Convert to Grayscale
    if len(working.shape) == 3:
        gray = cv2.cvtColor(working, cv2.COLOR_BGR2GRAY)
        steps_applied.append("Converted to single-channel grayscale")
    else:
        gray = working.copy()

    # 3. Bilateral Filter Denoising (removes paper texture while strictly preserving wall boundaries)
    if denoise:
        gray = cv2.bilateralFilter(gray, d=5, sigmaColor=40, sigmaSpace=40)
        steps_applied.append("Applied bilateral edge-preserving denoise")

    # 4. Adaptive Contrast Enhancement (CLAHE)
    if enhance_contrast:
        clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
        gray = clahe.apply(gray)
        steps_applied.append("Applied CLAHE adaptive histogram equalization")

    # 5. Wall Edge Sharpening (Unsharp masking)
    if sharpen_edges:
        gaussian = cv2.GaussianBlur(gray, (0, 0), sigmaX=2.0)
        sharpened = cv2.addWeighted(gray, 1.4, gaussian, -0.4, 0)
        gray = np.clip(sharpened, 0, 255).astype(np.uint8)
        steps_applied.append("Applied unsharp masking edge enhancement")

    # Compute actual contrast ratio
    contrast_metric = float(np.std(gray) / (np.mean(gray) + 1e-5))

    # Convert grayscale back to BGR for universal frontend canvas compatibility
    output_bgr = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    metadata = {
        "original_width": orig_w,
        "original_height": orig_h,
        "processed_width": new_w,
        "processed_height": new_h,
        "steps_applied": steps_applied,
        "contrast_metric": round(contrast_metric, 4),
    }

    return output_bgr, metadata


def save_processed_image(img: np.ndarray, output_path: Path) -> Path:
    """Saves the preprocessed image as a web-optimized PNG."""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    success = cv2.imwrite(str(output_path), img, [cv2.IMWRITE_PNG_COMPRESSION, 4])
    if not success:
        raise IOError(f"Failed to write processed image to {output_path}")
    return output_path


def compute_scale_calibration(
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    real_meters: float,
) -> Tuple[float, float, float]:
    """Computes meters_per_pixel, pixels_per_meter, and pixel distance from two points."""
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    pixel_dist = math.sqrt(dx * dx + dy * dy)
    if pixel_dist < 1.0:
        raise ValueError("Selected calibration points are too close together (< 1 pixel).")

    meters_per_pixel = real_meters / pixel_dist
    pixels_per_meter = pixel_dist / real_meters

    return meters_per_pixel, pixels_per_meter, pixel_dist

