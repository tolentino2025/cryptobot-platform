# Task: technical-analysis

**Agent:** technical-analysis-agent (Atlas)
**Trigger:** Start of each trading loop cycle (parallel with market-scan)
**Output:** `technical_analysis_report[]` — one per monitored pair

---

## Execution Steps

### Step 1 — Load Price Data
For each pair in `monitored_pairs`:
- Fetch OHLCV data: `1D`, `4H`, `1H`, `15m` timeframes
- Fetch volume data for all timeframes
- Verify data completeness (no gaps)

### Step 2 — Determine Trend Structure (Top-Down)
**Daily (1D):**
- Identify swing highs/lows for last 20 candles
- Classify: `uptrend | downtrend | ranging`
- Note EMAs: 21, 50, 200

**4-Hour (4H):**
- Same structure analysis
- Identify EMA alignment

**1-Hour (1H):**
- Current structure for entry framing

**Output:** `trend.daily`, `trend.h4`, `trend.h1`, `overall_bias`

### Step 3 — Calculate Indicators

**RSI (14):**
- Calculate for 1D and 4H
- Check for bullish/bearish divergence
- Note if overbought (>70) or oversold (<30)

**MACD (12/26/9):**
- Calculate histogram for 4H
- Determine signal: `bullish | bearish | neutral`
- Note histogram trend (expanding/contracting)

**Moving Averages:**
- EMA 21, 50, 200 for all timeframes
- Determine EMA stack alignment

**ATR (14):**
- Calculate ATR for 1H (for stop sizing)
- Note if expanding (momentum) or contracting (consolidation)

**Volume Profile:**
- Calculate POC, VAH, VAL for last 20 sessions
- Identify high/low volume nodes near current price

### Step 4 — Map Key Levels
- Identify 2 nearest resistance levels above current price
- Identify 2 nearest support levels below current price
- Mark major S/R (from monthly/weekly pivots)
- Add Fibonacci retracements of last major swing

### Step 5 — Detect Chart Patterns
Scan for active patterns in 4H and 1H:
- Continuation: flags, pennants, triangles, wedges
- Reversal: H&S, double top/bottom, engulfing
- Note timeframe and directional implication

### Step 6 — Determine Trade Bias
```
IF daily_trend == h4_trend == h1_trend:
  analysis_quality = "high"
ELSE IF 2 of 3 align:
  analysis_quality = "medium"
ELSE:
  analysis_quality = "low"

trade_bias = direction that majority of signals support
invalidation_level = most recent swing point against trade_bias
```

### Step 7 — Generate Report
Produce `technical_analysis_report` for each pair.
Log to `logs/technical-analysis/YYYY-MM-DD-HH-MM-{pair}.json`.

### Step 8 — Broadcast
Send all `technical_analysis_reports[]` to `strategy-agent` input queue.
