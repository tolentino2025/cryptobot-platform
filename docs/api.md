# CryptoBot Platform — API Reference

## Authentication

All endpoints (except `/health`) require Bearer token:
```
Authorization: Bearer <API_AUTH_TOKEN>
```

## Endpoints

### System
- `GET /health` — Health check (no auth)
- `GET /system/state` — Current system state and mode
- `POST /system/pause` — Pause trading
- `POST /system/resume` — Resume trading
- `POST /system/kill` — Kill switch (requires restart)

### Configuration
- `GET /config` — Current configuration
- `PUT /config/strategy` — Update strategy parameters
- `PUT /config/risk` — Update risk limits

### Data
- `GET /positions` — Open and recent positions
- `GET /balances` — Current balances
- `GET /orders` — Orders with filters
- `GET /fills` — Fill history
- `GET /decisions` — AI decision history
- `GET /incidents` — Incident log
- `GET /audit` — Audit trail

### Mode
- `POST /mode/sim` — Switch to SIM mode
- `POST /mode/demo` — Switch to DEMO mode
- `POST /mode/live` — Switch to LIVE (requires confirmation)

### Dashboard
- `GET /dashboard/overview` — Aggregated dashboard data

Full implementation in ETAPA 3.
