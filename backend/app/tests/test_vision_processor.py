import cv2
import numpy as np
import pytest
from app.services.vision.processor import (
    compute_scale_calibration,
    preprocess_floor_plan,
)


def create_synthetic_floorplan_image(width=800, height=600):
    """Creates a synthetic floor plan image with walls and rooms for testing."""
    # Light gray background
    img = np.full((height, width, 3), 245, dtype=np.uint8)
    
    # Outer walls (dark charcoal lines)
    cv2.rectangle(img, (50, 50), (750, 550), (30, 30, 30), thickness=6)
    
    # Inner corridor divider
    cv2.line(img, (50, 300), (750, 300), (40, 40, 40), thickness=4)
    
    # Room partitions
    cv2.line(img, (250, 50), (250, 300), (40, 40, 40), thickness=4)
    cv2.line(img, (500, 50), (500, 300), (40, 40, 40), thickness=4)
    
    # Door openings (clear wall gap)
    cv2.line(img, (120, 300), (180, 300), (245, 245, 245), thickness=6)
    
    return img


def test_preprocess_floor_plan_pipeline():
    img = create_synthetic_floorplan_image(800, 600)
    processed, meta = preprocess_floor_plan(
        img=img,
        enhance_contrast=True,
        denoise=True,
        sharpen_edges=True,
        max_dimension=1000,
    )

    assert processed is not None
    assert processed.shape[0] == 600
    assert processed.shape[1] == 800
    assert meta["original_width"] == 800
    assert meta["original_height"] == 600
    assert meta["processed_width"] == 800
    assert meta["processed_height"] == 600
    assert "contrast_metric" in meta
    assert meta["contrast_metric"] > 0
    assert len(meta["steps_applied"]) >= 3


def test_preprocess_oversized_downscaling():
    large_img = np.full((3200, 2400, 3), 200, dtype=np.uint8)
    processed, meta = preprocess_floor_plan(
        img=large_img,
        max_dimension=1600,
    )
    assert meta["processed_height"] == 1600
    assert meta["processed_width"] == 1200
    assert any("Resized" in step for step in meta["steps_applied"])


def test_scale_calibration_calculation():
    # 200 pixels represent 10.0 meters -> scale is 0.05 meters/pixel (20 pixels/meter)
    p1 = (100.0, 100.0)
    p2 = (300.0, 100.0)
    m_per_px, px_per_m, dist = compute_scale_calibration(p1, p2, 10.0)

    assert round(dist, 2) == 200.0
    assert round(m_per_px, 4) == 0.05
    assert round(px_per_m, 2) == 20.0


def test_scale_calibration_coincident_points_error():
    p1 = (50.0, 50.0)
    p2 = (50.0, 50.0)
    with pytest.raises(ValueError) as exc:
        compute_scale_calibration(p1, p2, 5.0)
    assert "too close together" in str(exc.value)


def test_pdf_rendering_and_processing(tmp_path):
    import fitz
    from app.services.vision.processor import load_floor_plan_image

    # Create a small valid PDF file
    doc = fitz.open()
    page = doc.new_page(width=500, height=400)
    # Draw simple architectural rectangle on PDF
    rect = fitz.Rect(50, 50, 450, 350)
    page.draw_rect(rect, color=(0, 0, 0), width=2)
    pdf_path = tmp_path / "test_blueprint.pdf"
    doc.save(str(pdf_path))
    doc.close()

    # Load and process via TouchRoute pipeline
    img_bgr, meta = load_floor_plan_image(pdf_path, "application/pdf")
    assert meta["is_pdf"] is True
    assert meta["page_count"] == 1
    assert img_bgr.shape[0] > 0
    assert img_bgr.shape[1] > 0

    # Verify preprocessing on PDF raster
    processed, pre_meta = preprocess_floor_plan(img_bgr)
    assert processed is not None
    assert pre_meta["processed_width"] > 0

