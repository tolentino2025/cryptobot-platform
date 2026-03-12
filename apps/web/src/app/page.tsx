'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { PanelPerformance } from '@/components/PanelPerformance';
import { PanelRisk }        from '@/components/PanelRisk';
import { PanelMarket }      from '@/components/PanelMarket';
import { PanelAI }          from '@/components/PanelAI';
import { PanelTrading }     from '@/components/PanelTrading';
import { PanelSystem }      from '@/components/PanelSystem';
import { T }                from '@/components/charts';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

interface DashboardData {
  system: {
    state:       string;
    mode:        string;
    uptime:      number;
    version:     string;
    haltReason:  string | null;
  };
  portfolio: {
    totalEquity:      number;
    availableBalance: number;
    totalExposure:    number;
    exposurePercent:  number;
    dailyPnl:         number;
    dailyPnlPercent:  number;
    weeklyPnl:        number;
    totalRealizedPnl: number;
    dailyTradeCount:  number;
    consecutiveLosses:number;
    openPositions:    Record<string, unknown>[];
    unrealizedPnl:    number;
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

type TradingSubTab = 'lifecycle' | 'orders';

// ─────────────────────────────────────────────────────────────────────
// Loading / Error
// ─────────────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center w-screen h-screen" style={{ background: T.bg }}>
      <div className="text-center">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent mx-auto mb-3 animate-spin"
          style={{ borderColor: `${T.info} transparent ${T.info} ${T.info}` }}
        />
        <p style={{ color: T.neutral, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>
          Connecting to CryptoBot…
        </p>
      </div>
    </div>
  );
}

function ErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-center w-screen h-screen" style={{ background: T.bg }}>
      <div
        className="rounded-xl border p-8 max-w-sm w-full text-center mx-4"
        style={{ borderColor: `${T.loss}30`, background: T.panel }}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: `${T.loss}10`, border: `1px solid ${T.loss}30` }}
        >
          <span style={{ color: T.loss, fontSize: 18 }}>⚠</span>
        </div>
        <p style={{ color: T.loss, fontWeight: 700, marginBottom: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
          Connection Error
        </p>
        <p style={{ color: T.neutral, fontSize: 10, marginBottom: 18, fontFamily: 'JetBrains Mono, monospace', wordBreak: 'break-all' }}>
          {error}
        </p>
        <button
          onClick={onRetry}
          className="px-5 py-2 rounded-lg text-xs font-semibold transition-colors"
          style={{
            background: `${T.info}15`,
            color: T.info,
            border: `1px solid ${T.info}30`,
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          Retry
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Terminal header bar
// ─────────────────────────────────────────────────────────────────────

function TerminalHeader({
  system,
  lastUpdated,
  onAction,
}: {
  system: DashboardData['system'];
  lastUpdated: Date | null;
  onAction: (action: string) => void;
}) {
  const stateColor =
    system.state === 'RUNNING' ? T.profit
    : system.state === 'HALTED' ? T.loss
    : T.warning;

  const modeColor =
    system.mode === 'LIVE' ? T.loss
    : system.mode === 'DEMO' ? T.warning
    : T.info;

  return (
    <div
      className="flex items-center gap-3 px-3 h-10 flex-shrink-0 border-b select-none"
      style={{ background: T.panel, borderColor: T.dim }}
    >
      {/* Logo */}
      <span
        className="text-[11px] font-black tracking-[0.25em] uppercase flex-shrink-0"
        style={{ fontFamily: 'JetBrains Mono, monospace', color: T.profit, textShadow: `0 0 10px ${T.profit}60` }}
      >
        CRYPTOBOT
      </span>

      {/* Divider */}
      <div className="w-px h-4 flex-shrink-0" style={{ background: T.dim }} />

      {/* State + mode badges */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span
          className="text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded border"
          style={{ color: stateColor, borderColor: `${stateColor}40`, background: `${stateColor}10`,
            fontFamily: 'JetBrains Mono, monospace', textShadow: `0 0 5px ${stateColor}` }}
        >
          {system.state}
        </span>
        <span
          className="text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded border"
          style={{ color: modeColor, borderColor: `${modeColor}40`, background: `${modeColor}10`,
            fontFamily: 'JetBrains Mono, monospace' }}
        >
          {system.mode}
        </span>
      </div>

      {/* Last update */}
      <span style={{ color: T.neutral, fontSize: 8, fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>
        {lastUpdated ? `updated ${lastUpdated.toLocaleTimeString()}` : 'connecting…'}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Control buttons */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {[
          { label: 'PAUSE',  action: 'pause',  color: T.warning },
          { label: 'RESUME', action: 'resume', color: T.profit  },
          { label: 'KILL',   action: 'kill',   color: T.loss    },
        ].map(({ label, action, color }) => (
          <button
            key={action}
            onClick={() => onAction(action)}
            className="px-2.5 py-1 rounded text-[8px] font-black tracking-wider transition-colors"
            style={{
              color,
              border: `1px solid ${color}30`,
              background: `${color}08`,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Version */}
      <span style={{ color: T.dim, fontSize: 8, fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>
        v{system.version}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Panel wrapper (border + bg)
// ─────────────────────────────────────────────────────────────────────

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden"
      style={{
        background: T.panel,
        border: `1px solid ${T.dim}`,
        borderRadius: 8,
        minHeight: 0,
      }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data,        setData]        = useState<DashboardData | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [healthData,  setHealthData]  = useState<Record<string, unknown> | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [subTab,      setSubTab]      = useState<TradingSubTab>('lifecycle');

  const fetchData = useCallback(async () => {
    try {
      const result = await api.dashboard();
      setData(result);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const health = await api.health();
      setHealthData(health);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchHealth();
    const d = setInterval(fetchData,   5_000);
    const h = setInterval(fetchHealth, 15_000);
    return () => { clearInterval(d); clearInterval(h); };
  }, [fetchData, fetchHealth]);

  const handleAction = async (action: string) => {
    const reason = prompt(`Reason for ${action}:`);
    if (!reason) return;
    try {
      if (action === 'pause')  await api.pause(reason);
      if (action === 'resume') await api.resume(reason);
      if (action === 'kill') {
        if (!confirm('⚠ KILL SWITCH — Stops ALL trading. Continue?')) return;
        await api.kill(reason);
      }
      await fetchData();
    } catch (e) {
      alert(`Action failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen error={error ?? 'No data'} onRetry={fetchData} />;

  const { system, portfolio, riskLimits, recentDecisions, recentOrders, recentIncidents, recentLifecycles } = data;
  const latestDecision = recentDecisions[0] ?? null;
  const symbol = latestDecision
    ? String((latestDecision.inputSummary as Record<string, unknown> | null)?.symbol ?? 'BTCUSDT')
    : 'BTCUSDT';

  return (
    <div
      className="flex flex-col"
      style={{ width: '100vw', height: '100vh', background: T.bg, overflow: 'hidden' }}
    >
      {/* ── TOP BAR ── */}
      <TerminalHeader system={system} lastUpdated={lastUpdated} onAction={handleAction} />

      {/* ── HALT BANNER ── */}
      {system.state === 'HALTED' && (
        <div
          className="flex items-center gap-2 px-4 py-1.5 flex-shrink-0 border-b"
          style={{ background: `${T.loss}12`, borderColor: `${T.loss}30` }}
        >
          <span
            className="text-[8px] font-black tracking-widest"
            style={{ color: T.loss, fontFamily: 'JetBrains Mono, monospace', textShadow: `0 0 6px ${T.loss}` }}
          >
            ● SYSTEM HALTED
          </span>
          {system.haltReason && (
            <span style={{ color: T.neutral, fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}>
              — {system.haltReason}
            </span>
          )}
        </div>
      )}

      {/* ── 2×3 PANEL GRID ── */}
      <div
        className="flex-1 grid min-h-0"
        style={{
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows:    '1fr 1fr 1fr',
          gap: 4,
          padding: 4,
        }}
      >
        {/* Row 1 */}
        <Panel>
          <PanelPerformance portfolio={portfolio} lifecycles={recentLifecycles} />
        </Panel>
        <Panel>
          <PanelRisk
            portfolio={{
              consecutiveLosses: portfolio.consecutiveLosses,
              dailyTradeCount:   portfolio.dailyTradeCount,
              totalExposure:     portfolio.totalExposure,
            }}
            riskLimits={riskLimits}
          />
        </Panel>

        {/* Row 2 */}
        <Panel>
          <PanelMarket latestDecision={latestDecision} symbol={symbol} />
        </Panel>
        <Panel>
          <PanelAI decisions={recentDecisions} />
        </Panel>

        {/* Row 3 */}
        <Panel>
          <PanelTrading
            positions={portfolio.openPositions}
            lifecycles={recentLifecycles}
            orders={recentOrders}
            activeSubTab={subTab}
            setSubTab={setSubTab}
          />
        </Panel>
        <Panel>
          <PanelSystem
            health={healthData}
            system={system}
            incidents={recentIncidents}
          />
        </Panel>
      </div>
    </div>
  );
}
