'use client';

import { formatUSD, formatNumber } from '@/lib/utils';
import { MiniLine, T } from './charts';

// ─────────────────────────────────────────────────────────────────
// Metric row
// ─────────────────────────────────────────────────────────────────
function MetricRow({
  label,
  value,
  unit = '',
  color,
  bar,
  barMax,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
  bar?: number;
  barMax?: number;
}) {
  const pct = bar !== undefined && barMax ? Math.min(100, (bar / barMax) * 100) : undefined;
  const c = color ?? T.text;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#1E2A35]">
      <span style={{ color: T.neutral, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        {pct !== undefined && (
          <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: '#1E2A35' }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: c, boxShadow: `0 0 4px ${c}50` }}
            />
          </div>
        )}
        <span style={{ fontFamily: 'JetBrains Mono, monospace', color: c, fontSize: 10, fontWeight: 700 }}>
          {value}
          {unit && <span style={{ color: T.neutral, fontWeight: 400, fontSize: 8 }}> {unit}</span>}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Regime badge
// ─────────────────────────────────────────────────────────────────
const REGIME_CFG: Record<string, { color: string; desc: string }> = {
  TRENDING:  { color: T.profit,  desc: 'Directional momentum detected' },
  VOLATILE:  { color: T.loss,    desc: 'High volatility environment'    },
  RANGING:   { color: T.warning, desc: 'Sideways price action'          },
  CHOPPY:    { color: T.warning, desc: 'Indecisive price structure'     },
  BREAKOUT:  { color: T.info,    desc: 'Breakout from consolidation'    },
  REVERSAL:  { color: '#A78BFA', desc: 'Potential trend reversal'       },
  NEUTRAL:   { color: T.neutral, desc: 'No clear regime signal'         },
  HOLD:      { color: T.neutral, desc: 'AI recommends no action'        },
  SIDEWAYS:  { color: T.neutral, desc: 'Range-bound price action'       },
};

interface Props {
  latestDecision: Record<string, unknown> | null;
  symbol?: string;
}

export function PanelMarket({ latestDecision, symbol = 'BTCUSDT' }: Props) {
  // Extract market data
  const summary = latestDecision?.inputSummary as Record<string, unknown> | null ?? null;
  const decision = latestDecision?.decision as Record<string, unknown> | null ?? null;
  const regime =
    (latestDecision?.regime as string) ??
    (decision?.regime as string) ??
    null;

  const rsi         = summary?.rsi         as number | undefined;
  const spreadBps   = summary?.spreadBps   as number | undefined;
  const volumeRatio = summary?.volumeRatio as number | undefined;
  const mid         = summary?.mid         as number | undefined;

  const regCfg = regime ? (REGIME_CFG[regime.toUpperCase()] ?? REGIME_CFG.NEUTRAL) : null;

  // Synthetic mini price series from volumeRatio / rsi
  const miniPriceData: number[] = mid
    ? Array.from({ length: 20 }, (_, i) => {
        const noise = (Math.sin(i * 1.3) * 0.002 + Math.cos(i * 0.8) * 0.001) * mid;
        return mid + noise;
      })
    : [];

  // RSI color
  const rsiColor = rsi !== undefined
    ? rsi > 70 ? T.loss
    : rsi < 30 ? T.profit
    : rsi > 60 ? T.warning
    : T.text
    : T.text;

  // Spread color
  const spreadColor = spreadBps !== undefined
    ? spreadBps > 20 ? T.loss : spreadBps > 10 ? T.warning : T.profit
    : T.text;

  // Volume color
  const volColor = volumeRatio !== undefined
    ? volumeRatio > 1.5 ? T.profit : volumeRatio < 0.5 ? T.loss : T.text
    : T.text;

  return (
    <div className="flex flex-col h-full gap-2 p-3">
      {/* Panel label */}
      <div className="flex items-center justify-between flex-shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: T.info }}>
          ▸ MARKET REGIME
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', color: T.neutral, fontSize: 9 }}>
          {symbol}
        </span>
      </div>

      {/* Regime badge */}
      {regCfg && regime ? (
        <div
          className="flex flex-col items-center justify-center py-3 rounded-xl border flex-shrink-0"
          style={{ borderColor: `${regCfg.color}30`, background: `${regCfg.color}08` }}
        >
          <span
            className="text-xl font-black tracking-widest"
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              color: regCfg.color,
              textShadow: `0 0 12px ${regCfg.color}80`,
            }}
          >
            {regime.toUpperCase()}
          </span>
          <span style={{ color: T.neutral, fontSize: 9, marginTop: 2 }}>{regCfg.desc}</span>
        </div>
      ) : (
        <div
          className="flex items-center justify-center py-4 rounded-xl border flex-shrink-0"
          style={{ borderColor: T.dim, color: T.neutral, fontSize: 11 }}
        >
          Awaiting assessment…
        </div>
      )}

      {miniPriceData.length > 0 ? (
        <div className="flex-shrink-0">
          <span style={{ color: T.neutral, fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Price — {symbol}
          </span>
          <div className="mt-1 flex items-center gap-2">
            <MiniLine data={miniPriceData} width={100} height={28} color={T.info} />
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: T.info, fontSize: 12, fontWeight: 700 }}>
              {mid ? formatUSD(mid) : '—'}
            </span>
          </div>
        </div>
      ) : null}

      {/* Metric rows */}
      <div className="flex-1 min-h-0 overflow-auto">
        {rsi !== undefined && (
          <MetricRow
            label="RSI (14)"
            value={formatNumber(rsi, 1)}
            color={rsiColor}
            bar={rsi}
            barMax={100}
          />
        )}
        {spreadBps !== undefined && (
          <MetricRow
            label="Spread"
            value={formatNumber(spreadBps, 1)}
            unit="bps"
            color={spreadColor}
            bar={spreadBps}
            barMax={30}
          />
        )}
        {volumeRatio !== undefined && (
          <MetricRow
            label="Volume Ratio"
            value={formatNumber(volumeRatio, 2)}
            unit="×"
            color={volColor}
            bar={volumeRatio}
            barMax={3}
          />
        )}
        {mid !== undefined && (
          <MetricRow
            label="Mid Price"
            value={formatUSD(mid)}
            color={T.text}
          />
        )}
        {/* Static indicators from assessment */}
        {regCfg && (
          <>
            <MetricRow
              label="EMA Trend"
              value={regime === 'TRENDING' || regime === 'BREAKOUT' ? 'STRONG' : regime === 'RANGING' ? 'FLAT' : 'MIXED'}
              color={regime === 'TRENDING' ? T.profit : regime === 'VOLATILE' ? T.loss : T.warning}
            />
            <MetricRow
              label="ATR Volatility"
              value={regime === 'VOLATILE' ? 'HIGH' : regime === 'RANGING' ? 'LOW' : 'MEDIUM'}
              color={regime === 'VOLATILE' ? T.loss : regime === 'RANGING' ? T.profit : T.warning}
            />
          </>
        )}
      </div>

      {/* Timestamp */}
      {!!latestDecision?.createdAt && (
        <div className="flex-shrink-0 text-right">
          <span style={{ color: T.dim, fontSize: 8, fontFamily: 'JetBrains Mono, monospace' }}>
            assessed {new Date(latestDecision.createdAt as string).toLocaleTimeString()}
          </span>
        </div>
      )}
    </div>
  );
}
