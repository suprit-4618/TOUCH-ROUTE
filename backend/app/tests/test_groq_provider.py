"""Unit test suite for GroqProvider (Groq multimodal AI inference provider for TouchRoute).

Verifies:
1. API configuration and default model.
2. Missing API key handling.
3. Base64 data URL image sanitization.
4. Mocked successful response parsing into StructuredSpatialAnalysis.
5. Fenced markdown JSON extraction.
6. Malformed JSON handling without hallucinated fallbacks.
7. API timeout handling (TimeoutError).
8. HTTP 401/403 authentication error handling (PermissionError).
9. HTTP 429 rate limiting handling (RuntimeError).
10. HTTP 400 decommissioned model handling (RuntimeError).
11. Coordinate normalization and blueprint scaling preservation.
12. Verification-state preservation (strictly unverified by default).
13. Provider factory selection (groq, groq_meta, groq_vision).
14. Voice destination intent matching.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch
import httpx
import pytest
from app.schemas.spatial import StructuredSpatialAnalysis
from app.services.ai.factory import get_ai_provider
from app.services.ai.groq_provider import (
    GROQ_DEFAULT_ENDPOINT,
    GROQ_DEFAULT_MODEL,
    GroqProvider,
)
from app.services.spatial.coordinates import CoordinateTransformer
from app.services.spatial.validator import SpatialAnalysisValidator


SAMPLE_MODEL_JSON_OUTPUT = {
    "building_name": "Health Center",
    "level_name": "Level 1",
    "level_number": 1,
    "rooms": [
        {
            "id": "room_rec",
            "name": "Main Reception",
            "type": "reception",
            "room_number": "100",
            "coordinates": [{"x": 0.30, "y": 0.40}],
            "bounding_box": {"min_x": 0.20, "min_y": 0.30, "max_x": 0.40, "max_y": 0.50},
            "confidence": 0.95,
            "is_accessible": True,
            "notes": "Step-free automated entrance",
        },
        {
            "id": "room_exam1",
            "name": "Exam Room 1",
            "type": "clinic",
            "room_number": "101",
            "coordinates": [{"x": 0.60, "y": 0.40}],
            "bounding_box": {"min_x": 0.50, "min_y": 0.30, "max_x": 0.70, "max_y": 0.50},
            "confidence": 0.92,
            "is_accessible": True,
        },
    ],
    "corridors": [
        {
            "id": "corr_main",
            "name": "Central Corridor",
            "waypoints": [{"x": 0.10, "y": 0.40}, {"x": 0.90, "y": 0.40}],
            "width_meters": 2.4,
            "is_accessible": True,
            "confidence": 0.96,
        }
    ],
    "connections": [
        {
            "id": "conn_rec",
            "source_id": "corr_main",
            "target_id": "room_rec",
            "connection_type": "door",
            "is_accessible": True,
            "confidence": 0.93,
        }
    ],
    "entrances": [
        {
            "id": "ent_main",
            "label": "West Entrance",
            "type": "entrance",
            "x": 0.10,
            "y": 0.40,
            "is_accessible": True,
            "confidence": 0.98,
        }
    ],
    "exits": [],
    "doors": [
        {
            "id": "door_rec",
            "label": "Reception Door",
            "type": "door",
            "x": 0.20,
            "y": 0.40,
            "is_accessible": True,
            "confidence": 0.94,
        }
    ],
    "stairs": [],
    "elevators": [],
    "uncertainty_notes": ["Minor glare on south corner floor plan boundary."],
}


def test_groq_provider_configuration():
    """1. Verifies API configuration, endpoint URL, and default model identifier."""
    provider = GroqProvider(api_key="gsk_test_key_123", model_id="llama-3.2-11b-vision-preview")
    assert provider.name() == "groq"
    assert provider.endpoint == GROQ_DEFAULT_ENDPOINT
    assert provider.model_id == "llama-3.2-11b-vision-preview"
    assert provider.timeout_seconds == 60.0
    assert provider.api_key == "gsk_test_key_123"


@pytest.mark.asyncio
async def test_groq_provider_missing_api_key():
    """2. Verifies error handling when GROQ_API_KEY is missing."""
    provider = GroqProvider(api_key="")
    with pytest.raises(ValueError) as exc:
        await provider.analyze_floor_plan(b"fake_image_bytes", "image/png")
    assert "Groq API key is not configured" in str(exc.value)


def test_groq_image_input_formatting():
    """3. Verifies image input base64 data URL formatting."""
    provider = GroqProvider(api_key="gsk_test")
    raw_bytes = b"sample_png_binary_data"
    formatted = provider._sanitize_image_payload(raw_bytes, "image/png")
    assert formatted.startswith("data:image/png;base64,")
    import base64
    encoded_part = formatted.split(",", 1)[1]
    assert base64.b64decode(encoded_part) == raw_bytes


@pytest.mark.asyncio
async def test_groq_successful_model_response_mocked():
    """4. Verifies successful response parsing with mocked Groq endpoint."""
    provider = GroqProvider(api_key="gsk_mock_key")

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
        result = await provider.analyze_floor_plan(b"fake_image", "image/png", building_hint="Health Center")

    assert isinstance(result, StructuredSpatialAnalysis)
    assert len(result.rooms) == 2
    assert result.rooms[0].name == "Main Reception"
    assert result.rooms[0].room_number == "100"
    assert len(result.entrances) == 1
    assert len(result.uncertainty_notes) == 1


def test_groq_fenced_markdown_json_parsing():
    """5. Verifies JSON extraction when model returns markdown fences or conversational text."""
    provider = GroqProvider(api_key="gsk_mock_key")
    raw_markdown = f"""Here is the extracted spatial data:
```json
{json.dumps(SAMPLE_MODEL_JSON_OUTPUT)}
```
Hope this is helpful!"""

    extracted = provider._extract_json_from_text(raw_markdown)
    assert extracted["building_name"] == "Health Center"
    assert len(extracted["rooms"]) == 2


def test_groq_invalid_json_handling():
    """6. Verifies controlled error handling on malformed JSON without fabricating data."""
    provider = GroqProvider(api_key="gsk_mock_key")
    malformed = "I found 2 rooms: { 'rooms': incomplete"

    with pytest.raises(ValueError) as exc:
        provider._extract_json_from_text(malformed)
    assert "Malformed JSON" in str(exc.value) or "Could not parse" in str(exc.value)


@pytest.mark.asyncio
async def test_groq_api_timeout_handling():
    """7. Verifies proper TimeoutError when request times out."""
    provider = GroqProvider(api_key="gsk_mock_key", timeout_seconds=5.0)

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = httpx.TimeoutException("Connection timed out")
        with pytest.raises(TimeoutError) as exc:
            await provider.analyze_floor_plan(b"image_bytes", "image/png")
    assert "timed out" in str(exc.value)


@pytest.mark.asyncio
async def test_groq_http_401_403_authentication_error():
    """8. Verifies PermissionError on HTTP 401 or 403."""
    provider = GroqProvider(api_key="gsk_invalid")

    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.text = "Unauthorized: Invalid API key"

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        with pytest.raises(PermissionError) as exc:
            await provider.analyze_floor_plan(b"image_bytes", "image/png")
    assert "Groq API authentication failed" in str(exc.value)


@pytest.mark.asyncio
async def test_groq_http_429_rate_limiting():
    """9. Verifies rate limit error handling on HTTP 429."""
    provider = GroqProvider(api_key="gsk_mock_key")

    mock_resp = MagicMock()
    mock_resp.status_code = 429
    mock_resp.text = "Too Many Requests"

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        with pytest.raises(RuntimeError) as exc:
            await provider.analyze_floor_plan(b"image_bytes", "image/png")
    assert "rate limit exceeded" in str(exc.value)


@pytest.mark.asyncio
async def test_groq_http_400_decommissioned_model_error():
    """10. Verifies clear reporting when Groq returns model_decommissioned."""
    provider = GroqProvider(api_key="gsk_mock_key", model_id="llama-3.2-11b-vision-preview")

    mock_resp = MagicMock()
    mock_resp.status_code = 400
    mock_resp.text = json.dumps({
        "error": {
            "message": "The model `llama-3.2-11b-vision-preview` has been decommissioned and is no longer supported.",
            "type": "invalid_request_error",
            "code": "model_decommissioned",
        }
    })

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        with pytest.raises(RuntimeError) as exc:
            await provider.analyze_floor_plan(b"image_bytes", "image/png")
    assert "decommissioned" in str(exc.value)
    assert "retired by Groq" in str(exc.value)


def test_groq_schema_validation_and_coordinate_preservation():
    """11. Verifies that normalized coordinates are accurately transformed to original blueprint space."""
    analysis = StructuredSpatialAnalysis.model_validate(SAMPLE_MODEL_JSON_OUTPUT)
    transformer = CoordinateTransformer(orig_width=1000, orig_height=1000)
    validator = SpatialAnalysisValidator(transformer=transformer, confidence_threshold=0.7)

    nodes, edges, report = validator.process_and_validate(analysis)

    rec_node = next(n for n in nodes if n["room_number"] == "100")
    assert rec_node["x"] == pytest.approx(300.0, abs=1.0)
    assert rec_node["y"] == pytest.approx(400.0, abs=1.0)


def test_groq_verification_state_preservation():
    """12. Verifies that all AI-detected entities are initialized as unverified."""
    analysis = StructuredSpatialAnalysis.model_validate(SAMPLE_MODEL_JSON_OUTPUT)
    transformer = CoordinateTransformer(orig_width=1000, orig_height=1000)
    validator = SpatialAnalysisValidator(transformer=transformer)

    nodes, edges, report = validator.process_and_validate(analysis)

    for n in nodes:
        assert n["is_geometry_validated"] is True
        assert n["is_user_verified"] is False, f"Node {n['id']} was falsely marked as verified!"
        assert n["detection_source"] == "ai_detection"

    for e in edges:
        assert e["is_user_verified"] is False


def test_groq_factory_selection():
    """13. Verifies factory instantiation for groq, groq_meta, groq_vision."""
    p1 = get_ai_provider("groq")
    assert isinstance(p1, GroqProvider)
    assert p1.name() == "groq"

    p2 = get_ai_provider("groq_meta")
    assert isinstance(p2, GroqProvider)

    p3 = get_ai_provider("groq_vision")
    assert isinstance(p3, GroqProvider)


@pytest.mark.asyncio
async def test_groq_destination_intent_matching():
    """14. Verifies voice destination intent matching."""
    provider = GroqProvider(api_key="gsk_test")
    rooms = [
        {"id": "r1", "name": "Main Reception", "room_number": "100"},
        {"id": "r2", "name": "Pediatric Clinic", "room_number": "102"},
    ]

    assert await provider.parse_destination_intent("main reception", rooms) == "r1"
    assert await provider.parse_destination_intent("I want to visit the pediatric clinic", rooms) == "r2"
    assert await provider.parse_destination_intent("take me to room 100", rooms) == "r1"
    assert await provider.parse_destination_intent("cafeteria", rooms) is None
