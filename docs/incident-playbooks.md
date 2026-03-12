# CryptoBot Platform — Incident Playbooks

## Severidade

| Nível | Descrição | Ação Automática |
|-------|-----------|-----------------|
| INFO | Informativo, sem impacto | Log apenas |
| WARNING | Degradação parcial | Log + alerta |
| CRITICAL | Risco operacional | PAUSE automática + alerta |
| FATAL | Falha grave | KILL + alerta crítico |

---

## INC-01: MARKET_DATA_GAP

**Trigger**: Dados de mercado não atualizam há mais de `dataFreshnessMaxMs` (default: 5s)

**Causa provável**:
- WebSocket desconectou
- Exchange em manutenção
- Problema de rede

**Ação automática**: PAUSE se `killOnMarketDataGap=true`

**Resolução**:
1. Verificar status da exchange (ex: status.binance.com)
2. Verificar conectividade de rede
3. Verificar logs: `docker compose logs api | grep market-data`
4. Se exchange ok, reiniciar o sistema
5. Se exchange em manutenção, aguardar e resumir

---

## INC-02: EXCHANGE_DESYNC

**Trigger**: Estado local de posições/saldos diverge do estado na corretora

**Causa provável**:
- Ordem executou mas notificação falhou
- Restart durante execução
- Outra aplicação operou na mesma conta

**Ação automática**: KILL se `killOnExchangeDesync=true`

**Resolução**:
1. **NÃO RESUMIR automaticamente**
2. Verificar posições na corretora manualmente
3. Verificar ordens abertas na corretora
4. Comparar com estado local: `GET /positions` e `GET /orders`
5. Se necessário, fechar posições manualmente na corretora
6. Ajustar estado no banco de dados se necessário
7. Reiniciar sistema — reconciliação automática rodará

---

## INC-03: CONSECUTIVE_LOSSES

**Trigger**: Número de perdas consecutivas atingiu `maxConsecutiveLosses` (default: 3)

**Causa provável**:
- Condições de mercado adversas
- Estratégia mal calibrada
- Spread/slippage elevado

**Ação automática**: Cooldown de `cooldownAfterLossMinutes` (default: 30min)

**Resolução**:
1. Aguardar cooldown expirar (sistema resume automaticamente)
2. Revisar os últimos trades: `GET /decisions?page=1&pageSize=10`
3. Verificar se as perdas foram por stop loss ou timeout
4. Considerar ajustar parâmetros de estratégia
5. Se padrão persiste, pausar manualmente e revisar

---

## INC-04: DAILY_LOSS_LIMIT

**Trigger**: Perda diária acumulada excede `maxDailyLoss` (default: 20 USDT)

**Ação automática**: PAUSE até próximo dia UTC

**Resolução**:
1. Sistema resume automaticamente no próximo dia UTC
2. Revisar trades do dia
3. Considerar ajustar limites se muito restritivos
4. Considerar ajustar estratégia se limites frequentemente atingidos

---

## INC-05: WEEKLY_LOSS_LIMIT

**Trigger**: Perda semanal acumulada excede `maxWeeklyLoss` (default: 50 USDT)

**Ação automática**: PAUSE até próxima semana UTC

**Resolução**: Similar ao INC-04, mas para ciclo semanal.

---

## INC-06: CLAUDE_API_ERROR

**Trigger**: API Claude retornou erro, timeout ou resposta inválida

**Causa provável**:
- API indisponível temporariamente
- Billing expirado
- Rate limit atingido
- API key inválida

**Ação automática**: Fallback para HOLD. Circuit breaker abre após 5 falhas.

**Resolução**:
1. Verificar status: status.anthropic.com
2. Verificar billing na conta Anthropic
3. Verificar API key no .env
4. Circuit breaker reseta em 60s automaticamente
5. Se persistir, verificar logs detalhados

---

## INC-07: REPEATED_REJECTIONS

**Trigger**: Múltiplas ordens rejeitadas pela exchange em sequência

**Causa provável**:
- Saldo insuficiente na exchange
- Par/símbolo desativado
- Quantidade abaixo do mínimo
- Rate limit da exchange

**Ação automática**: KILL se `killOnRepeatedRejections=true`

**Resolução**:
1. Verificar saldo na exchange
2. Verificar status do par de trading
3. Verificar logs de ordem: `GET /orders?page=1`
4. Verificar rate limits consumidos
5. Ajustar configuração e reiniciar

---

## INC-08: UNEXPECTED_POSITION

**Trigger**: Posição detectada na exchange que não está rastreada localmente

**Causa provável**:
- Outra aplicação operou na mesma conta
- Estado local corrompido
- Restart durante execução sem reconciliação adequada

**Ação automática**: KILL se `killOnUnexpectedPosition=true`

**Resolução**:
1. Verificar quem abriu a posição (outra app? manual?)
2. Se manual, fechar na exchange e reiniciar
3. Se bug, investigar sequência de eventos no audit log
4. Garantir que apenas o bot opera nesta conta

---

## Procedimento Geral para Qualquer Incidente

1. **Verificar**: `GET /system/state` e `GET /incidents`
2. **Diagnosticar**: Ler logs (`docker compose logs api`), audit trail (`GET /audit`)
3. **Mitigar**: Se necessário, `POST /system/kill`
4. **Resolver**: Corrigir causa raiz
5. **Validar**: Rodar em SIM por período antes de voltar ao modo anterior
6. **Documentar**: Registrar o que aconteceu e como foi resolvido
