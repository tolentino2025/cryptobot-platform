'use client';

import { cn, formatUSD, formatNumber, formatDate, verdictColor } from '@/lib/utils';
import { Card, SectionLabel, Badge } from './ui';

// ─────────────────────────────────────────────────────
// Market Regime
// ─────────────────────────────────────────────────────

const REGIME_CONFIG: Record<string, { color: string; bg: string }> = {
  TRENDING:  { color: '#22C55E', bg: 'bg-[#22C55E]/10 border-[#22C55E]/20' },
  VOLATILE:  { color: '#EF4444', bg: 'bg-[#EF4444]/10 border-[#EF4444]/20' },
  RANGING:   { color: '#F59E0B', bg: 'bg-[#F59E0B]/10 border-[#F59E0B]/20' },
  CHOPPY:    { color: '#F59E0B', bg: 'bg-[#F59E0B]/10 border-[#F59E0B]/20' },
  BREAKOUT:  { color: '#3B82F6', bg: 'bg-[#3B82F6]/10 border-[#3B82F6]/20' },
  REVERSAL:  { color: '#A78BFA', bg: 'bg-purple-500/10 border-purple-500/20' },
  HOLD:      { color: '#64748B', bg: 'bg-[#64748B]/10 border-[#64748B]/20'  },
  NEUTRAL:   { color: '#64748B', bg: 'bg-[#64748B]/10 border-[#64748B]/20'  },
  SIDEWAYS:  { color: '#64748B', bg: 'bg-[#64748B]/10 border-[#64748B]/20'  },
};

function getRegime(decision: Record<string, unknown> | null): string | null {
  if (!decision) return null;
  // Try multiple possible paths
  if (typeof decision.regime === 'string') return decision.regime;
  const d = decision.decision as Record<string, unknown> | undefined;
  if (d && typeof d.regime === 'string') return d.regime;
  const a = decision.assessment as Record<string, unknown> | undefined;
  if (a && typeof a.regime === 'string') return a.regime;
  return null;
}

function getInputSummary(decision: Record<string, unknown> | null) {
  if (!decision) return null;
  if (decision.inputSummary && typeof decision.inputSummary === 'object') {
    return decision.inputSummary as Record<string, unknown>;
  }
  return null;
}

export function MarketRegimePanel({ decision }: { decision: Record<string, unknown> | null }) {
  const regime = getRegime(decision);
  const summary = getInputSummary(decision);
  const regCfg = regime
    ? (REGIME_CONFIG[regime.toUpperCase()] ?? REGIME_CONFIG.HOLD)
    : null;

  return (
    <Card className="p-4 flex flex-col gap-3">
      <SectionLabel>Market Conditions</SectionLabel>

      {regCfg && regime ? (
        <>
          {/* Regime badge */}
          <div className={cn('flex items-center justify-center py-4 rounded-xl border', regCfg.bg)}>
            <span className="text-2xl font-black tracking-widest" style={{ color: regCfg.color }}>
              {regime.toUpperCase()}
            </span>
          </div>

          {/* Metrics grid */}
          {summary && (
            <div className="grid grid-cols-2 gap-2">
              {summary.rsi !== undefined && (
                <MetricTile
                  label="RSI"
                  value={formatNumber(summary.rsi as number, 1)}
                  danger={(summary.rsi as number) > 70 || (summary.rsi as number) < 30}
                />
              )}
              {summary.spreadBps !== undefined && (
                <MetricTile
                  label="Spread"
                  value={`${formatNumber(summary.spreadBps as number, 1)}bps`}
                  danger={(summary.spreadBps as number) > 20}
                />
              )}
              {summary.volumeRatio !== undefined && (
                <MetricTile
                  label="Vol. Ratio"
                  value={`${formatNumber(summary.volumeRatio as number, 2)}×`}
                />
              )}
              {summary.mid !== undefined && (
                <MetricTile
                  label="Mid Price"
                  value={formatUSD(summary.mid as number)}
                />
              )}
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-8 gap-2">
          <div className="w-10 h-10 rounded-full bg-[#1F1F2A] flex items-center justify-center">
            <span className="text-[#64748B]">📡</span>
          </div>
          <p className="text-[#64748B] text-sm">Awaiting first assessment</p>
        </div>
      )}
    </Card>
  );
}

function MetricTile({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="bg-[#0F0F17] rounded-lg px-3 py-2 border border-[#1F1F2A]">
      <p className="text-[10px] text-[#64748B] uppercase tracking-wider">{label}</p>
      <p className={cn('text-sm font-mono font-bold mt-0.5', danger ? 'text-[#F59E0B]' : 'text-white')}>
        {value}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Latest AI Decision
// ─────────────────────────────────────────────────────

const ACTION_CFG: Record<string, { color: string; bg: string }> = {
  BUY:  { color: '#22C55E', bg: 'bg-[#22C55E]/10 border-[#22C55E]/30 text-[#22C55E]' },
  SELL: { color: '#EF4444', bg: 'bg-[#EF4444]/10 border-[#EF4444]/30 text-[#EF4444]' },
  EXIT: { color: '#F59E0B', bg: 'bg-[#F59E0B]/10 border-[#F59E0B]/30 text-[#F59E0B]' },
  HOLD: { color: '#64748B', bg: 'bg-[#64748B]/10 border-[#64748B]/30 text-[#64748B]' },
};

export function LatestDecisionPanel({ decision }: { decision: Record<string, unknown> | null }) {
  if (!decision) {
    return (
      <Card className="p-4 flex flex-col">
        <SectionLabel>Latest AI Decision</SectionLabel>
        <div className="flex-1 flex flex-col items-center justify-center py-8 gap-2">
          <div className="w-10 h-10 rounded-full bg-[#1F1F2A] flex items-center justify-center">
            <span className="text-[#64748B]">🤖</span>
          </div>
          <p className="text-[#64748B] text-sm">No decisions yet</p>
        </div>
      </Card>
    );
  }

  // Extract all values as typed primitives to avoid `unknown` in JSX
  const action       = String(decision.action ?? 'HOLD');
  const symbol       = String(decision.symbol ?? '');
  const confidence   = decision.confidence as number;
  const latencyMs    = String(decision.latencyMs ?? 0);
  const createdAt    = decision.createdAt as string;
  const verdict      = decision.verdict  ? String(decision.verdict)      : null;
  const denialReason = decision.denialReason ? String(decision.denialReason) : null;
  const thesis       = decision.thesis   ? String(decision.thesis)       : null;
  const hasVeto      = Boolean(decision.entry_veto);
  const hasExit      = Boolean(decision.should_exit);
  const acCfg        = ACTION_CFG[action] ?? ACTION_CFG.HOLD;

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Latest AI Decision</SectionLabel>
        <span className="text-[10px] font-mono text-[#64748B]">
          {formatDate(createdAt)}
        </span>
      </div>

      {/* Action + symbol row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className={cn('px-4 py-2 rounded-xl border text-lg font-black tracking-widest', acCfg.bg)}>
          {action}
        </div>
        <div>
          <p className="text-[10px] text-[#64748B]">Symbol</p>
          <p className="font-mono font-bold text-white">{symbol}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[10px] text-[#64748B]">Confidence</p>
          <p className="font-mono font-bold text-white">
            {formatNumber(confidence, 1)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[#64748B]">Latency</p>
          <p className="font-mono text-white text-sm">{latencyMs}ms</p>
        </div>
      </div>

      {/* Verdict row */}
      {verdict && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-[#64748B]">Risk verdict:</span>
          <span className={cn('text-xs font-bold', verdictColor(verdict))}>
            {verdict}
          </span>
          {denialReason && (
            <span className="text-[10px] text-[#EF4444]/60">
              ({denialReason})
            </span>
          )}
        </div>
      )}

      {/* Veto / exit signals */}
      {(hasVeto || hasExit) && (
        <div className="flex gap-2 flex-wrap">
          {hasVeto && (
            <Badge className="text-[10px] text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/20">
              ENTRY VETO
            </Badge>
          )}
          {hasExit && (
            <Badge className="text-[10px] text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20">
              EXIT SIGNAL
            </Badge>
          )}
        </div>
      )}

      {/* Thesis */}
      {thesis && (
        <div className="bg-[#0F0F17] rounded-xl px-3 py-2.5 border border-[#1F1F2A]">
          <p className="text-[10px] text-[#64748B] uppercase tracking-wider mb-1">AI Thesis</p>
          <p className="text-xs text-[#94A3B8] leading-relaxed line-clamp-3">{thesis}</p>
        </div>
      )}
    </Card>
  );
}
