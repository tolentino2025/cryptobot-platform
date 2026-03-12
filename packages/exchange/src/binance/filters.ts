// ═══════════════════════════════════════════════════════════════
// BinanceFilters — Parse exchangeInfo filters and validate orders
//
// Before any order is submitted, we:
//   1. Load symbol filters from GET /api/v3/exchangeInfo
//   2. Round qty to LOT_SIZE.stepSize
//   3. Round price to PRICE_FILTER.tickSize
//   4. Reject if qty < minQty or notional < minNotional
// ═══════════════════════════════════════════════════════════════

import { createLogger } from '@cryptobot/core';
import type { BinanceSymbolFilter } from './types.js';

const logger = createLogger('binance-filters');

// ── Parsed filter set per symbol ────────────────────────────────

export interface ParsedFilters {
  symbol: string;
  lotSize: {
    minQty: number;
    maxQty: number;
    stepSize: number;
  };
  priceFilter: {
    minPrice: number;
    maxPrice: number;
    tickSize: number;
  };
  minNotional: number;
  baseAssetPrecision: number;
  quotePrecision: number;
}

export interface FilterValidationResult {
  valid: boolean;
  errors: string[];
  adjustedQty: number;
  adjustedPrice: number | null;
}

// ── Filter cache ─────────────────────────────────────────────────

export class ExchangeFilterCache {
  private cache = new Map<string, ParsedFilters>();

  set(symbol: string, filters: ParsedFilters): void {
    this.cache.set(symbol, filters);
  }

  get(symbol: string): ParsedFilters | null {
    return this.cache.get(symbol) ?? null;
  }

  has(symbol: string): boolean {
    return this.cache.has(symbol);
  }

  size(): number {
    return this.cache.size;
  }
}

// ── Parsing ───────────────────────────────────────────────────────

export function parseFilters(
  symbol: string,
  rawFilters: BinanceSymbolFilter[],
  baseAssetPrecision = 8,
  quotePrecision = 8,
): ParsedFilters {
  // Sensible defaults
  let minQty = 0.00001;
  let maxQty = 9_000_000;
  let stepSize = 0.00001;
  let minPrice = 0;
  let maxPrice = 0;
  let tickSize = 0.01;
  let minNotional = 10;

  for (const f of rawFilters) {
    switch (f.filterType) {
      case 'LOT_SIZE':
        minQty = parseFloat(f.minQty ?? '0');
        maxQty = parseFloat(f.maxQty ?? '9000000');
        stepSize = parseFloat(f.stepSize ?? '0.00001');
        break;

      case 'PRICE_FILTER':
        minPrice = parseFloat(f.minPrice ?? '0');
        maxPrice = parseFloat(f.maxPrice ?? '0');
        tickSize = parseFloat(f.tickSize ?? '0.01');
        break;

      case 'MIN_NOTIONAL':
      case 'NOTIONAL':
        minNotional = parseFloat(f.minNotional ?? '10');
        break;

      default:
        // PERCENT_PRICE, MAX_NUM_ORDERS, etc. — ignored
        break;
    }
  }

  return {
    symbol,
    lotSize: { minQty, maxQty, stepSize },
    priceFilter: { minPrice, maxPrice, tickSize },
    minNotional,
    baseAssetPrecision,
    quotePrecision,
  };
}

// ── Rounding ──────────────────────────────────────────────────────

/** Round down to the nearest step (floor rounding — never exceed intended qty) */
export function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  // Determine precision from step string representation
  const stepStr = step.toFixed(10).replace(/\.?0+$/, '');
  const decimalPlaces = stepStr.includes('.') ? (stepStr.split('.')[1] ?? '').length : 0;
  const rounded = Math.floor(value / step) * step;
  return parseFloat(rounded.toFixed(decimalPlaces));
}

// ── Validation ────────────────────────────────────────────────────

/**
 * Validate and round an order against exchange filters.
 * Returns adjusted qty/price and a list of errors (empty = valid).
 */
export function validateOrder(
  filters: ParsedFilters,
  qty: number,
  price: number | null,
  side: 'BUY' | 'SELL',
): FilterValidationResult {
  const errors: string[] = [];
  const { lotSize, priceFilter, minNotional } = filters;

  // ── Quantity (LOT_SIZE) ──
  const adjustedQty = roundToStep(qty, lotSize.stepSize);

  if (adjustedQty <= 0) {
    errors.push(`Adjusted quantity is zero after step rounding (original: ${qty}, step: ${lotSize.stepSize})`);
  } else {
    if (adjustedQty < lotSize.minQty) {
      errors.push(`qty ${adjustedQty} < minQty ${lotSize.minQty}`);
    }
    if (adjustedQty > lotSize.maxQty) {
      errors.push(`qty ${adjustedQty} > maxQty ${lotSize.maxQty}`);
    }
  }

  // ── Price (PRICE_FILTER) ──
  let adjustedPrice: number | null = null;
  if (price !== null) {
    adjustedPrice = roundToStep(price, priceFilter.tickSize);
    if (priceFilter.minPrice > 0 && adjustedPrice < priceFilter.minPrice) {
      errors.push(`price ${adjustedPrice} < minPrice ${priceFilter.minPrice}`);
    }
    if (priceFilter.maxPrice > 0 && adjustedPrice > priceFilter.maxPrice) {
      errors.push(`price ${adjustedPrice} > maxPrice ${priceFilter.maxPrice}`);
    }
  }

  // ── Notional (MIN_NOTIONAL) ──
  // For LIMIT: notional = qty * price. For MARKET BUY: use quoteOrderQty (not checked here).
  if (price !== null && adjustedPrice !== null && adjustedQty > 0) {
    const notional = adjustedQty * adjustedPrice;
    if (notional < minNotional) {
      errors.push(`notional ${notional.toFixed(2)} < minNotional ${minNotional} (${side} ${adjustedQty} @ ${adjustedPrice})`);
    }
  }

  if (errors.length > 0) {
    logger.warn({ symbol: filters.symbol, errors, qty, price, side }, 'Filter validation failed');
  }

  return { valid: errors.length === 0, errors, adjustedQty, adjustedPrice };
}
