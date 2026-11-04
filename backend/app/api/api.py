from fastapi import APIRouter
from app.api.routes import (
    analysis,
    floorplans,
    health,
    markers,
    navigation,
    positioning,
    projects,
    tactile,
    uploads,
    voice,
)

api_router = APIRouter()

api_router.include_router(health.router, tags=["System Health"])
api_router.include_router(projects.router, prefix="/projects", tags=["Projects"])
api_router.include_router(uploads.router, prefix="/uploads", tags=["Floor Plan Uploads"])
api_router.include_router(floorplans.router, prefix="/floorplans", tags=["Floor Plans & Processing"])
api_router.include_router(analysis.router, prefix="/analysis", tags=["Spatial Analysis"])
api_router.include_router(navigation.router, prefix="/navigation", tags=["Navigation Engine"])
api_router.include_router(positioning.router, prefix="/positioning", tags=["Indoor Positioning & Tracking"])
api_router.include_router(markers.router, prefix="/markers", tags=["NFC & QR Access Markers"])
api_router.include_router(tactile.router, prefix="/tactile", tags=["Tactile Mapping"])
api_router.include_router(voice.router, prefix="/voice", tags=["Voice Navigation & Synthesis"])
