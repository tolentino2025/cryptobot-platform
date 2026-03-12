'use client';

import { useMemo } from 'react';
import { Card, CardHeader, Badge, StatusDot, DS, severityColor } from './ui';
import { fmt } from '@/lib/fmt';

type Incident = Record<string, unknown>;

function asNum(v: unknown): number | undefined {
  return typeof v === 'number' && isFinite(v) ? v : undefined;
}
function asBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  return null;
}
function asStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

// ─── Service light row ────────────────────────────────────────────
function ServiceRow({
  label,
  healthy,
  latencyMs,
  latencyThreshold = 100,
  extra,
}: {
  label: string;
  healthy: boolean | null;
  latencyMs?: number | null;
  latencyThreshold?: number;
  extra?: string;
}) {
  const statusColor =
    healthy === null ? DS.textMuted :
    healthy ? DS.profit : DS.loss;

  const latColor =
    latencyMs == null ? DS.textMuted :
    latencyMs > latencyThreshold * 5 ? DS.loss :
    latencyMs > latencyThreshold     ? DS.warning :
    DS.profit;

  return (
    <div
      className="flex items-center gap-3 py-2"
      style={{ borderBottom: `1px solid ${DS.border}` }}
    >
      <StatusDot color={statusColor} />
      <span className="text-xs flex-1 font-medium" style={{ color: DS.text }}>
        {label}
      </span>
      {extra && (
        <span className="text-[10px] hidden sm:block" style={{ color: DS.textMuted }}>
          {extra}
        </span>
      )}
      {latencyMs != null && (
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
          style={{ color: latColor, background: `${latColor}12`, fontFamily: DS.mono }}
        >
          {fmt.latency(latencyMs)}
        </span>
      )}
      <span
        className="text-[10px] font-semibold"
        style={{ color: statusColor, fontFamily: DS.mono, width: 52, textAlign: 'right' }}
      >
        {healthy === null ? 'Unknown' : healthy ? 'Healthy' : 'Failing'}
      </span>
    </div>
  );
}

// ─── Grouped incident row ─────────────────────────────────────────
interface GroupedIncident {
  type:      string;
  severity:  string;
  count:     number;
  lastAt:    string | null;
  isActive:  boolean;
  message:   string | null;
}

function IncidentGroupRow({ g }: { g: GroupedIncident }) {
  const sev   = g.severity.toUpperCase();
  const color = severityColor(sev);

  return (
    <div
      className="flex items-start gap-3 py-2.5"
      style={{ borderBottom: `1px solid ${DS.border}` }}
    >
      {/* Severity indicator */}
      <div className="flex-shrink-0 mt-0.5">
        <StatusDot color={g.isActive ? color : DS.textMuted} pulse={g.isActive && sev === 'CRITICAL'} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge label={sev} color={color} size="xs" />
          <span className="text-xs font-semibold" style={{ color: g.isActive ? DS.text : DS.textSec }}>
            {g.type.replace(/_/g, ' ')}
          </span>
          {g.count > 1 && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ color: DS.textMuted, background: DS.border }}
            >
              ×{g.count}
            </span>
          )}
          {!g.isActive && (
            <span className="text-[9px]" style={{ color: DS.textMuted }}>
              resolved
            </span>
          )}
        </div>
        {g.message && (
          <div
            className="text-[10px] mt-0.5 truncate"
            style={{ color: DS.textMuted, maxWidth: '100%' }}
          >
            {g.message}
          </div>
        )}
      </div>

      {/* Last seen */}
      <div
        className="text-[10px] flex-shrink-0"
        style={{ color: DS.textMuted, fontFamily: DS.mono }}
      >
        {g.lastAt ? fmt.ago(g.lastAt) : '—'}
      </div>
    </div>
  );
}

interface Props {
  health:    Record<string, unknown> | null;
  system:    { state: string; mode: string; uptime: number; version: string };
  incidents: Incident[];
}

export function SystemHealthCard({ health, system, incidents }: Props) {
  const checks    = health?.checks as Record<string, unknown> | null ?? null;
  const db        = checks?.database   as Record<string, unknown> | null ?? null;
  const redis     = checks?.redis      as Record<string, unknown> | null ?? null;
  const exchange  = checks?.exchange   as Record<string, unknown> | null ?? null;
  const mktData   = checks?.marketData as Record<string, unknown> | null ?? null;
  const clock     = checks?.clockDrift as Record<string, unknown> | null ?? null;

  // Market data freshness
  const symbols = mktData?.symbols as Record<string, Record<string, unknown>> | null ?? null;
  const btcFresh = symbols ? Object.values(symbols).every((s) => asBool(s.fresh) !== false) : null;
  const mktDataAge = symbols
    ? Math.max(...Object.values(symbols).map((s) => asNum(s.ageMs) ?? 0))
    : null;

  // Group incidents by type to avoid duplicates
  const groupedIncidents = useMemo<GroupedIncident[]>(() => {
    const map = new Map<string, GroupedIncident>();
    for (const inc of incidents) {
      const type     = asStr(inc.type) ?? 'UNKNOWN';
      const severity = asStr(inc.severity) ?? 'LOW';
      const existing = map.get(type);

      if (existing) {
        existing.count++;
        const newAt = asStr(inc.createdAt);
        if (newAt && (!existing.lastAt || newAt > existing.lastAt)) {
          existing.lastAt = newAt;
        }
        if (asBool(inc.isActive)) existing.isActive = true;
      } else {
        map.set(type, {
          type,
          severity,
          count: 1,
          lastAt: asStr(inc.createdAt) ?? null,
          isActive: asBool(inc.isActive) === true,
          message: asStr(inc.message) ?? null,
        });
      }
    }
    // Sort: active first, then by severity
    const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return [...map.values()].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
    });
  }, [incidents]);

  const activeCount = groupedIncidents.filter((g) => g.isActive).length;
  const criticalCount = groupedIncidents.filter(
    (g) => g.isActive && g.severity.toUpperCase() === 'CRITICAL',
  ).length;

  const overallColor =
    criticalCount > 0 ? DS.loss :
    activeCount > 0   ? DS.warning :
    DS.profit;
  const overallLabel =
    criticalCount > 0 ? 'CRITICAL' :
    activeCount > 0   ? 'DEGRADED' :
    'NOMINAL';

  return (
    <Card accent={overallColor}>
      <CardHeader
        title="System Health"
        accent={overallColor}
        right={<Badge label={overallLabel} color={overallColor} size="sm" />}
      />

      <div className="p-5 space-y-4">
        {/* System info row */}
        <div
          className="grid grid-cols-4 gap-3 rounded-lg p-3"
          style={{ background: DS.elevated, border: `1px solid ${DS.border}` }}
        >
          {[
            { label: 'State',   value: system.state,   color: system.state === 'RUNNING' ? DS.profit : DS.warning },
            { label: 'Mode',    value: system.mode,    color: system.mode  === 'LIVE'    ? DS.loss   : DS.warning },
            { label: 'Uptime',  value: fmt.duration(system.uptime), color: DS.text },
            { label: 'Version', value: `v${system.version}`, color: DS.textSec },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div className="text-[9px] uppercase tracking-wider" style={{ color: DS.textMuted }}>
                {label}
              </div>
              <div className="text-xs font-semibold mt-0.5" style={{ color, fontFamily: DS.mono }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Service status */}
        <div>
          <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: DS.textMuted }}>
            Services
          </div>
          <ServiceRow
            label="Exchange Connectivity"
            healthy={asBool(exchange?.healthy)}
            latencyMs={asNum(exchange?.latencyMs)}
            latencyThreshold={80}
          />
          <ServiceRow
            label="Market Data Stream"
            healthy={btcFresh}
            latencyMs={mktDataAge}
            latencyThreshold={5000}
            extra={symbols ? `${Object.keys(symbols).join(', ')}` : undefined}
          />
          <ServiceRow
            label="Database"
            healthy={asBool(db?.healthy)}
            latencyMs={asNum(db?.latencyMs)}
            latencyThreshold={20}
          />
          <ServiceRow
            label="Redis / Cache"
            healthy={asBool(redis?.healthy)}
            latencyMs={asNum(redis?.latencyMs)}
            latencyThreshold={5}
          />
          <ServiceRow
            label="Clock Sync"
            healthy={asBool(clock?.healthy)}
            latencyMs={asNum(clock?.driftMs)}
            latencyThreshold={100}
            extra="clock drift"
          />
        </div>

        {/* Incident log */}
        <div>
          <div className="text-[10px] uppercase tracking-widest mb-1 flex items-center justify-between" style={{ color: DS.textMuted }}>
            <span>Incident Log</span>
            <span style={{ fontFamily: DS.mono }}>
              {activeCount > 0
                ? <span style={{ color: DS.warning }}>{activeCount} active</span>
                : <span style={{ color: DS.profit }}>all clear</span>
              }
            </span>
          </div>

          {groupedIncidents.length === 0 ? (
            <div className="text-xs py-3 text-center" style={{ color: DS.textMuted }}>
              No incidents recorded
            </div>
          ) : (
            <div>
              {groupedIncidents.slice(0, 8).map((g) => (
                <IncidentGroupRow key={g.type} g={g} />
              ))}
              {groupedIncidents.length > 8 && (
                <div className="text-[10px] pt-2 text-center" style={{ color: DS.textMuted }}>
                  +{groupedIncidents.length - 8} more incident types
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
