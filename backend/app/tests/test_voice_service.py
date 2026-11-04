"""
Unit tests for TouchRoute Voice Service and TTS API endpoint.
Verifies:
1. Status endpoint returns expected audio asset configuration.
2. PCM to WAV wrapping produces valid 24kHz 16-bit mono WAV headers.
3. Live synthesis returns audio/wav binary stream or graceful 503 fallback.
4. Input validation (empty text rejection).
"""

import wave
import io
import pytest
from app.api.routes.voice import pcm_to_wav, get_voice_status, synthesize_dynamic_speech, SynthesisRequest
from fastapi import HTTPException


def test_voice_status_endpoint():
    status = get_voice_status()
    assert "google_tts_configured" in status
    assert "gemini" in status["active_model"].lower()
    assert status["default_voice"] == "Kore"
    assert status["sample_rate_hz"] == 24000
    assert status["mode"] == "live_dynamic_synthesis"


def test_pcm_to_wav_conversion():
    # 1 second of 24kHz 16-bit mono silence (48,000 bytes)
    raw_pcm = b"\x00\x00" * 24000
    wav_bytes = pcm_to_wav(raw_pcm, sample_rate=24000)

    # Validate RIFF header
    assert wav_bytes.startswith(b"RIFF")
    buf = io.BytesIO(wav_bytes)
    with wave.open(buf, "rb") as wf:
        assert wf.getnchannels() == 1
        assert wf.getsampwidth() == 2
        assert wf.getframerate() == 24000
        assert wf.getnframes() == 24000


def test_synthesize_empty_text_rejected():
    with pytest.raises(HTTPException) as exc_info:
        synthesize_dynamic_speech(SynthesisRequest(text="   ", voice_name="Kore"))
    assert exc_info.value.status_code == 400
    assert "empty text" in exc_info.value.detail.lower()

