# Task: generate-trade-setup

**Agent:** strategy-agent (Vega)
**Trigger:** After receiving both `market_intelligence_report` and `technical_analysis_reports[]`
**Output:** `trade_proposals[]`

---

## Pre-Conditions
- `market_intelligence_report.trading_allowed == true`
- At least one `technical_analysis_report` with `analysis_quality != "low"`

---

## Execution Steps

### Step 1 — Macro Alignment Check
For each pair's technical_analysis_report:
```
macro_bias = market_intelligence_report.macro_bias
tech_bias = technical_analysis_report.trade_bias

IF macro_bias == "bullish" AND tech_bias == "long":
  direction_aligned = true, direction = "LONG"
ELSE IF macro_bias == "bearish" AND tech_bias == "short":
  direction_aligned = true, direction = "SHORT"
ELSE IF macro_bias == "neutral":
  direction_aligned = true (neutral allows both)
  direction = tech_bias
ELSE:
  direction_aligned = false
  → Skip this pair (macro conflicts with technical)
```

### Step 2 — Entry Condition Validation
For aligned pairs, verify entry conditions exist:
- Price at key support/resistance level? ✓/✗
- Confirmation candle present on 1H? ✓/✗
- Volume expansion on move? ✓/✗
- RSI not overbought/oversold at entry? ✓/✗

Skip pair if fewer than 2 entry conditions confirmed.

### Step 3 — Define Trade Parameters
For each valid pair:
```
entry_zone.ideal = current_price (or limit level at key zone)
entry_zone.range = ±0.3% of ideal entry

stop_loss = invalidation_level from technical_analysis_report
  (or 1.5x ATR below entry for longs / above for shorts)

tp1 = nearest resistance (longs) or support (shorts)
tp2 = next major level
tp3 = next significant structure level

rr_ratio = (tp1 - entry) / (entry - stop_loss) for longs
         = (entry - tp1) / (stop_loss - entry) for shorts
```

### Step 4 — Determine Trade Type
```
IF holding_period_estimate < 4 hours:
  trade_type = "scalping"
ELSE IF holding_period_estimate < 24 hours:
  trade_type = "intraday"
ELSE:
  trade_type = "swing"
```

### Step 5 — Score Confidence
Calculate confidence_score by summing factor scores:

| Factor | Score |
|---|---|
| macro_alignment confirmed | +20 |
| all 3 timeframes aligned | +25 (or +15 if 2 of 3) |
| MACD bullish/bearish signal | +10 |
| RSI momentum supports | +10 |
| Entry at high-confluence level (2+ confirmations) | +20 |
| Chart pattern confirmed | +15 |

**Total: 0-100**

### Step 6 — Filter by Thresholds
```
IF rr_ratio < trade_type.min_rr:
  DISCARD — insufficient risk/reward

IF confidence_score < 70:
  DISCARD — below minimum confidence

IF confidence_score >= 70:
  status = "pending_risk_review"
  → Add to trade_proposals[]
```

### Step 7 — Build Proposal Objects
For each approved setup, generate `trade_proposal` with:
- Unique ID (UUID)
- All parameters defined above
- Thesis (2-3 sentence rationale)
- Invalidation condition (explicit price level)
- References to source reports

### Step 8 — Broadcast
Send `trade_proposals[]` to `risk-manager-agent`.
Log to `logs/proposals/YYYY-MM-DD-HH-MM.json`.
