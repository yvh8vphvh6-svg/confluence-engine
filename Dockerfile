# syntax=docker/dockerfile:1
# Single-service image: build the Next.js static export with Node, then serve
# it (plus the FastAPI API + WebSocket) from one Python process. One URL, no CORS.

# ---- Stage 1: build the static frontend (Node pinned) --------------------
FROM node:20-bookworm-slim AS frontend
WORKDIR /app
# Install deps deterministically from the committed lockfile (npm workspaces).
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci
# Build → emits the static site to /app/frontend/out (next.config: output:"export").
COPY frontend ./frontend
RUN npm run build --prefix frontend

# ---- Stage 2: Python runtime (Python pinned) -----------------------------
FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

# Python deps first for layer caching.
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install -r backend/requirements.txt

# App code + the built frontend.
COPY backend ./backend
COPY --from=frontend /app/frontend/out ./frontend/out

# Writable dir for the SQLite memory / journal (ephemeral; resets on redeploy).
RUN mkdir -p /app/output

EXPOSE 8000
# Bind 0.0.0.0 and the platform's $PORT (Render/Railway/Fly inject PORT).
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
