# Deploying Confluence Engine

This app deploys as **one service**: the FastAPI backend serves the Next.js
**static export** (`frontend/out`) plus the REST API and the WebSocket stream
from a single process. That means **one public URL, no CORS, no separate
frontend host**. Open it from any device (phone, laptop) at that URL.

Recommended host: **Render** (free tier), deployed from the included
[`Dockerfile`](./Dockerfile) via the [`render.yaml`](./render.yaml) Blueprint.
The Docker image pins **Node 20** (builds the frontend) and **Python 3.12**
(runs the server), so the build is identical everywhere.

- **Build:** `docker build` from `./Dockerfile` (Render does this automatically).
- **Start:** `uvicorn backend.main:app --host 0.0.0.0 --port $PORT` (the image's
  `CMD` — binds `0.0.0.0` and the platform's injected `$PORT`).

---

## Option A — Render Blueprint (one click, recommended)

1. **Push the code to GitHub** (already configured — see "Push" at the bottom).
   The repo must be on GitHub so Render can build from it.
2. Go to **https://render.com** and **sign up / log in** (use "Sign in with
   GitHub" so Render can see your repos).
3. In the dashboard, click **New +** (top right) → **Blueprint**.
4. **Connect** your GitHub account if prompted, then **select the
   `confluence-engine` repository** and click **Connect**.
5. Render reads [`render.yaml`](./render.yaml) and shows one service named
   **`confluence-engine`** (type: Web, runtime: Docker, plan: Free). Click
   **Apply** (older UI: **Create New Resources**).
6. **Set the secret.** On the service's **Environment** tab, find
   **`ANTHROPIC_API_KEY`** (it is declared with `sync: false`, so Render asks
   you for the value — it is never stored in the repo). Click **Add / Edit**,
   paste your key (`sk-ant-...`), and **Save Changes**. A redeploy kicks off.
   - The app **runs fine without this key** — the AI coach just falls back to
     rule-based notes. Everything else works.
7. Wait for the build + deploy to finish (first Docker build is a few minutes;
   watch the **Logs** tab — success shows `Uvicorn running on http://0.0.0.0:<port>`
   and `serving static frontend from /app/frontend/out`).
8. **Find your live URL** at the **top of the service page**, e.g.
   `https://confluence-engine.onrender.com`. Click it — that's your permanent
   URL, open it from any device.

## Option B — Render Web Service (manual, no Blueprint)

1. **New +** → **Web Service** → connect the GitHub repo.
2. **Runtime / Language:** choose **Docker** (Render auto-detects the
   `Dockerfile`; leave Build & Start commands blank — the image defines them).
3. **Instance Type:** **Free**.
4. **Environment** → **Add Environment Variable**:
   - Key `ANTHROPIC_API_KEY`, Value `sk-ant-...` (your secret).
5. **Create Web Service**. Get the URL from the top of the page when live.

---

## Environment variables

| Variable | Required? | Set where | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Optional (recommended) | Render → Environment (secret) | Enables the live Claude coach. Read **only** from the environment; never in the repo. Without it the coach uses rule-based fallback and the app still works. |
| `PORT` | **Do not set** | Injected by Render | The container binds `0.0.0.0:$PORT` automatically. |
| `FRONTEND_ORIGIN` | Not needed here | Render → Environment | Only for a *separate-origin* frontend. Single-service is same-origin, so CORS is never used. Comma-separated list allowed. |
| `CONFLUENCE_COACH_MODEL` | Optional | Render → Environment | Override the coach model (default `claude-haiku-4-5`). |

The frontend needs **no** build-time env vars for this deploy: in production it
talks to its **own origin** (relative `/api/...` for REST, `wss://<host>/api/simulation/stream`
for the WebSocket), so HTTPS/WSS are used automatically. (`NEXT_PUBLIC_API_URL`
/ `NEXT_PUBLIC_WS_URL` exist only as overrides for a split deploy.)

---

## Important notes about the free tier

- **Cold starts.** Free Render services **spin down after ~15 minutes of
  inactivity**. The next visit triggers a wake-up that takes roughly
  **30–60 seconds** before the page loads. This is normal; subsequent requests
  are fast.
- **SQLite resets on redeploy.** The instance disk is **ephemeral**. The
  backtest "memory" (`output/trading_memory.db`) and your **journal / paper
  trades / decisions / custom strategies / sessions** (`output/journal.db`) are
  stored on that disk and are **wiped on every redeploy or restart**.
  - The backtest memory **re-populates automatically** on boot via a background
    sweep (~1–2 min). Until it finishes, the Leaderboard / Strategies /
    Validation tabs show "computing…".
  - Journal data does **not** survive a redeploy. This is a practice simulator,
    so that's acceptable; to make it durable you'd attach a Render Persistent
    Disk mounted at `/app/output` (paid) or point the app at a managed database.

---

## Verifying locally (optional, before deploying)

```bash
# 1) Build the static frontend (emits frontend/out)
npm run build

# 2) Serve everything from the backend on one port (like production)
PORT=8000 .venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
#   → open http://localhost:8000  (frontend, API and WS all on one origin)

# Or build & run the exact production image:
docker build -t confluence-engine .
docker run --rm -e PORT=8000 -e ANTHROPIC_API_KEY=sk-ant-... -p 8000:8000 confluence-engine
```

The deterministic engine check and the production build both stay green:

```bash
python -m backend.run_backtest --verify   # DETERMINISTIC across processes
npm run build                              # static export to frontend/out
```

---

## Push (so the host can deploy from GitHub)

- **Remote:** `https://github.com/yvh8vphvh6-svg/confluence-engine`
- **Branch:** `main`

```bash
git push origin main
```

Render auto-deploys on every push to `main` (`autoDeploy: true` in
`render.yaml`).
