# Task: performance-report

**Agent:** performance-analyst-agent (Oracle)
**Trigger:** Daily at 00:00 UTC / Weekly on Sundays / On-demand
**Output:** `performance_report`

---

## Execution Steps

### Step 1 — Load Trade History
```
period_trades = load_closed_trades(from=period_start, to=period_end)

IF len(period_trades) < 5:
  → Generate minimal report with note: "Insufficient data for statistical analysis"
  STOP full analysis

IF len(period_trades) < 30:
  → Generate report with caveat: "Sample size below 30 — metrics directional only"
```

### Step 2 — Calculate Core Metrics

**Win Rate:**
```
winning = count(trades where net_pnl > 0)
win_rate = winning / total_trades * 100
```

**Profit Factor:**
```
gross_profit = sum(pnl for winning trades)
gross_loss = abs(sum(pnl for losing trades))
profit_factor = gross_profit / gross_loss
```

**Expectancy:**
```
avg_win = gross_profit / winning_trades
avg_loss = gross_loss / losing_trades
loss_rate = 1 - win_rate / 100
expectancy = (win_rate/100 * avg_win) - (loss_rate * avg_loss)
```

**Sharpe Ratio (annualized):**
```
daily_returns = calculate_daily_pnl_pct_series(period)
mean_daily = mean(daily_returns)
std_daily = std(daily_returns)
sharpe = (mean_daily / std_daily) * sqrt(365)
```

**Sortino Ratio:**
```
downside_returns = [r for r in daily_returns if r < 0]
downside_std = std(downside_returns)
sortino = (mean_daily / downside_std) * sqrt(365)
```

**Max Drawdown:**
```
(from portfolio-manager-agent records)
max_drawdown_pct = portfolio.drawdown.max_pct
```

**Average R/R Achieved:**
```
avg_rr = mean((actual_exit - entry) / (entry - stop_loss) for winning trades)
```

### Step 3 — Breakdown by Trade Type
For each type in [scalping, intraday, swing]:
```
subset = trades where trade_type == type
calculate: trades_count, win_rate, net_pnl, profit_factor, avg_rr
```

### Step 4 — Market Attribution
Group trades by market condition at entry:
```
for condition in [macro_bias, volatility_classification, sentiment_label]:
  group trades by condition value
  calculate win_rate and avg_pnl per group
  identify best and worst performing conditions
```

### Step 5 — Drift Detection
```
trades_last_7d = filter trades from last 7 days (min 5)
trades_prior_30d = filter trades 7-37 days ago (min 10)

IF sufficient data:
  wr_7d = win_rate(trades_last_7d)
  wr_30d = win_rate(trades_prior_30d)

  IF wr_7d < wr_30d - 10:
    drift_detected = true
    drift_indicator = "Win rate declined 10%+ in last 7 days"

  pf_7d = profit_factor(trades_last_7d)
  IF pf_7d < 1.0:
    drift_detected = true
    drift_indicator = "Profit factor below 1.0 — losing money on average"
```

### Step 6 — Generate Optimization Recommendations
Based on attribution analysis:
```
top_conditions = top 3 market conditions by win_rate and PnL
worst_conditions = worst 3 conditions

recommendations = []
FOR each top condition:
  recommendations.append("Increase allocation during: {condition}")
FOR each worst condition:
  recommendations.append("Reduce/avoid trading during: {condition}")

# Add technical observations
IF avg_rr_achieved < 1.5:
  recommendations.append("Setup quality issue: average R/R below target — review entry discipline")
IF win_rate > 65% but PF < 1.5:
  recommendations.append("Letting losers run too long — review exit discipline")
```

### Step 7 — Generate Report
Build `performance_report` with all calculated fields.
Save to `logs/reports/YYYY-MM-DD-{daily|weekly}.json`.
Send summary to user (human-readable format).
Send optimization signals to `strategy-agent` and `risk-manager-agent`.

### Step 8 — Alert on Critical Thresholds
```
IF profit_factor < 1.0: ALERT "Losing money — strategy review required"
IF sharpe_ratio < 0.5: ALERT "Risk-adjusted returns deteriorating"
IF drift_detected AND severity == "critical": ALERT + halt trade type
```
