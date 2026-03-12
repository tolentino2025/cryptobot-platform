# CryptoBot Platform — Decision Prompt

## System Prompt

O system prompt do Claude Decision Engine é fixo e segue estas diretrizes:

1. **Função**: Motor de decisão de trading spot de curtíssimo prazo
2. **Ações**: BUY, SELL, HOLD, EXIT
3. **Restrição**: NUNCA executa ordens, apenas sugere
4. **Prioridade #1**: Preservação de capital
5. **Prioridade #2**: Disciplina operacional
6. **Default**: Em dúvida, retornar HOLD

## Output Schema

```json
{
  "action": "BUY | SELL | HOLD | EXIT",
  "symbol": "BTCUSDT",
  "confidence": 0.0-1.0,
  "entry_type": "LIMIT | MARKET",
  "entry_price": 0.0,
  "size_quote": 0.0,
  "stop_price": 0.0,
  "take_profit_price": 0.0,
  "max_slippage_bps": 0,
  "time_horizon_sec": 0,
  "thesis": "texto curto",
  "invalidate_if": ["condição"]
}
```

## Validação

Respostas inválidas (JSON malformado, schema incorreto, campos fora dos limites) são automaticamente convertidas em HOLD com motivo registrado.

## Contexto Enviado

O DecisionContext inclui: ticker (bid/ask/last/mid), features calculadas (EMA, RSI, ATR, volume, spread, book imbalance), posição atual, conta, e hints da estratégia.

Consulte `packages/decision-engine/src/prompt.ts` para o prompt completo.
