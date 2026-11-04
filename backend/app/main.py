import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.api import api_router
from app.core.config import settings
from app.database.session import Base, SessionLocal, engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("touchroute")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure database tables are created without synthetic data
    logger.info("Initializing TouchRoute database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("TouchRoute backend database initialized.")

    yield
    logger.info("TouchRoute backend shutting down.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    description=(
        "TouchRoute: AI-Powered Indoor Navigation and Tactile Mapping for the Visually Impaired. "
        "Production-minded REST API for spatial parsing, deterministic indoor routing, and tactile output generation."
    ),
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/", tags=["Root"])
def root():
    return {
        "service": settings.PROJECT_NAME,
        "tagline": "AI-Powered Indoor Navigation and Tactile Mapping for the Visually Impaired",
        "version": settings.VERSION,
        "docs_url": "/docs",
        "api_v1": settings.API_V1_STR,
        "status": "operational",
    }

