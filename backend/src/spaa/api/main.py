from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from spaa.adapters.database import init_db
from spaa.api.routes.audio import router as audio_router
from spaa.api.routes.books import router as books_router
from spaa.api.routes.queue import router as queue_router
from spaa.api.routes.study import router as study_router
from spaa.api.routes.sync import router as sync_router
from spaa.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite tables on startup
    init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Servidor maestro de SPAA para gestión de biblioteca, segmentación de Markdown, orquestación de TTS y sincronización offline.",
    lifespan=lifespan,
)

# CORS configuration for Web/Capacitor frontend and Chrome Extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(books_router)
app.include_router(queue_router)
app.include_router(audio_router)
app.include_router(sync_router)
app.include_router(study_router)


@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "app": settings.app_name,
        "environment": settings.environment,
    }
