'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

import { DS } from '@/components/v2/ui';
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

// ─────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [data,        setData]        = useState<DashboardData | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [healthData,  setHealthData]  = useState<Record<string, unknown> | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [execTab,     setExecTab]     = useState<ExecTab>('orders');

  const fetchData = useCallback(async () => {
    try {
      const result = await api.dashboard();
      setData(result);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect to API');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      setHealthData(await api.health());
    } catch { /* non-critical */ }
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
        if (!confirm('⚠ KILL SWITCH — This stops ALL trading activity. Continue?')) return;
        await api.kill(reason);
      }
      await fetchData();
    } catch (e) {
      alert(`Action failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  if (loading) return <LoadingScreen />;
  if (error || !data) return <ErrorScreen error={error ?? 'No data received'} onRetry={fetchData} />;

  const {
    system, portfolio, riskLimits,
    recentDecisions, recentOrders, recentIncidents, recentLifecycles,
  } = data;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: DS.bg }}>
      {/* ── Fixed header ── */}
      <DashboardHeader
        system={system}
        lastUpdated={lastUpdated}
        onAction={handleAction}
      />

      {/* ── Scrollable content ── */}
      <main className="flex-1 px-4 md:px-6 py-5 max-w-[1440px] mx-auto w-full space-y-5">

        {/* ── ROW 1: Market Overview + AI Decision ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <MarketOverviewCard latestDecision={recentDecisions[0] ?? null} />
          <AIDecisionCard decisions={recentDecisions} />
        </div>

        {/* ── ROW 2: Positions & Execution ── */}
        <PositionStatusCard
          openPositions={portfolio.openPositions}
          orders={recentOrders}
          lifecycles={recentLifecycles}
          activeTab={execTab}
          setTab={setExecTab}
        />

        {/* ── ROW 3: Risk + Performance ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-5">
          <RiskControlCard
            portfolio={{
              consecutiveLosses: portfolio.consecutiveLosses,
              dailyTradeCount:   portfolio.dailyTradeCount,
              totalExposure:     portfolio.totalExposure,
            }}
            riskLimits={riskLimits}
          />
          <PerformanceCard
            portfolio={portfolio}
            lifecycles={recentLifecycles}
          />
        </div>

        {/* ── ROW 4: System Health ── */}
        <SystemHealthCard
          health={healthData}
          system={system}
          incidents={recentIncidents}
        />

        {/* Footer */}
        <p
          className="text-center text-[10px] pb-4"
          style={{ color: DS.textMuted, fontFamily: DS.mono }}
        >
          CryptoBot Platform v{system.version} · {system.mode} mode ·
          Automated algorithmic trading · Not financial advice
        </p>
      </main>
    </div>
  );
}
