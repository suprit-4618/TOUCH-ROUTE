import os
import uuid
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import sanitize_filename, validate_file_magic_bytes, validate_uploaded_file
from app.database.session import get_db
from app.models.project import FloorPlan, Project
from app.schemas.floorplan import FloorPlanUploadResponse
from app.services.vision.processor import load_floor_plan_image

router = APIRouter()


@router.post("/{project_id}", response_model=FloorPlanUploadResponse, status_code=status.HTTP_201_CREATED)
def upload_floor_plan(
    project_id: str,
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    validate_uploaded_file(file)

    clean_filename = sanitize_filename(file.filename)
    file_id = str(uuid.uuid4())
    stored_name = f"{file_id}_{clean_filename}"
    file_path = settings.UPLOAD_DIR / stored_name

    # Read chunked with size limit and magic bytes signature check
    chunk_size = 64 * 1024
    total_bytes = 0
    first_chunk = True
    try:
        with open(file_path, "wb") as f:
            while True:
                chunk = file.file.read(chunk_size)
                if not chunk:
                    break
                if first_chunk:
                    first_chunk = False
                    ext = Path(clean_filename).suffix.lower()
                    if not validate_file_magic_bytes(chunk[:16], ext):
                        f.close()
                        if file_path.exists():
                            file_path.unlink()
                        raise HTTPException(
                            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                            detail=f"File content does not match expected architectural document signature for '{ext}'.",
                        )
                total_bytes += len(chunk)
                if total_bytes > settings.MAX_UPLOAD_SIZE_BYTES:
                    f.close()
                    if file_path.exists():
                        file_path.unlink()
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)} MB.",
                    )
                f.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to write uploaded file to disk: {str(e)}",
        )

    # Validate image decoding and extract dimensions
    mime_type = file.content_type or "application/octet-stream"
    try:
        img_bgr, meta = load_floor_plan_image(file_path, mime_type)
        h, w = img_bgr.shape[:2]
    except Exception as e:
        # Clean up file on decode failure
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to decode floor plan document: {str(e)}",
        )

    plan_name = name or Path(clean_filename).stem.replace("_", " ").title()

    new_floor_plan = FloorPlan(
        id=file_id,
        project_id=project.id,
        name=plan_name,
        original_filename=clean_filename,
        file_path=str(file_path),
        file_size=total_bytes,
        mime_type=mime_type,
        width=w,
        height=h,
        analysis_status="uploaded",
    )
    db.add(new_floor_plan)
    db.commit()
    db.refresh(new_floor_plan)

    return FloorPlanUploadResponse(
        id=new_floor_plan.id,
        project_id=project.id,
        name=new_floor_plan.name,
        filename=clean_filename,
        file_size_bytes=total_bytes,
        mime_type=new_floor_plan.mime_type,
        width=w,
        height=h,
        status="uploaded",
        message="Floor plan uploaded and validated. Ready for preprocessing and scale calibration.",
    )


@router.get("/{floorplan_id}/file", summary="Stream raw uploaded floor plan file")
def get_floor_plan_file(floorplan_id: str, db: Session = Depends(get_db)):
    fp = db.query(FloorPlan).filter(FloorPlan.id == floorplan_id).first()
    if not fp or not os.path.exists(fp.file_path):
        raise HTTPException(status_code=404, detail="Floor plan file not found.")

    return FileResponse(
        path=fp.file_path,
        media_type=fp.mime_type,
        filename=fp.original_filename,
    )


@router.get("/{floorplan_id}/processed-image", summary="Stream preprocessed web-ready image")
def get_processed_image(floorplan_id: str, db: Session = Depends(get_db)):
    fp = db.query(FloorPlan).filter(FloorPlan.id == floorplan_id).first()
    if not fp:
        raise HTTPException(status_code=404, detail="Floor plan not found.")

    target_path = fp.processed_file_path if (fp.processed_file_path and os.path.exists(fp.processed_file_path)) else fp.file_path
    if not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail="Image file not found on disk.")

    # If original was a PDF but hasn't been preprocessed yet, rasterize on the fly
    if target_path.lower().endswith(".pdf"):
        img_bgr, _ = load_floor_plan_image(Path(target_path), "application/pdf")
        preview_path = settings.UPLOAD_DIR / f"{fp.id}_preview.png"
        import cv2
        cv2.imwrite(str(preview_path), img_bgr)
        return FileResponse(path=str(preview_path), media_type="image/png")

    return FileResponse(
        path=target_path,
        media_type="image/png" if target_path.lower().endswith(".png") else fp.mime_type,
    )
