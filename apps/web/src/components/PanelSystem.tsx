'use client';

import { T } from './charts';
import { formatDuration } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────
// Latency row
// ─────────────────────────────────────────────────────────────────
function LatencyRow({ label, ms, threshold = 100 }: { label: string; ms: number | null; threshold?: number }) {
  const color =
    ms === null ? T.neutral
    : ms > threshold * 3 ? T.loss
    : ms > threshold ? T.warning
    : T.profit;

  const barPct = ms === null ? 0 : Math.min(100, (ms / (threshold * 4)) * 100);

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-[#1E2A35]">
      {/* Status dot */}
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: color, boxShadow: `0 0 4px ${color}` }}
      />
      <span style={{ color: T.neutral, fontSize: 9, flex: 1, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </span>
      {/* Bar */}
      <div className="w-16 h-1 rounded-full overflow-hidden flex-shrink-0" style={{ background: '#1E2A35' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${barPct}%`, background: color, boxShadow: `0 0 3px ${color}50` }}
        />
      </div>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', color, fontSize: 9, fontWeight: 700, width: 40, textAlign: 'right', flexShrink: 0 }}>
        {ms === null ? '—' : `${ms}ms`}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Incident item
// ─────────────────────────────────────────────────────────────────
function IncidentItem({ incident }: { incident: Record<string, unknown> }) {
  const severity = String(incident.severity ?? 'LOW');
  const type     = String(incident.type ?? '');
  const isActive = Boolean(incident.isActive);
  const color    = severity === 'CRITICAL' ? T.loss : severity === 'HIGH' ? T.warning : T.neutral;

  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-[#1E2A35]">
      <div
        className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0"
        style={{ background: isActive ? color : T.dim, boxShadow: isActive ? `0 0 4px ${color}` : undefined }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span style={{ fontFamily: 'JetBrains Mono, monospace', color, fontSize: 8, fontWeight: 700 }}>
            {severity}
          </span>
          <span style={{ color: T.text, fontSize: 9, fontWeight: 600 }} className="truncate">
            {type}
          </span>
          {isActive && (
            <span className="text-[7px] font-bold px-1 py-0.5 rounded border"
              style={{ color: T.loss, borderColor: `${T.loss}40`, background: `${T.loss}10` }}>
              ACTIVE
            </span>
          )}
        </div>
        {!!incident.message && (
          <div style={{ color: T.neutral, fontSize: 8, marginTop: 1 }} className="truncate">
            {String(incident.message).slice(0, 60)}
          </div>
        )}
      </div>
      <span style={{ color: T.dim, fontSize: 8, fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>
        {new Date(incident.createdAt as string).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Service status light
// ─────────────────────────────────────────────────────────────────
function ServiceLight({ label, healthy }: { label: string; healthy: boolean | null }) {
  const color = healthy === null ? T.neutral : healthy ? T.profit : T.loss;
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-2.5 h-2.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color}80` }}
      />
      <span style={{ color: T.neutral, fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>
        {label}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Panel
// ─────────────────────────────────────────────────────────────────

interface Props {
  health:    Record<string, unknown> | null;
  system:    { state: string; mode: string; uptime: number; version: string };
  incidents: Record<string, unknown>[];
}

export function PanelSystem({ health, system, incidents }: Props) {
  const services = health?.services as Record<string, unknown> | null ?? null;
  const latencies = health?.latencies as Record<string, number | null> | null ?? null;

  const exchangeMs   = latencies?.exchange   ?? null;
  const marketDataMs = latencies?.marketData ?? null;
  const aiMs         = latencies?.ai         ?? null;
  const redisMs      = latencies?.redis      ?? null;
  const dbMs         = latencies?.database   ?? null;
  const clockDrift   = latencies?.clockDrift ?? null;

  const svcExchange  = services ? (services.exchange   as boolean | null ?? null) : null;
  const svcDb        = services ? (services.database   as boolean | null ?? null) : null;
  const svcAi        = services ? (services.ai         as boolean | null ?? null) : null;
  const svcRisk      = services ? (services.risk       as boolean | null ?? null) : null;
  const svcExec      = services ? (services.execution  as boolean | null ?? null) : null;
  const svcPortfolio = services ? (services.portfolio  as boolean | null ?? null) : null;

  const activeIncidents = incidents.filter((i) => i.isActive);
  const overallHealthy  = activeIncidents.length === 0 &&
    [svcExchange, svcDb, svcAi, svcRisk, svcExec, svcPortfolio].every((s) => s !== false);

  const statusColor = overallHealthy
    ? T.profit
    : activeIncidents.length > 0 || [svcExchange, svcDb].some((s) => s === false)
    ? T.loss
    : T.warning;

  return (
    <div className="flex flex-col h-full gap-2 p-3">
      {/* Panel label */}
      <div className="flex items-center justify-between flex-shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: T.warning }}>
          ▸ SYSTEM HEALTH
        </span>
        <span
          className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border"
          style={{
            color: statusColor,
            borderColor: `${statusColor}40`,
            background: `${statusColor}10`,
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          {overallHealthy ? 'NOMINAL' : activeIncidents.length > 0 ? 'INCIDENT' : 'DEGRADED'}
        </span>
      </div>

      {/* Service lights */}
      <div className="flex items-center justify-around px-1 py-2 rounded-xl border flex-shrink-0"
        style={{ borderColor: '#1E2A35', background: '#0E1520' }}>
        <ServiceLight label="Exchange"  healthy={svcExchange}  />
        <ServiceLight label="Database"  healthy={svcDb}        />
        <ServiceLight label="AI"        healthy={svcAi}        />
        <ServiceLight label="Risk"      healthy={svcRisk}      />
        <ServiceLight label="Execution" healthy={svcExec}      />
        <ServiceLight label="Portfolio" healthy={svcPortfolio} />
      </div>

      {/* Latency section */}
      <div className="flex-shrink-0">
        <span style={{ color: T.neutral, fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 2 }}>
          Latencies
        </span>
        <LatencyRow label="Exchange"    ms={exchangeMs}   threshold={80}  />
        <LatencyRow label="Market Data" ms={marketDataMs} threshold={200} />
        <LatencyRow label="AI Inference"ms={aiMs}         threshold={2000}/>
        <LatencyRow label="Database"    ms={dbMs}         threshold={50}  />
        <LatencyRow label="Redis"       ms={redisMs}      threshold={10}  />
        {clockDrift !== null && (
          <LatencyRow label="Clock Drift" ms={clockDrift}  threshold={500} />
        )}
      </div>

      {/* Uptime + version row */}
      <div className="flex items-center gap-3 flex-shrink-0 px-1">
        <div>
          <div style={{ color: T.neutral, fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Uptime</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', color: T.text, fontSize: 10, fontWeight: 700 }}>
            {formatDuration(system.uptime)}
          </div>
        </div>
        <div>
          <div style={{ color: T.neutral, fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Mode</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace',
            color: system.mode === 'LIVE' ? T.loss : system.mode === 'DEMO' ? T.warning : T.info,
            fontSize: 10, fontWeight: 700 }}>
            {system.mode}
          </div>
        </div>
        <div>
          <div style={{ color: T.neutral, fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>State</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace',
            color: system.state === 'RUNNING' ? T.profit : system.state === 'HALTED' ? T.loss : T.warning,
            fontSize: 10, fontWeight: 700 }}>
            {system.state}
          </div>
        </div>
        <div className="ml-auto">
          <div style={{ color: T.neutral, fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Version</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', color: T.dim, fontSize: 9 }}>
            v{system.version}
          </div>
        </div>
      </div>

      {/* Incident timeline */}
      <div className="flex-1 min-h-0 overflow-auto">
        <span style={{ color: T.neutral, fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 4 }}>
          Incident Log ({incidents.length})
        </span>
        {incidents.length === 0 ? (
          <div className="flex items-center justify-center py-4" style={{ color: T.neutral, fontSize: 10 }}>
            No incidents recorded
          </div>
        ) : (
          incidents.slice(0, 8).map((inc) => (
            <IncidentItem key={String(inc.id)} incident={inc} />
          ))
        )}
      </div>
    </div>
  );
}
