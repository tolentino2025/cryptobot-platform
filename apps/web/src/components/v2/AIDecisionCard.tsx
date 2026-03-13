'use client';

import { Card, CardHeader, Badge, ScoreBar, EmptyState, DS, LatencyChip, DataPill } from './ui';
import { fmt } from '@/lib/fmt';

type Decision = Record<string, unknown>;

function asNum(v: unknown): number | undefined {
  return typeof v === 'number' && isFinite(v) ? v : undefined;
}
function asStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

const ACTION_CFG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  BUY:      { color: DS.profit,  bg: DS.profitBg,  border: DS.profitBorder,  label: 'BUY'      },
  SELL:     { color: DS.loss,    bg: DS.lossBg,    border: DS.lossBorder,    label: 'SELL'     },
  EXIT:     { color: DS.loss,    bg: DS.lossBg,    border: DS.lossBorder,    label: 'EXIT'     },
  HOLD:     { color: DS.textSec, bg: DS.elevated,  border: DS.border,        label: 'HOLD'     },
  'NO-TRADE': { color: DS.warning, bg: DS.warningBg, border: DS.warningBorder, label: 'NO-TRADE'},
};

const VERDICT_CFG: Record<string, { color: string }> = {
  APPROVED: { color: DS.profit },
  DENIED:   { color: DS.loss   },
  PENDING:  { color: DS.warning},
};

const STAGE_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  AI_VETO: { label: 'Stopped at AI', color: DS.warning, bg: DS.warningBg, border: DS.warningBorder },
  ENTRY_RULES_FAILED: { label: 'Stopped at Entry', color: DS.info, bg: DS.infoBg, border: DS.infoBorder },
  RISK_DENIED: { label: 'Stopped at Risk', color: DS.loss, bg: DS.lossBg, border: DS.lossBorder },
  EXECUTION_FAILED: { label: 'Stopped at Execution', color: DS.loss, bg: DS.lossBg, border: DS.lossBorder },
  EXECUTED: { label: 'Order Sent', color: DS.profit, bg: DS.profitBg, border: DS.profitBorder },
};

// ─── Timeline dot for recent decisions ───────────────────────────
function TimelineDot({ d }: { d: Decision }) {
  const action = asStr(d.action) ?? 'HOLD';
  const color =
    action === 'BUY'  ? DS.profit :
    action === 'SELL' || action === 'EXIT' ? DS.loss :
    DS.textMuted;
  const conf = asNum(d.confidence) ?? 0;

  return (
    <div className="group relative">
      <div
        className="w-2.5 h-2.5 rounded-full cursor-default transition-transform hover:scale-125"
        style={{ background: color, boxShadow: `0 0 4px ${color}80`, opacity: 0.4 + conf * 0.6 }}
        title={`${action} · ${(conf * 100).toFixed(0)}% · ${fmt.time(asStr(d.createdAt))}`}
      />
    </div>
  );
}

interface Props {
  decisions: Decision[];
}

export function AIDecisionCard({ decisions }: Props) {
  const latest = decisions[0] ?? null;

  // ── Extract all fields from latest decision ──────────────────
  const summary = latest?.inputSummary as Record<string, unknown> | null ?? null;

  const action     = asStr(latest?.action)  ?? 'HOLD';
  const confidence = asNum(latest?.confidence) ?? 0;
  const thesis     = asStr(latest?.thesis);
  const verdict    = asStr(latest?.verdict);
  const latencyMs  = asNum(latest?.latencyMs);
  const createdAt  = asStr(latest?.createdAt);
  const holdReason = asStr(latest?.holdReason);
  const fallbackReason = asStr(latest?.fallbackReason);
  const pipelineStage = asStr(latest?.pipelineStageStoppedAt);
  const failedEntryConditions = Array.isArray(latest?.failedEntryConditions)
    ? latest.failedEntryConditions.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];

  const regime = asStr(latest?.regime) ?? null;

  const entryVeto = Boolean(latest?.entryVeto);
  const shouldExit = Boolean(latest?.shouldExit);

  // ── Derive 6 signal scores from available data ───────────────
  const rsi         = asNum(summary?.rsi);
  const spreadBps   = asNum(summary?.spreadBps);
  const volumeRatio = asNum(summary?.volumeRatio);

  const REGIME_TREND: Record<string, number> = {
    TRENDING: 88, BREAKOUT: 92, BULLISH: 85, RANGING: 40, VOLATILE: 25, CHOPPY: 20,
    REVERSAL: 55, HOLD: 15, NEUTRAL: 30, BEARISH: 20,
  };
  const trendScore = regime ? (REGIME_TREND[regime.toUpperCase()] ?? 30) : 30;

  const momentumScore =
    rsi != null ? Math.min(100, Math.max(0, ((rsi - 30) / 40) * 100)) : 50;

  const liquidityScore =
    spreadBps != null ? Math.min(100, Math.max(0, ((30 - spreadBps) / 30) * 100)) : 50;

  const volumeScore =
    volumeRatio != null ? Math.min(100, Math.max(0, (volumeRatio / 2) * 100)) : 50;

  const riskScore = entryVeto ? 15 : Boolean(summary?.hasPosition) ? 50 : 85;
  const confScore = Math.round(confidence * 100);

  const actionCfg  = ACTION_CFG[action] ?? ACTION_CFG.HOLD;
  const verdictCfg = verdict ? (VERDICT_CFG[verdict] ?? { color: DS.textSec }) : null;
  const stageCfg = pipelineStage ? (STAGE_CFG[pipelineStage] ?? {
    label: pipelineStage.replaceAll('_', ' '),
    color: DS.textSec,
    bg: DS.elevated,
    border: DS.border,
  }) : null;

  // ── Latency severity ─────────────────────────────────────────
  const latencyColor =
    latencyMs == null ? DS.textSec :
    latencyMs > 5000  ? DS.loss :
    latencyMs > 2000  ? DS.warning :
    DS.profit;

  if (!latest) {
    return (
      <Card>
        <CardHeader title="AI Decision Engine" accent={DS.purple} />
        <EmptyState
          title="Awaiting first AI assessment"
          subtitle="The decision engine will produce its first evaluation shortly"
          icon="⊙"
        />
      </Card>
    );
  }

  return (
    <Card accent={DS.purple}>
      <CardHeader
        title="AI Decision Engine"
        accent={DS.purple}
        subtitle={createdAt ? fmt.ago(createdAt) : undefined}
        right={<LatencyChip ms={latencyMs} threshold={1000} />}
      />

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <DataPill
            label="AI action"
            value={actionCfg.label}
            tone={actionCfg.color}
          />
          <DataPill
            label="Pipeline"
            value={stageCfg?.label ?? (entryVeto ? 'AI vetoed' : 'Advancing')}
            tone={stageCfg?.color ?? (entryVeto ? DS.warning : DS.profit)}
          />
          <DataPill
            label="Confidence"
            value={`${confScore}%`}
            tone={confScore >= 80 ? DS.profit : confScore >= 50 ? DS.warning : DS.loss}
          />
          <DataPill
            label="Latency"
            value={latencyMs != null ? fmt.latency(latencyMs) : '—'}
            tone={latencyColor}
          />
        </div>

        {/* ── Decision hero row ── */}
        <div className="flex items-start gap-4">
          {/* Action badge */}
          <div
            className="flex flex-col items-center justify-center rounded-xl px-5 py-3 flex-shrink-0"
            style={{
              background: actionCfg.bg,
              border: `1px solid ${actionCfg.border}`,
              minWidth: 100,
            }}
          >
            <span
              className="text-2xl font-black tracking-widest"
              style={{
                color: actionCfg.color,
                fontFamily: DS.mono,
                textShadow: `0 0 12px ${actionCfg.color}60`,
              }}
            >
              {actionCfg.label}
            </span>
            <span className="text-[9px] mt-0.5 uppercase tracking-wider" style={{ color: DS.textMuted }}>
              Decision
            </span>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 flex-1">
            <div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: DS.textMuted }}>
                Confidence
              </div>
              <div
                className="text-lg font-bold"
                style={{
                  color: confScore >= 80 ? DS.profit : confScore >= 50 ? DS.warning : DS.loss,
                  fontFamily: DS.mono,
                }}
              >
                {confScore}%
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: DS.textMuted }}>
                Verdict
              </div>
              <div
                className="text-lg font-bold"
                style={{ color: verdictCfg?.color ?? DS.textSec, fontFamily: DS.mono }}
              >
                {verdict ?? '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: DS.textMuted }}>
                Regime
              </div>
              <div className="text-sm font-semibold" style={{ color: DS.warning, fontFamily: DS.mono }}>
                {regime ?? '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: DS.textMuted }}>
                Latency
              </div>
              <div
                className="text-sm font-semibold"
                style={{ color: latencyColor, fontFamily: DS.mono }}
              >
                {latencyMs != null ? fmt.latency(latencyMs) : '—'}
                {latencyMs != null && latencyMs > 3000 && (
                  <span className="text-[9px] ml-1" style={{ color: DS.warning }}>⚠ slow</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Flags ── */}
        {(entryVeto || shouldExit) && (
          <div className="flex gap-2 flex-wrap">
            {entryVeto && (
              <Badge label="Entry Veto Active" color={DS.warning} size="xs" />
            )}
            {shouldExit && (
              <Badge label="Exit Signal" color={DS.loss} size="xs" />
            )}
          </div>
        )}

        <div
          className="rounded-xl p-3.5"
          style={{
            background: stageCfg?.bg ?? DS.elevated,
            border: `1px solid ${stageCfg?.border ?? DS.border}`,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em]" style={{ color: DS.textMuted }}>
                Pipeline status
              </div>
              <div className="text-sm font-semibold mt-1" style={{ color: stageCfg?.color ?? DS.text }}>
                {stageCfg?.label ?? 'Assessment produced successfully'}
              </div>
            </div>
            {pipelineStage && (
              <Badge label={pipelineStage.replaceAll('_', ' ')} color={stageCfg?.color ?? DS.textSec} size="xs" />
            )}
          </div>
          <p className="text-xs leading-relaxed mt-2" style={{ color: DS.textSec }}>
            {fallbackReason ?? holdReason ?? thesis ?? 'No blocking reason recorded for this cycle.'}
          </p>
          {failedEntryConditions.length > 0 && (
            <div className="grid gap-2 mt-3 md:grid-cols-2">
              {failedEntryConditions.slice(0, 4).map((condition) => (
                <div
                  key={condition}
                  className="rounded-lg px-3 py-2 text-[11px]"
                  style={{ background: DS.panel2, border: `1px solid ${DS.border}`, color: DS.textSec }}
                >
                  {condition}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Signal scores ── */}
        <div
          className="rounded-lg p-3.5 space-y-2"
          style={{ background: DS.elevated, border: `1px solid ${DS.border}` }}
        >
          <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: DS.textMuted }}>
            Signal Breakdown
          </div>
          <ScoreBar
            label="Trend"
            value={Math.round(trendScore)}
            color={trendScore >= 60 ? DS.profit : DS.warning}
          />
          <ScoreBar
            label="Momentum"
            value={Math.round(momentumScore)}
            color={momentumScore >= 60 ? DS.profit : DS.warning}
          />
          <ScoreBar
            label="Liquidity"
            value={Math.round(liquidityScore)}
            color={liquidityScore >= 60 ? DS.profit : DS.loss}
          />
          <ScoreBar
            label="Volume"
            value={Math.round(volumeScore)}
            color={DS.info}
          />
          <ScoreBar
            label="Risk"
            value={riskScore}
            color={riskScore >= 60 ? DS.profit : DS.loss}
          />
          <ScoreBar
            label="Confidence"
            value={confScore}
            color={DS.purple}
          />
        </div>

        {/* ── Thesis ── */}
        {thesis && (
          <div
            className="rounded-lg p-3.5"
            style={{ background: DS.elevated, border: `1px solid ${DS.border}` }}
          >
            <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: DS.textMuted }}>
              Decision thesis
            </div>
            <p className="text-xs leading-relaxed" style={{ color: DS.textSec }}>
              {thesis}
            </p>
          </div>
        )}

        {/* ── Decision timeline ── */}
        {decisions.length > 1 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: DS.textMuted }}>
              Recent decisions ({decisions.length})
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {[...decisions].slice(0, 40).reverse().map((d, i) => (
                <TimelineDot key={String(d.id ?? i)} d={d} />
              ))}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-[9px]" style={{ color: DS.textMuted }}>
              <span className="flex items-center gap-1">
                <span style={{ color: DS.profit }}>●</span> Buy
              </span>
              <span className="flex items-center gap-1">
                <span style={{ color: DS.loss }}>●</span> Sell/Exit
              </span>
              <span className="flex items-center gap-1">
                <span style={{ color: DS.textMuted }}>●</span> Hold
              </span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
