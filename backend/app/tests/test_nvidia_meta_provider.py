"""Unit and integration test suite for NvidiaMetaProvider (Meta Llama 3.2 11B Vision Instruct via NVIDIA NIM).

Verifies:
1. API configuration.
2. Missing API key handling.
3. Successful model response (mocked).
4. Image input formatting (base64 data URL).
5. Invalid/malformed JSON response handling.
6. API timeout handling.
7. HTTP 401/403 authentication error handling.
8. HTTP 429 rate limiting handling.
9. Schema validation and coordinate preservation.
10. Uncertain detections handling.
11. Verification-state preservation (strictly unverified by default).
12. Provider factory selection.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch
import httpx
import pytest
from app.schemas.spatial import (
    BoundingBox,
    StructuredSpatialAnalysis,
)
from app.services.ai.factory import get_ai_provider
from app.services.ai.nvidia_provider import (
    NVIDIA_NIM_DEFAULT_ENDPOINT,
    NVIDIA_NIM_DEFAULT_MODEL,
    NvidiaMetaProvider,
)
from app.services.spatial.coordinates import CoordinateTransformer
from app.services.spatial.validator import SpatialAnalysisValidator


SAMPLE_MODEL_JSON_OUTPUT = {
    "building_name": "Clinic Complex",
    "level_name": "Level 1",
    "level_number": 1,
    "rooms": [
        {
            "id": "room_rec",
            "name": "Central Reception",
            "type": "reception",
            "room_number": "100",
            "coordinates": [{"x": 0.35, "y": 0.50}],
            "bounding_box": {"min_x": 0.25, "min_y": 0.40, "max_x": 0.45, "max_y": 0.60},
            "confidence": 0.94,
            "is_accessible": True,
            "notes": "Step-free wide entrance",
        },
        {
            "id": "room_audiology",
            "name": "Audiology Exam Room",
            "type": "room",
            "room_number": "101",
            "coordinates": [{"x": 0.70, "y": 0.30}],
            "bounding_box": {"min_x": 0.60, "min_y": 0.20, "max_x": 0.80, "max_y": 0.40},
            "confidence": 0.91,
            "is_accessible": True,
            "notes": None,
        },
    ],
    "connections": [
        {
            "id": "conn_1",
            "source_id": "ent_main",
            "target_id": "room_rec",
            "connection_type": "door",
            "distance_meters": 4.5,
            "confidence": 0.92,
            "is_accessible": True,
            "is_inter_floor": False,
        }
    ],
    "entrances": [
        {
            "id": "ent_main",
            "label": "West Accessible Entrance",
            "type": "entrance",
            "x": 0.15,
            "y": 0.50,
            "is_accessible": True,
            "confidence": 0.98,
            "notes": "Automatic sliding door",
        }
    ],
    "exits": [],
    "doors": [
        {
            "id": "door_rec",
            "label": "Reception Doorway",
            "type": "door",
            "x": 0.25,
            "y": 0.50,
            "is_accessible": True,
            "confidence": 0.93,
        }
    ],
    "stairs": [
        {
            "id": "stair_east",
            "label": "East Fire Stairs",
            "type": "stairs",
            "x": 0.90,
            "y": 0.20,
            "is_accessible": False,
            "confidence": 0.95,
        }
    ],
    "elevators": [
        {
            "id": "elev_central",
            "label": "Central Passenger Elevator",
            "type": "elevator",
            "x": 0.50,
            "y": 0.50,
            "is_accessible": True,
            "confidence": 0.96,
        }
    ],
    "uncertainty_notes": ["Partial label near south alcove could not be read with high confidence."],
}


def test_nvidia_provider_configuration():
    """1. Verifies API configuration, endpoint URL, and model identifier."""
    provider = NvidiaMetaProvider(api_key="test_key_123")
    assert provider.name() == "nvidia"
    assert provider.endpoint == NVIDIA_NIM_DEFAULT_ENDPOINT
    assert provider.model_id == NVIDIA_NIM_DEFAULT_MODEL
    assert provider.timeout_seconds == 60.0
    assert provider.api_key == "test_key_123"


@pytest.mark.asyncio
async def test_nvidia_provider_missing_api_key():
    """2. Verifies error handling when NVIDIA_API_KEY is missing."""
    # Instantiation with explicit empty key
    provider = NvidiaMetaProvider(api_key="")
    with pytest.raises(ValueError) as exc:
        await provider.analyze_floor_plan(b"fake_image_bytes", "image/png")
    assert "NVIDIA API key is not configured" in str(exc.value)


def test_image_input_formatting():
    """3. Verifies image input base64 data URL formatting."""
    provider = NvidiaMetaProvider(api_key="test_key")
    raw_bytes = b"sample_png_binary_data"
    formatted = provider._sanitize_image_payload(raw_bytes, "image/png")
    assert formatted.startswith("data:image/png;base64,")
    import base64
    encoded_part = formatted.split(",", 1)[1]
    assert base64.b64decode(encoded_part) == raw_bytes


@pytest.mark.asyncio
async def test_successful_model_response_mocked():
    """4. Verifies successful response parsing with mocked NVIDIA NIM endpoint."""
    provider = NvidiaMetaProvider(api_key="nvapi-mock-key")

    mock_chat_response = {
        "id": "chatcmpl-test",
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": json.dumps(SAMPLE_MODEL_JSON_OUTPUT),
                }
            }
        ],
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_chat_response

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        result = await provider.analyze_floor_plan(b"fake_image", "image/png", building_hint="Clinic Complex")

    assert isinstance(result, StructuredSpatialAnalysis)
    assert len(result.rooms) == 2
    assert result.rooms[0].name == "Central Reception"
    assert result.rooms[0].room_number == "100"
    assert len(result.entrances) == 1
    assert len(result.stairs) == 1
    assert result.stairs[0].is_accessible is False  # Stairs are not accessible
    assert len(result.elevators) == 1
    assert result.elevators[0].is_accessible is True
    assert len(result.uncertainty_notes) == 1


def test_fenced_markdown_json_parsing():
    """5. Verifies JSON extraction when model returns markdown fences or conversational text."""
    provider = NvidiaMetaProvider(api_key="nvapi-mock-key")
    raw_markdown = f"""Here is the structured architectural analysis:
```json
{json.dumps(SAMPLE_MODEL_JSON_OUTPUT)}
```
Hope this helps with indoor navigation!"""

    extracted = provider._extract_json_from_text(raw_markdown)
    assert extracted["building_name"] == "Clinic Complex"
    assert len(extracted["rooms"]) == 2


def test_invalid_json_handling():
    """6. Verifies controlled error handling on malformed JSON without fabricating data."""
    provider = NvidiaMetaProvider(api_key="nvapi-mock-key")
    malformed_output = "I found 3 rooms: Room 1, Room 2 and Room 3. { 'rooms': [incomplete json"

    with pytest.raises(ValueError) as exc:
        provider._extract_json_from_text(malformed_output)
    assert "Malformed JSON" in str(exc.value) or "Could not parse" in str(exc.value)


@pytest.mark.asyncio
async def test_api_timeout_handling():
    """7. Verifies proper TimeoutError when request times out."""
    provider = NvidiaMetaProvider(api_key="nvapi-mock-key", timeout_seconds=5.0)

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = httpx.TimeoutException("Connection timed out")
        with pytest.raises(TimeoutError) as exc:
            await provider.analyze_floor_plan(b"image_bytes", "image/png")
    assert "timed out" in str(exc.value)


@pytest.mark.asyncio
async def test_http_401_403_authentication_error():
    """8. Verifies PermissionError on HTTP 401 or 403."""
    provider = NvidiaMetaProvider(api_key="invalid-key")

    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.text = "Unauthorized: Invalid API key"

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        with pytest.raises(PermissionError) as exc:
            await provider.analyze_floor_plan(b"image_bytes", "image/png")
    assert "NVIDIA API authentication failed" in str(exc.value)


@pytest.mark.asyncio
async def test_http_429_rate_limiting():
    """9. Verifies rate limit error handling on HTTP 429."""
    provider = NvidiaMetaProvider(api_key="nvapi-mock-key")

    mock_resp = MagicMock()
    mock_resp.status_code = 429
    mock_resp.text = "Too Many Requests"

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        with pytest.raises(RuntimeError) as exc:
            await provider.analyze_floor_plan(b"image_bytes", "image/png")
    assert "rate limit exceeded" in str(exc.value)


def test_schema_validation_and_coordinate_preservation():
    """10. Verifies that normalized coordinates are accurately transformed to original blueprint space."""
    analysis = StructuredSpatialAnalysis.model_validate(SAMPLE_MODEL_JSON_OUTPUT)
    transformer = CoordinateTransformer(orig_width=2000, orig_height=1000)
    validator = SpatialAnalysisValidator(transformer=transformer, confidence_threshold=0.7)

    nodes, edges, report = validator.process_and_validate(analysis)

    # Room 100 center was (0.35, 0.50) normalized
    # In 2000x1000 original space: x = 0.35 * 2000 = 700.0, y = 0.50 * 1000 = 500.0
    rec_node = next(n for n in nodes if n["room_number"] == "100")
    assert rec_node["x"] == pytest.approx(700.0, abs=1.0)
    assert rec_node["y"] == pytest.approx(500.0, abs=1.0)


def test_verification_state_preservation():
    """11. Verifies that all AI-detected entities are initialized as unverified (is_user_verified=False)."""
    analysis = StructuredSpatialAnalysis.model_validate(SAMPLE_MODEL_JSON_OUTPUT)
    transformer = CoordinateTransformer(orig_width=1000, orig_height=1000)
    validator = SpatialAnalysisValidator(transformer=transformer)

    nodes, edges, report = validator.process_and_validate(analysis)

    for n in nodes:
        assert n["is_geometry_validated"] is True
        assert n["is_user_verified"] is False, f"Node {n['id']} was falsely marked as verified!"
        assert n["detection_source"] == "ai_detection"

    for e in edges:
        assert e["is_user_verified"] is False, f"Edge {e['id']} was falsely marked as verified!"


def test_factory_provider_selection():
    """12. Verifies factory instantiation for nvidia, gemini, and fallback."""
    p_nvidia = get_ai_provider("nvidia")
    assert isinstance(p_nvidia, NvidiaMetaProvider)
    assert p_nvidia.name() == "nvidia"

    p_llama = get_ai_provider("llama")
    assert isinstance(p_llama, NvidiaMetaProvider)

    p_gemini = get_ai_provider("gemini")
    assert p_gemini.name() == "gemini"

    # Default fallback
    p_default = get_ai_provider(None)
    assert p_default is not None


@pytest.mark.asyncio
async def test_destination_intent_matching():
    """13. Verifies phonetic and room-number matching."""
    provider = NvidiaMetaProvider(api_key="test_key")
    rooms = [
        {"id": "r1", "name": "Central Reception", "room_number": "100"},
        {"id": "r2", "name": "Audiology Exam Room", "room_number": "101"},
    ]

    # Exact name match
    assert await provider.parse_destination_intent("central reception", rooms) == "r1"
    # Substring match
    assert await provider.parse_destination_intent("I need to find the audiology room", rooms) == "r2"
    # Room number match
    assert await provider.parse_destination_intent("room 101", rooms) == "r2"
    # No match
    assert await provider.parse_destination_intent("cafeteria", rooms) is None
