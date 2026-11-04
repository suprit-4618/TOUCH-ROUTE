from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.config import settings
from app.database.session import get_db

router = APIRouter()


@router.get("/health", summary="System Health & Readiness")
def health_check(db: Session = Depends(get_db)):
    """Verifies API readiness, database connectivity, and configured AI provider."""
    db_status = "connected"
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    ai_configured = False
    if settings.AI_PROVIDER == "groq":
        ai_configured = bool(settings.GROQ_API_KEY)
    elif settings.AI_PROVIDER == "nvidia":
        ai_configured = bool(settings.NVIDIA_API_KEY)
    elif settings.AI_PROVIDER == "gemini":
        ai_configured = bool(settings.GEMINI_API_KEY)
    else:
        ai_configured = bool(settings.META_API_KEY or settings.NVIDIA_API_KEY or settings.GROQ_API_KEY)

    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "app_name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "database": db_status,
        "ai_provider": settings.AI_PROVIDER,
        "ai_configured": ai_configured,
    }

