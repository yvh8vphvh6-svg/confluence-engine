"""FastAPI app: live/replay WebSocket stream + REST for the batch results.

On boot, if the SQLite 'memory' has no runs yet, the default deterministic
backtest sweep is launched in a background thread so the leaderboard / strategy
/ validation tabs are populated by the time the UI needs them. The sweep is the
*real* engine (backend.run_backtest) — the same one `--verify` proves.

On boot it also probes the Claude assistant (key present? does a tiny Messages
call succeed?) and logs the precise outcome, surfaced via /healthz and
/api/assistant/health. The API key value is never logged.
"""
from __future__ import annotations

import logging
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from backend.api import repository
from backend.api.coach import _api_key, assistant_health
from backend.api.routes import router as data_router
from backend.api.ws import router as simulation_router
from backend.config.settings import get_settings

log = logging.getLogger("main")
settings = get_settings()

_sweep_started = False
_sweep_done = threading.Event()
_assistant: dict[str, Any] = {"assistant_key_present": False, "assistant_status": "checking",
                              "model": settings.coach_model, "detail": ""}


def _run_sweep() -> None:
    try:
        from backend.run_backtest import run_sweep
        log.warning("populating backtest memory (this runs once)...")
        run_sweep(settings.sweep_days, list(settings.sweep_timeframes),
                  settings.default_seed, persist=True)
        log.warning("backtest memory ready")
    except Exception:  # noqa: BLE001
        log.exception("boot sweep failed")
    finally:
        _sweep_done.set()


def _maybe_start_sweep() -> None:
    global _sweep_started
    if _sweep_started:
        return
    _sweep_started = True
    if repository.memory_ready():
        _sweep_done.set()
        return
    if not settings.auto_run_sweep_on_boot:
        _sweep_done.set()
        return
    threading.Thread(target=_run_sweep, name="boot-sweep", daemon=True).start()


def _check_assistant() -> None:
    """Tiny real Messages call to verify the assistant can reach Claude."""
    global _assistant
    result = assistant_health()
    _assistant = result
    if result["assistant_status"] == "ok":
        log.warning("assistant: Claude reachable ✓ (key present, model=%s)", result["model"])
    elif not result["assistant_key_present"]:
        log.warning("assistant: ANTHROPIC_API_KEY NOT found — coach will use rule-based fallback. "
                    "Add the bare key to the repo-root .env.")
    else:
        log.warning("assistant: key present but Claude call FAILED — reason=%s model=%s detail=%s",
                    result["assistant_status"], result["model"], result["detail"])


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    _maybe_start_sweep()
    # key presence is known immediately (no network); confirm reachability off-thread
    _assistant["assistant_key_present"] = bool(_api_key())
    threading.Thread(target=_check_assistant, name="assistant-check", daemon=True).start()
    yield


app = FastAPI(
    title=settings.app_name,
    version="2.0.0",
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(simulation_router)
app.include_router(data_router)


@app.get("/healthz", tags=["system"])
async def healthz() -> dict[str, Any]:
    return {
        "status": "ok",
        "assistant_key_present": bool(_api_key()),
        "assistant_status": _assistant["assistant_status"],
        "assistant_model": _assistant.get("model", settings.coach_model),
    }


@app.get("/readyz", tags=["system"])
async def readyz() -> JSONResponse:
    ready = repository.memory_ready()
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "status": "ready" if ready else "computing",
            "memory": "ok" if ready else "populating",
            "sweep_complete": _sweep_done.is_set(),
        },
    )


# --- single-service static frontend ---------------------------------------
# In production the Next.js static export (`frontend/out`) is served by this
# same app, so the whole thing is one URL with no CORS. The catch-all is
# registered LAST, so the API/system/WS routes above always win; it only
# handles asset + page requests. Absent (dev), the app is API-only and the
# frontend runs from `next dev` on :3000.
FRONTEND_OUT = Path(__file__).resolve().parent.parent / "frontend" / "out"

if FRONTEND_OUT.is_dir():
    log.warning("serving static frontend from %s", FRONTEND_OUT)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str) -> FileResponse:
        rel = full_path.strip("/")
        if rel:
            # exact asset (e.g. _next/static/..., favicon), then the exported
            # page as <route>.html, then a <route>/index.html directory page.
            for candidate in (
                FRONTEND_OUT / rel,
                FRONTEND_OUT / f"{rel}.html",
                FRONTEND_OUT / rel / "index.html",
            ):
                if candidate.is_file():
                    return FileResponse(candidate)
        # SPA / unknown route → app shell (client router takes over) or 404 page.
        index = FRONTEND_OUT / "index.html"
        if index.is_file():
            return FileResponse(index)
        not_found = FRONTEND_OUT / "404.html"
        return FileResponse(not_found if not_found.is_file() else index)
else:
    log.warning("no static frontend at %s (API-only mode)", FRONTEND_OUT)
