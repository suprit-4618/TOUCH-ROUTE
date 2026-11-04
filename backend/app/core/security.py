import re
from pathlib import Path
from typing import Tuple
from fastapi import HTTPException, UploadFile, status
from app.core.config import settings


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent directory traversal or unsafe characters."""
    filename = Path(filename).name
    # Keep only alphanumeric, hyphens, underscores, dots
    clean_name = re.sub(r"[^\w\.-]", "_", filename)
    return clean_name


def validate_uploaded_file(file: UploadFile) -> Tuple[bool, str]:
    """Validate file extension and content type for security and format support."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is missing.",
        )

    ext = Path(file.filename).suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file extension '{ext}'. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}",
        )

    if file.content_type and file.content_type not in settings.ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported MIME type '{file.content_type}'. Allowed: {', '.join(settings.ALLOWED_MIME_TYPES)}",
        )

    return True, ext


def validate_file_magic_bytes(header: bytes, ext: str) -> bool:
    """Verifies that the initial bytes match the declared architectural document signature."""
    if not header:
        return False
    if ext == ".png":
        return header.startswith(b"\x89PNG\r\n\x1a\n")
    elif ext in (".jpg", ".jpeg"):
        return header.startswith(b"\xff\xd8\xff")
    elif ext == ".pdf":
        return header.startswith(b"%PDF")
    return True

