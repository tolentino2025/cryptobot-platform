# CryptoBot Platform — Risk Rules

## Regras Obrigatórias do Risk Engine

Toda proposta de operação passa por TODAS as regras abaixo. Qualquer falha resulta em DENIAL.

| # | Regra | Parâmetro | Default | Descrição |
|---|-------|-----------|---------|-----------|
| 1 | system_state | - | RUNNING | Sistema deve estar RUNNING |
| 2 | allowed_symbols | allowedSymbols | [BTCUSDT] | Símbolo deve estar na whitelist |
| 3 | data_freshness | dataFreshnessMaxMs | 5000ms | Dados devem ter < 5s de idade |
| 4 | daily_loss | maxDailyLoss | 20 USDT | Perda diária máxima |
| 5 | weekly_loss | maxWeeklyLoss | 50 USDT | Perda semanal máxima |
| 6 | max_open_positions | maxOpenPositions | 1 | Máximo 1 posição simultânea |
| 7 | trades_per_hour | maxTradesPerHour | 4 | Máximo 4 trades por hora |
| 8 | consecutive_losses | maxConsecutiveLosses | 3 | Pausa após 3 perdas |
| 9 | cooldown | cooldownAfterLossMinutes | 30 | 30min de cooldown |
| 10 | max_spread | maxSpreadBps | 15 | Spread máximo 15bps |
| 11 | max_position_notional | maxPositionNotional | 100 USDT | Posição máxima |
| 12 | max_total_exposure | maxTotalExposureNotional | 200 USDT | Exposição total |
| 13 | sufficient_balance | - | - | Saldo >= tamanho da ordem |
| 14 | min_balance | minBalanceThreshold | 10 USDT | Saldo mínimo para operar |
| 15 | active_incidents | noTradeDuringIncident | true | Sem trade durante incidente |
| 16 | min_confidence | minConfidence | 0.5 | Confiança mínima da IA |
| 17 | no_pyramiding | allowPyramiding | false | Sem empilhar posições |

## Kill Conditions

- killOnExchangeDesync: Estado local diverge da corretora → KILL
- killOnMarketDataGap: Gap de dados > threshold → KILL
- killOnUnexpectedPosition: Posição detectada não rastreada → KILL
- killOnRepeatedRejections: Múltiplas ordens rejeitadas → KILL
