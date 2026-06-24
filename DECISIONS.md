# DECISIONS — Integrating the real engine into the live app

This log records the non-obvious choices made while replacing the demo brain
("Momentum Confluence" on synthetic ~100-priced "CFE" data) with the real,
tested, deterministic engine shipped in `trading-sim/`. Per BUILD_ORDER.md I did
not ask clarifying questions; where realism/correctness conflicted with
convenience I chose correctness and noted it here.

## Architecture

1. **Relocated the real engine into the root `backend/` package** (not a sibling).
   `python -m backend.run_backtest --verify` must run from the repo root, and the
   FastAPI app already lives at `backend.main:app`, so the engine modules
   (`engine/`, `data/generator.py`, `memory/`, `run_backtest.py`) now live under
   `backend/`. The demo modules (`data/ingest.py`, `data/normalizer.py`,
   `data/database.py`, the moving-average `engine/simulation.py` +
   `engine/confluence.py`, and `data/schemas.py`) were **deleted**. The real
   `engine/confluence.py` and `engine/simulation.py` overwrote the demo ones of
   the same name. `run_backtest.py` resolves its output dir to repo-root
   `output/`, which is where the SQLite "memory", `results.json` and the
   self-contained `dashboard.html` are written.

2. **`trading-sim/` is kept as the upstream source of truth** (read-only). The
   running app imports from `backend.*`. `trading-sim/` is not imported at
   runtime; it remains so the determinism proof's provenance is auditable.

3. **New frontend data contract in `backend/schemas.py`.** The demo contract only
   knew 4 strategies and a directional `bullish/bearish/neutral` "regime". The
   real engine has 8 strategies and 4 *market* regimes (`trending`, `ranging`,
   `high_vol`, `low_vol`). I replaced the Pydantic contract to carry the real
   regime, all 8 strategies with their four confluence-factor booleans, the
   confluence score breakdown + threshold, real position/trade objects (R
   multiples, exit reasons), and richer indicators (ADX/DI, EMA20/50, RSI, VWAP,
   killzone). The frontend `store.ts` types mirror this exactly.

## Live stream (the hard adaptation)

4. **`backend/engine/live.py` — `LiveSimulation`** drives the dashboard. The
   real `simulation.Backtester` is a batch state machine; a live/replay stream
   needs per-bar snapshots. `LiveSimulation` precomputes the whole timeline in
   one deterministic forward pass (same building blocks the Backtester uses:
   `build_context`, the 8 strategy fns from `REGISTRY`, `confluence.evaluate`,
   `ExecutionModel`, and the same risk model — partial TP at +1R, breakeven, ATR
   trail, −2R daily lock, 3-loss cooldown) and records one `TickSnapshot` per bar.
   Play / pause / speed / step / step-back / seek just index into that immutable
   timeline, so replay is deterministic and step-back is exact (no drift).
   - **Trade-off:** the live engine is a *separate* implementation from
     `Backtester`, so it is **not bit-identical** to the batch backtest. That is
     intentional: the determinism gate (`--verify`) only governs `Backtester`,
     which is untouched. The live engine reuses the same primitives so behaviour
     is faithful, but the leaderboard/validation numbers always come from the
     batch engine via SQLite, never from the live stream.

5. **Portfolio of selected strategies, one position at a time.** The left-panel
   multi-select picks which of the 8 strategies are armed. Each bar, every armed
   strategy is evaluated (its own independent zone state, so SMC zone
   consumption never bleeds between strategies) and its signal + confluence is
   emitted for the inspector. When flat, the first armed strategy (registry
   order) whose signal clears confluence and fills opens the position. This keeps
   "real open positions + real running metrics" honest for the chosen mix while
   still surfacing every strategy's live signal.

6. **Regime filter** gates *new entries* (a signal in a filtered-out regime is
   shown greyed but not taken), matching the "regime filter" control intent.

7. **Default instrument MNQ, default timeframe 5m, seed 42.** Prices look like
   MNQ (~18,000) / MGC (~2,350). Switching instrument/timeframe/seed/strategies
   over the WebSocket cancels and rebuilds the timeline (clean replace).

8. **WebSocket protocol** (`/api/simulation/stream`): client sends JSON control
   messages (`config`, `play`, `pause`, `speed`, `step`, `step_back`, `seek`,
   `reset`); server streams `{type:"tick", ...}` snapshots plus a `{type:"meta"}`
   handshake (instrument spec, bar count, strategy metadata). Cadence is driven
   by speed; the server coalesces — one message per advanced bar, and the chart
   updates via `series.update` against a ref instead of re-rendering React per
   tick.

## REST endpoints (real numbers from SQLite memory)

9. `backend/api/routes.py` serves the batch results:
   `/api/instruments`, `/api/strategies`, `/api/strategies/{name}`,
   `/api/leaderboard`, `/api/validation`, `/api/education`. All read the
   `MemoryStore` (`output/trading_memory.db`) and `results.json` produced by
   `run_backtest`. **n<100 is reported as "insufficient sample," never a faked
   win rate; `promote` reflects the real Monte-Carlo (<15% p95 DD) AND n≥100
   gate.**

10. **Memory is populated on boot.** `main.py`'s lifespan launches the default
    sweep (150 days × {5m,15m} × 2 instruments × 8 strategies) in a background
    thread if the memory DB has no runs, so the leaderboard isn't empty when the
    UI loads. A `/readyz` reports whether the sweep has finished; the UI shows a
    "computing backtests" state until then. I also ran the sweep once in this
    session so `output/` ships populated.

## Frontend

11. **Multi-tab app** (Dashboard, Strategies, Indicators, Tests/Validation,
    Education, Sources, Books) built in the existing Next.js 14 App Router. The
    educational content (indicator verdicts, strategy families, validation steps,
    peer-reviewed sources, reading list) is transcribed from `EDUCATION.md` into a
    structured TS module (`lib/education.ts`) and rendered — reliable and
    dependency-free (no markdown runtime dep, so `npm run build` has no network
    surprise).

12. **Performance:** chart candles live in a ref and update via the Lightweight
    Charts `series.update` API; only the latest tick + derived panel data go
    through Zustand. Heavy lists (blotter, leaderboard) are memoized and capped.
    Control changes debounce and cancel/replace the in-flight stream config.

13. **Theme** moved to the spec palette: `#0B0F19` bg, `#1A1F2E` panels, neon
    `#00E676` / `#FF1744` / `#FFD600`.

14. **Honesty rules preserved:** persistent "Simulation only — no brokerage
    connection or real-money execution" banner, an explicit "synthetic data"
    notice, "insufficient sample" instead of fabricated stats, and the
    Monte-Carlo promote/hold gate shown verbatim.

## Housekeeping

15. Root `package.json` gained a `build` script (`npm run build --prefix
    frontend`) so the required `npm run build` works from the repo root.
16. Stray botched-venv directories (`then/`, `.venvn/`, `.venvScriptsactivate/`)
    and generated artifacts are added to `.gitignore`; they are accidental and
    not part of the app.
17. `backend/requirements.txt` gained `numpy` (the engine's core dep).
18. The Python test suite (`backend/tests/`) was rewritten to cover the new live
    engine + the determinism/contract guarantees, since it referenced
    now-deleted demo modules.

---

## Pass 2 — manual mode, best-setup ranking, coach, checklist, journal

19. **"Prior work" that wasn't there.** The pass-2 brief asked me to preserve a
    "guide/tooltips/walkthrough" and an "AI chat assistant" from earlier work.
    Neither existed in the repo at the start of this pass (the repo was exactly
    the pass-1 output — verified by grep). There was nothing to preserve, so I
    proceeded and folded a Claude-backed **assistant** into the new Coach panel
    (free-text Q&A in addition to setup coaching), which covers the "AI chat
    assistant" intent. All actual pass-1 work (real engine, controls, dashboard,
    tabs, determinism) is untouched.

20. **Live data adapter** (`backend/data/feed.py`). A pluggable `MarketDataFeed`
    interface with a deterministic `SyntheticFeed` (wraps the existing generator)
    and `IBKRFeed` / `TradovateFeed` / `DatabentoFeed` stubs activated by env
    (`CONFLUENCE_DATA_FEED` + per-provider credential vars). No real feed is
    wired, and **no order routing exists anywhere** — this stays paper-only. When
    a live feed is requested but unavailable/unimplemented, the resolver logs
    loudly and falls back to synthetic. `data_source` ("synthetic" | "live") is
    carried in the WS meta and shown as a badge so data provenance is always
    labelled. The engine reads OHLCV through the feed, so a real historical
    adapter can replace the generator without touching the rest.

21. **Best-setup ranking + anti-flood** (engine + `repository`). Each live signal
    gets `score = confluence_confidence × max(regime_expectancy_R, 0) ×
    min(n/100, 1)` using the strategy's real backtested by-regime expectancy from
    SQLite. The tick carries `best_setup` (single top-ranked active setup) and
    `also_firing` (the rest, collapsed). A strategy is only marked `recommended`
    when it cleared the gate **in the current regime**: regime n≥100 AND regime
    expectancy>0 AND the run's Monte-Carlo `promote` for the live symbol/timeframe.
    Anything else is "not enough evidence yet" — never recommended. The frontend
    debounces the displayed best setup (~700 ms) so it doesn't flicker.

22. **Coach** (`backend/api/coach.py`, `POST /api/coach`). Deterministic,
    discipline-first coaching copy is always available (factors present/missing,
    regime edge with the synthetic-data caveat, R:R, risk, and over-trading /
    cooldown / daily-stop / in-position warnings tied to the real risk model). If
    `ANTHROPIC_API_KEY` is set, the same context is phrased via Claude
    (`claude-opus-4-8`, adaptive thinking) through the official `anthropic` SDK
    (lazy-imported; absence or any API error falls back to the rule-based copy).
    A hard, non-negotiable system prompt + an always-appended disclaimer line
    forbid profit promises and certainty and repeat "simulation / signals aren't
    guarantees / not financial advice / your own risk." The same endpoint answers
    free-text questions (the assistant).

23. **Manual / practice mode** (client-side paper account). A mode toggle turns
    off acting on the auto-sim and lets the user place their own paper trades. The
    current best setup renders as a **yellow entry ticket** (direction, entry,
    stop, take-profit, R:R, and a 1%-risk position size computed from the paper
    balance and the instrument point value). "Take" opens a paper position tracked
    in a **separate** paper account (balance / equity / win rate / expectancy(R),
    distinct from the engine's metrics); "Skip" dismisses it; manual close is
    available; stop/TP auto-close on each streamed bar. Every closed paper trade
    is persisted to the backend journal. No broker, no real orders.

24. **Testing tab = conditions-met checklist.** Reworked into yes/no ✓/✗ rows:
    a **live setup** checklist (Base, Structure, Timing/OTE, Price-action, Regime
    favorable, Sample n≥100, Monte-Carlo gate — from the live stream) and a
    **per-strategy** gate checklist (Sample n≥100, Positive expectancy, Passed
    Monte-Carlo) from SQLite. The determinism proof, Monte-Carlo table, and sample
    sizes are kept but framed as pass/fail conditions.

25. **Education visuals + Journal.** The Education tab gained real charts drawn
    with Lightweight Charts (FVG, order block, opening range, BOS examples) plus
    SVG diagrams (equity curve, win-rate-vs-expectancy). A new **Journal** tab and
    backend (`backend/journal.py`, SQLite at `output/journal.db`,
    `/api/journal*`) auto-logs the user's paper trades (setup, strategy, regime, R
    result, exit reason) and free-text notes with an emotion/discipline tag, and
    shows trends (win rate, expectancy, exit-reason and emotion breakdowns,
    recurring-mistake heuristics).

26. `backend/requirements.txt` gained `anthropic` (used only when a key is set;
    the coach degrades to deterministic copy otherwise).

---

## Pass 3 — usability + structure (Learn / Backtest / Practice), realism, real chart

27. **Realistic deterministic generator.** Rewrote `data/generator.py`: the old
    GBM had 6σ price-level jumps (the "violent/erratic" complaint). New model is
    multiplicative with an AR(1) momentum term, gentle mean-reversion to a slow
    intraday anchor, a per-day trend/range character, a U-shaped vol profile, and
    *bounded* displacement bursts (so FVGs/OBs/sweeps still occur without insane
    candles). Per-minute returns are clipped. Still seeded/deterministic (crc32
    symbol offset; `--verify` passes) and clearly labelled SYNTHETIC. Prices stay
    in instrument range (MNQ ~18k, MGC ~2.3k). I re-ran the sweep to repopulate
    the SQLite memory against the new data.

28. **Extended session 04:00–16:00 ET (720 min/day)** so session-start presets are
    real and distinct: London (04:00), NY / Market open (09:30), Power hour
    (15:00), Custom. `indicators.opening_range` now anchors the OR at the 09:30
    RTH open (not the first pre-market bar), so ORB still means the cash-open
    range. Killzones/VWAP/PDH unchanged.

29. **More timeframes:** added 30m and 1h alongside 1m/5m/15m (`resample_ohlcv`
    rules, `COOLDOWN_BARS`, live-engine timeframe validation, UI selectors).

30. **Smoother playback:** default cadence raised (`base_tick_seconds` 0.4 → 1.2s)
    and speed steps are 0.25× / 0.5× / 1× / 2× / 4× / 8×. Combined with the calmer
    generator the chart reads like a chart, not noise.

31. **Overlay declutter:** capped active zones (most-recent 3 FVG / 3 OB / 1 ORB /
    2 BOS), titles only on the newest of each kind, and trade markers capped, so
    the FVG/OB/BOS labels no longer overlap into a mess. Toggles unchanged.

32. **Free manual paper trading** (the blocking fix). Manual trading is no longer
    gated on a "qualified setup": a `TradePanel` lets you place a market Buy/Sell
    AT ANY TIME with adjustable stop/target (in points, ATR-prefilled) and size
    (1%-risk helper). Taking a trade opens a VISIBLE paper position — entry/stop/TP
    are drawn on the chart, size shown, unrealized P&L updates live each bar — with
    a prominent in-trade vs flat banner, a Close button, and stop/TP auto-close.
    The "best setup" is now optional guidance: a "Use suggestion" button prefills
    the order form; it never blocks placing your own trade. This fixes the
    "it says I took a trade but nothing happens" mismatch — the position lives in
    one place in the store and every surface (panel + chart + account) reads it.

33. **Backtest mode** (`/backtest` + `POST /api/backtest`). Pick instrument,
    timeframe, ONE strategy, a session start, seed and days → run a deterministic
    `Backtester` pass (new optional `session_start_min` entry-time gate; default
    None keeps `--verify` byte-identical) → trades table, equity curve, metrics,
    Monte-Carlo, and a conditions-met checklist. A Reset button clears and lets a
    different strategy re-run cleanly from scratch.

34. **Validation tab** is now functional: a per-strategy "Run validation" action
    hits `/api/backtest` and renders the readable conditions checklist (Base /
    Structure / Timing-OTE / Price-action via factor coverage, Regime favorable,
    Sample n≥100, Monte-Carlo gate) plus determinism + drawdown. Quiz-style
    learning moved to Lessons.

35. **Learn onboarding** (`OnboardingModal` + `lib/lessons.ts`). Auto-launches on
    first visit (localStorage) and is reachable anytime from the nav. Centered
    modal styled like the reference: icon, Welcome heading+subtitle, numbered
    lesson list with ✓ for completed and lock+duration for the rest, "And more!",
    the simulated-data disclaimer, and Get started / Back to Dashboard buttons.
    Lessons explain, in plain English, every panel/control/metric (Orientation,
    Futures 101, Using the Charts, Reading the Panels, The Strategies, Risk & the
    Coach, Manual Trading, Backtesting, Validation, Journal). Completion is tracked
    and unlocks sequentially.

36. **Three clear modes** via nav: **Learn** (modal), **Practice** (`/` —
    streaming chart + free manual trading + coach), **Backtest** (`/backtest`),
    **Real Chart** (`/real`), plus a reference group (Validation, Strategies,
    Indicators, Journal, Education, Sources, Books).

37. **Real Chart** (`/real` + `POST/GET /api/realchart`). Pulls **actual** market
    data through the pluggable adapter: a keyless **Yahoo Finance delayed** feed
    (MNQ→NQ=F, MGC→GC=F), clearly labelled "delayed / unofficial". If the network
    is unavailable or a configured provider isn't wired, it returns a clear
    "not connected — connect a market-data provider" state. It never fabricates
    real prices, and the synthetic Practice/Backtest charts stay separate and
    labelled SYNTHETIC.

---

## Pass 4 — paced TEACHING simulator (auto-pause & teach, de-churn, interactive tour)

38. **"Qualified setup" + auto-pause/teach.** Each bar's snapshot now carries a
    `qualified_setup` — the single setup that is `active`, clears confluence
    (`execute`), and has **positive in-regime backtested expectancy** (looser than
    the full MC `promote` so teaching moments actually occur on synthetic data;
    honesty preserved because the evidence string still states the real gate
    status). `LiveSimulation.fresh_qualified_at(i)` returns it only on a *fresh*
    qualification edge (different from the previous bar), so the same setup
    persisting across bars doesn't re-trigger. The WS player auto-pauses the sim
    on each fresh qualified setup (`Session.auto_pause`, default ON): it flips
    `playing=False` (so the paused-on tick reads paused), emits the bar, and sends
    a `{"type":"teach", setup, bar_index}` message. Resume/Take/Skip all resume
    play, which clears the teach state and runs on to the next fresh qualified
    setup. An `{"type":"autopause", value}` control toggles it (UI toggle in the
    chart header, default ON in Practice).

39. **TeachCard** (frontend): when a teach arrives, a prominent yellow card frames
    the setup — direction, entry/stop/TP, R:R, which confluence factors are
    present/missing, the regime, the real backtested edge (with the synthetic
    caveat), a 1%-risk size, and **Take / Skip / Resume**. Take opens the paper
    trade from the setup and resumes; Skip/Resume just resume. The chart **zooms
    in** (larger bar spacing + scroll-to-latest) and draws the setup's
    entry/stop/target lines while paused.

40. **De-churned coach + stable best-setup.** `useBestSetup` now tracks the stable
    `qualified_setup` (not the per-bar top-ranked `best_setup`), so the BestSetup
    panel only changes when the qualified setup actually changes. The Coach calls
    the model **only on meaningful events** — a new qualified setup, and the
    user's own paper-trade open/close — never every bar. A cheap, always-current
    **risk banner** (cooldown / daily-stop / loss-streak / overtrading) is derived
    locally from metrics with no model call, so risk stays visible without churn.

## Pass 5 — make the Claude coach actually connect (.env loading + diagnostics)

P5-1. **Root cause:** the coach checked `os.environ["ANTHROPIC_API_KEY"]`, but the
   bare key in repo-root `.env` was never loaded into the process — `pydantic-
   settings` only reads `CONFLUENCE_`-prefixed vars and uvicorn doesn't auto-load
   `.env`. So the key was always absent → silent rule-based fallback. Fix:
   `load_dotenv(REPO_ROOT/.env)` at the top of `config/settings.py` (runs before
   anything reads env; does not override already-exported vars). The coach reads
   the bare `ANTHROPIC_API_KEY` from `os.environ`.

P5-2. **Model id.** Probed the live API with the funded key: `claude-opus-4-8` and
   `claude-haiku-4-5` both work; `claude-3-5-haiku-*`/`claude-3-haiku-*` 404. The
   coach now defaults to **`claude-haiku-4-5`** (current Haiku — fast/cheap for a
   coach), configurable via `CONFLUENCE_COACH_MODEL`. The `thinking` param was
   removed from the call (a plain Messages request is the portable, working
   shape).

P5-3. **Precise failure reasons (no more generic "set ANTHROPIC_API_KEY").** The
   coach now classifies failures via the SDK's typed exceptions into
   `missing_key` / `sdk_missing` / `auth` / `credit` / `model` / `rate_limit` /
   `network` / `error`, logs the real status+message (never the key), and surfaces
   the reason in `CoachResponse.reason` and the rule-based note.

P5-4. **Diagnostics.** `assistant_health()` makes one tiny real Messages call;
   startup logs whether the key was found and whether the test call succeeded
   (with the error if not). `/healthz` gained `assistant_key_present` and
   `assistant_status`; added `GET /api/assistant/health` returning the full
   structured result. The key value is never logged or returned.

41. **Interactive new-user Tour.** A click-through tour (`Tour.tsx`) overlays the
    real dashboard, spotlighting one element at a time (nav, controls, chart,
    best-setup, trade panel, coach, paper account, metrics) via `data-tour`
    anchors, with Back / Next / Skip and a final "Start practicing" + "Open
    lessons" hand-off to the existing lessons. It auto-launches on first visit
    (localStorage `ce_tour_seen_v1`) and is re-launchable from the "Take the tour"
    link. The lessons modal no longer auto-opens (the tour is the first-run
    experience; lessons remain on the Learn nav button and the tour hand-off).

## Pass 6 — big feature build (glossary, drills, performance, strategy library/lab, journaling, progression, context, anti-patterns, custom strategies, psychology/scenarios)

Audited the app against the full 12-item feature list first; **extended** the
existing performance/journal/education/validation surfaces rather than rebuilding
them. The AI/coach was left exactly as-is (not part of this pass). Everything is
simulation/synthetic with the honesty rules intact (labeled synthetic, "insufficient
sample" instead of fake stats, "not financial advice"). Both gates kept green.

P6-1. **Glossary** (`/glossary`, `lib/glossary.ts`). 36 terms across the 6 required
   categories (Market Structure, Order Flow, Technical Analysis, Risk Management,
   Futures-Specific, Psychology). Each term carries name, definition, why-it-matters,
   and an example. Searchable + category-filterable, client-side.

P6-2. **Decision-point training** (`/drills`, backend `api/decision.py`). The chart
   pauses at a decision index (90 bars of history). The user commits BEFORE the
   reveal: action (Buy/Sell/Wait/Pass), a typed WHY, and stop+target (points) drawn
   on the chart. On reveal the engine simulates HORIZON=30 bars forward, scores
   direction (0–60) + risk management (0–40), persists to a `decisions` table, and
   shows running accuracy. Difficulty (beginner/intermediate/advanced) maps to
   regime (trending/ranging/high-vol). Scenario id = `SYM:TF:SEED:IDX` so scoring
   deterministically reconstructs the same scenario.

P6-3. **Performance tracking** (extended `backend/journal.py` `_stats()` + new
   `/performance`). `_stats()` now returns wins/losses/breakeven, win rate, avg
   win/loss R, profit factor, expectancy(R), net P&L, max drawdown(R), avg hold,
   streaks (current/best-win/best-loss), by_exit, by_emotion, by_strategy,
   by_mistake. `mistakes` tags added to `paper_trades` (TEXT column, migrated in
   `_conn()`); `MISTAKE_TAGS` = FOMO / moved stop / oversized / traded news /
   revenge / off-plan / early entry / late entry. The `/performance` page renders
   stat cards, per-strategy table, mistake tags, and SVG visual reports (equity
   curve, rolling win rate, R-distribution histogram, drawdown, time-of-day,
   day-of-week, calendar heatmap) with an honest empty state when n===0.

P6-4. **Strategy library** (`lib/strategyLibrary.ts`, extended `/strategies`).
   `STRATEGY_DOCS` keyed by the 8 engine REGISTRY names: description, works/fails,
   entry steps, stop logic, targets, R:R, timeframes, time-of-day, an annotated
   WIN and an annotated FAILURE example, common mistakes, variations, and an
   optional teaching diagram (reuses the education `Diagrams`). Shown as an
   expandable playbook alongside the live backtest stats already on the page.

P6-5. **Strategy testing framework + custom builder** (`/strategy-lab`, backend
   `api/customstrats.py`). Two tabs. **Test & review:** pick a strategy → its
   setup conditions (from the playbook) → a forced 6-item pre-trade checklist
   ("if you can't tick every box, pass") → a post-trade review template that saves
   to journal notes → a per-strategy dashboard combining the built-in backtest
   stats with the user's own journaled `by_strategy` stats. **Custom builder:**
   define/save/edit/delete a `CustomStrategy` (name, family, description,
   conditions[], entry trigger, stop logic, target R:R, sizing, timeframes, notes)
   in a `custom_strategies` table (upsert by name). Custom strategies are traded
   manually and tracked by tagging journaled paper trades with the strategy name —
   no auto-execution.

P6-6. **Scenario library** (`/scenarios`, `lib/quizzes.ts` `SCENARIOS`) — 6
   "what do you do?" cards scored with best-answer + explanation, via the reusable
   `MCQuiz` component (localStorage attempt/score tracking + weakest-pattern recap).

P6-7. **Journaling extended** (`/journal`). Added a session-review form
   (mood, confidence 1–10, goals, notes → `add_session` / `sessions` table), an
   auto weekly-review table (ISO-week buckets: trades, win%, expectancy, Δ vs prev
   week, best strategy, repeated mistake), full performance stat cards, by-strategy
   panel, mistake-tag chips, and a session log. The TradePanel close flow now
   captures an emotion + multi-select mistake tags that flow through `closePaper` →
   `logPaperTrade` into the trade row.

P6-8. **Progression** (`/progress`). Five levels Beginner→Expert with concrete,
   data-driven unlock requirements pulled from real signals — journaled trades +
   expectancy + sessions (journal), training decisions + accuracy (decision stats),
   and scenario/psychology answers (localStorage). No fake unlocks.

P6-9. **Market context** (`/context`, backend `api/context.py`). A pre-session read:
   session + next event, prior-day high/low/close, overnight range/move, key levels
   (PDH/PDL/OR-high/OR-low/VWAP), and a transparent bias with reasons + an
   invalidation level. Clearly labeled synthetic / illustrative, not a forecast.

P6-10. **Anti-pattern education** (`/anti-patterns`, `lib/antipatterns.ts`). 8
   traps (false breakouts, bull/bear traps, dead-cat bounce, low-volume drift, news
   spike, etc.) each with looks-like / why-it's-tempting / why-it-fails / how-to-spot
   / what-to-do-instead, with optional teaching diagrams.

P6-11. **Custom strategy builder** — see P6-5 (same `/strategy-lab` surface +
   `api/customstrats.py`).

P6-12. **Psychology module** (`/psychology`, `lib/quizzes.ts` `PSYCHOLOGY`) — 6
   interactive bias scenarios (tilt, FOMO, loss acceptance, patience, overtrading,
   revenge) via `MCQuiz`: multiple choice, scored with a best answer + explanation,
   tracked per-tag in localStorage with a weakest-areas recap.

P6-13. **Navigation.** `NavTabs` reorganized — Practice/Backtest/Real Chart stay as
   flat primary tabs; the ~16 reference/learning routes are grouped into three
   click-to-open dropdowns (Train / Learn / Track) with outside-click + route-change
   close, so all 19 routes are reachable without crowding the bar. The Learn modal
   button is unchanged.

P6-14. **New REST endpoints** (`api/routes.py`): `POST /journal/session`,
   `GET /decision/new`, `POST /decision/score`, `GET /decision/stats`,
   `DELETE /decision`, `GET /context`, `GET|POST /custom-strategies`,
   `DELETE /custom-strategies/{name}`. All backend modules smoke-tested; both
   `python -m backend.run_backtest --verify` and `npm run build` pass.

## Pass 7 — deployment (single-service, one permanent URL)

Goal: open the app from any device at a permanent URL with the simplest deploy
that works. The frontend is 100% client components (no API routes, no
`next/image`, no server-only APIs, no `useSearchParams`), so it can be a **static
export** — which means the FastAPI backend can serve it directly.

P7-1. **Single service, not two.** Chose static-export + same-origin over a
   two-service Render Blueprint. `next.config.mjs` gains `output: "export"` +
   `images.unoptimized`, emitting `frontend/out`. FastAPI serves it via a
   catch-all `GET /{full_path:path}` registered LAST (so every API/WS/system
   route wins): it returns the exact asset, else `<route>.html`, else
   `<route>/index.html`, else the app shell / `404.html`. Result: one URL, no
   CORS, no Node at runtime. The catch-all is guarded by `FRONTEND_OUT.is_dir()`
   so local dev (no `out/`) stays API-only with `next dev` on :3000.

P7-2. **Same-origin URLs in production.** `apiBaseUrl()` and `ws.ts` now resolve
   in three tiers: explicit `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` override
   → dev localhost:8000 → production same-origin. In prod REST is relative
   (`/api/...`) and the WS URL is derived from `window.location`
   (`wss://<host>/api/simulation/stream` on HTTPS), so TLS is automatic and there
   is no hard-coded localhost. `window` is only touched at connect-time (browser),
   safe under static prerender.

P7-3. **Docker, because Python+Node can't share a Render native runtime.** A
   multi-stage [`Dockerfile`](./Dockerfile): stage 1 `node:20-bookworm-slim`
   runs `npm ci` (deterministic, from the committed root `package-lock.json`
   workspace) + `next build`; stage 2 `python:3.12-slim-bookworm` installs
   `backend/requirements.txt`, copies `backend/` and the built `frontend/out`,
   and runs `uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}`.
   Versions are pinned by the base images. Verified: `docker build` succeeds and
   the container binds `0.0.0.0:$PORT`, serves `/`, deep routes, `_next` assets
   (correct MIME types) and the API — and boots gracefully with **no** key
   (`assistant_status: missing_key`, rule-based fallback).

P7-4. **Secrets stay out of the repo.** `.gitignore` now ignores `.env` /
   `.env.*` (kept `.env.example`) and `frontend/out`; confirmed `.env` is
   untracked and `git check-ignore .env` passes. `.dockerignore` excludes `.env*`,
   `.venv`, `node_modules`, `output`, `.git` (but intentionally KEEPS markdown —
   `backend/EDUCATION.md` is read at runtime). `ANTHROPIC_API_KEY` is read only
   from `os.environ`; `load_dotenv` no-ops in the container (no `.env`), so the
   Render-set host secret is used and never logged.

P7-5. **CORS configurable but unused single-service.** `settings.cors_origins`
   gets a `_default_cors_origins()` that appends any `FRONTEND_ORIGIN` (bare env
   var, comma-separated, trailing slash stripped) to the localhost defaults.
   Same-origin single-service never exercises CORS; the var only matters for a
   split deploy.

P7-6. **Render Blueprint** [`render.yaml`](./render.yaml): one `type: web`,
   `runtime: docker`, `plan: free`, `healthCheckPath: /healthz`,
   `autoDeploy: true`, `ANTHROPIC_API_KEY` declared `sync: false` (set in
   dashboard). `PORT` is left to Render. [`DEPLOY.md`](./DEPLOY.md) has the exact
   click-by-click steps, the env-var table, and notes on free-tier cold starts +
   ephemeral SQLite (memory auto-repopulates; journal resets on redeploy).

P7-7. **Gates stay green:** `python -m backend.run_backtest --verify` remains
   DETERMINISTIC (32 runs reproducible in- and cross-process), `npm run build`
   passes and emits the static export, and `pytest` is 12/12.

## Pass 8 — animated pattern demos in the glossary (proof of concept)

Added small auto-drawing chart "clips" to glossary terms that have a visual
price-action shape. Scoped to exactly 3 terms — Fair Value Gap, Order Block,
Liquidity Sweep / Stop Hunt — as a proof of concept; the other terms are
untouched. Not video, not embeds: each clip renders from a tiny hand-authored
OHLC array using the same `lightweight-charts` setup as the rest of the app.

P8-1. **Reusable component** [`components/PatternDemo.tsx`](./frontend/components/PatternDemo.tsx).
   `<PatternDemo bars zones marks height? durationMs? />` draws the candles
   left-to-right over ~1.5s (`setData(slice)` on a timer), then reveals the
   highlight zone(s) + markers and holds the finished shape. The y-axis is
   locked via `autoscaleInfoProvider` and the x-axis via a fixed
   `setVisibleLogicalRange`, so candles don't rescale/jitter while drawing
   (textbook-clean). Same colors/grid/style as `ConceptChart`/`DrillChart`.
   Built to be reused for more terms and the strategy library — just pass new
   data. No new deps (reuses lightweight-charts 4.2.3).

P8-2. **Replay over infinite loop.** The clip auto-plays once on expand and then
   holds the completed pattern with a "↻ Replay" button. Chosen over a
   continuous loop so the finished textbook shape stays on screen to study and
   isn't visually noisy in the grid (the brief says "loops OR offers a replay
   button").

P8-3. **Hand-authored data** [`lib/patternDemos.ts`](./frontend/lib/patternDemos.ts),
   keyed by the exact glossary term string (decoupled from `glossary.ts`, which
   stays pure text and untouched). Each is ~10 candles with a zone + 1–2 markers
   highlighting the key part: FVG → the gap zone + retest; OB → the order-block
   candle + mitigation; Sweep → the swept liquidity line + sweep wick + reversal.
   Invariants asserted in CI-style check (all pass): FVG candle1.high <
   candle3.low and the retest dips into the gap; OB marker is the last down
   candle before a larger up impulse and the zone equals its range; the sweep
   wick pokes above the level, closes back below, then reverses down.

P8-4. **Collapsed by default.** A `GlossaryDemo` toggle ("Show example ▸") sits
   below the Example line in the card; expanding renders the demo and plays it.
   The grid stays clean. `PatternDemo` is `dynamic(..., { ssr:false })` so the
   chart lib is a separate chunk loaded only when a demo is opened.

P8-5. **Labeled as teaching.** Every clip shows
   "Illustration — idealized example, not real market data." plus a one-line
   caption of what to watch. It's a diagram, not a prediction.

P8-6. **Verified (no browser needed):** `npm run build` passes and the static
   export contains the toggle for exactly the 3 terms; the page serves 200 +
   styled and the live WebSocket stream produces frames; the 9 pattern-data
   invariants hold; `--verify` stays DETERMINISTIC (32 runs). Final visual
   confirmation of the animation is a browser open of `/glossary` → expand one
   of the 3 terms.
