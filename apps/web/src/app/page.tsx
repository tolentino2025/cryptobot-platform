'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import {
  cn, formatUSD, formatPercent, formatDate, formatDuration,
  stateColor, stateBg, modeColor, verdictColor, pnlColor, formatNumber,
} from '@/lib/utils';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

interface DashboardData {
  system: { state: string; mode: string; uptime: number; version: string };
  portfolio: {
    totalEquity: number; availableBalance: number; totalExposure: number;
    exposurePercent: number; dailyPnl: number; dailyPnlPercent: number;
    weeklyPnl: number; totalRealizedPnl: number; dailyTradeCount: number;
    consecutiveLosses: number; openPositions: any[];
  };
  riskLimits: any;
  recentDecisions: any[];
  recentOrders: any[];
  recentIncidents: any[];
}

// ═══════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-[#1a1f2e] border border-[#2a3042] rounded-xl p-5', className)}>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <Card>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={cn('text-2xl font-bold font-mono', color ?? 'text-white')}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </Card>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border',
      className,
    )}>
      {children}
    </span>
  );
}

function SectionTitle({ children, icon }: { children: React.ReactNode; icon?: string }) {
  return (
    <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
      {icon && <span>{icon}</span>}
      {children}
    </h2>
  );
}

// ── LIVE MODE BANNER ──
function LiveBanner({ mode }: { mode: string }) {
  if (mode !== 'LIVE') return null;
  return (
    <div className="bg-red-900/40 border-2 border-red-500 rounded-xl p-4 mb-6 flex items-center gap-3 animate-pulse">
      <span className="text-3xl">🚨</span>
      <div>
        <p className="text-red-300 font-bold text-lg">LIVE MODE — REAL MONEY AT RISK</p>
        <p className="text-red-400 text-sm">All trades are executed with real funds on the exchange.</p>
      </div>
    </div>
  );
}

// ── SYSTEM HEADER ──
function SystemHeader({ system, onAction }: { system: DashboardData['system']; onAction: (action: string) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold text-white tracking-tight">
          <span className="text-cyan-400">Crypto</span>Bot
        </h1>
        <Badge className={stateBg(system.state)}>
          <span className={cn('w-2 h-2 rounded-full mr-1.5 animate-pulse', {
            'bg-emerald-400': system.state === 'RUNNING',
            'bg-amber-400': system.state === 'PAUSED',
            'bg-red-400': system.state === 'KILLED',
            'bg-blue-400': system.state === 'INITIALIZING',
          })} />
          <span className={stateColor(system.state)}>{system.state}</span>
        </Badge>
        <Badge className={modeColor(system.mode)}>{system.mode}</Badge>
        <span className="text-xs text-slate-500">v{system.version}</span>
        <span className="text-xs text-slate-500">Up: {formatDuration(Math.floor(system.uptime))}</span>
      </div>
      <div className="flex gap-2">
        {system.state === 'RUNNING' && (
          <button onClick={() => onAction('pause')}
            className="px-3 py-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-sm hover:bg-amber-500/30 transition">
            ⏸ Pause
          </button>
        )}
        {system.state === 'PAUSED' && (
          <button onClick={() => onAction('resume')}
            className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-sm hover:bg-emerald-500/30 transition">
            ▶ Resume
          </button>
        )}
        {system.state !== 'KILLED' && (
          <button onClick={() => onAction('kill')}
            className="px-3 py-1.5 bg-red-500/20 text-red-300 border border-red-500/30 rounded-lg text-sm hover:bg-red-500/30 transition">
            ⛔ Kill
          </button>
        )}
      </div>
    </div>
  );
}

// ── DECISIONS TABLE ──
function DecisionsSection({ decisions }: { decisions: any[] }) {
  return (
    <Card>
      <SectionTitle icon="🤖">AI Decisions</SectionTitle>
      {decisions.length === 0 ? (
        <p className="text-slate-500 text-sm">No decisions yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-xs uppercase border-b border-[#2a3042]">
                <th className="text-left pb-2 pr-3">Time</th>
                <th className="text-left pb-2 pr-3">Action</th>
                <th className="text-left pb-2 pr-3">Symbol</th>
                <th className="text-right pb-2 pr-3">Conf.</th>
                <th className="text-left pb-2 pr-3">Verdict</th>
                <th className="text-right pb-2 pr-3">Latency</th>
                <th className="text-left pb-2">Thesis</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((d: any) => (
                <tr key={d.id} className="border-b border-[#2a3042]/50 hover:bg-white/[0.02]">
                  <td className="py-2 pr-3 text-slate-400 font-mono text-xs">{formatDate(d.createdAt)}</td>
                  <td className="py-2 pr-3">
                    <Badge className={
                      d.action === 'BUY' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                      d.action === 'SELL' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                      d.action === 'EXIT' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                      'text-slate-400 bg-slate-500/10 border-slate-500/20'
                    }>{d.action}</Badge>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{d.symbol}</td>
                  <td className="py-2 pr-3 text-right font-mono">{formatNumber(d.confidence, 1)}</td>
                  <td className="py-2 pr-3">
                    <span className={verdictColor(d.verdict)}>{d.verdict}</span>
                    {d.denialReason && (
                      <span className="text-[10px] text-red-400/60 ml-1">({d.denialReason})</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs text-slate-400">{d.latencyMs}ms</td>
                  <td className="py-2 text-xs text-slate-400 max-w-[200px] truncate">{d.thesis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── ORDERS TABLE ──
function OrdersSection({ orders }: { orders: any[] }) {
  return (
    <Card>
      <SectionTitle icon="📋">Recent Orders</SectionTitle>
      {orders.length === 0 ? (
        <p className="text-slate-500 text-sm">No orders yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-xs uppercase border-b border-[#2a3042]">
                <th className="text-left pb-2 pr-3">Time</th>
                <th className="text-left pb-2 pr-3">Symbol</th>
                <th className="text-left pb-2 pr-3">Side</th>
                <th className="text-left pb-2 pr-3">Type</th>
                <th className="text-right pb-2 pr-3">Qty</th>
                <th className="text-right pb-2 pr-3">Price</th>
                <th className="text-left pb-2 pr-3">Status</th>
                <th className="text-left pb-2">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id} className="border-b border-[#2a3042]/50 hover:bg-white/[0.02]">
                  <td className="py-2 pr-3 text-slate-400 font-mono text-xs">{formatDate(o.createdAt)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{o.symbol}</td>
                  <td className="py-2 pr-3">
                    <span className={o.side === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>{o.side}</span>
                  </td>
                  <td className="py-2 pr-3 text-slate-400">{o.type}</td>
                  <td className="py-2 pr-3 text-right font-mono">{formatNumber(o.quantity, 5)}</td>
                  <td className="py-2 pr-3 text-right font-mono">{o.price ? formatUSD(o.price) : 'MKT'}</td>
                  <td className="py-2 pr-3">
                    <Badge className={
                      o.status === 'FILLED' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                      o.status === 'CANCELLED' || o.status === 'REJECTED' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                      o.status === 'OPEN' || o.status === 'SENT' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' :
                      'text-slate-400 bg-slate-500/10 border-slate-500/20'
                    }>{o.status}</Badge>
                  </td>
                  <td className="py-2 text-xs text-slate-500">{o.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── POSITIONS TABLE ──
function PositionsSection({ positions }: { positions: any[] }) {
  return (
    <Card>
      <SectionTitle icon="📊">Open Positions</SectionTitle>
      {positions.length === 0 ? (
        <p className="text-slate-500 text-sm">No open positions</p>
      ) : (
        <div className="space-y-3">
          {positions.map((p: any) => (
            <div key={p.id} className="bg-[#111827] rounded-lg p-4 border border-[#2a3042]/50">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-white">{p.symbol}</span>
                  <Badge className={
                    p.side === 'LONG' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                    'text-red-400 bg-red-500/10 border-red-500/20'
                  }>{p.side}</Badge>
                </div>
                <div className="text-right">
                  <p className={cn('font-mono font-bold', pnlColor(p.unrealizedPnl ?? 0))}>
                    {formatUSD(p.unrealizedPnl ?? 0)}
                  </p>
                  <p className={cn('text-xs font-mono', pnlColor(p.unrealizedPnlPercent ?? 0))}>
                    {formatPercent(p.unrealizedPnlPercent ?? 0)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4 mt-3 text-xs">
                <div>
                  <span className="text-slate-500">Entry</span>
                  <p className="font-mono text-white">{formatUSD(p.entryPrice)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Current</span>
                  <p className="font-mono text-white">{formatUSD(p.currentPrice ?? 0)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Qty</span>
                  <p className="font-mono text-white">{formatNumber(p.quantity, 5)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Notional</span>
                  <p className="font-mono text-white">{formatUSD(p.notional)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── INCIDENTS TABLE ──
function IncidentsSection({ incidents }: { incidents: any[] }) {
  return (
    <Card>
      <SectionTitle icon="🚨">Recent Incidents</SectionTitle>
      {incidents.length === 0 ? (
        <p className="text-slate-500 text-sm">No incidents</p>
      ) : (
        <div className="space-y-2">
          {incidents.map((i: any) => (
            <div key={i.id} className={cn(
              'rounded-lg p-3 border text-sm',
              i.severity === 'CRITICAL' || i.severity === 'FATAL'
                ? 'bg-red-900/20 border-red-500/30'
                : i.severity === 'WARNING'
                  ? 'bg-amber-900/20 border-amber-500/30'
                  : 'bg-slate-800/50 border-[#2a3042]',
            )}>
              <div className="flex justify-between">
                <span className={cn('font-medium', {
                  'text-red-300': i.severity === 'CRITICAL' || i.severity === 'FATAL',
                  'text-amber-300': i.severity === 'WARNING',
                  'text-slate-300': i.severity === 'INFO',
                })}>{i.title}</span>
                <span className="text-xs text-slate-500">{formatDate(i.createdAt)}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{i.description}</p>
              <div className="flex gap-2 mt-1">
                <Badge className={i.isActive
                  ? 'text-red-400 bg-red-500/10 border-red-500/20'
                  : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                }>{i.isActive ? 'ACTIVE' : 'RESOLVED'}</Badge>
                <span className="text-[10px] text-slate-500">{i.actionTaken}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════
// MAIN DASHBOARD PAGE
// ═══════════════════════════════════════════

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'decisions' | 'orders' | 'audit'>('overview');

  const fetchData = useCallback(async () => {
    try {
      const result = await api.dashboard();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect to API');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAction = async (action: string) => {
    const reason = prompt(`Reason for ${action}:`);
    if (!reason) return;
    try {
      if (action === 'pause') await api.pause(reason);
      if (action === 'resume') await api.resume(reason);
      if (action === 'kill') {
        if (!confirm('⚠️ KILL SWITCH: This will stop ALL trading and require a restart. Continue?')) return;
        await api.kill(reason);
      }
      await fetchData();
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Connecting to CryptoBot...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md text-center">
          <p className="text-red-400 text-lg mb-2">Connection Error</p>
          <p className="text-slate-400 text-sm mb-4">{error ?? 'No data available'}</p>
          <button onClick={fetchData} className="px-4 py-2 bg-cyan-500/20 text-cyan-300 rounded-lg text-sm hover:bg-cyan-500/30">
            Retry
          </button>
        </Card>
      </div>
    );
  }

  const { system, portfolio, recentDecisions, recentOrders, recentIncidents } = data;

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-[1600px] mx-auto">
      {/* LIVE Banner */}
      <LiveBanner mode={system.mode} />

      {/* Header */}
      <SystemHeader system={system} onAction={handleAction} />

      {/* Navigation Tabs */}
      <div className="flex gap-1 mb-6 bg-[#111827] p-1 rounded-lg w-fit">
        {(['overview', 'decisions', 'orders', 'audit'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium transition',
              activeTab === tab
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-400 hover:text-white hover:bg-white/5',
            )}
          >
            {tab === 'overview' ? '📊 Overview' :
             tab === 'decisions' ? '🤖 Decisions' :
             tab === 'orders' ? '📋 Orders' : '📜 Audit'}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === 'overview' && (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
            <StatCard label="Equity" value={formatUSD(portfolio.totalEquity)} />
            <StatCard label="Available" value={formatUSD(portfolio.availableBalance)} />
            <StatCard
              label="Daily PnL"
              value={formatUSD(portfolio.dailyPnl)}
              sub={formatPercent(portfolio.dailyPnlPercent)}
              color={pnlColor(portfolio.dailyPnl)}
            />
            <StatCard
              label="Weekly PnL"
              value={formatUSD(portfolio.weeklyPnl)}
              color={pnlColor(portfolio.weeklyPnl)}
            />
            <StatCard label="Exposure" value={formatPercent(portfolio.exposurePercent)}
              sub={formatUSD(portfolio.totalExposure)} />
            <StatCard label="Trades Today" value={String(portfolio.dailyTradeCount)}
              sub={`${portfolio.consecutiveLosses} consec. losses`}
              color={portfolio.consecutiveLosses >= 2 ? 'text-amber-400' : undefined} />
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <PositionsSection positions={portfolio.openPositions} />
            <IncidentsSection incidents={recentIncidents} />
          </div>

          {/* Latest Decisions */}
          <div className="mb-6">
            <DecisionsSection decisions={recentDecisions.slice(0, 5)} />
          </div>

          {/* Latest Orders */}
          <OrdersSection orders={recentOrders.slice(0, 5)} />
        </>
      )}

      {/* ── Decisions Tab ── */}
      {activeTab === 'decisions' && (
        <DecisionsSection decisions={recentDecisions} />
      )}

      {/* ── Orders Tab ── */}
      {activeTab === 'orders' && (
        <OrdersSection orders={recentOrders} />
      )}

      {/* ── Audit Tab ── */}
      {activeTab === 'audit' && (
        <Card>
          <SectionTitle icon="📜">Audit Trail</SectionTitle>
          <p className="text-slate-500 text-sm">
            Audit log viewer with filtering — connect to <code className="text-cyan-400">/audit</code> endpoint.
            Full audit data available via API with filters for eventType, severity, source, date range.
          </p>
          <div className="mt-4 space-y-2">
            {recentDecisions.map((d: any) => (
              <div key={d.id} className="text-xs font-mono text-slate-400 border-b border-[#2a3042]/30 pb-1">
                <span className="text-slate-500">{formatDate(d.createdAt)}</span>
                {' '}
                <span className={d.action === 'BUY' ? 'text-emerald-400' : d.action === 'SELL' ? 'text-red-400' : 'text-slate-400'}>
                  {d.action}
                </span>
                {' '}{d.symbol}{' '}
                <span className={verdictColor(d.verdict)}>{d.verdict}</span>
                {d.denialReason && <span className="text-red-400/50"> ({d.denialReason})</span>}
                {' — '}{d.thesis}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Footer */}
      <div className="mt-8 text-center text-xs text-slate-600 pb-4">
        CryptoBot Platform v0.1.0 — No guarantee of financial returns — Priority: robustness &amp; risk control
      </div>
    </div>
  );
}
