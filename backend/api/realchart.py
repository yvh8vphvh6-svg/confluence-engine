"""Real (delayed) market data for the Real Chart view.

Pulls ACTUAL market data through a free, keyless, delayed source (Yahoo Finance:
MNQ→NQ=F, MGC→GC=F). Clearly labelled delayed/unofficial. If the network is
unavailable or a configured provider isn't wired, returns a clear
"not connected" state — it never fabricates real prices. The synthetic
Practice/Backtest charts are entirely separate and labelled SYNTHETIC.

Set CONFLUENCE_REALCHART=off to force the not-connected state (e.g. offline).
"""
from __future__ import annotations

import logging
import os

import httpx

log = logging.getLogger("realchart")

YAHOO_SYMBOL = {"MNQ": "NQ=F", "MGC": "GC=F"}
# (yahoo interval, range) per timeframe — intraday windows are limited by Yahoo
YAHOO_PARAMS = {
    "1m": ("1m", "1d"),
    "5m": ("5m", "5d"),
    "15m": ("15m", "1mo"),
    "30m": ("30m", "1mo"),
    "1h": ("60m", "3mo"),
}
_UA = "Mozilla/5.0 (compatible; ConfluenceEngine/3.0; +https://example.invalid)"


def real_chart(symbol: str, timeframe: str) -> dict:
    how = ("Real MNQ/MGC data flows through the pluggable adapter. Yahoo Finance "
           "(delayed) is used by default and needs no key; for live/official data, "
           "wire a provider (IBKR / Tradovate / Databento) via CONFLUENCE_DATA_FEED "
           "and its credentials.")
    if os.environ.get("CONFLUENCE_REALCHART", "").lower() in ("off", "0", "false"):
        return {"connected": False, "reason": "Real chart disabled by configuration.",
                "how_to_connect": how}
    ysym = YAHOO_SYMBOL.get(symbol)
    if ysym is None or timeframe not in YAHOO_PARAMS:
        return {"connected": False, "reason": f"No real mapping for {symbol} {timeframe}.",
                "how_to_connect": how}

    interval, rng = YAHOO_PARAMS[timeframe]
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ysym}"
    try:
        resp = httpx.get(url, params={"interval": interval, "range": rng},
                         headers={"User-Agent": _UA}, timeout=8.0)
        resp.raise_for_status()
        data = resp.json()
        result = (data.get("chart", {}).get("result") or [None])[0]
        if not result:
            raise ValueError("empty result")
        ts = result["timestamp"]
        q = result["indicators"]["quote"][0]
        o, h, l, c = q["open"], q["high"], q["low"], q["close"]
        vol = q.get("volume") or [0] * len(ts)
        candles = []
        for i in range(len(ts)):
            if None in (o[i], h[i], l[i], c[i]):
                continue
            candles.append({
                "time": int(ts[i]),
                "open": round(float(o[i]), 4), "high": round(float(h[i]), 4),
                "low": round(float(l[i]), 4), "close": round(float(c[i]), 4),
                "volume": float(vol[i] or 0),
            })
        if not candles:
            raise ValueError("no usable candles")
        meta = result.get("meta", {})
        return {
            "connected": True,
            "delayed": True,
            "source": "Yahoo Finance (delayed, unofficial)",
            "symbol": symbol,
            "proxy_symbol": ysym,
            "timeframe": timeframe,
            "last_price": meta.get("regularMarketPrice"),
            "candles": candles[-400:],
            "note": (f"{symbol} shown via continuous front-month proxy {ysym}; "
                     "data is delayed and for education only — not for trading."),
        }
    except Exception as exc:  # noqa: BLE001 - surface as not-connected, never fake
        log.info("real chart fetch failed for %s/%s: %s", symbol, timeframe, exc)
        return {
            "connected": False,
            "reason": f"Couldn't reach the delayed market-data source ({type(exc).__name__}). "
                      "This environment may be offline.",
            "how_to_connect": how,
        }
