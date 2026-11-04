from typing import Optional
from app.core.config import settings
from app.services.ai.base import AIProvider
from app.services.ai.gemini_provider import GeminiProvider
from app.services.ai.groq_provider import GroqProvider
from app.services.ai.meta_provider import MetaProvider
from app.services.ai.nvidia_provider import NvidiaMetaProvider


def get_ai_provider(provider_name: Optional[str] = None) -> AIProvider:
    """Factory to return active AI provider based on parameter or environment configuration."""
    target = (provider_name or settings.AI_PROVIDER).strip().lower()
    if target in ("groq", "groq_meta", "groq_vision"):
        return GroqProvider()
    elif target in ("nvidia", "nvidia_meta", "meta_vision", "llama"):
        return NvidiaMetaProvider()
    elif target == "meta":
        return MetaProvider()
    elif target == "gemini":
        return GeminiProvider()
    else:
        # Default fallback
        return GeminiProvider()

