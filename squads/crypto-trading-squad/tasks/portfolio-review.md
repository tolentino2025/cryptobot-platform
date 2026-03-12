# Task: portfolio-review

**Agent:** portfolio-manager-agent (Nexus)
**Trigger:** Every loop cycle (always runs) + on execution_report receipt
**Output:** `portfolio_status`

---

## Execution Steps

### Step 1 — Sync with Exchange
- Pull all open positions from configured exchanges
- Pull current prices for all open pairs
- Pull account balances (USDT, per-asset)
- Reconcile with internal position records
- Flag any discrepancies for review

### Step 2 — Update Position PnL
For each open position:
```
unrealized_pnl = (current_price - entry_price) * position_size_units
  (adjusted for direction: negative for shorts when price rises)

unrealized_pnl_pct = unrealized_pnl / position_size_usdt * 100
```

### Step 3 — Calculate Exposure
```
total_exposure_usdt = sum(position_size_usdt for all open positions)
total_exposure_pct = total_exposure_usdt / total_capital * 100
long_exposure_pct = sum of long positions / total_capital * 100
short_exposure_pct = sum of short positions / total_capital * 100

by_asset = group positions by base asset, sum notional
```

### Step 4 — Update PnL Ledger
```
realized_pnl_today += any closed positions PnL (net of fees)
fees_today += execution fees from new executions
net_pnl_today = realized_pnl_today - fees_today
```

### Step 5 — Drawdown Check
```
IF total_capital > peak_capital:
  peak_capital = total_capital  # New high water mark

current_drawdown_pct = (peak_capital - total_capital) / peak_capital * 100

IF current_drawdown_pct > max_drawdown_pct:
  max_drawdown_pct = current_drawdown_pct
```

### Step 6 — Alert Generation
```
alerts = []

IF current_drawdown_pct >= 10%:
  alerts.append(CRITICAL: "Drawdown circuit breaker triggered")
  → Signal risk-manager-agent: HALT ALL TRADING

IF current_drawdown_pct >= 5%:
  alerts.append(WARNING: "Drawdown warning — position sizes reduced")
  → Signal risk-manager-agent: reduce sizes

IF total_exposure_pct > 28%:
  alerts.append(WARNING: "Exposure approaching limit")
  → Signal risk-manager-agent: tighten controls

IF daily_loss_pct >= 3%:
  alerts.append(CRITICAL: "Daily loss limit reached")
  → Signal risk-manager-agent: halt for today
```

### Step 7 — Rebalancing Actions
```
IF volatility_classification == "extreme":
  → Close all positions below 50% of TP1
  → Log rebalance actions

IF single_asset_exposure > 15%:
  → Alert risk-manager: block new trades in this asset
```

### Step 8 — Generate Portfolio Status
Produce `portfolio_status` snapshot.
Log to `logs/portfolio/YYYY-MM-DD-HH-MM.json`.
Send to `risk-manager-agent` (for next cycle's risk calculations).
Send to `performance-analyst-agent` (for PnL tracking).
