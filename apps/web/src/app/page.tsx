'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { cn, pnlColor } from '@/lib/utils';

// Components
import { Header, LiveBanner, HaltBanner }   from '@/components/Header';
import { PerformancePanel }                  from '@/components/PerformancePanel';
import { RiskPanel }                         from '@/components/RiskPanel';
import { MarketRegimePanel, LatestDecisionPanel } from '@/components/MarketAIPanel';
import { PositionsPanel }                    from '@/components/PositionsPanel';
import { IncidentsPanel }                    from '@/components/IncidentsPanel';
import { SystemStatusPanel, HealthPanel }    from '@/components/SystemHealthPanel';
import { DecisionsTable, OrdersTable, LifecycleTable } from '@/components/DetailTables';
import { Card, SectionLabel }                from '@/components/ui';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

interface DashboardData {
  system: {
    state: string;
    mode: string;
    uptime: number;
    version: string;
    haltReason: string | null;
  };
  portfolio: {
    totalEquity: number;
    availableBalance: number;
    totalExposure: number;
    exposurePercent: number;
    dailyPnl: number;
    dailyPnlPercent: number;
    weeklyPnl: number;
    totalRealizedPnl: number;
    dailyTradeCount: number;
    consecutiveLosses: number;
    openPositions: Record<string, unknown>[];
    unrealizedPnl: number;
  };
  riskLimits: {
    maxDailyLoss: number;
    dailyLossRemaining: number | null;
    [key: string]: unknown;
  } | null;
  recentDecisions:  Record<string, unknown>[];
  recentOrders:     Record<string, unknown>[];
  recentIncidents:  Record<string, unknown>[];
  recentLifecycles: Record<string, unknown>[];
}

type TabKey = 'decisions' | 'orders' | 'lifecycle' | 'health';

// ─────────────────────────────────────────────────────────────────────
// Loading / Error screens
// ─────────────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0A0A0F]">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#64748B] text-sm font-mono">Connecting to CryptoBot…</p>
      </div>
    </div>
  );
}

function ErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0A0A0F]">
      <div className="bg-[#12121A] border border-[#1F1F2A] rounded-xl p-8 max-w-sm w-full text-center mx-4">
        <div className="w-12 h-12 rounded-full bg-[#EF4444]/10 border border-[#EF4444]/30 flex items-center justify-center mx-auto mb-4">
          <span className="text-[#EF4444] text-xl">⚠</span>
        </div>
        <p className="text-[#EF4444] font-bold mb-2">Connection Error</p>
        <p className="text-[#64748B] text-sm mb-5 font-mono break-all">{error}</p>
        <button
          onClick={onRetry}
          className="px-5 py-2 bg-[#3B82F6]/15 text-[#3B82F6] border border-[#3B82F6]/30 rounded-lg text-sm font-semibold hover:bg-[#3B82F6]/25 transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data,         setData]         = useState<DashboardData | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [activeTab,    setActiveTab]    = useState<TabKey>('decisions');
  const [healthData,   setHealthData]   = useState<Record<string, unknown> | null>(null);
  const [buildInfo,    setBuildInfo]    = useState<Record<string, unknown> | null>(null);
  const [lastUpdated,  setLastUpdated]  = useState<Date | null>(null);

  // ── Data fetching ──────────────────────────────────────
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
      const [health, bi] = await Promise.all([api.health(), api.buildInfo()]);
      setHealthData(health);
      setBuildInfo(bi);
    } catch {
      // non-critical — health tab will show stale data
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchHealth();
    const dataInterval   = setInterval(fetchData,   5_000);
    const healthInterval = setInterval(fetchHealth, 15_000);
    return () => {
      clearInterval(dataInterval);
      clearInterval(healthInterval);
    };
  }, [fetchData, fetchHealth]);

  // ── Action handler ─────────────────────────────────────
  const handleAction = async (action: string) => {
    const reason = prompt(`Reason for ${action}:`);
    if (!reason) return;
    try {
      if (action === 'pause')  await api.pause(reason);
      if (action === 'resume') await api.resume(reason);
      if (action === 'kill') {
        if (!confirm('⚠️ KILL SWITCH — Stops ALL trading and requires restart. Continue?')) return;
        await api.kill(reason);
      }
      await fetchData();
    } catch (e) {
      alert(`Action failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  // ── Early returns ──────────────────────────────────────
  if (loading)         return <LoadingScreen />;
  if (error || !data)  return <ErrorScreen error={error ?? 'No data'} onRetry={fetchData} />;

  const { system, portfolio, riskLimits, recentDecisions, recentOrders, recentIncidents, recentLifecycles } = data;
  const activeIncidents = recentIncidents.filter((i) => i.isActive).length;
  const latestDecision  = recentDecisions[0] ?? null;

  // Synthetic equity sparkline from session start to current
  const equitySparkData = (() => {
    const daily = portfolio.dailyPnl;
    const eq    = portfolio.totalEquity;
    // Approximate intraday curve as 5 points leading to current equity
    return [
      eq - daily * 1.0,
      eq - daily * 0.75,
      eq - daily * 0.5,
      eq - daily * 0.25,
      eq,
    ];
  })();

  // ── Tabs config ────────────────────────────────────────
  const tabs: { key: TabKey; label: string; icon: string; count?: number }[] = [
    { key: 'decisions', label: 'AI Decisions', icon: '🤖', count: recentDecisions.length  },
    { key: 'orders',    label: 'Orders',        icon: '📋', count: recentOrders.length     },
    { key: 'lifecycle', label: 'Lifecycle',     icon: '🔗', count: recentLifecycles?.length ?? 0 },
    { key: 'health',    label: 'Health',        icon: '🩺' },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0F]">

      {/* ── FIXED HEADER ── */}
      <Header
        system={system}
        activeIncidents={activeIncidents}
        onAction={handleAction}
        lastUpdated={lastUpdated}
      />

      {/* ── SCROLLABLE BODY ── */}
      <main className="pt-14 pb-10 px-3 md:px-5 xl:px-6 max-w-[1600px] mx-auto space-y-4">

        {/* Banners */}
        <div className="pt-4">
          <LiveBanner mode={system.mode} />
          <HaltBanner state={system.state} reason={system.haltReason} />
        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║  SECTION 1 — PERFORMANCE KPI CARDS          ║
            ╚══════════════════════════════════════════════╝ */}
        <PerformancePanel portfolio={portfolio} equitySparkData={equitySparkData} />

        {/* ╔══════════════════════════════════════════════╗
            ║  SECTION 2 — RISK + MARKET + AI DECISION    ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <RiskPanel portfolio={portfolio} riskLimits={riskLimits} />
          <MarketRegimePanel decision={latestDecision} />
          <LatestDecisionPanel decision={latestDecision} />
        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║  SECTION 3 — POSITIONS + STATUS SIDEBAR     ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PositionsPanel positions={portfolio.openPositions} />
          <div className="flex flex-col gap-4">
            <IncidentsPanel incidents={recentIncidents} />
            <SystemStatusPanel health={healthData} />
          </div>
        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║  SECTION 4 — DETAIL TABLES (Tabbed)         ║
            ╚══════════════════════════════════════════════╝ */}
        <div>
          {/* Tab navigation */}
          <div className="flex items-center gap-1 bg-[#12121A] border border-[#1F1F2A] p-1 rounded-xl w-fit mb-4 flex-wrap">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                  activeTab === tab.key
                    ? 'bg-[#3B82F6]/15 text-[#3B82F6] border border-[#3B82F6]/25'
                    : 'text-[#64748B] hover:text-white hover:bg-[#1F1F2A]',
                )}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none',
                      activeTab === tab.key
                        ? 'bg-[#3B82F6]/25 text-[#3B82F6]'
                        : 'bg-[#1F1F2A] text-[#64748B]',
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <Card className="p-4">
            {activeTab === 'decisions' && (
              <>
                <SectionLabel>AI Decision History</SectionLabel>
                <DecisionsTable decisions={recentDecisions} />
              </>
            )}
            {activeTab === 'orders' && (
              <>
                <SectionLabel>Order Execution Log</SectionLabel>
                <OrdersTable orders={recentOrders} />
              </>
            )}
            {activeTab === 'lifecycle' && (
              <>
                <SectionLabel>Trade Lifecycle</SectionLabel>
                <LifecycleTable lifecycles={recentLifecycles ?? []} />
              </>
            )}
            {activeTab === 'health' && (
              <HealthPanel health={healthData} buildInfo={buildInfo} />
            )}
          </Card>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-[#1F1F2A] font-mono pb-2">
          CryptoBot Platform v{system.version} · Automated Spot Trading ·
          No financial guarantees · Priority: robustness &amp; risk control
        </p>
      </main>
    </div>
  );
}
