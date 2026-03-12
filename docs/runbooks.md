# CryptoBot Platform — Runbooks

## 1. Setup Local (Primeira vez)

```bash
# 1. Clone o repositório
git clone <repo-url>
cd cryptobot-platform

# 2. Configure variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais (no mínimo API_AUTH_TOKEN)

# 3. Execute o setup automatizado
bash infrastructure/scripts/setup.sh

# 4. Ou manualmente:
npm install
cd infrastructure && docker compose up -d postgres redis && cd ..
npx --workspace=packages/db prisma generate
npx --workspace=packages/db prisma migrate dev --name init
npx --workspace=packages/db tsx prisma/seed.ts

# 5. Iniciar API
npm run --workspace=@cryptobot/api dev

# 6. Em outro terminal, iniciar dashboard
npm run --workspace=@cryptobot/web dev

# 7. Verificar saúde
curl http://localhost:3001/health
```

## 2. Operações Diárias

### Verificar estado do sistema
```bash
curl -H "Authorization: Bearer $API_AUTH_TOKEN" http://localhost:3001/system/state
```

### Verificar dashboard
Abrir http://localhost:3000 no navegador.

### Verificar decisões recentes
```bash
curl -H "Authorization: Bearer $API_AUTH_TOKEN" http://localhost:3001/decisions?page=1&pageSize=5
```

## 3. Controles Operacionais

### Pausar o sistema
```bash
curl -X POST http://localhost:3001/system/pause \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Manutenção programada"}'
```

### Resumir operação
```bash
curl -X POST http://localhost:3001/system/resume \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Manutenção concluída"}'
```

### Kill Switch (EMERGÊNCIA)
```bash
curl -X POST http://localhost:3001/system/kill \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Comportamento anômalo detectado"}'
```

⚠️ Kill switch requer restart completo do sistema para recuperar.

## 4. Trocar de Modo

### Para SIM
```bash
curl -X POST http://localhost:3001/mode/sim \
  -H "Authorization: Bearer $API_AUTH_TOKEN"
```

### Para DEMO (requer credenciais testnet)
```bash
curl -X POST http://localhost:3001/mode/demo \
  -H "Authorization: Bearer $API_AUTH_TOKEN"
```

### Para LIVE (⚠️ DINHEIRO REAL)
```bash
# 1. Setar no .env:
#    TRADING_MODE=LIVE
#    LIVE_CONFIRMATION_CODE=<código-único>
#    BINANCE_TESTNET=false
#    BINANCE_API_KEY=<chave-real>
#    BINANCE_API_SECRET=<secret-real>

# 2. Reiniciar sistema

# 3. Confirmar via API:
curl -X POST http://localhost:3001/mode/live \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mode": "LIVE", "confirmationCode": "<código>", "reason": "Validação completa"}'
```

## 5. Ajustar Configuração

### Alterar limites de risco
```bash
curl -X PUT http://localhost:3001/config/risk \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "updates": {"maxPositionNotional": 200, "maxDailyLoss": 30},
    "reason": "Ajuste após validação em SIM por 48h"
  }'
```

### Alterar estratégia
```bash
curl -X PUT http://localhost:3001/config/strategy \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "updates": {"takeProfitBps": 40, "stopLossBps": 25},
    "reason": "Ajuste de TP/SL baseado em backtest"
  }'
```

## 6. Troubleshooting

### Sistema não inicia
1. Verificar PostgreSQL: `docker compose ps` na pasta infrastructure
2. Verificar Redis: `redis-cli ping`
3. Verificar .env: todas as variáveis obrigatórias preenchidas?
4. Verificar migrations: `npx --workspace=packages/db prisma migrate status`

### Sistema entrou em SAFE_MODE
1. Verificar incidentes: `GET /incidents`
2. Divergência detectada na reconciliação
3. Verificar manualmente posições na corretora
4. Após resolver, reiniciar o sistema

### Sistema entrou em KILLED
1. Verificar motivo: `GET /system/state` e `GET /incidents`
2. Corrigir causa raiz
3. Reiniciar processo: `npm run --workspace=@cryptobot/api dev`

### Claude API não responde
1. Verificar ANTHROPIC_API_KEY no .env
2. Verificar billing na conta Anthropic
3. Sistema usa fallback HOLD automaticamente
4. Circuit breaker abre após 5 falhas, reseta em 60s

## 7. Executar Testes

```bash
# Todos os testes
npm run test

# Testes de um pacote específico
npm run --workspace=@cryptobot/risk-engine test

# Testes com coverage
npx --workspace=packages/risk-engine vitest run --coverage
```

## 8. Docker em Produção

```bash
# Build completo
cd infrastructure
docker compose up -d --build

# Verificar logs
docker compose logs -f api
docker compose logs -f web

# Reiniciar apenas a API
docker compose restart api
```
