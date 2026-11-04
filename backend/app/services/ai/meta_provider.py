import logging
from typing import Dict, List, Optional
from app.core.config import settings
from app.schemas.spatial import StructuredSpatialAnalysis
from app.services.ai.base import AIProvider

logger = logging.getLogger(__name__)


class MetaProvider(AIProvider):
    """Meta AI provider adapter for floor-plan visual understanding and intent extraction."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.META_API_KEY

    def name(self) -> str:
        return "meta"

    async def analyze_floor_plan(
        self,
        image_bytes: bytes,
        mime_type: str,
        building_hint: Optional[str] = None,
    ) -> StructuredSpatialAnalysis:
        if not self.api_key:
            raise NotImplementedError(
                "Meta AI provider adapter is registered for future deployment. Please configure META_API_KEY or switch AI_PROVIDER=gemini."
            )
        # Placeholder for Meta AI Llama-Vision integration endpoint
        raise NotImplementedError("Meta AI adapter is not yet connected to a live endpoint.")

    async def parse_destination_intent(
        self,
        spoken_transcript: str,
        available_rooms: List[Dict[str, str]],
    ) -> Optional[str]:
        cleaned = spoken_transcript.strip().lower()
        for room in available_rooms:
            name = room.get("name", "").lower()
            if name and (name in cleaned or cleaned in name):
                return room["id"]
        return None

