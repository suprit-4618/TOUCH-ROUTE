import asyncio
import io
import cv2
import numpy as np
import pytest
from fastapi import UploadFile
from app.api.routes.floorplans import (
    calibrate_scale,
    delete_floor_plan,
    get_floor_plan,
    preprocess_floor_plan_endpoint,
)
from app.api.routes.uploads import upload_floor_plan
from app.database.session import SessionLocal
from app.models.project import Project
from app.schemas.floorplan import (
    Point2D,
    PreprocessRequest,
    ScaleCalibrationRequest,
)


def create_test_image_bytes():
    img = np.full((400, 600, 3), 240, dtype=np.uint8)
    cv2.rectangle(img, (20, 20), (580, 380), (30, 30, 30), 4)
    success, encoded = cv2.imencode(".png", img)
    return encoded.tobytes()


@pytest.fixture
def test_project():
    db = SessionLocal()
    proj = Project(
        name="Stage 2 Test Complex",
        building_name="Engineering Annex",
        is_demo=False,
        status="draft",
    )
    db.add(proj)
    db.commit()
    db.refresh(proj)
    proj_id = proj.id
    db.close()
    yield proj_id
    # Cleanup
    db = SessionLocal()
    p = db.query(Project).filter(Project.id == proj_id).first()
    if p:
        db.delete(p)
        db.commit()
    db.close()


def test_upload_and_process_floorplan(test_project):
    db = SessionLocal()
    try:
        # 1. Upload valid PNG floor plan
        img_bytes = create_test_image_bytes()
        file_obj = UploadFile(
            filename="ground_floor_scan.png",
            file=io.BytesIO(img_bytes),
            headers={"content-type": "image/png"},
        )

        upload_res = upload_floor_plan(
            project_id=test_project,
            file=file_obj,
            name="Ground Floor Blueprints",
            db=db,
        )

        assert upload_res.id is not None
        assert upload_res.status == "uploaded"
        assert upload_res.width == 600
        assert upload_res.height == 400
        fp_id = upload_res.id

        # 2. Check metadata
        fp_data = get_floor_plan(fp_id, db=db)
        assert fp_data.name == "Ground Floor Blueprints"
        assert fp_data.analysis_status == "uploaded"
        assert fp_data.is_scale_calibrated is False

        # 3. Preprocess with OpenCV
        preprocess_req = PreprocessRequest(
            enhance_contrast=True,
            denoise=True,
            sharpen_edges=True,
        )
        pre_res = preprocess_floor_plan_endpoint(fp_id, payload=preprocess_req, db=db)
        assert pre_res.status == "processed"
        assert pre_res.processed_dimensions["width"] == 600
        assert pre_res.contrast_metric > 0

        # Verify DB updated
        fp_updated = get_floor_plan(fp_id, db=db)
        assert fp_updated.analysis_status == "processed"
        assert fp_updated.processed_file_path is not None

        # 4. Calibrate scale (2-point measurement: 100 pixels = 5 meters -> 0.05 m/px)
        calib_req = ScaleCalibrationRequest(
            point1=Point2D(x=100.0, y=100.0),
            point2=Point2D(x=200.0, y=100.0),
            known_distance_meters=5.0,
        )
        calib_res = calibrate_scale(fp_id, payload=calib_req, db=db)
        assert calib_res.is_scale_calibrated is True
        assert round(calib_res.scale_meters_per_pixel, 4) == 0.05
        assert round(calib_res.pixels_per_meter, 2) == 20.0

        # 5. Delete floor plan
        delete_floor_plan(fp_id, db=db)
        with pytest.raises(Exception):
            get_floor_plan(fp_id, db=db)

    finally:
        db.close()


def test_upload_file_magic_bytes_rejection(test_project):
    """Verify that uploading files with invalid binary magic signatures is rejected with 415."""
    from fastapi import HTTPException
    db = SessionLocal()
    try:
        # Fake PNG containing plain HTML script
        fake_png_bytes = b"<html><script>alert('pwn')</script></html>"
        fake_file = UploadFile(
            filename="malicious_cad.png",
            file=io.BytesIO(fake_png_bytes),
            headers={"content-type": "image/png"},
        )

        with pytest.raises(HTTPException) as exc:
            upload_floor_plan(
                project_id=test_project,
                file=fake_file,
                name="Malicious CAD",
                db=db,
            )
        assert exc.value.status_code == 415
        assert "document signature" in exc.value.detail.lower()
    finally:
        db.close()
