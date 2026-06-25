"""Pluggable market-data adapter.

The engine reads OHLCV through a `MarketDataFeed` so a real historical/live
adapter (IBKR / Tradovate / Databento) can replace the synthetic generator
later WITHOUT touching the rest of the app. Default is the deterministic
synthetic generator.

HONESTY / SAFETY: this layer provides *market data* only. There is no order
routing here or anywhere in this project — it is paper-trading / simulation
only. A "live" feed (if ever wired) would still never place real orders.
"""
from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod

import pandas as pd

from ..engine.types import Instrument
from .generator import DEFAULT_DIFFICULTY, generate_ohlcv, resample_ohlcv

log = logging.getLogger("feed")


class MarketDataFeed(ABC):
    """A source of 1m OHLCV bars for an instrument."""

    #: "synthetic" | "live" — surfaced in the UI so data provenance is labelled.
    source: str = "synthetic"
    name: str = "feed"

    @abstractmethod
    def ohlcv(self, instrument: Instrument, days: int, seed: int, timeframe: str,
              difficulty: str | None = None) -> pd.DataFrame:
        ...


class SyntheticFeed(MarketDataFeed):
    source = "synthetic"
    name = "synthetic-v4"

    def ohlcv(self, instrument: Instrument, days: int, seed: int, timeframe: str,
              difficulty: str | None = None) -> pd.DataFrame:
        df_1m = generate_ohlcv(instrument, days=days, seed=seed, difficulty=difficulty or DEFAULT_DIFFICULTY)
        return resample_ohlcv(df_1m, timeframe)


class _UnconfiguredLiveFeed(MarketDataFeed):
    """Base for real broker/data feeds. Credentials are read from env; no real
    order routing is ever performed. Until a real adapter is implemented these
    raise so the resolver can fall back to synthetic and label the data."""

    source = "live"
    provider = "live"
    required_env: tuple[str, ...] = ()

    def __init__(self) -> None:
        self.name = f"{self.provider}-live"
        missing = [k for k in self.required_env if not os.environ.get(k)]
        if missing:
            raise RuntimeError(
                f"{self.provider} feed requires env vars: {', '.join(missing)}")

    def ohlcv(self, instrument: Instrument, days: int, seed: int, timeframe: str,
              difficulty: str | None = None) -> pd.DataFrame:
        raise NotImplementedError(
            f"{self.provider} live data adapter is not implemented yet. "
            "Plug a real historical/live OHLCV source here (read-only — no order "
            "routing). The app falls back to the synthetic feed in the meantime.")


class IBKRFeed(_UnconfiguredLiveFeed):
    provider = "ibkr"
    required_env = ("CONFLUENCE_IBKR_HOST", "CONFLUENCE_IBKR_PORT")


class TradovateFeed(_UnconfiguredLiveFeed):
    provider = "tradovate"
    required_env = ("CONFLUENCE_TRADOVATE_TOKEN",)


class DatabentoFeed(_UnconfiguredLiveFeed):
    provider = "databento"
    required_env = ("CONFLUENCE_DATABENTO_KEY",)


_LIVE_FEEDS = {"ibkr": IBKRFeed, "tradovate": TradovateFeed, "databento": DatabentoFeed}


def resolve_feed() -> MarketDataFeed:
    """Return the configured feed, or the synthetic feed if none is set up.

    Set CONFLUENCE_DATA_FEED=ibkr|tradovate|databento (plus that provider's
    credentials) to request a live feed. Any failure falls back to synthetic and
    is logged — the app never silently pretends synthetic data is live.
    """
    choice = os.environ.get("CONFLUENCE_DATA_FEED", "synthetic").strip().lower()
    if choice in ("", "synthetic", "mock"):
        return SyntheticFeed()
    cls = _LIVE_FEEDS.get(choice)
    if cls is None:
        log.warning("unknown CONFLUENCE_DATA_FEED=%r; using synthetic", choice)
        return SyntheticFeed()
    try:
        cls()  # construct to validate env/credentials; real adapters fall through below
        # smoke check: real adapters raise NotImplementedError today
        log.warning("live feed %r requested but not implemented; using synthetic", choice)
        return SyntheticFeed()
    except Exception as exc:  # noqa: BLE001 - log loudly, fall back
        log.warning("live feed %r unavailable (%s); using synthetic", choice, exc)
        return SyntheticFeed()
