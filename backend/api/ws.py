"""Live / replay WebSocket stream.

Protocol (JSON both ways):

  client -> server control messages:
    {"type":"config", "symbol":"MNQ", "timeframe":"5m", "seed":42,
     "strategies":[...], "regime_filter":null}   # (re)build the timeline
    {"type":"play"} {"type":"pause"}
    {"type":"speed", "value":2.0}
    {"type":"step"} {"type":"step_back"}
    {"type":"seek", "index": 1234}               # absolute timeline offset
    {"type":"reset"}

  server -> client:
    {"type":"meta", ...}      once per (re)build
    {"type":"status", ...}    on transitions (building / ready / error)
    {"type":"tick", ...}      one per advanced bar (SimulationTick)
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import suppress

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..config.settings import get_settings
from ..engine.live import LiveSimulation
from ..engine.strategies import all_strategies
from . import repository

log = logging.getLogger("ws")
router = APIRouter(prefix="/api/simulation", tags=["simulation"])

# build cache shared across connections (timelines are pure functions of config)
_CACHE: dict[tuple, LiveSimulation] = {}
_CACHE_LOCK = asyncio.Lock()
_MAX_CACHE = 8


def _key(symbol, timeframe, seed, strategies, regime_filter) -> tuple:
    return (symbol, timeframe, int(seed), tuple(sorted(strategies)), regime_filter)


async def _get_sim(symbol, timeframe, seed, strategies, regime_filter) -> LiveSimulation:
    strategies = strategies or all_strategies()
    key = _key(symbol, timeframe, seed, strategies, regime_filter)
    async with _CACHE_LOCK:
        sim = _CACHE.get(key)
    if sim is not None:
        return sim
    stats = await asyncio.to_thread(repository.regime_stats)
    gate = await asyncio.to_thread(repository.gate_for, symbol, timeframe)
    sim = await asyncio.to_thread(
        LiveSimulation, symbol, timeframe, seed, strategies, regime_filter, stats, gate)
    async with _CACHE_LOCK:
        _CACHE[key] = sim
        while len(_CACHE) > _MAX_CACHE:
            _CACHE.pop(next(iter(_CACHE)))
    return sim


class Session:
    def __init__(self, websocket: WebSocket) -> None:
        self.ws = websocket
        self.settings = get_settings()
        self.sim: LiveSimulation | None = None
        self.cursor = 0
        self.playing = False
        self.speed = 1.0
        self.auto_pause = True  # pause + teach on each fresh qualified setup
        self._dirty = asyncio.Event()  # wake the sender after a control change

    async def configure(self, msg: dict) -> None:
        symbol = msg.get("symbol", self.settings.default_symbol)
        timeframe = msg.get("timeframe", self.settings.default_timeframe)
        seed = msg.get("seed", self.settings.default_seed)
        strategies = msg.get("strategies") or None
        regime_filter = msg.get("regime_filter")
        await self._send({"type": "status", "state": "building",
                          "symbol": symbol, "timeframe": timeframe})
        try:
            sim = await _get_sim(symbol, timeframe, seed, strategies, regime_filter)
        except Exception as exc:  # noqa: BLE001 - surface, don't swallow
            log.exception("failed to build simulation")
            await self._send({"type": "status", "state": "error", "message": str(exc)})
            return
        self.sim = sim
        self.cursor = 0
        self.playing = True
        await self._send(sim.meta())
        await self._send({"type": "status", "state": "ready", "length": sim.length})
        await self._emit_current(frame=True)
        self._dirty.set()

    async def _emit_current(self, frame: bool = False) -> None:
        if not self.sim:
            return
        tick = self.sim.tick_at(self.cursor, self.playing)
        if tick is None:
            return
        payload = tick.model_dump(mode="json")
        if frame:
            # non-contiguous jump: include a candle window so the chart redraws
            payload = {**payload, "type": "frame", "candles": self.sim.window(self.cursor)}
        await self._send(payload)

    async def _send(self, payload: dict) -> None:
        await self.ws.send_json(payload)

    async def handle(self, msg: dict) -> None:
        kind = msg.get("type")
        if kind == "config":
            await self.configure(msg)
            return
        if not self.sim:
            return
        if kind in ("play", "resume"):
            self.playing = True
            self._dirty.set()
        elif kind == "autopause":
            self.auto_pause = bool(msg.get("value", True))
        elif kind == "pause":
            self.playing = False
            await self._emit_current(frame=True)
        elif kind == "speed":
            self.speed = max(0.1, min(float(msg.get("value", 1.0)), 20.0))
            self._dirty.set()
        elif kind == "step":
            self.playing = False
            self.cursor = min(self.cursor + 1, self.sim.length - 1)
            await self._emit_current(frame=True)
        elif kind == "step_back":
            self.playing = False
            self.cursor = max(self.cursor - 1, 0)
            await self._emit_current(frame=True)
        elif kind == "seek":
            self.playing = False
            self.cursor = max(0, min(int(msg.get("index", 0)), self.sim.length - 1))
            await self._emit_current(frame=True)
        elif kind == "reset":
            self.cursor = 0
            self.playing = False
            await self._emit_current(frame=True)

    async def run_player(self) -> None:
        """Advance the cursor while playing, coalescing to one tick per bar."""
        while True:
            if not self.playing or not self.sim:
                self._dirty.clear()
                await self._dirty.wait()
                continue
            if self.cursor >= self.sim.length - 1:
                self.playing = False
                await self._emit_current()  # final bar with playing=false
                continue
            self.cursor += 1
            # auto-pause + teach on each fresh qualified setup (the core teaching beat).
            # Flip playing BEFORE emitting so the paused-on tick reads playing=false.
            qual = self.sim.fresh_qualified_at(self.cursor) if self.auto_pause else None
            if qual:
                self.playing = False
                await self._emit_current()
                await self._send({"type": "teach", "setup": qual, "bar_index": self.cursor})
                continue
            await self._emit_current()
            delay = self.settings.base_tick_seconds / self.speed
            try:
                await asyncio.wait_for(self._dirty.wait(), timeout=delay)
                self._dirty.clear()
            except asyncio.TimeoutError:
                pass


@router.websocket("/stream")
async def simulation_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    session = Session(websocket)
    # auto-configure with defaults so the UI shows data immediately
    await session.configure({})
    player = asyncio.create_task(session.run_player())
    try:
        while True:
            msg = await websocket.receive_json()
            await session.handle(msg)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        player.cancel()
        with suppress(asyncio.CancelledError):
            await player
