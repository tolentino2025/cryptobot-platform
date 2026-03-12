# Task: execute-trade

**Agent:** execution-agent (Pulse)
**Trigger:** Receipt of APPROVED `risk_decision` from risk-manager-agent
**Output:** `execution_report`

---

## Pre-Conditions
- `risk_decision.decision == "APPROVED"`
- Exchange API credentials configured and tested
- Account balance sufficient for approved position size

---

## Execution Steps

### Step 1 — Pre-Execution Validation
```
verify:
  - risk_decision.decision == "APPROVED"
  - current_price within 0.5% of risk_decision.entry_zone
  - account_balance >= position_size_usdt * 1.05 (5% buffer)
  - exchange API connectivity (ping test)

IF any check fails:
  → Log failure, DO NOT execute, notify portfolio-manager
```

### Step 2 — Place Entry Order
```
order_params = {
  symbol: pair,
  side: "BUY" (LONG) or "SELL" (SHORT),
  type: "LIMIT",
  price: risk_decision.approved_position.entry,
  quantity: risk_decision.approved_position.position_size_units,
  timeInForce: "GTC"
}

entry_order = exchange.place_order(order_params)
log(entry_order)

# Wait for fill (max 60 seconds)
fill_status = wait_for_fill(entry_order.id, timeout=60s)

IF not filled within 60s:
  IF current_price still within acceptable range:
    → Cancel limit, place MARKET order
  ELSE:
    → Cancel limit, abort execution
    → Log: "Entry window expired — price moved"
    → Notify strategy-agent: proposal invalidated
    STOP
```

### Step 3 — Place Stop-Loss (SIMULTANEOUS with fill confirmation)
```
CRITICAL: Stop-loss placed IMMEDIATELY after entry fill — no delay

stop_order = {
  symbol: pair,
  side: opposite of entry,
  type: "STOP_LOSS_LIMIT",
  stopPrice: risk_decision.approved_position.stop_loss,
  price: stop_loss * (1 - 0.002),  # 0.2% limit offset
  quantity: filled_quantity
}

stop_order_result = exchange.place_order(stop_order)
log(stop_order_result)
```

### Step 4 — Place TP1 Order
```
tp1_quantity = filled_quantity * 0.50  # 50% at TP1

tp1_order = {
  symbol: pair,
  side: opposite of entry,
  type: "LIMIT",
  price: risk_decision.approved_position.tp1,
  quantity: tp1_quantity
}

tp1_order_result = exchange.place_order(tp1_order)
log(tp1_order_result)
```

### Step 5 — Monitor for TP1 Fill
```
ON tp1_fill:
  → Cancel original stop-loss order
  → Place new stop-loss at entry price (breakeven)
  → Place TP2 order for next 30% of remaining position
  → Log: "TP1 hit, stop moved to breakeven"
  → Notify portfolio-manager-agent
```

### Step 6 — Monitor for TP2 Fill
```
ON tp2_fill:
  → Cancel TP2 limit order
  → Place TRAILING_STOP on remaining 20% position
  → Trail distance = 1.5x ATR from highest price
  → Log: "TP2 hit, trailing stop activated"
  → Notify portfolio-manager-agent
```

### Step 7 — Handle Stop Trigger
```
ON stop_loss_triggered:
  → Log: "Stop triggered at {price}"
  → Cancel all remaining take-profit orders
  → Generate exit_record with full PnL calculation
  → Send to portfolio-manager-agent
  → Send to performance-analyst-agent
```

### Step 8 — Generate Execution Report
Produce `execution_report` with all order IDs, fill prices, timestamps.
Calculate slippage: `(fill_price - target_price) / target_price * 100`
Log to `logs/executions/YYYY-MM-DD.json`.
Send to `portfolio-manager-agent`.

### Error Handling
```
ON any API error:
  → Log full error details
  → Retry ONCE after 5 seconds
  → If retry fails: HALT, notify user with full context
  → DO NOT retry indefinitely
  → DO NOT place partial orders and guess the rest
```
