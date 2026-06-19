# Confluence Engine

Confluence Engine is a full-stack trading simulation dashboard. The backend ingests and normalizes 1m OHLCV data, calculates confluence signals, simulates tick-level execution, persists closed trades to SQLite, and streams validated payloads to a Next.js dashboard over WebSocket.

This project is simulation-only. It has no Docker, PostgreSQL, Redis, broker connection, or real-money execution.

## Stack

- Backend: FastAPI, Python 3.11-compatible code, SQLite, pandas, Pydantic v2
- Frontend: Next.js 14 App Router, TypeScript, Tailwind CSS, Zustand, Lightweight Charts
- Runtime: root `npm run dev` starts both servers through `concurrently`

## Project Tree

```text
confluence-engine/
├── backend/
│   ├── api/
│   │   └── ws.py
│   ├── config/
│   │   └── settings.py
│   ├── data/
│   │   ├── database.py
│   │   ├── ingest.py
│   │   ├── normalizer.py
│   │   └── schemas.py
│   ├── engine/
│   │   ├── confluence.py
│   │   └── simulation.py
│   ├── tests/
│   │   └── test_simulation.py
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── Chart.tsx
│   │   ├── MetricsDashboard.tsx
│   │   ├── StrategyPanel.tsx
│   │   └── SystemStatus.tsx
│   ├── lib/
│   │   ├── api.ts
│   │   ├── store.ts
│   │   └── ws.ts
│   └── package.json
├── package.json
└── README.md
```

## Install

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
npm install
```

## Run

```bash
npm run dev
```

The root `dev` script runs:

```bash
.venv/bin/uvicorn backend.main:app --reload --port 8000
npm run dev --prefix frontend
```

Open `http://localhost:3000`. FastAPI docs are available at `http://localhost:8000/docs`.

## Phase 2 Features

- `backend/data/ingest.py`: validates OHLCV, aligns timestamps to UTC, repairs missing 1m candles, and falls back to deterministic Alpaca-shaped mock data.
- `backend/data/normalizer.py`: fills gaps, cleans candles, calculates ATR(14), ADX(14), VWAP, and NY/London session markers.
- `backend/engine/confluence.py`: weighted scoring with base `0.4`, structure `0.2`, timing `0.2`, price action `0.2`, and dynamic thresholds of `0.75` high-vol / `0.65` normal.
- `backend/engine/simulation.py`: tick-level strategy checks for ORB, FVG retest, BOS, and breakout; tracks PnL, expectancy, win rate, max drawdown, -2R daily stop, and 15m cooldown after three losses.
- `frontend/components/Chart.tsx`: renders streaming candles with FVG/OB markers.
- `frontend/components/MetricsDashboard.tsx`: shows live expectancy, win rate, drawdown, cooldown, daily stop, and strategy leaderboard.

## Configuration

Backend settings use the `CONFLUENCE_` prefix:

```bash
CONFLUENCE_DATABASE_PATH=/absolute/path/trades.db \
CONFLUENCE_MARKET_DATA_PATH=/absolute/path/alpaca_1m.csv \
CONFLUENCE_SIMULATION_INTERVAL_SECONDS=0.25 \
npm run dev
```

Frontend environment overrides:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/api/simulation/stream
```

## Verification

```bash
source .venv/bin/activate
python -m pytest backend/tests -q
npm run typecheck --prefix frontend
npm run build --prefix frontend
```
