# Task: market-scan

**Agent:** market-intelligence-agent (Sigma)
**Trigger:** Start of each trading loop cycle
**Output:** `market_intelligence_report`

---

## Execution Steps

### Step 1 — Fetch Sentiment Data
- Query Fear & Greed Index (Alternative.me API)
- Query social sentiment aggregator (LunarCrush or equivalent)
- Calculate composite `sentiment_score` (0-100)
- Map to `sentiment_label`

### Step 2 — Assess Market Volatility
- Pull 24h price change % for top 20 crypto assets
- Calculate BTC dominance delta (1h, 4h, 24h)
- Query funding rates on Binance/Bybit perpetuals
- Check open interest 1h change %
- Classify: `low | medium | high | extreme`

### Step 3 — Screen News Feed
- Pull latest 20 headlines from configured sources
- Score each item: `low | medium | high | critical` impact
- Flag any critical items for immediate halt evaluation

### Step 4 — Macro Signal Check
- Check DXY 1-day trend direction
- Note any scheduled macro events in next 4 hours (economic calendar)
- Calculate BTC/S&P 500 correlation coefficient (30-day)
- Determine `macro_bias`: `bullish | bearish | neutral`

### Step 5 — Liquidity Scan
- Check exchange BTC/ETH reserve changes (24h)
- Scan for whale transactions > $1M (on-chain)
- Check stablecoin supply ratio change

### Step 6 — Determine Trading Status
```
IF volatility_classification == "extreme":
  trading_allowed = false
  halt_reason = "Extreme volatility detected"
ELSE IF any critical_impact news in last 2 hours:
  trading_allowed = false
  halt_reason = "Critical market event — [description]"
ELSE IF portfolio drawdown >= 10%:
  trading_allowed = false
  halt_reason = "Drawdown circuit breaker triggered"
ELSE:
  trading_allowed = true
```

### Step 7 — Generate Report
Produce `market_intelligence_report` with all fields populated.
Log report to `logs/market-intelligence/YYYY-MM-DD-HH-MM.json`.

### Step 8 — Broadcast
Send `market_intelligence_report` to:
- `strategy-agent` input queue
- `risk-manager-agent` (volatility classification)
