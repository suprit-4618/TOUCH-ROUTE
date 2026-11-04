import json
import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.config import settings
from app.database.session import get_db
from app.models.project import FloorPlan
from app.schemas.floorplan import (
    FloorPlanRead,
    PreprocessRequest,
    PreprocessResponse,
    ScaleCalibrationRequest,
    ScaleCalibrationResponse,
)
from app.services.vision.processor import (
    compute_scale_calibration,
    load_floor_plan_image,
    preprocess_floor_plan,
    save_processed_image,
)

router = APIRouter()


@router.get("/{floorplan_id}", response_model=FloorPlanRead, summary="Get floor plan record and calibration status")
def get_floor_plan(floorplan_id: str, db: Session = Depends(get_db)):
    fp = db.query(FloorPlan).filter(FloorPlan.id == floorplan_id).first()
    if not fp:
        raise HTTPException(status_code=404, detail="Floor plan not found.")
    return fp


@router.post("/{floorplan_id}/preprocess", response_model=PreprocessResponse, summary="Run OpenCV architectural preprocessing")
def preprocess_floor_plan_endpoint(
    floorplan_id: str,
    payload: PreprocessRequest,
    db: Session = Depends(get_db),
):
    fp = db.query(FloorPlan).filter(FloorPlan.id == floorplan_id).first()
    if not fp:
        raise HTTPException(status_code=404, detail="Floor plan not found.")

    raw_path = Path(fp.file_path)
    if not raw_path.exists():
        raise HTTPException(status_code=404, detail="Original floor plan file is missing from storage.")

    # Load image (supports PNG, JPG, JPEG, PDF)
    try:
        img_bgr, meta = load_floor_plan_image(raw_path, fp.mime_type)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to read image for preprocessing: {str(e)}")

    # Apply real OpenCV operations
    processed_bgr, meta_steps = preprocess_floor_plan(
        img=img_bgr,
        enhance_contrast=payload.enhance_contrast,
        denoise=payload.denoise,
        sharpen_edges=payload.sharpen_edges,
        max_dimension=payload.max_dimension or 2800,
    )

    # Save processed image to disk
    out_name = f"{fp.id}_processed.png"
    out_path = settings.UPLOAD_DIR / out_name
    save_processed_image(processed_bgr, out_path)

    # Update database record
    fp.processed_file_path = str(out_path)
    fp.processed_width = meta_steps["processed_width"]
    fp.processed_height = meta_steps["processed_height"]
    fp.preprocessing_metadata = json.dumps(meta_steps)
    fp.analysis_status = "processed"
    db.commit()
    db.refresh(fp)

    return PreprocessResponse(
        floorplan_id=fp.id,
        original_dimensions={"width": meta_steps["original_width"], "height": meta_steps["original_height"]},
        processed_dimensions={"width": meta_steps["processed_width"], "height": meta_steps["processed_height"]},
        preprocessing_steps=meta_steps["steps_applied"],
        contrast_metric=meta_steps["contrast_metric"],
        status="processed",
        processed_image_url=f"/api/v1/uploads/{fp.id}/processed-image",
    )


@router.post("/{floorplan_id}/calibrate-scale", response_model=ScaleCalibrationResponse, summary="Calibrate real-world scale (meters per pixel)")
def calibrate_scale(
    floorplan_id: str,
    payload: ScaleCalibrationRequest,
    db: Session = Depends(get_db),
):
    fp = db.query(FloorPlan).filter(FloorPlan.id == floorplan_id).first()
    if not fp:
        raise HTTPException(status_code=404, detail="Floor plan not found.")

    # Direct manual entry
    if payload.manual_scale_meters_per_pixel:
        scale_val = payload.manual_scale_meters_per_pixel
        fp.scale_meters_per_pixel = scale_val
        fp.is_scale_calibrated = True
        fp.calibration_metadata = json.dumps({
            "mode": "manual",
            "scale_meters_per_pixel": scale_val,
        })
        db.commit()
        db.refresh(fp)
        return ScaleCalibrationResponse(
            floorplan_id=fp.id,
            scale_meters_per_pixel=scale_val,
            pixels_per_meter=round(1.0 / scale_val, 4),
            is_scale_calibrated=True,
            status="calibrated",
            message=f"Manual scale calibrated: 1 pixel = {scale_val:.4f}m ({1.0 / scale_val:.1f} px/m).",
        )

    # 2-Point geometric reference measurement
    if not payload.point1 or not payload.point2 or not payload.known_distance_meters:
        raise HTTPException(
            status_code=400,
            detail="Must provide two distinct points with a known distance in meters, or specify manual_scale_meters_per_pixel.",
        )

    try:
        meters_per_pixel, pixels_per_meter, pixel_dist = compute_scale_calibration(
            p1=(payload.point1.x, payload.point1.y),
            p2=(payload.point2.x, payload.point2.y),
            real_meters=payload.known_distance_meters,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    fp.scale_meters_per_pixel = meters_per_pixel
    fp.is_scale_calibrated = True
    fp.calibration_metadata = json.dumps({
        "mode": "measured_2point",
        "point1": {"x": payload.point1.x, "y": payload.point1.y},
        "point2": {"x": payload.point2.x, "y": payload.point2.y},
        "measured_pixel_distance": round(pixel_dist, 2),
        "known_distance_meters": payload.known_distance_meters,
        "scale_meters_per_pixel": meters_per_pixel,
    })
    db.commit()
    db.refresh(fp)

    return ScaleCalibrationResponse(
        floorplan_id=fp.id,
        scale_meters_per_pixel=round(meters_per_pixel, 6),
        pixels_per_meter=round(pixels_per_meter, 4),
        pixel_distance_measured=round(pixel_dist, 2),
        known_distance_meters=payload.known_distance_meters,
        is_scale_calibrated=True,
        status="calibrated",
        message=f"Scale calibrated: {payload.known_distance_meters}m over {pixel_dist:.1f}px (1px = {meters_per_pixel:.4f}m).",
    )


@router.delete("/{floorplan_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete floor plan")
def delete_floor_plan(floorplan_id: str, db: Session = Depends(get_db)):
    fp = db.query(FloorPlan).filter(FloorPlan.id == floorplan_id).first()
    if not fp:
        raise HTTPException(status_code=404, detail="Floor plan not found.")

    # Remove files
    if fp.file_path and os.path.exists(fp.file_path):
        try:
            os.remove(fp.file_path)
        except OSError:
            pass

    if fp.processed_file_path and os.path.exists(fp.processed_file_path):
        try:
            os.remove(fp.processed_file_path)
        except OSError:
            pass

    db.delete(fp)
    db.commit()
    return None

