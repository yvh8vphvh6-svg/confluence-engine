import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = REPO_ROOT / "output"

# Load the repo-root .env into the process environment FIRST, so a bare
# ANTHROPIC_API_KEY (no CONFLUENCE_ prefix) reaches os.environ even though
# pydantic-settings only maps prefixed vars and uvicorn doesn't auto-load .env.
# override=False keeps a shell-exported value authoritative.
load_dotenv(REPO_ROOT / ".env", override=False)


def _default_cors_origins() -> list[str]:
    """Local dev origins, plus any FRONTEND_ORIGIN(s) from the host env.

    Single-service deploys serve the frontend same-origin, so CORS is never
    exercised and this stays at the defaults. Set FRONTEND_ORIGIN (comma-
    separated allowed) only when hosting the frontend on a different origin.
    """
    origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
    extra = os.environ.get("FRONTEND_ORIGIN", "").strip()
    if extra:
        origins.extend(o.strip().rstrip("/") for o in extra.split(",") if o.strip())
    return origins


class Settings(BaseSettings):
    app_name: str = "Confluence Engine"
    environment: str = "development"

    # memory / batch outputs produced by run_backtest
    memory_db_path: Path = OUTPUT_DIR / "trading_memory.db"
    results_path: Path = OUTPUT_DIR / "results.json"
    education_path: Path = Path(__file__).resolve().parents[1] / "EDUCATION.md"

    cors_origins: list[str] = Field(default_factory=_default_cors_origins)

    # synthetic data / sweep parameters (deterministic)
    default_symbol: str = "MNQ"
    default_timeframe: str = "5m"
    default_seed: int = 42
    sweep_days: int = 150
    sweep_timeframes: list[str] = Field(default_factory=lambda: ["5m", "15m", "30m", "1h"])

    # live stream
    starting_balance: float = Field(default=50_000.0, gt=0)
    risk_fraction: float = Field(default=0.01, gt=0)        # 1% per trade
    base_tick_seconds: float = Field(default=1.2, gt=0)     # cadence at speed=1 (smoother)
    auto_run_sweep_on_boot: bool = True

    # coach / assistant model (a current, valid Anthropic model). CONFLUENCE_COACH_MODEL overrides.
    coach_model: str = "claude-haiku-4-5"

    model_config = SettingsConfigDict(
        env_prefix="CONFLUENCE_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
