# Task: validate-risk

**Agent:** risk-manager-agent (Bastion)
**Trigger:** Receipt of `trade_proposals[]` from strategy-agent
**Output:** `risk_decisions[]`

---

## Pre-Conditions
- Must have current `portfolio_status` from portfolio-manager-agent
- Must have current `market_intelligence_report`

---

## Execution Steps (per proposal)

### Step 1 — Drawdown Circuit Breaker Check
```
IF portfolio.drawdown_pct >= 10%:
  REJECT ALL — halt_reason = "Drawdown circuit breaker: {pct}%"
  STOP processing, notify user

IF portfolio.daily_loss_pct >= 3%:
  REJECT ALL — halt_reason = "Daily loss limit reached: {pct}%"
  STOP processing for remainder of day
```

### Step 2 — Volatility Gate
```
IF market_intelligence.volatility_classification == "extreme":
  REJECT ALL — reason = "Extreme volatility: trading suspended"
  STOP processing

IF market_intelligence.volatility_classification == "high":
  → Increase min_confidence_threshold to 80 for this cycle
  → Apply 30% position size reduction for this cycle
```

### Step 3 — Maximum Open Trades Check
```
IF portfolio.open_positions.count >= 5:
  REJECT — reason = "Maximum open trades reached (5)"
```

### Step 4 — Portfolio Exposure Check
```
current_exposure = portfolio.total_exposure_pct
proposal_notional = entry_price * proposed_position_size
new_exposure = current_exposure + (proposal_notional / total_capital * 100)

IF new_exposure > 30%:
  REJECT — reason = "Would exceed max portfolio exposure (30%)"
```

### Step 5 — Single Asset Concentration Check
```
existing_asset_exposure = portfolio.exposure_by_asset[proposal.pair.base]

IF existing_asset_exposure + new_exposure_for_asset > 15%:
  REJECT — reason = "Single asset concentration limit (15%)"
```

### Step 6 — Correlation Check
```
IF proposal.direction == "LONG":
  correlated_long_exposure = sum of all long positions in correlated_pairs
  IF correlated_long_exposure + new_position > 15%:
    REJECT — reason = "Correlated position concentration"
```

### Step 7 — Confidence & R/R Validation
```
IF proposal.confidence_score < 70 (or 80 in high volatility):
  REJECT — reason = "Confidence below threshold: {score}"

IF proposal.risk_reward_ratio < 2.0:
  REJECT — reason = "Insufficient R/R ratio: {ratio}"
```

### Step 8 — Calculate Position Size
If all checks pass:
```
account_capital = portfolio.total_capital_usdt
risk_amount = account_capital * 0.01  (1% max)
stop_distance = abs(proposal.entry - proposal.stop_loss)
raw_position_size = risk_amount / stop_distance

# Apply volatility reduction if high volatility
IF high_volatility: raw_position_size = raw_position_size * 0.70

# Apply losing streak reduction if active
IF losing_streak_3: raw_position_size = raw_position_size * 0.50

# Enforce exchange minimums/maximums
position_size = clamp(raw_position_size, exchange.min, exchange.max)

# Final risk verification
actual_risk = position_size * stop_distance
actual_risk_pct = actual_risk / account_capital * 100

ASSERT actual_risk_pct <= 1.0  # Hard cap, no exceptions
```

### Step 9 — Emit Decision
```
risk_decision = {
  trade_proposal_id: proposal.id,
  decision: "APPROVED",
  approved_position: { ...all parameters + position_size },
  risk_checks_passed: { ...all boolean results }
}
```

Log decision to `logs/risk-decisions/YYYY-MM-DD.json`.
Send to `execution-agent` if APPROVED.
Send rejection log to `strategy-agent` for learning.
