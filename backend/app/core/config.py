import os
from pathlib import Path
from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "TouchRoute"
    API_V1_STR: str = "/api/v1"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"

    # Database: Supports SQLite (out-of-box local dev) and PostgreSQL/PostGIS (production/docker)
    DATABASE_URL: str = "sqlite:///./touchroute.db"

    # File uploads
    UPLOAD_DIR: Path = Path("backend/uploads").resolve()
    MAX_UPLOAD_SIZE_BYTES: int = 25 * 1024 * 1024  # 25 MB
    ALLOWED_EXTENSIONS: List[str] = [".png", ".jpg", ".jpeg", ".pdf"]
    ALLOWED_MIME_TYPES: List[str] = [
        "image/png",
        "image/jpeg",
        "image/jpg",
        "application/pdf",
    ]

    # AI Provider Architecture
    AI_PROVIDER: str = "gemini"  # "gemini" | "nvidia" | "groq" | "meta"
    GEMINI_API_KEY: str = ""
    GEMINI_VOICE_MODEL: str = "gemini-2.5-flash-preview-tts"
    NVIDIA_API_KEY: str = ""
    META_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.2-11b-vision-preview"

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
    ]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return []

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()

# Ensure upload directory exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

