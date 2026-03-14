'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { fmt } from '@/lib/fmt';

import { DS, Card, DataPill, Badge } from '@/components/v2/ui';
import { DashboardHeader }    from '@/components/v2/DashboardHeader';
import { MarketOverviewCard } from '@/components/v2/MarketOverviewCard';
import { AIDecisionCard }     from '@/components/v2/AIDecisionCard';
import { PositionStatusCard } from '@/components/v2/PositionStatusCard';
import { RiskControlCard }    from '@/components/v2/RiskControlCard';
import { PerformanceCard }    from '@/components/v2/PerformanceCard';
import { SystemHealthCard }   from '@/components/v2/SystemHealthCard';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────
interface DashboardData {
  system: {
    state:       string;
    mode:        string;
    uptime:      number;
    version:     string;
    haltReason:  string | null;
  };
  portfolio: {
    totalEquity:       number;
    availableBalance:  number;
    totalExposure:     number;
    exposurePercent:   number;
    dailyPnl:          number;
    dailyPnlPercent:   number;
    weeklyPnl:         number;
    totalRealizedPnl:  number;
    dailyTradeCount:   number;
    consecutiveLosses: number;
    openPositions:     Record<string, unknown>[];
    unrealizedPnl:     number;
  };
  riskLimits: {
    maxDailyLoss:       number;
    dailyLossRemaining: number | null;
    [key: string]: unknown;
  } | null;
  recentDecisions:  Record<string, unknown>[];
  recentOrders:     Record<string, unknown>[];
  recentIncidents:  Record<string, unknown>[];
  recentLifecycles: Record<string, unknown>[];
}

type ExecTab = 'orders' | 'trades';
type SystemAction = 'pause' | 'resume' | 'kill';

interface ActionDialogState {
  action: SystemAction;
  reason: string;
}

interface SessionData {
  username: string;
  role: 'viewer' | 'admin';
}

interface CycleChange {
  label: string;
  value: string;
  tone: string;
}

function asNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function stageTone(stage: string | null): string {
  switch (stage) {
    case 'AI_VETO':
      return DS.warning;
    case 'ENTRY_RULES_FAILED':
      return DS.info;
    case 'NO_EXIT_SIGNAL':
      return DS.textSec;
    case 'RISK_DENIED':
      return DS.loss;
    case 'EXECUTION_FAILED':
      return DS.loss;
    default:
      return DS.profit;
  }
}

function eventTimestamp(value: unknown): number {
  const raw = asStr(value);
  if (!raw) return 0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function makeEventKey(prefix: string, item: Record<string, unknown>, fallback: number): string {
  return `${prefix}:${asStr(item.id) ?? asStr(item.createdAt) ?? asStr(item.updatedAt) ?? String(fallback)}`;
}

function computeCycleChanges(prev: DashboardData | null, next: DashboardData): CycleChange[] {
  if (!prev) return [];

  const changes: CycleChange[] = [];
  const prevDecision = prev.recentDecisions[0] ?? null;
  const nextDecision = next.recentDecisions[0] ?? null;

  const prevStage = asStr(prevDecision?.pipelineStageStoppedAt);
  const nextStage = asStr(nextDecision?.pipelineStageStoppedAt);
  if ((prevStage ?? 'ACTIVE') !== (nextStage ?? 'ACTIVE')) {
    changes.push({
      label: 'Pipeline',
      value: `${prevStage ?? 'ACTIVE'} -> ${nextStage ?? 'ACTIVE'}`,
      tone: stageTone(nextStage),
    });
  }

  const prevRegime = asStr(prevDecision?.regime);
  const nextRegime = asStr(nextDecision?.regime);
  if (prevRegime !== nextRegime && nextRegime) {
    changes.push({
      label: 'Regime',
      value: `${prevRegime ?? '—'} -> ${nextRegime}`,
      tone: DS.info,
    });
  }

  const prevAction = asStr(prevDecision?.action) ?? 'HOLD';
  const nextAction = asStr(nextDecision?.action) ?? 'HOLD';
  if (prevAction !== nextAction) {
    changes.push({
      label: 'Decision',
      value: `${prevAction} -> ${nextAction}`,
      tone: nextAction === 'HOLD' ? DS.warning : DS.profit,
    });
  }

  const prevExposure = prev.portfolio.totalExposure;
  const nextExposure = next.portfolio.totalExposure;
  if (Math.abs(prevExposure - nextExposure) > 0.0001) {
    changes.push({
      label: 'Exposure',
      value: `${fmt.usd(prevExposure)} -> ${fmt.usd(nextExposure)}`,
      tone: nextExposure > prevExposure ? DS.profit : DS.textSec,
    });
  }

  const prevIncidentCount = prev.recentIncidents.filter((incident) => !asStr(incident.resolvedAt)).length;
  const nextIncidentCount = next.recentIncidents.filter((incident) => !asStr(incident.resolvedAt)).length;
  if (prevIncidentCount !== nextIncidentCount) {
    changes.push({
      label: 'Incidents',
      value: `${prevIncidentCount} -> ${nextIncidentCount} active`,
      tone: nextIncidentCount > prevIncidentCount ? DS.loss : DS.profit,
    });
  }

  const prevOrders = prev.recentOrders.length;
  const nextOrders = next.recentOrders.length;
  if (prevOrders !== nextOrders) {
    changes.push({
      label: 'Orders',
      value: `${prevOrders} -> ${nextOrders} recent`,
      tone: nextOrders > prevOrders ? DS.profit : DS.textSec,
    });
  }

  return changes.slice(0, 6);
}

function computeFreshEventIds(prev: DashboardData | null, next: DashboardData): string[] {
  if (!prev) return [];

  const previousKeys = new Set<string>([
    ...prev.recentDecisions.map((item, index) => makeEventKey('decision', item, index)),
    ...prev.recentOrders.map((item, index) => makeEventKey('order', item, index)),
    ...prev.recentIncidents.map((item, index) => makeEventKey('incident', item, index)),
    ...prev.recentLifecycles.map((item, index) => makeEventKey('trade', item, index)),
  ]);

  return [
    ...next.recentDecisions.map((item, index) => makeEventKey('decision', item, index)),
    ...next.recentOrders.map((item, index) => makeEventKey('order', item, index)),
    ...next.recentIncidents.map((item, index) => makeEventKey('incident', item, index)),
    ...next.recentLifecycles.map((item, index) => makeEventKey('trade', item, index)),
  ].filter((key) => !previousKeys.has(key)).slice(0, 8);
}

function EnvironmentBannerCard({
  system,
  healthData,
}: {
  system: DashboardData['system'];
  healthData: Record<string, unknown> | null;
}) {
  const checks = healthData?.checks as Record<string, unknown> | null ?? null;
  const healthStatus = asStr(healthData?.status) ?? 'unknown';
  const modeCfg = system.mode === 'LIVE'
    ? {
        label: 'LIVE',
        title: 'LIVE - operando com dinheiro real',
        description: 'Ambiente de produção. Exige máxima atenção operacional.',
        tone: DS.loss,
        bg: DS.lossBg,
        border: DS.lossBorder,
      }
    : system.mode === 'DEMO'
      ? {
          label: 'DEMO',
          title: 'Demonstração supervisionada',
          description: 'Dados reais e infraestrutura ativa, com monitoramento operacional constante.',
          tone: DS.warning,
          bg: DS.warningBg,
          border: DS.warningBorder,
        }
      : {
          label: 'SIM',
          title: 'Simulação sem risco real',
          description: 'Ciclos, decisões e risco em validação sem execução financeira real.',
          tone: DS.info,
          bg: DS.infoBg,
          border: DS.infoBorder,
        };

  return (
    <Card accent={modeCfg.tone}>
      <div className="p-4 md:p-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between" style={{ background: modeCfg.bg, border: `1px solid ${modeCfg.border}` }}>
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge label={modeCfg.label} color={modeCfg.tone} size="xs" />
            <Badge label={system.state} color={system.state === 'RUNNING' ? DS.profit : DS.warning} size="xs" />
            <Badge label={`Health ${healthStatus.toUpperCase()}`} color={healthStatus === 'ok' ? DS.profit : DS.warning} size="xs" />
          </div>
          <div>
            <div className="text-lg font-bold" style={{ color: modeCfg.tone, fontFamily: DS.font }}>
              {modeCfg.title}
            </div>
            <p className="text-sm mt-1" style={{ color: DS.textSec }}>
              {modeCfg.description}
            </p>
            {system.haltReason && (
              <p className="text-sm mt-2" style={{ color: DS.loss }}>
                Halt reason: {system.haltReason}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 xl:min-w-[520px]">
          <DataPill
            label="Exchange"
            value={asStr((checks?.exchange as Record<string, unknown> | null)?.status)?.toUpperCase() ?? '—'}
            tone={asStr((checks?.exchange as Record<string, unknown> | null)?.status) === 'healthy' ? DS.profit : DS.warning}
          />
          <DataPill
            label="Market Data"
            value={asStr((checks?.marketData as Record<string, unknown> | null)?.status)?.toUpperCase() ?? '—'}
            tone={asStr((checks?.marketData as Record<string, unknown> | null)?.status) === 'healthy' ? DS.profit : DS.warning}
          />
          <DataPill
            label="Database"
            value={asStr((checks?.database as Record<string, unknown> | null)?.status)?.toUpperCase() ?? '—'}
            tone={asStr((checks?.database as Record<string, unknown> | null)?.status) === 'healthy' ? DS.profit : DS.warning}
          />
          <DataPill
            label="Redis"
            value={asStr((checks?.redis as Record<string, unknown> | null)?.status)?.toUpperCase() ?? '—'}
            tone={asStr((checks?.redis as Record<string, unknown> | null)?.status) === 'healthy' ? DS.profit : DS.warning}
          />
        </div>
      </div>
    </Card>
  );
}

function QuickStatsGrid({
  system,
  portfolio,
  lastUpdated,
}: {
  system: DashboardData['system'];
  portfolio: DashboardData['portfolio'];
  lastUpdated: Date | null;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {[
        {
          label: 'Estado',
          value: system.state,
          tone: system.state === 'RUNNING' ? DS.profit : DS.warning,
        },
        {
          label: 'Saldo disponível',
          value: fmt.usd(portfolio.availableBalance),
          tone: DS.info,
        },
        {
          label: 'P&L diário',
          value: fmt.usd(portfolio.dailyPnl),
          tone: portfolio.dailyPnl > 0 ? DS.profit : portfolio.dailyPnl < 0 ? DS.loss : DS.textSec,
        },
        {
          label: 'Última atualização',
          value: lastUpdated ? lastUpdated.toLocaleTimeString('pt-BR') : '—',
          tone: DS.text,
        },
      ].map((item) => (
        <Card key={item.label} accent={item.tone}>
          <div className="p-4">
            <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: DS.textMuted }}>
              {item.label}
            </div>
            <div className="text-xl font-bold mt-2" style={{ color: item.tone, fontFamily: DS.mono }}>
              {item.value}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function CycleDeltaBar({ changes }: { changes: CycleChange[] }) {
  return (
    <Card accent={changes.length > 0 ? changes[0].tone : DS.textSec}>
      <div className="p-4 md:p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em]" style={{ color: DS.teal, fontFamily: DS.mono }}>
              Cycle Delta
            </p>
            <h2 className="text-lg font-bold mt-1" style={{ color: DS.text, fontFamily: DS.font }}>
              What changed since the last polling cycle
            </h2>
          </div>
          <Badge label={changes.length > 0 ? `${changes.length} CHANGES` : 'STABLE'} color={changes.length > 0 ? DS.teal : DS.textSec} size="xs" />
        </div>
        {changes.length === 0 ? (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: DS.elevated, border: `1px solid ${DS.border}`, color: DS.textSec }}>
            No meaningful operational changes were detected in the latest refresh.
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {changes.map((change) => (
              <div
                key={`${change.label}-${change.value}`}
                className="rounded-xl px-3.5 py-3 live-enter"
                style={{ background: `${change.tone}10`, border: `1px solid ${change.tone}24` }}
              >
                <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: DS.textMuted }}>
                  {change.label}
                </div>
                <div className="text-sm font-semibold mt-1" style={{ color: change.tone, fontFamily: DS.mono }}>
                  {change.value}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function WhyNoTradeCard({ decisions }: { decisions: Record<string, unknown>[] }) {
  const counts = new Map<string, { count: number; tone: string }>();

  for (const decision of decisions.slice(0, 16)) {
    const stage = asStr(decision.pipelineStageStoppedAt);
    const holdReason = asStr(decision.holdReason);
    const failedEntryConditions = Array.isArray(decision.failedEntryConditions)
      ? decision.failedEntryConditions.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [];

    if (stage === 'AI_VETO') {
      const label = holdReason ?? 'AI veto';
      counts.set(label, { count: (counts.get(label)?.count ?? 0) + 1, tone: DS.warning });
      continue;
    }

    if (stage === 'ENTRY_RULES_FAILED' && failedEntryConditions.length > 0) {
      for (const condition of failedEntryConditions.slice(0, 2)) {
        counts.set(condition, { count: (counts.get(condition)?.count ?? 0) + 1, tone: DS.info });
      }
      continue;
    }

    if (stage === 'RISK_DENIED') {
      const label = holdReason ?? 'Risk denied';
      counts.set(label, { count: (counts.get(label)?.count ?? 0) + 1, tone: DS.loss });
      continue;
    }

    if ((asStr(decision.action) ?? 'HOLD') === 'HOLD' && holdReason) {
      counts.set(holdReason, { count: (counts.get(holdReason)?.count ?? 0) + 1, tone: stageTone(stage) });
    }
  }

  const blockers = [...counts.entries()]
    .map(([reason, meta]) => ({ reason, count: meta.count, tone: meta.tone }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return (
    <Card accent={DS.warning}>
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em]" style={{ color: DS.warning, fontFamily: DS.mono }}>
              Why No Trade
            </p>
            <h2 className="text-xl font-bold mt-1" style={{ color: DS.text, fontFamily: DS.font }}>
              Persistent blockers in recent cycles
            </h2>
            <p className="text-sm mt-1" style={{ color: DS.textSec }}>
              Top motivos que estao impedindo o bot de converter assessment em ordem.
            </p>
          </div>
          <Badge label={`${blockers.length} BLOCKERS`} color={DS.warning} size="xs" />
        </div>

        {blockers.length === 0 ? (
          <div className="rounded-xl px-4 py-4 text-sm" style={{ background: DS.elevated, border: `1px solid ${DS.border}`, color: DS.textSec }}>
            No persistent blockers detected in the recent decision window.
          </div>
        ) : (
          <div className="space-y-2">
            {blockers.map((blocker) => (
              <div
                key={blocker.reason}
                className="rounded-xl px-3.5 py-3"
                style={{ background: `${blocker.tone}10`, border: `1px solid ${blocker.tone}24` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold" style={{ color: DS.text }}>
                    {blocker.reason}
                  </span>
                  <Badge label={`${blocker.count}x`} color={blocker.tone} size="xs" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function EventStream({
  decisions,
  orders,
  incidents,
  lifecycles,
  freshIds,
}: {
  decisions: Record<string, unknown>[];
  orders: Record<string, unknown>[];
  incidents: Record<string, unknown>[];
  lifecycles: Record<string, unknown>[];
  freshIds: Set<string>;
}) {
  const items = [
    ...decisions.slice(0, 8).map((decision, index) => {
      const action = asStr(decision.action) ?? 'HOLD';
      const stage = asStr(decision.pipelineStageStoppedAt);
      const reason = asStr(decision.holdReason) ?? asStr(decision.fallbackReason) ?? asStr(decision.thesis) ?? 'AI cycle completed';
      const tone =
        action === 'BUY' || action === 'SELL' || action === 'EXIT' ? DS.profit :
        stage === 'RISK_DENIED' || stage === 'EXECUTION_FAILED' ? DS.loss :
        stage === 'AI_VETO' ? DS.warning :
        stage === 'ENTRY_RULES_FAILED' ? DS.info :
        DS.textSec;

      return {
        id: makeEventKey('decision', decision, index),
        ts: eventTimestamp(decision.createdAt),
        time: asStr(decision.createdAt),
        lane: 'AI',
        title: `${action} · ${asStr(decision.regime) ?? 'UNKNOWN'}`,
        detail: reason,
        meta: stage ?? 'ASSESSMENT',
        tone,
      };
    }),
    ...orders.slice(0, 8).map((order, index) => {
      const status = asStr(order.status) ?? 'UNKNOWN';
      const side = asStr(order.side) ?? '—';
      const symbol = asStr(order.symbol) ?? '—';
      const qty = asNum(order.quantity);
      const tone =
        status === 'FILLED' ? DS.profit :
        status === 'REJECTED' || status === 'CANCELLED' ? DS.loss :
        DS.info;

      return {
        id: makeEventKey('order', order, index),
        ts: eventTimestamp(order.createdAt),
        time: asStr(order.createdAt),
        lane: 'ORDER',
        title: `${symbol} ${side} ${status}`,
        detail: `${qty != null ? qty.toFixed(4) : '—'} units${asStr(order.purpose) ? ` · ${asStr(order.purpose)}` : ''}`,
        meta: 'EXECUTION',
        tone,
      };
    }),
    ...incidents.slice(0, 8).map((incident, index) => {
      const code = asStr(incident.code) ?? 'INCIDENT';
      const severity = asStr(incident.severity) ?? 'INFO';
      const tone =
        severity === 'CRITICAL' ? DS.loss :
        severity === 'HIGH' || severity === 'WARNING' ? DS.warning :
        DS.info;

      return {
        id: makeEventKey('incident', incident, index),
        ts: eventTimestamp(incident.createdAt),
        time: asStr(incident.createdAt),
        lane: 'INCIDENT',
        title: code,
        detail: asStr(incident.message) ?? asStr(incident.note) ?? 'Operational incident logged',
        meta: severity,
        tone,
      };
    }),
    ...lifecycles.slice(0, 8).map((trade, index) => {
      const symbol = asStr(trade.symbol) ?? '—';
      const pnl = asNum(trade.realizedPnl);
      const isOpen = pnl == null;
      const tone = pnl == null ? DS.info : pnl >= 0 ? DS.profit : DS.loss;

      return {
        id: makeEventKey('trade', trade, index),
        ts: eventTimestamp(trade.updatedAt ?? trade.createdAt),
        time: asStr(trade.updatedAt) ?? asStr(trade.createdAt),
        lane: 'TRADE',
        title: `${symbol} ${isOpen ? 'OPEN' : 'CLOSED'}`,
        detail: pnl == null ? 'Lifecycle active with unrealized PnL' : `Realized ${pnl >= 0 ? '+' : ''}${fmt.usd(pnl)}`,
        meta: isOpen ? 'LIVE' : 'SETTLED',
        tone,
      };
    }),
  ]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 14);

  return (
    <Card accent={DS.info}>
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em]" style={{ color: DS.info, fontFamily: DS.mono }}>
              Live Event Stream
            </p>
            <h2 className="text-xl font-bold mt-1" style={{ color: DS.text, fontFamily: DS.font }}>
              Unified bot timeline
            </h2>
            <p className="text-sm mt-1" style={{ color: DS.textSec }}>
              Decisoes, bloqueios, ordens, trades e incidentes em uma unica sequencia temporal.
            </p>
          </div>
          <Badge label={`${items.length} EVENTS`} color={DS.info} size="xs" />
        </div>

        <div className="space-y-2">
          {items.length === 0 ? (
            <div
              className="rounded-xl px-4 py-5 text-sm"
              style={{ background: DS.elevated, border: `1px solid ${DS.border}`, color: DS.textSec }}
            >
              No recent operational events were returned by the backend.
            </div>
          ) : (
            items.map((item, index) => (
              <div
                key={item.id}
                className={`relative rounded-xl p-3.5 md:p-4 overflow-hidden ${freshIds.has(item.id) ? 'live-enter' : ''}`}
                style={{ background: DS.elevated, border: `1px solid ${DS.border}` }}
              >
                <div
                  className="absolute left-0 top-0 bottom-0 w-[3px]"
                  style={{ background: item.tone }}
                />
                <div className="flex items-start gap-3">
                  <div className="pt-1">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: item.tone, boxShadow: `0 0 10px ${item.tone}70` }}
                    />
                    {index < items.length - 1 && (
                      <div className="w-px h-10 mx-auto mt-1" style={{ background: `${DS.border}` }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge label={item.lane} color={item.tone} size="xs" />
                        <span className="text-sm font-semibold" style={{ color: DS.text }}>
                          {item.title}
                        </span>
                        <span className="text-[10px]" style={{ color: DS.textMuted, fontFamily: DS.mono }}>
                          {fmt.ago(item.time)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px]" style={{ color: item.tone, fontFamily: DS.mono }}>
                          {item.meta}
                        </span>
                        <span className="text-[10px]" style={{ color: DS.textMuted, fontFamily: DS.mono }}>
                          {fmt.time(item.time)}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed mt-2" style={{ color: DS.textSec }}>
                      {item.detail}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// Loading / Error screens
// ─────────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ background: DS.bg }}
    >
      <div className="text-center space-y-3">
        <div
          className="w-8 h-8 mx-auto rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: `${DS.info} transparent ${DS.info} ${DS.info}` }}
        />
        <p className="text-sm" style={{ color: DS.textSec, fontFamily: DS.mono }}>
          Connecting to CryptoBot…
        </p>
      </div>
    </div>
  );
}

function ErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ background: DS.bg }}
    >
      <div
        className="rounded-xl p-8 max-w-sm w-full text-center mx-4 space-y-4"
        style={{ background: DS.surface, border: `1px solid ${DS.lossBorder}` }}
      >
        <div
          className="w-12 h-12 rounded-full mx-auto flex items-center justify-center"
          style={{ background: DS.lossBg, border: `1px solid ${DS.lossBorder}` }}
        >
          <span style={{ color: DS.loss, fontSize: 22 }}>⚠</span>
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: DS.loss }}>
            Connection Error
          </p>
          <p
            className="text-xs mt-1 break-all"
            style={{ color: DS.textSec, fontFamily: DS.mono }}
          >
            {error}
          </p>
        </div>
        <button
          onClick={onRetry}
          className="px-5 py-2 rounded-lg text-xs font-semibold transition-colors"
          style={{
            color: DS.info,
            background: DS.infoBg,
            border: `1px solid ${DS.infoBorder}`,
            fontFamily: DS.mono,
          }}
        >
          Retry Connection
        </button>
      </div>
    </div>
  );
}

function ActionDialog({
  state,
  busy,
  feedback,
  onClose,
  onReasonChange,
  onSubmit,
}: {
  state: ActionDialogState | null;
  busy: boolean;
  feedback: string | null;
  onClose: () => void;
  onReasonChange: (reason: string) => void;
  onSubmit: () => void;
}) {
  if (!state) return null;

  const isKill = state.action === 'kill';
  const accent = isKill ? DS.loss : state.action === 'pause' ? DS.warning : DS.profit;
  const title = `${state.action.toUpperCase()} System`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(3, 10, 16, 0.72)', backdropFilter: 'blur(8px)' }}
        onClick={busy ? undefined : onClose}
      />
      <div
        className="relative w-full max-w-md rounded-2xl p-5 space-y-4"
        style={{
          background: DS.surface,
          border: `1px solid ${accent}50`,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.42)',
          backdropFilter: 'blur(22px)',
        }}
      >
        <div className="space-y-1">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: accent, fontFamily: DS.mono }}
          >
            Control Plane
          </p>
          <h2 className="text-xl font-bold" style={{ color: DS.text, fontFamily: DS.font }}>
            {title}
          </h2>
          <p className="text-sm" style={{ color: DS.textSec }}>
            {isKill
              ? 'This closes all positions and requires a restart before trading resumes.'
              : 'Provide an operational reason so the action is traceable in the audit log.'}
          </p>
        </div>

        <label className="block space-y-2">
          <span className="text-[11px] uppercase tracking-[0.16em]" style={{ color: DS.textMuted }}>
            Reason
          </span>
          <textarea
            value={state.reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={4}
            placeholder="Describe why this action is necessary"
            className="w-full rounded-xl px-3 py-3 text-sm resize-none outline-none"
            style={{
              color: DS.text,
              background: DS.elevated,
              border: `1px solid ${DS.border}`,
              fontFamily: DS.font,
            }}
          />
        </label>

        {feedback && (
          <div
            className="rounded-xl px-3 py-2 text-sm"
            style={{
              color: feedback.startsWith('Action failed') ? DS.loss : DS.textSec,
              background: feedback.startsWith('Action failed') ? DS.lossBg : DS.elevated,
              border: `1px solid ${feedback.startsWith('Action failed') ? DS.lossBorder : DS.border}`,
            }}
          >
            {feedback}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-[0.16em]"
            style={{
              color: DS.textSec,
              background: 'transparent',
              border: `1px solid ${DS.border}`,
              fontFamily: DS.mono,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={busy || state.reason.trim().length < 6}
            className="px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-[0.16em] disabled:opacity-50"
            style={{
              color: accent,
              background: `${accent}12`,
              border: `1px solid ${accent}45`,
              fontFamily: DS.mono,
            }}
          >
            {busy ? 'Executing...' : `Confirm ${state.action}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [data,        setData]        = useState<DashboardData | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [healthData,  setHealthData]  = useState<Record<string, unknown> | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [execTab,     setExecTab]     = useState<ExecTab>('orders');
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [cycleChanges, setCycleChanges] = useState<CycleChange[]>([]);
  const [freshEventIds, setFreshEventIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const previousDataRef = useRef<DashboardData | null>(null);

  async function fetchData() {
    try {
      const result = await api.dashboard() as DashboardData;
      setCycleChanges(computeCycleChanges(previousDataRef.current, result));
      setFreshEventIds(new Set(computeFreshEventIds(previousDataRef.current, result)));
      previousDataRef.current = result;
      setData(result);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect to API');
    } finally {
      setLoading(false);
    }
  }

  async function fetchHealth() {
    try {
      setHealthData(await api.health() as Record<string, unknown>);
    } catch { /* non-critical */ }
  }

  async function fetchSession() {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    if (!response.ok) {
      router.replace('/login');
      return;
    }

    const result = await response.json() as {
      authenticated: boolean;
      username: string;
      role: 'viewer' | 'admin';
    };

    if (!result.authenticated) {
      router.replace('/login');
      return;
    }

    setSession({ username: result.username, role: result.role });
  }

  useEffect(() => {
    fetchSession();
    fetchData();
    fetchHealth();
    const d = setInterval(fetchData,   5_000);
    const h = setInterval(fetchHealth, 15_000);
    return () => { clearInterval(d); clearInterval(h); };
  }, []);

  useEffect(() => {
    if (freshEventIds.size === 0) return;
    const timeout = window.setTimeout(() => setFreshEventIds(new Set()), 4500);
    return () => window.clearTimeout(timeout);
  }, [freshEventIds]);

  function handleAction(action: string) {
    if (session?.role !== 'admin') return;
    if (action === 'pause' || action === 'resume' || action === 'kill') {
      setActionFeedback(null);
      setActionDialog({ action, reason: '' });
    }
  }

  function submitAction() {
    if (!actionDialog || session?.role !== 'admin') return;

    startTransition(async () => {
      try {
        if (actionDialog.action === 'pause') await api.pause(actionDialog.reason.trim());
        if (actionDialog.action === 'resume') await api.resume(actionDialog.reason.trim());
        if (actionDialog.action === 'kill') await api.kill(actionDialog.reason.trim());
        await fetchData();
        setActionDialog(null);
        setActionFeedback(null);
      } catch (e) {
        setActionFeedback(`Action failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    });
  }

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen error={error ?? 'No data received'} onRetry={fetchData} />;

  const {
    system, portfolio, riskLimits,
    recentDecisions, recentOrders, recentIncidents, recentLifecycles,
  } = data;

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: DS.bg }}>
      <div
        className="absolute inset-x-0 top-0 h-[32rem] pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 12% 0%, rgba(20,184,166,0.18), transparent 32%), radial-gradient(circle at 88% 0%, rgba(59,130,246,0.18), transparent 30%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent 36%)',
        }}
      />
      {/* ── Fixed header ── */}
      <DashboardHeader
        system={system}
        lastUpdated={lastUpdated}
        onAction={handleAction}
        role={session?.role ?? null}
        onLogout={() => {
          startTransition(async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            router.replace('/login');
            router.refresh();
          });
        }}
      />

      {/* ── Scrollable content ── */}
      <main className="relative flex-1 px-4 md:px-6 py-5 md:py-6 max-w-[1520px] mx-auto w-full space-y-6">
        <EnvironmentBannerCard
          system={system}
          healthData={healthData}
        />

        <QuickStatsGrid
          system={system}
          portfolio={portfolio}
          lastUpdated={lastUpdated}
        />

        <CycleDeltaBar changes={cycleChanges} />

        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-5 items-start">
          <AIDecisionCard decisions={recentDecisions} />
          <MarketOverviewCard latestDecision={recentDecisions[0] ?? null} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
          <WhyNoTradeCard decisions={recentDecisions} />
          <RiskControlCard
            portfolio={{
              consecutiveLosses: portfolio.consecutiveLosses,
              dailyTradeCount:   portfolio.dailyTradeCount,
              totalExposure:     portfolio.totalExposure,
            }}
            riskLimits={riskLimits}
          />
        </div>

        <EventStream
          decisions={recentDecisions}
          orders={recentOrders}
          incidents={recentIncidents}
          lifecycles={recentLifecycles}
          freshIds={freshEventIds}
        />

        <PositionStatusCard
          openPositions={portfolio.openPositions}
          orders={recentOrders}
          lifecycles={recentLifecycles}
          activeTab={execTab}
          setTab={setExecTab}
        />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <PerformanceCard
            portfolio={portfolio}
            lifecycles={recentLifecycles}
          />
          <SystemHealthCard
            health={healthData}
            system={system}
            incidents={recentIncidents}
          />
        </div>

        {/* Footer */}
        <p
          className="text-center text-[10px] pb-4"
          style={{ color: DS.textMuted, fontFamily: DS.mono }}
        >
          CryptoBot Platform v{system.version} · {system.mode} mode ·
          Automated algorithmic trading · Not financial advice
        </p>
      </main>

      <ActionDialog
        state={actionDialog}
        busy={isPending}
        feedback={actionFeedback}
        onClose={() => {
          if (!isPending) {
            setActionDialog(null);
            setActionFeedback(null);
          }
        }}
        onReasonChange={(reason) => setActionDialog((current) => current ? { ...current, reason } : current)}
        onSubmit={submitAction}
      />
    </div>
  );
}
