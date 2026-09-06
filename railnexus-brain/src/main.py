"""
main.py — RailNexus Brain
FastAPI application entry point.

Startup:
  1. Load the CSV dataset.
  2. Validate it.
  3. Build the TrainRepository singleton.
  4. Build the BrainService singleton.
  5. Register API routes.

The app is stateless with respect to maintenance requests.
No request data is ever stored inside the Brain.
"""

from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── Ensure src/ is on the path when run with `uvicorn src.main:app` ──────────
sys.path.insert(0, str(Path(__file__).parent))

from api.routes import router
from config import API_PREFIX, CSV_PATH, SERVICE_NAME, SERVICE_VERSION
from core.data_loader import load_dataframe
from core.train_repository import TrainRepository
from core.validator import validate
from services.brain_service import BrainService

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


# ── Lifespan (startup + shutdown) ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load dataset and wire up singletons before accepting traffic."""
    logger.info("═" * 60)
    logger.info("  %s  v%s  — starting up", SERVICE_NAME, SERVICE_VERSION)
    logger.info("═" * 60)

    # 1. Load CSV
    logger.info("Loading dataset: %s", CSV_PATH)
    df = load_dataframe(CSV_PATH)
    logger.info("Dataset loaded: %d rows", len(df))

    # 2. Validate
    report = validate(df)
    for finding in report.findings:
        log_fn = {
            "INFO": logger.info,
            "WARNING": logger.warning,
            "ERROR": logger.error,
            "CRITICAL": logger.critical,
        }.get(finding.severity, logger.info)
        log_fn("[%s] %s — %s", finding.severity, finding.rule, finding.message)

    if report.has_critical:
        logger.critical("CRITICAL validation errors found. Service may produce unreliable results.")

    # 3. Build singletons
    repo = TrainRepository(df)
    service = BrainService(repo)

    # Attach to app.state
    app.state.df            = df
    app.state.repo          = repo
    app.state.brain_service = service

    logger.info("Brain service ready. Trains: %d | Stations: %d",
                repo.unique_train_count(), repo.unique_station_count())
    logger.info("API docs: http://localhost:8000/docs")

    yield   # ← app is live here

    logger.info("%s shutting down.", SERVICE_NAME)


# ── Application factory ───────────────────────────────────────────────────────

def create_app(skip_lifespan: bool = False) -> FastAPI:
    app = FastAPI(
        title="RailNexus Brain",
        description=(
            "**RailNexus Brain** — Phase 1 maintenance-window recommendation engine.\n\n"
            "Receives a runtime maintenance request via REST API, queries the supplied train "
            "movement dataset, detects conflicts, calculates direct delays, and returns "
            "the recommended lowest-direct-delay maintenance window.\n\n"
            "**Cascade delay simulation**: NOT_IMPLEMENTED in Phase 1.\n\n"
            "The human controller is always the final authority over any recommendation."
        ),
        version=SERVICE_VERSION,
        lifespan=None if skip_lifespan else lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ── CORS (allow Express backend on any port during development) ───────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],        # tighten in production
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Pydantic validation error → consistent JSON ───────────────────────
    from fastapi.exceptions import RequestValidationError

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        errors = exc.errors()
        # Build a clean, non-technical message
        messages = "; ".join(
            f"{' → '.join(str(loc) for loc in e['loc'])}: {e['msg']}"
            for e in errors
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "success": False,
                "error": {
                    "code": "INVALID_REQUEST",
                    "message": messages,
                },
            },
        )

    # ── Root Health Route ─────────────────────────────────────────────────
    @app.get("/health")
    async def root_health():
        return {"status": "ok", "service": SERVICE_NAME, "version": SERVICE_VERSION}

    # ── Routes ────────────────────────────────────────────────────────────
    app.include_router(router, prefix=API_PREFIX)

    return app


app = create_app()
