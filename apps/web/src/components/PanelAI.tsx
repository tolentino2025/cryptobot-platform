'use client';

import { useMemo } from 'react';
import { formatDate, formatNumber } from '@/lib/utils';
import { HexRadar, T } from './charts';
import type { RadarSignal } from './charts';

// ─────────────────────────────────────────────────────────────────
// Decision timeline dot
// ─────────────────────────────────────────────────────────────────
function TimelineDot({ decision }: { decision: Record<string, unknown> }) {
  const action = String(decision.action ?? 'HOLD');
  const color  = action === 'BUY' ? T.profit : action === 'EXIT' ? T.loss : T.neutral;
  const entry_veto = Boolean(decision.entry_veto);
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <div
        className="w-2 h-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 4px ${color}` }}
        title={`${action} — ${formatDate(decision.createdAt as string)}`}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Score bar
// ─────────────────────────────────────────────────────────────────
function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: T.neutral, fontSize: 8, width: 56, textAlign: 'right', flexShrink: 0 }}>
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#1E2A35' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${score}%`,
            background: color,
            boxShadow: `0 0 4px ${color}60`,
            transition: 'width 0.5s ease',
          }}
        />
      </div>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', color, fontSize: 9, width: 24, flexShrink: 0 }}>
        {score}
      </span>
    </div>
  );
}

interface Props {
  decisions: Record<string, unknown>[];
}

export function PanelAI({ decisions }: Props) {
  const latest = decisions[0] ?? null;

  // Derive 6 radar signals from available data
  const signals: RadarSignal[] = useMemo(() => {
    if (!latest) {
      return [
        { label: 'TREND',   value: 0 },
        { label: 'MOMENTUM',value: 0 },
        { label: 'LIQUID',  value: 0 },
        { label: 'VOLUME',  value: 0 },
        { label: 'RISK',    value: 0 },
        { label: 'CONF',    value: 0 },
      ];
    }

    const summary  = latest.inputSummary as Record<string, unknown> | null ?? {};
    const decision = latest.decision    as Record<string, unknown> | null ?? {};
    const regime   = (latest.regime as string) ?? (decision.regime as string) ?? 'HOLD';

    // Trend — from regime
    const trendScore: Record<string, number> = {
      TRENDING: 88, BREAKOUT: 92, RANGING: 45, VOLATILE: 25, CHOPPY: 20, REVERSAL: 60, HOLD: 15, NEUTRAL: 30,
    };
    const trend = trendScore[regime.toUpperCase()] ?? 30;

    // Momentum — from RSI (30=0, 50=50, 70=100)
    const rsi = (summary.rsi as number) ?? 50;
    const momentum = Math.min(100, Math.max(0, ((rsi - 30) / 40) * 100));

    // Liquidity — inverse of spread (0bps=100, 30bps=0)
    const spread = (summary.spreadBps as number) ?? 10;
    const liquidity = Math.min(100, Math.max(0, ((30 - spread) / 30) * 100));

    // Volume — volumeRatio (0x=0, 1x=50, 2x=100)
    const vol = (summary.volumeRatio as number) ?? 1;
    const volume = Math.min(100, Math.max(0, (vol / 2) * 100));

    // Risk — 100 = safe (no position, no veto), lower = riskier
    const hasPosition = Boolean(summary.hasPosition);
    const veto = Boolean(decision.entry_veto ?? latest.entry_veto);
    const riskScore = veto ? 15 : hasPosition ? 50 : 85;

    // Confidence — direct
    const conf = Math.round(((latest.confidence as number) ?? 0.5) * 100);

    return [
      { label: 'TREND',    value: Math.round(trend)    },
      { label: 'MOMENTUM', value: Math.round(momentum) },
      { label: 'LIQUID',   value: Math.round(liquidity)},
      { label: 'VOLUME',   value: Math.round(volume)   },
      { label: 'RISK',     value: Math.round(riskScore)},
      { label: 'CONF',     value: conf                 },
    ];
  }, [latest]);

  if (!latest) {
    return (
      <div className="flex flex-col h-full gap-2 p-3">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: T.purple }}>
          ▸ AI DECISION ENGINE
        </span>
        <div className="flex-1 flex items-center justify-center">
          <span style={{ color: T.neutral, fontSize: 11 }}>Awaiting first AI assessment…</span>
        </div>
      </div>
    );
  }

  const action    = String(latest.action ?? 'HOLD');
  const actionColor = action === 'BUY' ? T.profit : action === 'EXIT' || action === 'SELL' ? T.loss : T.neutral;
  const confidence = (latest.confidence as number) ?? 0;
  const latency    = (latest.latencyMs  as number) ?? 0;
  const thesis     = latest.thesis ? String(latest.thesis).slice(0, 180) : '';
  const verdict    = String(latest.verdict ?? '—');
  const verdictColor = verdict === 'APPROVED' ? T.profit : verdict === 'DENIED' ? T.loss : T.warning;

  const decision = latest.decision as Record<string, unknown> | null ?? {};
  const regime   = String((latest.regime as string) ?? (decision.regime as string) ?? '—');
  const hasVeto  = Boolean(decision.entry_veto ?? latest.entry_veto);
  const hasExit  = Boolean(decision.should_exit ?? latest.should_exit);

  return (
    <div className="flex flex-col h-full gap-2 p-3">
      {/* Panel label */}
      <div className="flex items-center justify-between flex-shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: T.purple }}>
          ▸ AI DECISION ENGINE
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', color: T.neutral, fontSize: 8 }}>
          {formatDate(latest.createdAt as string)}
        </span>
      </div>

      {/* Decision header */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div
          className="px-4 py-1.5 rounded-lg border text-sm font-black tracking-[0.2em]"
          style={{
            color: actionColor,
            borderColor: `${actionColor}40`,
            background: `${actionColor}10`,
            fontFamily: 'JetBrains Mono, monospace',
            textShadow: `0 0 8px ${actionColor}`,
          }}
        >
          {action}
        </div>
        <div>
          <div style={{ color: T.neutral, fontSize: 8 }}>CONFIDENCE</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', color: T.info, fontSize: 13, fontWeight: 700 }}>
            {(confidence * 100).toFixed(0)}%
          </div>
        </div>
        <div>
          <div style={{ color: T.neutral, fontSize: 8 }}>LATENCY</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', color: T.text, fontSize: 13, fontWeight: 700 }}>
            {latency}ms
          </div>
        </div>
        <div>
          <div style={{ color: T.neutral, fontSize: 8 }}>REGIME</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', color: T.warning, fontSize: 11, fontWeight: 700 }}>
            {regime}
          </div>
        </div>
        <div className="ml-auto">
          <div style={{ color: T.neutral, fontSize: 8 }}>VERDICT</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', color: verdictColor, fontSize: 11, fontWeight: 700 }}>
            {verdict}
          </div>
        </div>
      </div>

      {/* Signals: radar + bars side by side */}
      <div className="flex gap-3 flex-1 min-h-0">
        {/* Radar */}
        <div className="flex-shrink-0 flex items-center">
          <HexRadar signals={signals} size={140} />
        </div>

        {/* Score bars */}
        <div className="flex-1 flex flex-col justify-center gap-1.5 min-w-0">
          <ScoreBar label="Trend"    score={signals[0].value} color={signals[0].value >= 60 ? T.profit : T.warning} />
          <ScoreBar label="Momentum" score={signals[1].value} color={signals[1].value >= 60 ? T.profit : T.warning} />
          <ScoreBar label="Liquidity"score={signals[2].value} color={signals[2].value >= 60 ? T.profit : T.loss   } />
          <ScoreBar label="Volume"   score={signals[3].value} color={T.info                                        } />
          <ScoreBar label="Risk"     score={signals[4].value} color={signals[4].value >= 60 ? T.profit : T.loss   } />
          <ScoreBar label="Conf."    score={signals[5].value} color={T.purple                                      } />
        </div>
      </div>

      {/* Tags */}
      <div className="flex gap-1.5 flex-shrink-0 flex-wrap">
        {hasVeto && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border"
            style={{ color: T.warning, borderColor: `${T.warning}40`, background: `${T.warning}10` }}>
            ENTRY VETO
          </span>
        )}
        {hasExit && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border"
            style={{ color: T.loss, borderColor: `${T.loss}40`, background: `${T.loss}10` }}>
            EXIT SIGNAL
          </span>
        )}
      </div>

      {/* Thesis */}
      {thesis && (
        <div className="flex-shrink-0 px-2 py-1.5 rounded-lg border" style={{ borderColor: '#1E2A35', background: '#0E1520' }}>
          <span style={{ color: T.dim, fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Thesis
          </span>
          <p style={{ color: T.neutral, fontSize: 9, lineHeight: 1.5, marginTop: 2 }} className="line-clamp-2">
            {thesis}
          </p>
        </div>
      )}

      {/* Decision timeline */}
      <div className="flex-shrink-0">
        <span style={{ color: T.dim, fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 4 }}>
          Decision History
        </span>
        <div className="flex items-center gap-0.5 flex-wrap">
          {decisions.slice(0, 30).reverse().map((d, i) => (
            <TimelineDot key={String(d.id ?? i)} decision={d} />
          ))}
          {decisions.length === 0 && (
            <span style={{ color: T.dim, fontSize: 9 }}>No history yet</span>
          )}
        </div>
      </div>
    </div>
  );
}
