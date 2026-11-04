"""NVIDIA NIM Meta Llama 3.2 11B Vision Instruct AI Provider for TouchRoute.

Connects to NVIDIA NIM OpenAI-compatible Chat Completions endpoint:
Model: meta/llama-3.2-11b-vision-instruct
Endpoint: https://integrate.api.nvidia.com/v1/chat/completions
"""

import base64
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional
import httpx
from app.core.config import settings
from app.schemas.spatial import (
    BoundingBox,
    ConnectionEntity,
    RoomEntity,
    SpatialCoordinate,
    StructuredSpatialAnalysis,
    WaypointEntity,
)
from app.services.ai.base import AIProvider

logger = logging.getLogger(__name__)

NVIDIA_NIM_DEFAULT_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions"
NVIDIA_NIM_DEFAULT_MODEL = "meta/llama-3.2-11b-vision-instruct"

FLOOR_PLAN_INTERPRETATION_PROMPT = """You are an expert architectural blueprint analyst and indoor accessibility specialist.
Analyze this indoor building floor plan image carefully.
Building context: {building_hint}

Extract the spatial topology for indoor navigation:
1. All distinct rooms, offices, clinics, restrooms, reception areas, and collaborative spaces.
2. Corridor intersections and main hallway routes.
3. Building entrances, exits, and emergency egress points.
4. Physical doors and doorway transitions between spaces.
5. Vertical transit: staircases and elevators.
6. Visible connections between spaces (doors or open corridors).

CRITICAL INTERPRETATION RULES:
- Return all coordinates in NORMALIZED values between 0.0 and 1.0 (where 0.0, 0.0 is top-left and 1.0, 1.0 is bottom-right).
- For each room, provide a center coordinate and a bounding box [min_x, min_y, max_x, max_y] in 0.0 to 1.0 range.
- Never invent doors, rooms, corridors, or connections.
- Do not infer connectivity from proximity alone; a visible door or corridor opening must provide physical evidence.
- Mark uncertain or ambiguous architectural features with lower confidence (< 0.70) and add notes in uncertainty_notes.
- Distinguish detected features from verified features; never mark detections as human-verified.
- Keep different floors separate (report level_number and level_name).
- Return ONLY valid JSON matching this exact structure:

{{
  "building_name": "{building_hint}",
  "level_name": "Level 1",
  "level_number": 1,
  "rooms": [
    {{
      "id": "room_01",
      "name": "Central Reception",
      "type": "reception",
      "room_number": "100",
      "coordinates": [{{"x": 0.25, "y": 0.40}}],
      "bounding_box": {{"min_x": 0.20, "min_y": 0.35, "max_x": 0.30, "max_y": 0.45}},
      "confidence": 0.95,
      "is_accessible": true,
      "notes": "Step-free wide entrance"
    }}
  ],
  "connections": [
    {{
      "id": "conn_01",
      "source_id": "ent_01",
      "target_id": "room_01",
      "connection_type": "door",
      "distance_meters": 3.5,
      "confidence": 0.92,
      "is_accessible": true,
      "is_inter_floor": false
    }}
  ],
  "entrances": [
    {{
      "id": "ent_01",
      "label": "Main Entrance",
      "type": "entrance",
      "x": 0.10,
      "y": 0.40,
      "is_accessible": true,
      "confidence": 0.98,
      "notes": "Automatic double door"
    }}
  ],
  "exits": [],
  "doors": [
    {{
      "id": "door_01",
      "label": "Reception Doorway",
      "type": "door",
      "x": 0.20,
      "y": 0.40,
      "is_accessible": true,
      "confidence": 0.94
    }}
  ],
  "stairs": [],
  "elevators": [],
  "uncertainty_notes": []
}}
"""


class NvidiaMetaProvider(AIProvider):
    """NVIDIA NIM Meta Llama 3.2 11B Vision Instruct multimodal provider."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_id: Optional[str] = None,
        endpoint: Optional[str] = None,
        timeout_seconds: float = 60.0,
    ):
        # Resolve API key from explicit argument (even if empty) or environment/settings
        if api_key is not None:
            self.api_key = api_key.strip()
        else:
            self.api_key = (
                os.environ.get("NVIDIA_API_KEY")
                or getattr(settings, "NVIDIA_API_KEY", "")
                or (getattr(settings, "META_API_KEY", "") if getattr(settings, "META_API_KEY", "").startswith("nvapi-") else "")
                or (os.environ.get("META_API_KEY", "") if os.environ.get("META_API_KEY", "").startswith("nvapi-") else "")
            ).strip()
        self.model_id = model_id or NVIDIA_NIM_DEFAULT_MODEL
        self.endpoint = endpoint or NVIDIA_NIM_DEFAULT_ENDPOINT
        self.timeout_seconds = timeout_seconds

    def name(self) -> str:
        return "nvidia"

    def _sanitize_image_payload(self, image_bytes: bytes, mime_type: str) -> str:
        """Encodes image bytes as a standard base64 data URL."""
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        clean_mime = mime_type if mime_type in ("image/png", "image/jpeg", "image/webp") else "image/png"
        return f"data:{clean_mime};base64,{b64}"

    def _extract_json_from_text(self, text: str) -> Dict[str, Any]:
        """Extracts and parses JSON object from model response, handling markdown blocks and conversational wrappers."""
        if not text or not text.strip():
            raise ValueError("Empty response received from Meta Llama Vision model.")

        cleaned = text.strip()

        # 1. Match fenced code block ```json ... ```
        fenced_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, re.DOTALL)
        if fenced_match:
            try:
                return json.loads(fenced_match.group(1))
            except json.JSONDecodeError:
                pass

        # 2. Match outermost { ... }
        start_idx = cleaned.find("{")
        end_idx = cleaned.rfind("}")
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            candidate = cleaned[start_idx : end_idx + 1]
            try:
                return json.loads(candidate)
            except json.JSONDecodeError as err:
                raise ValueError(f"Malformed JSON in Meta Llama Vision response: {err.msg} at line {err.lineno} col {err.colno}")

        # 3. Direct parse attempt
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as err:
            raise ValueError(f"Could not parse structured JSON from Meta Llama Vision output: {err.msg}")

    async def analyze_floor_plan(
        self,
        image_bytes: bytes,
        mime_type: str,
        building_hint: Optional[str] = None,
    ) -> StructuredSpatialAnalysis:
        """Sends floor plan to NVIDIA NIM Meta Llama 3.2 11B Vision Instruct and returns structured spatial topology."""
        if not self.api_key:
            raise ValueError(
                "NVIDIA API key is not configured. Please set NVIDIA_API_KEY in the backend environment."
            )

        prompt_text = FLOOR_PLAN_INTERPRETATION_PROMPT.format(
            building_hint=building_hint or "Standard Architectural Facility"
        )
        data_url = self._sanitize_image_payload(image_bytes, mime_type)

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        payload = {
            "model": self.model_id,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt_text,
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": data_url,
                            },
                        },
                    ],
                }
            ],
            "max_tokens": 4096,
            "temperature": 0.1,
            "top_p": 0.9,
            "stream": False,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    self.endpoint,
                    headers=headers,
                    json=payload,
                )
        except httpx.TimeoutException as exc:
            logger.error("NVIDIA NIM API request timed out.")
            raise TimeoutError(f"NVIDIA NIM API request timed out after {self.timeout_seconds}s.") from exc
        except httpx.RequestError as exc:
            logger.error("NVIDIA NIM API network request failed: %s", exc)
            raise RuntimeError(f"Failed to communicate with NVIDIA NIM API: {str(exc)}") from exc

        # Handle HTTP status codes
        if response.status_code == 401 or response.status_code == 403:
            logger.error("NVIDIA NIM authentication rejected (HTTP %s).", response.status_code)
            raise PermissionError(
                f"NVIDIA API authentication failed (HTTP {response.status_code}). Please verify your NVIDIA_API_KEY."
            )
        elif response.status_code == 429:
            logger.warning("NVIDIA NIM rate limit exceeded (HTTP 429).")
            raise RuntimeError("NVIDIA NIM rate limit exceeded (HTTP 429). Please retry after a brief pause.")
        elif response.status_code >= 400:
            error_body = response.text[:300]
            logger.error("NVIDIA NIM returned HTTP %s: %s", response.status_code, error_body)
            raise RuntimeError(f"NVIDIA NIM API error (HTTP {response.status_code}): {error_body}")

        try:
            resp_json = response.json()
            content_text = resp_json["choices"][0]["message"]["content"]
        except (KeyError, IndexError, json.JSONDecodeError) as exc:
            logger.error("Unexpected response payload format from NVIDIA NIM: %s", response.text[:300])
            raise ValueError("NVIDIA NIM returned an unexpected response structure.") from exc

        # Extract and validate structured spatial JSON
        parsed_dict = self._extract_json_from_text(content_text)

        # Ensure required array keys are present
        parsed_dict.setdefault("building_name", building_hint or "Floor Plan")
        parsed_dict.setdefault("level_name", "Level 1")
        parsed_dict.setdefault("level_number", 1)
        parsed_dict.setdefault("rooms", [])
        parsed_dict.setdefault("connections", [])
        parsed_dict.setdefault("entrances", [])
        parsed_dict.setdefault("exits", [])
        parsed_dict.setdefault("doors", [])
        parsed_dict.setdefault("stairs", [])
        parsed_dict.setdefault("elevators", [])
        parsed_dict.setdefault("uncertainty_notes", [])

        # Normalize connection entity keys
        for conn in parsed_dict.get("connections", []):
            if isinstance(conn, dict):
                if "from_entity_id" in conn and "source_id" not in conn:
                    conn["source_id"] = conn.get("from_entity_id")
                if "to_entity_id" in conn and "target_id" not in conn:
                    conn["target_id"] = conn.get("to_entity_id")

        # Validate with Pydantic schema
        try:
            analysis = StructuredSpatialAnalysis.model_validate(parsed_dict)
            return analysis
        except Exception as pydantic_err:
            logger.error("Pydantic schema validation error on Meta Llama Vision output: %s", pydantic_err)
            raise ValueError(f"Meta Llama Vision output failed schema validation: {pydantic_err}") from pydantic_err

    async def parse_destination_intent(
        self,
        spoken_transcript: str,
        available_rooms: List[Dict[str, str]],
    ) -> Optional[str]:
        """Matches spoken queries to room identifiers using exact, substring, room number, and keyword overlap."""
        cleaned = spoken_transcript.strip().lower()
        if not cleaned:
            return None

        # 1. Exact match or direct substring
        for room in available_rooms:
            name = (room.get("name") or "").lower()
            room_no = (room.get("room_number") or "").lower()
            if cleaned == name or (room_no and cleaned == room_no):
                return room["id"]
            if name and (name in cleaned or cleaned in name):
                return room["id"]

        # 2. Room number match e.g. "room 101" or "101"
        for room in available_rooms:
            r_no = (room.get("room_number") or "").lower()
            if r_no and r_no in cleaned:
                return room["id"]

        # 3. Keyword / significant token overlap
        stop_words = {"i", "need", "to", "find", "the", "where", "is", "a", "an", "take", "me", "room", "go", "please"}
        query_words = set(re.findall(r"\w+", cleaned)) - stop_words
        if query_words:
            best_room_id = None
            max_matches = 0
            for room in available_rooms:
                name_words = set(re.findall(r"\w+", room.get("name", "").lower())) - stop_words
                matches = len(query_words & name_words)
                if matches > max_matches:
                    max_matches = matches
                    best_room_id = room.get("id")
            if best_room_id and max_matches > 0:
                return best_room_id

        return None
