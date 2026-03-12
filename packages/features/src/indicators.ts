// ═══════════════════════════════════════════════════════════════
// Indicator Calculations — Pure functions for technical indicators
// All functions are stateless and deterministic
// Full implementation: ETAPA 3
// ═══════════════════════════════════════════════════════════════

/** Exponential Moving Average */
export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [values[0]!];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i]! * k + result[i - 1]! * (1 - k));
  }
  return result;
}

/** Relative Strength Index */
export function rsi(closes: number[], period: number): number {
  if (closes.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

/** Average True Range */
export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number,
): number {
  if (highs.length < period + 1) return 0;

  const trueRanges: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i]! - lows[i]!,
      Math.abs(highs[i]! - closes[i - 1]!),
      Math.abs(lows[i]! - closes[i - 1]!),
    );
    trueRanges.push(tr);
  }

  // Simple average of last N true ranges
  const recent = trueRanges.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

/** Volume ratio: current volume vs average of last N periods */
export function volumeRatio(volumes: number[], lookback: number): number {
  if (volumes.length < 2) return 1;
  const current = volumes[volumes.length - 1]!;
  const history = volumes.slice(-lookback - 1, -1);
  if (history.length === 0) return 1;
  const avg = history.reduce((a, b) => a + b, 0) / history.length;
  return avg > 0 ? current / avg : 1;
}

/** Book imbalance: sum of top N bid quantities / sum of top N ask quantities */
export function bookImbalance(
  bids: Array<{ quantity: number }>,
  asks: Array<{ quantity: number }>,
  levels: number = 5,
): number {
  const bidVol = bids.slice(0, levels).reduce((s, b) => s + b.quantity, 0);
  const askVol = asks.slice(0, levels).reduce((s, a) => s + a.quantity, 0);
  return askVol > 0 ? bidVol / askVol : 1;
}

/** Trade flow imbalance: buy volume / total volume from recent trades */
export function tradeFlowImbalance(
  trades: Array<{ quantity: number; isBuyerMaker: boolean }>,
): number {
  if (trades.length === 0) return 0.5;
  let buyVol = 0;
  let totalVol = 0;
  for (const t of trades) {
    totalVol += t.quantity;
    if (!t.isBuyerMaker) buyVol += t.quantity; // Taker buy
  }
  return totalVol > 0 ? buyVol / totalVol : 0.5;
}
