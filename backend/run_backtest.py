"""Run the full deterministic backtest sweep.

    python -m backend.run_backtest                 # default sweep
    python -m backend.run_backtest --days 150 --timeframes 5m 15m --seed 42
    python -m backend.run_backtest --verify         # prove determinism (2 runs match)

Outputs (in ./output):
    results.json     - every run's metrics + Monte Carlo + trades (for the UI)
    dashboard.html   - self-contained visual report (open in a browser)
    trading_memory.db- SQLite 'AI memory' of all runs
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pandas as pd

from backend.data.generator import generate_ohlcv, news_bars, resample_ohlcv
from backend.engine import metrics as metrics_mod
from backend.engine.simulation import Backtester
from backend.engine.strategies import REGISTRY, all_strategies
from backend.engine.types import INSTRUMENTS
from backend.memory.store import MemoryStore

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "output"
DASHBOARD_ASSET = "MNQ"
DASHBOARD_TF = "15m"


def run_sweep(days: int, timeframes: list[str], seed: int, persist: bool = True) -> list[dict[str, Any]]:
    OUTPUT_DIR.mkdir(exist_ok=True)
    store = MemoryStore(str(OUTPUT_DIR / "trading_memory.db")) if persist else None

    results: list[dict[str, Any]] = []
    dashboard_payload: dict[str, Any] | None = None

    for symbol, inst in INSTRUMENTS.items():
        df_1m = generate_ohlcv(inst, days=days, seed=seed)
        for tf in timeframes:
            df = resample_ohlcv(df_1m, tf)
            nb = news_bars(df, seed)
            bt = Backtester(inst, seed=seed, news_bars=nb)
            for strat in all_strategies():
                res = bt.run(strat, df, tf)
                mc = metrics_mod.monte_carlo(res.trades, n_runs=1000, seed=seed)
                if store:
                    store.save_run(res, mc)
                entry = {
                    "strategy": strat,
                    "label": REGISTRY[strat][1].label,
                    "family": REGISTRY[strat][1].family,
                    "best_regime": REGISTRY[strat][1].best_regime,
                    "symbol": symbol,
                    "timeframe": tf,
                    "seed": seed,
                    "metrics": res.metrics,
                    "monte_carlo": mc,
                    "state_transitions": res.state_transitions,
                }
                results.append(entry)
                m = res.metrics
                print(f"{symbol:4s} {tf:3s} {strat:18s} "
                      f"n={m['n_trades']:4d} wr={_fmt(m['win_rate'])} "
                      f"pf={_fmt(m['profit_factor'])} exp={_fmt(m['expectancy_r'])}R "
                      f"ddR={m['max_drawdown_r']:6.2f} dd%={_pct(m['max_drawdown_pct'])} "
                      f"mc_p95={_pct(mc['p95_dd_pct'])} promote={mc['promote']}")

            if symbol == DASHBOARD_ASSET and tf == DASHBOARD_TF:
                dashboard_payload = _build_dashboard_payload(df, symbol, tf, results, store)

    with open(OUTPUT_DIR / "results.json", "w") as f:
        json.dump({"days": days, "seed": seed, "timeframes": timeframes,
                   "runs": results}, f, indent=2)

    if dashboard_payload is not None:
        _write_dashboard(dashboard_payload)

    if store:
        _print_leaderboard(store)
        store.close()

    return results


def _fmt(v: float | None) -> str:
    return f"{v:5.2f}" if isinstance(v, (int, float)) else " n/a "


def _pct(v: float | None) -> str:
    return f"{v*100:5.1f}%" if isinstance(v, (int, float)) else " n/a "


def _print_leaderboard(store: MemoryStore) -> None:
    print("\n=== LEADERBOARD (by expectancy R, n>=100 only) ===")
    rows = [r for r in store.leaderboard() if (r["n_trades"] or 0) >= 100]
    for r in rows[:15]:
        print(f"{r['symbol']:4s} {r['timeframe']:3s} {r['strategy']:18s} "
              f"exp={_fmt(r['expectancy_r'])}R pf={_fmt(r['profit_factor'])} "
              f"wr={_pct(r['win_rate'])} n={r['n_trades']:4d} promote={bool(r['mc_promote'])}")
    if not rows:
        print("(no strategy reached the n>=100 sample gate at these settings)")


def _build_dashboard_payload(df: pd.DataFrame, symbol: str, tf: str,
                             results: list[dict[str, Any]], store: MemoryStore | None) -> dict[str, Any]:
    ohlc = [{"time": int(ts.timestamp()), "open": float(r.open), "high": float(r.high),
             "low": float(r.low), "close": float(r.close)}
            for ts, r in df.iterrows()]
    trades_by_strat = {}
    if store:
        for run in store.leaderboard(symbol=symbol, timeframe=tf):
            rid = run["id"]
            ts = store.conn.execute(
                "SELECT * FROM trades WHERE run_id=? ORDER BY entry_time", (rid,)).fetchall()
            trades_by_strat[run["strategy"]] = [dict(t) for t in ts]
    runs_here = [r for r in results if r["symbol"] == symbol and r["timeframe"] == tf]
    return {"symbol": symbol, "timeframe": tf, "ohlc": ohlc,
            "trades_by_strat": trades_by_strat, "runs": runs_here,
            "leaderboard": [r for r in results]}


def verify_determinism(days: int, timeframes: list[str], seed: int) -> None:
    """Prove determinism two ways:
    1. In-process: run the sweep twice in this interpreter.
    2. Cross-process: run a second sweep in a *fresh* subprocess forced to use a
       different PYTHONHASHSEED. This is what actually catches bugs where a
       builtin hash() of a string leaks per-process randomness into results.
    """
    print("Running twice in-process to verify determinism...")
    a = run_sweep(days, timeframes, seed, persist=False)
    b = run_sweep(days, timeframes, seed, persist=False)
    ka = {(r["symbol"], r["timeframe"], r["strategy"]): r["metrics"] for r in a}
    kb = {(r["symbol"], r["timeframe"], r["strategy"]): r["metrics"] for r in b}
    mismatches = [k for k in ka if json.dumps(ka[k], sort_keys=True) != json.dumps(kb[k], sort_keys=True)]
    if mismatches:
        print(f"NON-DETERMINISTIC (in-process): {len(mismatches)} mismatches e.g. {mismatches[:3]}")
        raise SystemExit(1)
    print(f"  in-process: all {len(ka)} runs identical.")

    print("Running once more in a fresh subprocess (PYTHONHASHSEED=1) ...")
    env = dict(os.environ, PYTHONHASHSEED="1")
    code = (
        "import json,sys;"
        "from backend.run_backtest import run_sweep;"
        f"rows=run_sweep({days},{timeframes!r},{seed},persist=False);"
        "print('@@@'+json.dumps([{'k':[r['symbol'],r['timeframe'],r['strategy']],"
        "'m':r['metrics']} for r in rows], sort_keys=True))"
    )
    res = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True,
                         env=env, cwd=str(Path(__file__).resolve().parents[1]))
    if res.returncode != 0:
        print("subprocess failed:\n", res.stderr[-2000:])
        raise SystemExit(1)
    line = [ln for ln in res.stdout.splitlines() if ln.startswith("@@@")][-1][3:]
    cross = {tuple(d["k"]): d["m"] for d in json.loads(line)}
    xmis = [k for k in ka if json.dumps(ka[k], sort_keys=True) != json.dumps(cross.get(k), sort_keys=True)]
    if xmis:
        print(f"NON-DETERMINISTIC (cross-process): {len(xmis)} mismatches e.g. {xmis[:3]}")
        raise SystemExit(1)
    print(f"  cross-process (different hash seed): all {len(ka)} runs identical.")
    print(f"DETERMINISTIC: {len(ka)} runs reproducible in-process AND across processes.")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--days", type=int, default=150)
    p.add_argument("--timeframes", nargs="+", default=["5m", "15m"])
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--verify", action="store_true")
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args()
    logging.basicConfig(level=logging.WARNING if args.quiet else logging.ERROR,
                        format="%(levelname)s %(name)s %(message)s")
    if args.verify:
        verify_determinism(args.days, args.timeframes, args.seed)
    else:
        run_sweep(args.days, args.timeframes, args.seed)
        print(f"\nWrote {OUTPUT_DIR/'results.json'} and {OUTPUT_DIR/'dashboard.html'}")


# ---------------------------------------------------------------------------
# Self-contained dashboard (embedded data; opens with no server)
# ---------------------------------------------------------------------------
def _write_dashboard(payload: dict[str, Any]) -> None:
    html = _DASHBOARD_TEMPLATE.replace("__PAYLOAD__", json.dumps(payload))
    (OUTPUT_DIR / "dashboard.html").write_text(html, encoding="utf-8")


_DASHBOARD_TEMPLATE = r"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Confluence Engine — Backtest Report</title>
<script src="https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js"></script>
<style>
  :root{--bg:#0B0F19;--panel:#1A1F2E;--line:#27304a;--ink:#E7ECF5;--mut:#8A93A8;
        --g:#00E676;--r:#FF1744;--y:#FFD600;--mono:ui-monospace,"SF Mono",Menlo,monospace}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);
    font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  header{padding:18px 22px;border-bottom:1px solid var(--line);display:flex;
    align-items:baseline;gap:16px;flex-wrap:wrap}
  header h1{font-size:15px;letter-spacing:.14em;text-transform:uppercase;margin:0;font-weight:700}
  header .tag{font-family:var(--mono);font-size:11px;color:var(--mut)}
  .warn{margin:0 22px;margin-top:14px;padding:10px 14px;border:1px solid #3a2a00;
    background:#181400;color:var(--y);font-size:12px;border-radius:8px;font-family:var(--mono)}
  .wrap{display:grid;grid-template-columns:1fr 360px;gap:16px;padding:16px 22px}
  @media(max-width:900px){.wrap{grid-template-columns:1fr}}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px}
  .card h2{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);
    margin:0 0 10px}
  #chart{height:380px;width:100%}
  select{background:#0e1426;color:var(--ink);border:1px solid var(--line);border-radius:8px;
    padding:7px 10px;font-family:var(--mono);font-size:12px}
  .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
  .metric{background:#0e1426;border:1px solid var(--line);border-radius:10px;padding:10px}
  .metric .k{font-size:10px;color:var(--mut);text-transform:uppercase;letter-spacing:.08em}
  .metric .v{font-family:var(--mono);font-size:18px;margin-top:4px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{text-align:right;padding:7px 8px;border-bottom:1px solid var(--line);font-family:var(--mono)}
  th:first-child,td:first-child{text-align:left}
  th{color:var(--mut);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.06em;cursor:pointer}
  tr.sel{background:#13243f} tbody tr:hover{background:#11182c;cursor:pointer}
  .pos{color:var(--g)} .neg{color:var(--r)}
  .pill{display:inline-block;padding:1px 7px;border-radius:999px;font-size:10px;border:1px solid var(--line)}
  .promote{color:var(--g);border-color:#0c3} .reject{color:var(--r);border-color:#511}
  .legend{display:flex;gap:14px;font-size:11px;color:var(--mut);font-family:var(--mono);margin-top:8px}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle}
  svg{width:100%;height:120px;display:block}
  .sub{font-size:10px;color:var(--mut);font-family:var(--mono);margin-top:6px}
</style></head>
<body>
<header>
  <h1>Confluence Engine</h1>
  <span class="tag" id="ctx"></span>
</header>
<div class="warn">Synthetic data. These numbers validate engine logic, not a real edge. Use real OHLCV + forward testing + the n&ge;100 and Monte-Carlo &lt;15% gates before trusting any strategy.</div>
<div class="wrap">
  <div>
    <div class="card">
      <h2>Price &amp; signals — <span id="stratName"></span></h2>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px">
        <select id="strat"></select>
        <span class="sub" id="regimeNote"></span>
      </div>
      <div id="chart"></div>
      <div class="legend">
        <span><span class="dot" style="background:var(--g)"></span>long entry</span>
        <span><span class="dot" style="background:var(--r)"></span>short entry</span>
        <span><span class="dot" style="background:var(--y)"></span>exit</span>
      </div>
      <div class="metrics" id="metrics"></div>
    </div>
    <div class="card" style="margin-top:16px">
      <h2>Equity curve (R, selected strategy)</h2>
      <svg id="equity" viewBox="0 0 600 120" preserveAspectRatio="none"></svg>
      <div class="sub" id="equityNote"></div>
    </div>
  </div>
  <div class="card">
    <h2>Strategy leaderboard</h2>
    <table id="lb"><thead><tr>
      <th data-k="strategy">strategy</th><th data-k="symbol">sym</th><th data-k="timeframe">tf</th>
      <th data-k="expectancy_r">exp R</th><th data-k="profit_factor">PF</th>
      <th data-k="win_rate">win%</th><th data-k="n_trades">n</th><th data-k="promote">gate</th>
    </tr></thead><tbody></tbody></table>
    <div class="sub">Click a row (matching this asset/tf) to load it on the chart. Sorted by expectancy; gate = Monte-Carlo &lt;15% &amp; n&ge;100.</div>
  </div>
</div>
<script>
const DATA = __PAYLOAD__;
const fmt=(v,d=2)=>typeof v==="number"?v.toFixed(d):"n/a";
const pct=(v)=>typeof v==="number"?(v*100).toFixed(1)+"%":"n/a";

// chart
const chart=LightweightCharts.createChart(document.getElementById("chart"),{
  layout:{background:{color:"transparent"},textColor:"#8A93A8"},
  grid:{vertLines:{color:"#1c2740"},horzLines:{color:"#1c2740"}},
  rightPriceScale:{borderColor:"#27304a"},timeScale:{borderColor:"#27304a",timeVisible:true},
  crosshair:{mode:0}});
const candle=chart.addCandlestickSeries({upColor:"#00E676",downColor:"#FF1744",
  borderUpColor:"#00E676",borderDownColor:"#FF1744",wickUpColor:"#00E676",wickDownColor:"#FF1744"});
candle.setData(DATA.ohlc);

function runFor(strat){
  return DATA.runs.find(r=>r.strategy===strat) || null;
}
function tradesFor(strat){ return DATA.trades_by_strat[strat]||[]; }

function setStrategy(strat){
  document.getElementById("stratName").textContent=strat;
  document.getElementById("regimeNote").textContent="";
  const run=runFor(strat);
  // markers
  const tr=tradesFor(strat);
  const markers=[];
  tr.forEach(t=>{
    const dir=t.direction>0?"long":"short";
    markers.push({time:Math.floor(new Date(t.entry_time).getTime()/1000),
      position:t.direction>0?"belowBar":"aboveBar",
      color:t.direction>0?"#00E676":"#FF1744",
      shape:t.direction>0?"arrowUp":"arrowDown",text:dir});
    markers.push({time:Math.floor(new Date(t.exit_time).getTime()/1000),
      position:"inBar",color:"#FFD600",shape:"circle"});
  });
  markers.sort((a,b)=>a.time-b.time);
  candle.setMarkers(markers);
  if(run){
    const m=run.metrics, mc=run.monte_carlo;
    document.getElementById("regimeNote").textContent=
      "best regime: "+run.best_regime+" · family: "+run.family;
    const cards=[["trades",m.n_trades],["win rate",pct(m.win_rate)],
      ["expectancy",fmt(m.expectancy_r)+" R"],["profit factor",fmt(m.profit_factor)],
      ["max DD",pct(m.max_drawdown_pct)],["sharpe",fmt(m.sharpe)],
      ["MC p95 DD",pct(mc.p95_dd_pct)],["runs<15%",pct(mc.pct_runs_under_15pct)],
      ["sample",m.sufficient_sample?"ok (n≥100)":"thin (<100)"]];
    document.getElementById("metrics").innerHTML=cards.map(([k,v])=>{
      let cls=""; if(k==="expectancy"||k==="profit factor"){const num=parseFloat(v);
        cls=(k==="expectancy"?num>0:num>1)?"pos":"neg";}
      return `<div class="metric"><div class="k">${k}</div><div class="v ${cls}">${v}</div></div>`;
    }).join("");
    drawEquity(m.equity_curve_r||[0]);
    document.getElementById("equityNote").textContent=
      `final ${fmt((m.equity_curve_r||[0]).slice(-1)[0])} R over ${m.n_trades} trades · net $${fmt(m.net_pnl_dollars)}`;
  }
}

function drawEquity(curve){
  const svg=document.getElementById("equity");svg.innerHTML="";
  const W=600,H=120,pad=6;
  const min=Math.min(0,...curve),max=Math.max(0.0001,...curve);
  const sx=i=>pad+(W-2*pad)*(curve.length<2?0:i/(curve.length-1));
  const sy=v=>H-pad-(H-2*pad)*((v-min)/(max-min));
  const zero=sy(0);
  svg.innerHTML+=`<line x1="0" y1="${zero}" x2="${W}" y2="${zero}" stroke="#27304a" stroke-dasharray="3 3"/>`;
  let d="M"+sx(0)+" "+sy(curve[0]);
  for(let i=1;i<curve.length;i++) d+=" L"+sx(i)+" "+sy(curve[i]);
  const up=curve[curve.length-1]>=0;
  svg.innerHTML+=`<path d="${d}" fill="none" stroke="${up?"#00E676":"#FF1744"}" stroke-width="1.6"/>`;
}

// selector
const sel=document.getElementById("strat");
DATA.runs.sort((a,b)=>(b.metrics.expectancy_r??-9)-(a.metrics.expectancy_r??-9));
DATA.runs.forEach(r=>{const o=document.createElement("option");o.value=r.strategy;
  o.textContent=r.label+"  ("+fmt(r.metrics.expectancy_r)+"R)";sel.appendChild(o);});
sel.onchange=()=>setStrategy(sel.value);
document.getElementById("ctx").textContent=
  DATA.symbol+" · "+DATA.timeframe+" · "+DATA.ohlc.length+" bars · leaderboard "+DATA.leaderboard.length+" runs";

// leaderboard
let lbData=DATA.leaderboard.slice();
function renderLB(key){
  if(key){lbData.sort((a,b)=>{
    const va=key==="promote"?(a.monte_carlo.promote?1:0):(key in a.metrics?a.metrics[key]:a[key]);
    const vb=key==="promote"?(b.monte_carlo.promote?1:0):(key in b.metrics?b.metrics[key]:b[key]);
    return (vb??-9)-(va??-9);});}
  const tb=document.querySelector("#lb tbody");tb.innerHTML="";
  lbData.forEach(r=>{
    const m=r.metrics;const tr=document.createElement("tr");
    const expCls=(m.expectancy_r??0)>0?"pos":"neg";
    const pfCls=(m.profit_factor??0)>1?"pos":"neg";
    tr.innerHTML=`<td>${r.strategy}</td><td>${r.symbol}</td><td>${r.timeframe}</td>
      <td class="${expCls}">${fmt(m.expectancy_r)}</td><td class="${pfCls}">${fmt(m.profit_factor)}</td>
      <td>${pct(m.win_rate)}</td><td>${m.n_trades}</td>
      <td><span class="pill ${r.monte_carlo.promote?"promote":"reject"}">${r.monte_carlo.promote?"pass":"hold"}</span></td>`;
    if(r.symbol===DATA.symbol&&r.timeframe===DATA.timeframe){
      tr.onclick=()=>{sel.value=r.strategy;setStrategy(r.strategy);};}
    tb.appendChild(tr);
  });
}
document.querySelectorAll("#lb th").forEach(th=>th.onclick=()=>renderLB(th.dataset.k));
renderLB("expectancy_r");
setStrategy(sel.value||DATA.runs[0].strategy);
chart.timeScale().fitContent();
</script></body></html>"""


if __name__ == "__main__":
    main()
