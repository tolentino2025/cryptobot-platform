# Crypto Trading Squad

**Version:** 1.0.0
**Domain:** Automated Cryptocurrency Trading
**Squad ID:** `crypto-trading-squad`

> "Capital preservation first. Consistent small gains compound into exceptional results."

---

## Overview

A professional multi-agent trading desk for automated cryptocurrency trading. The squad operates as a coordinated team — each agent with a specific, non-overlapping responsibility. No single agent has full autonomy over the entire pipeline. Every trade passes through a structured decision chain before reaching the exchange.

This is **not** a gambling system. It is a **professional trading desk architecture**.

---

## Agents

| Agent | Name | Tier | Role |
|---|---|---|---|
| 📡 `market-intelligence-agent` | Sigma | 0 | Macro conditions, sentiment, volatility |
| 📊 `technical-analysis-agent` | Atlas | 0 | Price action, indicators, S/R levels |
| 🎯 `strategy-agent` | Vega | 1 | Trade setup generation, confidence scoring |
| 🛡️ `risk-manager-agent` | Bastion | 1 | Position sizing, exposure control |
| ⚡ `execution-agent` | Pulse | 2 | Order placement, stop/TP management |
| 💼 `portfolio-manager-agent` | Nexus | 2 | Capital allocation, PnL tracking |
| 📈 `performance-analyst-agent` | Oracle | 3 | Metrics, drift detection, optimization |

---

## Trading Loop

```
[Phase 1 + 2 — PARALLEL]
    📡 Sigma: Market Intelligence Scan
    📊 Atlas: Technical Analysis (all pairs)
         ↓
[Phase 3]
    🎯 Vega: Generate Trade Setups
    (only if trading_allowed == true)
         ↓
[Phase 4]
    🛡️ Bastion: Risk Validation + Position Sizing
    (APPROVED or REJECTED — no bypass)
         ↓
[Phase 5]
    ⚡ Pulse: Trade Execution
    (only APPROVED orders reach the exchange)
         ↓
[Phase 6 — Always Runs]
    💼 Nexus: Portfolio Review + Rebalancing
         ↓
[Phase 7 — Daily/Weekly]
    📈 Oracle: Performance Analysis + Optimization
         ↓
    🔁 Repeat (every 15 minutes)
```

---

## Safety Rules

| Rule | Value |
|---|---|
| Max risk per trade | **1% of capital** |
| Max open trades | **5** |
| Max portfolio exposure | **30%** |
| Drawdown halt | **10%** |
| Daily loss halt | **3%** |
| Extreme volatility | **No trading** |
| Stop-loss placement | **Simultaneous with entry** |
| Decision logging | **Every decision, always** |

---

## Quick Start

### 1. Initialize
```bash
aiox @market-intelligence-agent
```

### 2. Run Full Trading Loop
```bash
aiox @market-intelligence-agent *scan
aiox @technical-analysis-agent *scan-all
aiox @strategy-agent *generate-setup
aiox @risk-manager-agent *review-queue
aiox @execution-agent *execute {approved-id}
aiox @portfolio-manager-agent *status
aiox @performance-analyst-agent *daily-report
```

### 3. Quick Status Check
```bash
aiox @portfolio-manager-agent *status
aiox @risk-manager-agent *drawdown-status
```

---

## Configuration

- **Risk parameters:** `data/risk-parameters.yaml`
- **Monitored pairs:** `data/monitored-pairs.yaml`
- **Workflow:** `workflows/trading-loop.yaml`
- **Exchange credentials:** Set via environment variables (never in files)

```bash
export BINANCE_API_KEY="..."
export BINANCE_SECRET="..."
export BYBIT_API_KEY="..."
export BYBIT_SECRET="..."
```

---

## File Structure

```
squads/crypto-trading-squad/
├── config.yaml                          # Squad configuration
├── README.md                            # This file
├── agents/
│   ├── market-intelligence-agent.md    # 📡 Sigma
│   ├── technical-analysis-agent.md     # 📊 Atlas
│   ├── strategy-agent.md               # 🎯 Vega
│   ├── risk-manager-agent.md           # 🛡️ Bastion
│   ├── execution-agent.md              # ⚡ Pulse
│   ├── portfolio-manager-agent.md      # 💼 Nexus
│   └── performance-analyst-agent.md    # 📈 Oracle
├── tasks/
│   ├── market-scan.md
│   ├── technical-analysis.md
│   ├── generate-trade-setup.md
│   ├── validate-risk.md
│   ├── execute-trade.md
│   ├── portfolio-review.md
│   └── performance-report.md
├── workflows/
│   └── trading-loop.yaml
└── data/
    ├── monitored-pairs.yaml
    └── risk-parameters.yaml
```

---

## Agent Personas

| Agent | Archetype | Philosophy |
|---|---|---|
| Sigma | Sentinel | "Markets never sleep, neither do I" |
| Atlas | Decoder | "The chart tells the story" |
| Vega | Architect | "Every trade is a calculated thesis" |
| Bastion | Guardian | "Capital protection is absolute" |
| Pulse | Executor | "Approved orders execute with precision" |
| Nexus | Steward | "Capital is allocated, not gambled" |
| Oracle | Analyst | "Numbers tell the truth the market won't" |
