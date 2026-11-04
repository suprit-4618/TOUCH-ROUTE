"""
TouchRoute Voice Navigation & Text-to-Speech API Route.
Provides dynamic live speech synthesis via Google Gemini TTS (`gemini-3.8-flash-tts`),
and exposes voice asset metadata for the visitor navigation client.
"""

import io
import wave
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


class SynthesisRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500, description="Text to synthesize")
    voice_name: Optional[str] = Field("Kore", description="Gemini TTS prebuilt voice name (Kore, Aoede, etc.)")


def pcm_to_wav(pcm_data: bytes, sample_rate: int = 24000) -> bytes:
    """Wraps raw 16-bit mono PCM bytes in standard WAV container headers."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)  # Mono
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)  # 24,000 Hz
        wf.writeframes(pcm_data)
    return buf.getvalue()


@router.get("/status")
def get_voice_status():
    """Returns the operational status of the live Gemini TTS engine."""
    has_gemini = bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip())
    return {
        "google_tts_configured": has_gemini,
        "active_model": getattr(settings, "GEMINI_VOICE_MODEL", "gemini-2.5-flash-preview-tts"),
        "default_voice": "Kore",
        "sample_rate_hz": 24000,
        "mode": "live_dynamic_synthesis",
    }


@router.post("/synthesize")
def synthesize_dynamic_speech(payload: SynthesisRequest):
    """
    Synthesizes dynamic text into natural audio using Google Gemini TTS.
    Returns 24kHz 16-bit audio/wav binary stream.
    Gracefully returns 503 if API quota or service is unavailable.
    """
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Gemini API key not configured. Client must use local/browser TTS fallback.",
        )

    clean_text = payload.text.strip()
    if not clean_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot synthesize empty text.",
        )

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        model_name = getattr(settings, "GEMINI_VOICE_MODEL", "gemini-2.5-flash-preview-tts")
        response = client.models.generate_content(
            model=model_name,
            contents=clean_text,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=payload.voice_name or "Kore"
                        )
                    )
                ),
            ),
        )

        cand = response.candidates[0]
        if not cand.content or not cand.content.parts:
            logger.warning("Gemini TTS response had no content. Finish reason: %s", cand.finish_reason)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Speech synthesis returned no audio (finish_reason: {cand.finish_reason}).",
            )

        raw_pcm = cand.content.parts[0].inline_data.data
        wav_bytes = pcm_to_wav(raw_pcm, sample_rate=24000)

        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "Content-Disposition": "inline; filename=dynamic_speech.wav",
                "X-TouchRoute-TTS-Provider": "Google-Gemini-3.8-Flash-TTS",
                "X-TouchRoute-Voice": payload.voice_name or "Kore",
            },
        )

    except HTTPException:
        raise
    except Exception as exc:
        err_msg = str(exc)
        logger.error("Live Google TTS synthesis failed: %s", err_msg)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Google Gemini TTS service unavailable ({err_msg}). Fallback to client browser TTS.",
        ) from exc

