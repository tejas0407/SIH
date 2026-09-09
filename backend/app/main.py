"""FastAPI application entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1 import auth, documents, hitl, reports
from app.core.config import settings
from app.db.session import async_engine
from app.services.storage import get_store
from app.workers.queue import queue_depth

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        get_store().ensure_buckets()
    except Exception as exc:  # noqa: BLE001
        logger.warning("object store not ready at boot: %s", exc)
    yield
    await async_engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description=(
        "Digitises legacy Records of Rights, validates them against the "
        "arithmetic every register must satisfy, and routes what it cannot "
        "vouch for to a human reviewer. Built for SIH26018 (DILRMP)."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(documents.router, prefix=settings.API_V1_PREFIX)
app.include_router(hitl.router, prefix=settings.API_V1_PREFIX)
app.include_router(reports.router, prefix=settings.API_V1_PREFIX)


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.get("/health", tags=["ops"])
async def health() -> dict:
    checks: dict[str, str] = {}

    try:
        async with async_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            version = (await conn.execute(text("SELECT PostGIS_Version()"))).scalar_one()
        checks["database"] = f"ok (PostGIS {version})"
    except Exception as exc:  # noqa: BLE001
        checks["database"] = f"unavailable: {exc}"

    try:
        get_store().client.list_buckets()
        checks["object_store"] = "ok"
    except Exception as exc:  # noqa: BLE001
        checks["object_store"] = f"unavailable: {exc}"

    checks["hitl_queue_depth"] = str(queue_depth())
    healthy = all(not v.startswith("unavailable") for v in checks.values())
    return {"status": "healthy" if healthy else "degraded", "checks": checks}


@app.get("/", tags=["ops"])
async def root() -> dict:
    return {
        "service": settings.PROJECT_NAME,
        "problem_statement": "SIH26018",
        "docs": "/docs",
        "api": settings.API_V1_PREFIX,
    }
