import json
import logging
import re
from typing import Dict, List, Optional
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


def _extract_and_sanitize_json(raw_text: str, building_hint: Optional[str] = None) -> StructuredSpatialAnalysis:
    """Extract and robustly sanitize JSON from raw LLM output."""
    text = (raw_text or "").strip()

    # Strip markdown code fences if present
    if "```" in text:
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
        if match:
            text = match.group(1).strip()

    # Find outermost JSON object bounds
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        text = text[first_brace : last_brace + 1]

    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("Decoded Gemini response is not a valid JSON dictionary")

    # Sanitize root properties
    if not data.get("building_name"):
        data["building_name"] = building_hint or "Floor Plan"
    if not data.get("level_name"):
        data["level_name"] = "Level 1"
    if data.get("level_number") is None:
        data["level_number"] = 1

    # Ensure all expected list fields exist
    for list_key in [
        "rooms",
        "connections",
        "entrances",
        "exits",
        "doors",
        "stairs",
        "elevators",
        "unidentified_features",
        "uncertainty_notes",
    ]:
        if list_key not in data or not isinstance(data[list_key], list):
            data[list_key] = []

    # Clean connections
    sanitized_connections = []
    for idx, c in enumerate(data["connections"]):
        if not isinstance(c, dict):
            continue
        c_id = str(c.get("id") or f"conn_{idx+1}")
        s_id = str(c.get("source_id") or "")
        t_id = str(c.get("target_id") or "")
        if not s_id or not t_id:
            continue

        dist = c.get("distance_meters")
        try:
            dist = float(dist) if dist is not None else 1.5
        except (TypeError, ValueError):
            dist = 1.5

        conf = c.get("confidence")
        try:
            conf = float(conf) if conf is not None else 1.0
        except (TypeError, ValueError):
            conf = 1.0

        c_type = str(c.get("connection_type") or "door")
        accessible = bool(c.get("is_accessible") if c.get("is_accessible") is not None else True)
        inter_floor = bool(c.get("is_inter_floor") if c.get("is_inter_floor") is not None else False)

        sanitized_connections.append({
            "id": c_id,
            "source_id": s_id,
            "target_id": t_id,
            "connection_type": c_type,
            "distance_meters": dist,
            "confidence": conf,
            "is_accessible": accessible,
            "is_inter_floor": inter_floor,
        })
    data["connections"] = sanitized_connections

    # Clean rooms
    sanitized_rooms = []
    for idx, r in enumerate(data["rooms"]):
        if not isinstance(r, dict):
            continue
        r_id = str(r.get("id") or f"room_{idx+1}")
        r_name = str(r.get("name") or f"Room {idx+1}")
        r_type = str(r.get("type") or "room")
        r_no = str(r.get("room_number")) if r.get("room_number") is not None else None

        conf = r.get("confidence")
        try:
            conf = float(conf) if conf is not None else 1.0
        except (TypeError, ValueError):
            conf = 1.0

        accessible = bool(r.get("is_accessible") if r.get("is_accessible") is not None else True)

        coords = []
        raw_coords = r.get("coordinates")
        if isinstance(raw_coords, list):
            for pt in raw_coords:
                if isinstance(pt, dict) and "x" in pt and "y" in pt:
                    try:
                        coords.append({"x": float(pt["x"]), "y": float(pt["y"])})
                    except (TypeError, ValueError):
                        pass
                elif isinstance(pt, (list, tuple)) and len(pt) >= 2:
                    try:
                        coords.append({"x": float(pt[0]), "y": float(pt[1])})
                    except (TypeError, ValueError):
                        pass

        if not coords and r.get("x") is not None and r.get("y") is not None:
            try:
                coords.append({"x": float(r["x"]), "y": float(r["y"])})
            except (TypeError, ValueError):
                pass

        bbox = r.get("bounding_box")
        if isinstance(bbox, dict):
            try:
                bbox = {
                    "min_x": float(bbox.get("min_x") if bbox.get("min_x") is not None else 0.0),
                    "min_y": float(bbox.get("min_y") if bbox.get("min_y") is not None else 0.0),
                    "max_x": float(bbox.get("max_x") if bbox.get("max_x") is not None else 1.0),
                    "max_y": float(bbox.get("max_y") if bbox.get("max_y") is not None else 1.0),
                }
            except (TypeError, ValueError):
                bbox = None
        elif isinstance(bbox, (list, tuple)) and len(bbox) >= 4:
            try:
                bbox = {
                    "min_x": float(bbox[0] if bbox[0] is not None else 0.0),
                    "min_y": float(bbox[1] if bbox[1] is not None else 0.0),
                    "max_x": float(bbox[2] if bbox[2] is not None else 1.0),
                    "max_y": float(bbox[3] if bbox[3] is not None else 1.0),
                }
            except (TypeError, ValueError):
                bbox = None
        elif bbox is None and coords:
            cx, cy = coords[0]["x"], coords[0]["y"]
            bbox = {
                "min_x": max(0.0, cx - 0.03),
                "min_y": max(0.0, cy - 0.03),
                "max_x": min(1.0, cx + 0.03),
                "max_y": min(1.0, cy + 0.03),
            }
        else:
            bbox = None

        sanitized_rooms.append({
            "id": r_id,
            "name": r_name,
            "type": r_type,
            "room_number": r_no,
            "coordinates": coords,
            "bounding_box": bbox,
            "confidence": conf,
            "is_accessible": accessible,
            "notes": r.get("notes"),
        })
    data["rooms"] = sanitized_rooms

    # Clean waypoints (entrances, exits, doors, stairs, elevators)
    for wp_key in ["entrances", "exits", "doors", "stairs", "elevators"]:
        sanitized_wps = []
        for idx, item in enumerate(data.get(wp_key, [])):
            if not isinstance(item, dict):
                continue
            item_id = str(item.get("id") or f"{wp_key}_{idx+1}")
            item_label = str(item.get("label") or f"{wp_key.capitalize()} {idx+1}")
            item_type = str(item.get("type") or wp_key)
            try:
                item_x = float(item.get("x") if item.get("x") is not None else 0.5)
            except (TypeError, ValueError):
                item_x = 0.5
            try:
                item_y = float(item.get("y") if item.get("y") is not None else 0.5)
            except (TypeError, ValueError):
                item_y = 0.5
            try:
                item_conf = float(item.get("confidence") if item.get("confidence") is not None else 1.0)
            except (TypeError, ValueError):
                item_conf = 1.0
            item_acc = bool(item.get("is_accessible") if item.get("is_accessible") is not None else True)

            bbox = item.get("bounding_box")
            if isinstance(bbox, dict):
                try:
                    bbox = {
                        "min_x": float(bbox.get("min_x") if bbox.get("min_x") is not None else 0.0),
                        "min_y": float(bbox.get("min_y") if bbox.get("min_y") is not None else 0.0),
                        "max_x": float(bbox.get("max_x") if bbox.get("max_x") is not None else 1.0),
                        "max_y": float(bbox.get("max_y") if bbox.get("max_y") is not None else 1.0),
                    }
                except (TypeError, ValueError):
                    bbox = None
            else:
                bbox = None

            sanitized_wps.append({
                "id": item_id,
                "label": item_label,
                "type": item_type,
                "x": item_x,
                "y": item_y,
                "confidence": item_conf,
                "is_accessible": item_acc,
                "notes": item.get("notes"),
                "bounding_box": bbox,
            })
        data[wp_key] = sanitized_wps

    return StructuredSpatialAnalysis(**data)


class GeminiProvider(AIProvider):
    """Google Gemini multimodal vision AI provider for architectural floor plan spatial parsing."""

    def __init__(self, api_key: Optional[str] = None, model_id: Optional[str] = None):
        self.api_key = api_key if api_key is not None else settings.GEMINI_API_KEY
        # Current verified Gemini multimodal model from Google AI Studio
        self.model_id = model_id or "gemini-2.5-flash"

    def name(self) -> str:
        return "gemini"

    async def analyze_floor_plan(
        self,
        image_bytes: bytes,
        mime_type: str,
        building_hint: Optional[str] = None,
    ) -> StructuredSpatialAnalysis:
        if not self.api_key:
            raise ValueError(
                "Gemini API key is not configured. Please set GEMINI_API_KEY in the backend environment."
            )

        prompt = f"""
You are an expert architectural blueprint analyst and indoor accessibility specialist.
Analyze this indoor building floor plan image carefully.
Building context: {building_hint or 'Standard Public Building'}

Extract:
1. Distinct labeled rooms, clinics, offices, departments, and functional areas with their (x, y) center location (normalized 0.0 to 1.0).
2. Major entrances, exits, stairs, and elevators with (x, y) location.
3. Key door connections between adjacent rooms.

CRITICAL INSTRUCTIONS:
- Return all coordinates in normalized 0.0 to 1.0 space (0.0, 0.0 is top-left, 1.0, 1.0 is bottom-right).
- Return ONLY valid JSON matching this schema:
{{
  "building_name": "{building_hint or 'Floor Plan'}",
  "level_name": "Level 1",
  "level_number": 1,
  "rooms": [
    {{
      "id": "room_1",
      "name": "Entrance Hall",
      "type": "hall",
      "x": 0.2,
      "y": 0.3,
      "confidence": 0.95,
      "is_accessible": true
    }}
  ],
  "entrances": [
    {{"id": "ent_1", "label": "Main Entrance", "x": 0.15, "y": 0.1, "is_accessible": true}}
  ],
  "exits": [],
  "stairs": [],
  "elevators": [],
  "connections": [
    {{"id": "conn_1", "source_id": "ent_1", "target_id": "room_1", "connection_type": "door", "distance_meters": 2.5}}
  ]
}}
"""

        last_error = None
        import base64
        b64_img = base64.b64encode(image_bytes).decode("utf-8")

        models_to_try = []
        for m in [self.model_id, "gemini-3.5-flash", "gemini-3-flash-preview", "gemini-2.5-flash"]:
            if m and m not in models_to_try:
                models_to_try.append(m)

        headers = {
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json",
        }

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": b64_img,
                            }
                        },
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "response_mime_type": "application/json",
                "thinkingConfig": {
                    "thinkingBudget": 0,
                },
            },
        }

        for model in models_to_try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            try:
                async with httpx.AsyncClient(timeout=150.0) as client:
                    resp = await client.post(url, headers=headers, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        candidate_text = data["candidates"][0]["content"]["parts"][0]["text"]
                        return _extract_and_sanitize_json(candidate_text, building_hint)
                    else:
                        logger.warning(f"Gemini model {model} returned status {resp.status_code}: {resp.text[:150]}")
                        last_error = f"Model {model} returned HTTP {resp.status_code}: {resp.text[:150]}"
            except Exception as e:
                logger.error(f"Error querying Gemini model {model}: {e}")
                last_error = e

        raise RuntimeError(f"Failed to obtain structured floor plan interpretation from Gemini provider: {last_error}")

    async def parse_destination_intent(
        self,
        spoken_transcript: str,
        available_rooms: List[Dict[str, str]],
    ) -> Optional[str]:
        cleaned = spoken_transcript.strip().lower()
        if not cleaned:
            return None

        # Deterministic match first
        for room in available_rooms:
            name = room.get("name", "").lower()
            room_no = room.get("room_number", "").lower()
            if cleaned == name or (room_no and cleaned == room_no):
                return room["id"]
            if name in cleaned or (room_no and room_no in cleaned):
                return room["id"]

        return None
