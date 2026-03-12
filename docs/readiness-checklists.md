# CryptoBot Platform — Readiness Checklists

> ⚠️ NUNCA ativar LIVE sem completar 100% dos itens BLOQUEANTES de SIM e DEMO.

## Legenda

- **BLOQUEANTE** — Obrigatório. Sistema NÃO progride sem este item.
- **IMPORTANTE** — Fortemente recomendado. Omissão aumenta risco.
- **DESEJÁVEL** — Boa prática, pode ser feito em paralelo.

---

## CHECKLIST SIM (47 itens)

### Infraestrutura (9)
- [ ] Docker Compose sobe sem erros (PostgreSQL + Redis) — BLOQUEANTE
- [ ] Prisma migrations rodam com sucesso — BLOQUEANTE
- [ ] Seed popula bot_config, strategy_config, risk_limits, symbols — BLOQUEANTE
- [ ] API server inicia e responde em GET /health com status "ok" — BLOQUEANTE
- [ ] .env configurado com API_AUTH_TOKEN — BLOQUEANTE
- [ ] TRADING_MODE=SIM no .env — BLOQUEANTE
- [ ] Dashboard web inicia em localhost:3000 — IMPORTANTE
- [ ] Logs estruturados funcionando — IMPORTANTE
- [ ] Redis conecta e responde a PING — BLOQUEANTE

### Decision Loop (9)
- [ ] Market Data Service gera snapshots simulados — BLOQUEANTE
- [ ] Feature Engine calcula EMA, RSI, ATR — BLOQUEANTE
- [ ] Decision Engine retorna HOLD sem API key — BLOQUEANTE
- [ ] Decision Engine retorna HOLD para resposta inválida — BLOQUEANTE
- [ ] Risk Engine avalia e registra decisões — BLOQUEANTE
- [ ] Ciclo roda no intervalo configurado (15s) — BLOQUEANTE
- [ ] Decisões persistidas em model_decisions — BLOQUEANTE
- [ ] Risk reviews persistidas em risk_reviews — BLOQUEANTE
- [ ] Audit log registra cada ciclo — IMPORTANTE

### Execution Simulada (7)
- [ ] SimulatedAdapter preenche ordens — BLOQUEANTE
- [ ] Ordens registradas em order_requests — BLOQUEANTE
- [ ] Fills registrados em fills — BLOQUEANTE
- [ ] Posições abrem e fecham corretamente — BLOQUEANTE
- [ ] PnL calculado corretamente — BLOQUEANTE
- [ ] Saldo simulado atualizado — BLOQUEANTE
- [ ] Idempotência de ordens funciona — IMPORTANTE

### Risk Engine (11)
- [ ] Veto por daily loss — BLOQUEANTE
- [ ] Veto por weekly loss — BLOQUEANTE
- [ ] Veto por consecutive losses — BLOQUEANTE
- [ ] Cooldown ativado — BLOQUEANTE
- [ ] Veto por trades/hora — BLOQUEANTE
- [ ] Veto por max positions — BLOQUEANTE
- [ ] Veto por symbol não permitido — BLOQUEANTE
- [ ] Veto por dados stale — BLOQUEANTE
- [ ] Veto por saldo insuficiente — BLOQUEANTE
- [ ] Veto por confidence baixa — BLOQUEANTE
- [ ] 17+ regras passam nos testes — BLOQUEANTE

### State Machine (7)
- [ ] INITIALIZING → RUNNING no boot — BLOQUEANTE
- [ ] POST /system/pause → PAUSED — BLOQUEANTE
- [ ] POST /system/resume → RUNNING — BLOQUEANTE
- [ ] POST /system/kill → KILLED — BLOQUEANTE
- [ ] PAUSED não executa trades — BLOQUEANTE
- [ ] KILLED requer restart — BLOQUEANTE
- [ ] Transições no audit log — IMPORTANTE

### Testes (5)
- [ ] Risk Engine: 25+ cenários — BLOQUEANTE
- [ ] Schema validation: 14 cenários — BLOQUEANTE
- [ ] Indicadores: 14 cenários — BLOQUEANTE
- [ ] Utilities: 12 cenários — BLOQUEANTE
- [ ] Falhas: 10 cenários — BLOQUEANTE

### Operação Contínua (4)
- [ ] 1h+ sem erros fatais — BLOQUEANTE
- [ ] 24h+ sem degradação — IMPORTANTE
- [ ] PnL consistente com ordens — BLOQUEANTE
- [ ] Nenhum CRITICAL em operação normal — BLOQUEANTE

---

## CHECKLIST DEMO (30 itens)

**PRÉ-REQUISITO: 100% dos BLOQUEANTES de SIM**

### Credenciais (7)
- [ ] Conta Binance Testnet criada — BLOQUEANTE
- [ ] API Key/Secret da testnet no .env — BLOQUEANTE
- [ ] BINANCE_TESTNET=true — BLOQUEANTE
- [ ] TRADING_MODE=DEMO — BLOQUEANTE
- [ ] BinanceAdapter conecta — BLOQUEANTE
- [ ] getServerTime() ok — BLOQUEANTE
- [ ] getBalances() retorna saldos — BLOQUEANTE

### Ordens Reais Testnet (8)
- [ ] LIMIT buy aceita — BLOQUEANTE
- [ ] MARKET buy executada — BLOQUEANTE
- [ ] Venda (exit) executada — BLOQUEANTE
- [ ] Cancel funciona — BLOQUEANTE
- [ ] Tracking OPEN→FILLED — BLOQUEANTE
- [ ] Partial fills — IMPORTANTE
- [ ] Timeout + cancel — IMPORTANTE
- [ ] Rejeição tratada — BLOQUEANTE

### Reconciliação (5)
- [ ] Reconciliação no startup — BLOQUEANTE
- [ ] Posições locais = testnet — BLOQUEANTE
- [ ] Saldos locais = testnet (±1%) — BLOQUEANTE
- [ ] Divergência → SAFE_MODE — BLOQUEANTE
- [ ] Sem divergência → RUNNING — BLOQUEANTE

### Fluxo Completo (6)
- [ ] Pipeline completo funciona — BLOQUEANTE
- [ ] Claude API chamada com sucesso — BLOQUEANTE
- [ ] Decisão → ordem na testnet — BLOQUEANTE
- [ ] Fill atualiza posição/PnL — BLOQUEANTE
- [ ] Kill cancela ordens abertas — BLOQUEANTE
- [ ] Pause mantém posições — IMPORTANTE

### Operação Contínua (4)
- [ ] 4h+ sem erros — BLOQUEANTE
- [ ] 24h+ sem degradação — IMPORTANTE
- [ ] 48h+ sem CRITICAL — IMPORTANTE
- [ ] Dashboard dados reais — IMPORTANTE

---

## CHECKLIST LIVE (51 itens)

**PRÉ-REQUISITO: 100% dos BLOQUEANTES de SIM + DEMO**

### Segurança (11)
- [ ] API Key com permissões MÍNIMAS (spot only) — BLOQUEANTE
- [ ] Withdraw DESABILITADO — BLOQUEANTE
- [ ] Futures/Margin DESABILITADO — BLOQUEANTE
- [ ] IP whitelist na API key — BLOQUEANTE
- [ ] BINANCE_TESTNET=false — BLOQUEANTE
- [ ] TRADING_MODE=LIVE — BLOQUEANTE
- [ ] LIVE_CONFIRMATION_CODE configurado — BLOQUEANTE
- [ ] API_AUTH_TOKEN forte — BLOQUEANTE
- [ ] ANTHROPIC_API_KEY com billing ativo — BLOQUEANTE
- [ ] .env no .gitignore — BLOQUEANTE
- [ ] Secrets redactados nos logs — BLOQUEANTE

### Limites de Risco (14)
- [ ] maxPositionNotional = valor aceitável de perda — BLOQUEANTE
- [ ] maxDailyLoss = valor aceitável — BLOQUEANTE
- [ ] maxWeeklyLoss = valor aceitável — BLOQUEANTE
- [ ] maxOpenPositions = 1 — BLOQUEANTE
- [ ] maxTradesPerHour ≤ 4 — BLOQUEANTE
- [ ] maxConsecutiveLosses ≤ 3 — BLOQUEANTE
- [ ] cooldownAfterLossMinutes ≥ 15 — BLOQUEANTE
- [ ] killOnExchangeDesync = true — BLOQUEANTE
- [ ] killOnMarketDataGap = true — BLOQUEANTE
- [ ] killOnUnexpectedPosition = true — BLOQUEANTE
- [ ] killOnRepeatedRejections = true — BLOQUEANTE
- [ ] noTradeDuringIncident = true — BLOQUEANTE
- [ ] allowPyramiding = false — BLOQUEANTE
- [ ] allowedSymbols apenas pares validados — BLOQUEANTE

### Infraestrutura (7)
- [ ] Servidor com uptime ≥ 99.5% — BLOQUEANTE
- [ ] Docker restart=unless-stopped — BLOQUEANTE
- [ ] Health checks nos containers — BLOQUEANTE
- [ ] Backup automático do DB — BLOQUEANTE
- [ ] Monitoramento de recursos — IMPORTANTE
- [ ] Rede estável — IMPORTANTE
- [ ] Timezone UTC — IMPORTANTE

### Alertas (7)
- [ ] Webhook configurado e testado — BLOQUEANTE
- [ ] Kill → notificação — BLOQUEANTE
- [ ] Pause → notificação — BLOQUEANTE
- [ ] Daily loss → notificação — BLOQUEANTE
- [ ] Exchange desync → notificação — BLOQUEANTE
- [ ] Smartphone com alertas 24/7 — BLOQUEANTE
- [ ] Plano de ação por tipo de incidente — IMPORTANTE

### Validação (9)
- [ ] Todos os 75+ testes passam — BLOQUEANTE
- [ ] Kill switch testado em DEMO — BLOQUEANTE
- [ ] Pause/resume testado em DEMO — BLOQUEANTE
- [ ] Reconciliação testada em DEMO — BLOQUEANTE
- [ ] 48h+ em DEMO sem CRITICAL — BLOQUEANTE
- [ ] PnL revisado e consistente — BLOQUEANTE
- [ ] Runbooks lidos — BLOQUEANTE
- [ ] Playbooks lidos — BLOQUEANTE
- [ ] Saldo na exchange = mínimo necessário — BLOQUEANTE

### Ativação (10)
- [ ] ✅ "Estou disposto a perder 100% do saldo alocado" — BLOQUEANTE
- [ ] TRADING_MODE=LIVE no .env — BLOQUEANTE
- [ ] LIVE_CONFIRMATION_CODE no .env — BLOQUEANTE
- [ ] Reiniciar sistema — BLOQUEANTE
- [ ] POST /mode/live com código — BLOQUEANTE
- [ ] Banner vermelho no dashboard — BLOQUEANTE
- [ ] state=RUNNING, mode=LIVE — BLOQUEANTE
- [ ] Monitorar primeiros 30min — BLOQUEANTE
- [ ] Monitorar primeiras 4h — IMPORTANTE
- [ ] Revisar trades do primeiro dia — IMPORTANTE

### Pós-Ativação (3)
- [ ] Revisão diária primeira semana — BLOQUEANTE
- [ ] Backup diário ativo — BLOQUEANTE
- [ ] Ajustes baseados em performance — IMPORTANTE
