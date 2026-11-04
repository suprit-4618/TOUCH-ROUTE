from abc import ABC, abstractmethod
from typing import Dict, List, Optional
from app.schemas.spatial import StructuredSpatialAnalysis


class AIProvider(ABC):
    """Abstract interface for floor-plan AI understanding providers."""

    @abstractmethod
    def name(self) -> str:
        """Returns the provider name."""
        pass

    @abstractmethod
    async def analyze_floor_plan(
        self,
        image_bytes: bytes,
        mime_type: str,
        building_hint: Optional[str] = None,
    ) -> StructuredSpatialAnalysis:
        """Analyze building floor plan image and return structured spatial entities."""
        pass

    @abstractmethod
    async def parse_destination_intent(
        self,
        spoken_transcript: str,
        available_rooms: List[Dict[str, str]],
    ) -> Optional[str]:
        """Parse natural spoken destination into a matching target room/node id."""
        pass

