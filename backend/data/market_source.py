"""MarketDataSource — the Phase-E dual-source data abstraction.

A MarketDataSource yields OHLCV bars for an instrument + timeframe. Two
implementations:

  * ReplayDataSource — serves RECORDED real-market bars bundled in the repo
    (``backend/data/replay/*.json``). No API key, no network, always works.
    This is the DEFAULT and makes every Phase-E feature testable offline.

  * LiveDataSource — written against a keyed provider. The API key is read from
    the environment variable ``CONFLUENCE_LIVE_DATA_KEY`` ONLY — never hardcoded,
    never logged. It is selectable only when that variable is present; otherwise
    the app silently uses Replay. Verified later when a key + market hours are
    available; not required to build or pass.

HONESTY / SAFETY: this layer provides market DATA only. There is no order
routing here or anywhere in the project — Real Mode places paper trades only.
"""
from __future__ import annotations

import json
import logging
import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, TypedDict

log = logging.getLogger("market_source")

#: env var that, when set, makes the Live source selectable. Value is the
#: provider API key — read here only, never logged or returned to the client.
LIVE_KEY_ENV = "CONFLUENCE_LIVE_DATA_KEY"
#: optional override of the live provider base URL (provider-agnostic shape)
LIVE_URL_ENV = "CONFLUENCE_LIVE_DATA_URL"

REPLAY_DIR = Path(__file__).resolve().parent / "replay"
VALID_TIMEFRAMES = ("1m", "5m", "15m", "30m", "1h")


class Bar(TypedDict):
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float


class MarketDataSource(ABC):
    """A source of OHLCV bars for an instrument + timeframe."""

    #: machine id surfaced to the UI so provenance is always labelled
    kind: str = "source"
    #: True only when the bars are genuine recorded/live market data
    recorded: bool = False
    label: str = "source"

    @abstractmethod
    def bars(self, symbol: str, timeframe: str, limit: int = 400) -> list[Bar]:
        """Return up to ``limit`` most-recent bars (chronological)."""

    def describe(self) -> dict[str, Any]:
        return {"kind": self.kind, "label": self.label, "recorded": self.recorded}


class ReplayDataSource(MarketDataSource):
    """Serves recorded real-market bars bundled with the app. Offline-safe."""

    kind = "replay"
    recorded = True

    def __init__(self, directory: Path = REPLAY_DIR) -> None:
        self.directory = directory
        self.label = "Replay — bundled recorded bars"

    def _path(self, symbol: str, timeframe: str) -> Path:
        return self.directory / f"{symbol}_{timeframe}.json"

    def available(self, symbol: str, timeframe: str) -> bool:
        return self._path(symbol, timeframe).is_file()

    def bars(self, symbol: str, timeframe: str, limit: int = 400) -> list[Bar]:
        path = self._path(symbol, timeframe)
        if not path.is_file():
            raise FileNotFoundError(f"no bundled replay data for {symbol} {timeframe}")
        payload = json.loads(path.read_text())
        raw = payload.get("bars", [])
        bars: list[Bar] = [
            {"time": int(b["time"]), "open": float(b["open"]), "high": float(b["high"]),
             "low": float(b["low"]), "close": float(b["close"]), "volume": float(b.get("volume", 0.0))}
            for b in raw
        ]
        return bars[-limit:] if limit else bars

    def provenance(self, symbol: str, timeframe: str) -> dict[str, Any]:
        path = self._path(symbol, timeframe)
        if not path.is_file():
            return {"source": "replay", "recorded": True, "note": "no bundled data"}
        payload = json.loads(path.read_text())
        return {
            "source": payload.get("source", "recorded sample"),
            "proxy_symbol": payload.get("proxy_symbol"),
            "recorded": bool(payload.get("recorded", True)),
            "note": "Recorded real-market bars, bundled with the app (delayed/illustrative).",
        }


class LiveDataSource(MarketDataSource):
    """Keyed live provider (provider-agnostic aggregates shape). The key is read
    from the environment only. Selectable solely when LIVE_KEY_ENV is present."""

    kind = "live"
    recorded = True

    # MNQ/MGC continuous front-month proxies (same mapping the Replay bundle uses)
    PROXY = {"MNQ": "NQ=F", "MGC": "GC=F"}
    _RANGE = {"1m": "1d", "5m": "5d", "15m": "1mo", "30m": "1mo", "1h": "3mo"}
    _INTERVAL = {"1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "60m"}

    def __init__(self) -> None:
        key = os.environ.get(LIVE_KEY_ENV, "").strip()
        if not key:
            raise RuntimeError(f"{LIVE_KEY_ENV} is not set; live source unavailable")
        self._key = key  # held in memory only; never logged or serialised
        self._base = os.environ.get(LIVE_URL_ENV, "https://query1.finance.yahoo.com/v8/finance/chart").rstrip("/")
        self.label = "Live — keyed provider"

    def bars(self, symbol: str, timeframe: str, limit: int = 400) -> list[Bar]:
        import httpx  # lazy: keeps Live optional for environments without it

        proxy = self.PROXY.get(symbol)
        if proxy is None or timeframe not in self._INTERVAL:
            raise ValueError(f"live source has no mapping for {symbol} {timeframe}")
        # provider-agnostic request: the API key travels as a bearer header, never
        # in the URL/query (so it can't leak into logs).
        resp = httpx.get(
            f"{self._base}/{proxy}",
            params={"interval": self._INTERVAL[timeframe], "range": self._RANGE[timeframe]},
            headers={"Authorization": f"Bearer {self._key}", "User-Agent": "ConfluenceEngine/Live"},
            timeout=8.0,
        )
        resp.raise_for_status()
        result = (resp.json().get("chart", {}).get("result") or [None])[0]
        if not result:
            raise ValueError("empty live result")
        ts = result["timestamp"]
        q = result["indicators"]["quote"][0]
        o, h, low, c = q["open"], q["high"], q["low"], q["close"]
        vol = q.get("volume") or [0] * len(ts)
        out: list[Bar] = []
        for i in range(len(ts)):
            if None in (o[i], h[i], low[i], c[i]):
                continue
            out.append({"time": int(ts[i]), "open": round(float(o[i]), 4), "high": round(float(h[i]), 4),
                        "low": round(float(low[i]), 4), "close": round(float(c[i]), 4), "volume": float(vol[i] or 0)})
        if not out:
            raise ValueError("no usable live candles")
        return out[-limit:] if limit else out

    def provenance(self, symbol: str, timeframe: str) -> dict[str, Any]:
        return {"source": "live provider (keyed)", "recorded": True,
                "note": "Live market data via the configured provider. Paper trades only."}


def live_configured() -> bool:
    return bool(os.environ.get(LIVE_KEY_ENV, "").strip())


def resolve_source(prefer: str = "replay") -> MarketDataSource:
    """Return the requested source. Live is honoured only when its key env var is
    present; otherwise we silently fall back to Replay (the always-works default).
    """
    if prefer == "live" and live_configured():
        try:
            return LiveDataSource()
        except Exception as exc:  # noqa: BLE001 - never break on a misconfigured live source
            log.warning("live source unavailable (%s); using replay", type(exc).__name__)
    return ReplayDataSource()


def source_status() -> dict[str, Any]:
    """What the Settings toggle needs: which sources exist and whether Live is
    configured. The key VALUE is never included — only whether it is present."""
    return {
        "active_default": "replay",
        "live_configured": live_configured(),
        "live_key_env": LIVE_KEY_ENV,
        "replay_symbols": sorted({p.stem.split("_")[0] for p in REPLAY_DIR.glob("*.json")}),
        "note": "Replay = bundled recorded bars (no key). Live needs the key env var and is verified at market hours.",
    }
