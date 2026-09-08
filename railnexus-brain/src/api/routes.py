"""
routes.py — RailNexus Brain / api
FastAPI route definitions for /api/v1/brain

Endpoints:
  GET  /health        — liveness check
  GET  /data-status   — dataset availability + validation summary
  POST /analyze       — core maintenance-window recommendation engine

Business logic lives in brain_service.py — NOT here.
"""

from __future__ import annotations

import logging
import uuid
import json

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse

from api.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    DataStatusResponse,
    ErrorDetail,
    ErrorResponse,
    HealthResponse,
)
from config import CSV_FILENAME, SERVICE_NAME, SERVICE_VERSION, STATION_POINTS_PATH, SECTION_SCHEMATIC_PATH
from core.validator import validate

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Dependency helpers ────────────────────────────────────────────────────────

def _get_service(request: Request):
    """Retrieve the BrainService singleton from app state."""
    return request.app.state.brain_service


def _get_repo(request: Request):
    """Retrieve the TrainRepository singleton from app state."""
    return request.app.state.repo


def _get_df(request: Request) -> pd.DataFrame:
    """Retrieve the raw DataFrame from app state."""
    return request.app.state.df


def _resolve_trace_id(request: Request) -> str:
    """Use X-Request-ID header if provided, else generate one."""
    return request.headers.get("X-Request-ID", str(uuid.uuid4()))


# ── GET /health ───────────────────────────────────────────────────────────────

@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Brain liveness check",
    description="Returns 200 OK when the Brain service is running.",
    tags=["Health"],
)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=SERVICE_NAME,
        version=SERVICE_VERSION,
    )


# ── GET /data-status ──────────────────────────────────────────────────────────

@router.get(
    "/data-status",
    response_model=DataStatusResponse,
    summary="Dataset availability and validation summary",
    description=(
        "Checks whether the railway dataset is loaded and returns "
        "key statistics and validation result counts."
    ),
    tags=["Data"],
)
async def data_status(
    df: pd.DataFrame = Depends(_get_df),
    repo=Depends(_get_repo),
) -> DataStatusResponse:
    report = validate(df)
    return DataStatusResponse(
        status="ready",
        dataset=CSV_FILENAME,
        row_count=repo.row_count(),
        train_count=repo.unique_train_count(),
        station_count=repo.unique_station_count(),
        validation_errors=report.error_count,
        validation_warnings=report.warning_count,
    )


# ── GET /stations ─────────────────────────────────────────────────────────────

@router.get(
    "/stations",
    summary="List unique verified stations",
    description="Returns a sorted list of unique station codes present in the active dataset.",
    tags=["Data"],
)
async def list_stations(repo=Depends(_get_repo)) -> list[str]:
    return repo.get_unique_stations()


@router.get(
    "/stations/details",
    summary="List verified station coordinates",
    description="Returns station names and coordinates from the finalized GIS station points.",
    tags=["Data"],
)
async def list_station_details() -> list[dict]:
    data = json.loads(STATION_POINTS_PATH.read_text(encoding="utf-8"))
    result = []
    for feature in data.get("features", []):
        properties = feature.get("properties", {})
        coordinates = feature.get("geometry", {}).get("coordinates", [])
        if len(coordinates) != 2:
            continue
        longitude, latitude = coordinates
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            continue
        result.append({
            "station_code": properties.get("station_code"),
            "station_name": properties.get("station_name"),
            "latitude": latitude,
            "longitude": longitude,
            "source": properties.get("source"),
        })
    return result


@router.get(
    "/section-geometry",
    summary="Return verified schematic section geometry",
    description="Returns finalized station-to-station schematic geometry, not authoritative track geometry.",
    tags=["Data"],
)
async def section_geometry() -> dict:
    return json.loads(SECTION_SCHEMATIC_PATH.read_text(encoding="utf-8"))


# ── GET /sections ─────────────────────────────────────────────────────────────

@router.get(
    "/sections",
    summary="List unique verified corridor block sections",
    description="Returns unique from_station / to_station pairs with average distance and occupancy.",
    tags=["Data"],
)
async def list_sections(repo=Depends(_get_repo)) -> list[dict]:
    return repo.get_unique_sections()


# ── POST /analyze ─────────────────────────────────────────────────────────────


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    summary="Analyze a maintenance request",
    description=(
        "Receives a runtime maintenance request from the backend, "
        "queries the train movement dataset, generates candidate windows, "
        "detects conflicts, calculates direct delay, scores each window, "
        "and returns the recommended maintenance window as structured JSON. "
        "\n\n"
        "**Important**: The station codes and time values must use the "
        "same date convention as the dataset (1900-01-01 for time-only data). "
        "\n\n"
        "Cascade delay simulation is **IMPLEMENTED** (Phase 2 Deterministic Delay Propagation Engine)."
    ),
    tags=["Brain"],
    responses={
        200: {"description": "Analysis completed successfully."},
        400: {"model": ErrorResponse, "description": "Invalid request."},
        404: {"model": ErrorResponse, "description": "Section not found in dataset."},
        422: {"description": "Pydantic validation error."},
        500: {"model": ErrorResponse, "description": "Internal Brain error."},
    },
)
async def analyze(
    body: AnalyzeRequest,
    request: Request,
    service=Depends(_get_service),
) -> AnalyzeResponse | JSONResponse:
    trace_id = _resolve_trace_id(request)
    ps = body.planning_state
    mode = ps.planning_mode if ps else "SINGLE"
    n_pending = len(ps.pending_requests) if ps else 0
    n_fixed = len(ps.fixed_plans) if ps else 0

    logger.info(
        "[%s] Brain /analyze | REQ=%s | mode=%s | pending=%d | fixed=%d",
        trace_id, body.request_id, mode, n_pending, n_fixed,
    )

    try:
        result = service.analyze(request=body, trace_id=trace_id)
        logger.info(
            "[%s] Brain /analyze complete | REQ=%s | status=%s | plan_v=%s",
            trace_id, body.request_id, result.status, result.plan_version,
        )

        # Map non-success statuses to appropriate HTTP codes
        if not result.success:
            if result.status == "SECTION_NOT_FOUND":
                return JSONResponse(
                    status_code=status.HTTP_404_NOT_FOUND,
                    content={
                        "success": False,
                        "error": {
                            "code": "SECTION_NOT_FOUND",
                            "message": result.explanation,
                        },
                    },
                )
            if result.status == "NO_FEASIBLE_WINDOW":
                return JSONResponse(
                    status_code=status.HTTP_200_OK,   # business-level: request valid but no window
                    content=result.model_dump(mode="json"),
                )

        return result

    except Exception as exc:
        logger.exception("[%s] Internal Brain error: %s", trace_id, exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "success": False,
                "error": {
                    "code": "INTERNAL_BRAIN_ERROR",
                    "message": "An unexpected error occurred in the Brain service. "
                               "Check service logs for details.",
                },
            },
        )
