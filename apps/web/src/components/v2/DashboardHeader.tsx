'use client';

import { DS, Badge, StatusDot } from './ui';
import { fmt } from '@/lib/fmt';

interface Props {
  system: {
    state:      string;
    mode:       string;
    uptime:     number;
    version:    string;
    haltReason: string | null;
  };
  lastUpdated: Date | null;
  onAction:    (action: string) => void;
  role:        'viewer' | 'admin' | null;
  onLogout:    () => void;
}

const STATE_COLOR: Record<string, string> = {
  RUNNING: DS.profit, PAUSED: DS.warning, KILLED: DS.loss, HALTED: DS.loss,
};
const MODE_COLOR: Record<string, string> = {
  LIVE: DS.loss, DEMO: DS.warning, SIM: DS.info, SIMULATION: DS.info,
};

export function DashboardHeader({ system, lastUpdated, onAction, role, onLogout }: Props) {
  const stateColor = STATE_COLOR[system.state] ?? DS.textSec;
  const modeColor  = MODE_COLOR[system.mode]  ?? DS.textSec;

  return (
    <header
      className="flex flex-col flex-shrink-0"
      style={{
        background: `linear-gradient(180deg, rgba(6,16,24,0.96), rgba(8,20,29,0.90))`,
        borderBottom: `1px solid ${DS.border}`,
        backdropFilter: 'blur(18px)',
      }}
    >
      <div className="px-5 py-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-4">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, ${DS.info}24, ${DS.teal}20)`,
              border: `1px solid ${DS.borderActive}`,
              boxShadow: `0 10px 24px rgba(0,0,0,0.2)`,
            }}
          >
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: DS.info, boxShadow: `0 0 12px ${DS.info}` }} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-sm font-black tracking-[0.24em] uppercase"
                style={{ color: DS.text, fontFamily: DS.mono }}
              >
                CryptoBot
              </span>
              <span
                className="text-[10px] px-2 py-1 rounded-full"
                style={{ color: DS.textSec, background: DS.elevated, fontFamily: DS.mono, border: `1px solid ${DS.border}` }}
              >
                v{system.version}
              </span>
              <Badge label={system.mode} color={modeColor} size="xs" />
              <Badge label={system.state} color={stateColor} size="xs" />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="flex items-center gap-2">
                <StatusDot color={stateColor} pulse={system.state === 'RUNNING'} />
                <span className="text-sm font-semibold" style={{ color: DS.text }}>
                  {system.state === 'RUNNING' ? 'Bot active and cycling' : `Bot ${system.state.toLowerCase()}`}
                </span>
              </div>
              <span className="text-xs" style={{ color: DS.textSec, fontFamily: DS.mono }}>
                uptime {fmt.duration(system.uptime)}
              </span>
              <span className="text-xs" style={{ color: DS.textMuted, fontFamily: DS.mono }}>
                {lastUpdated ? `last sync ${lastUpdated.toLocaleTimeString()}` : 'syncing'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap xl:justify-end">
          <Badge
            label={role === 'admin' ? 'admin' : 'read-only'}
            color={role === 'admin' ? DS.loss : DS.info}
            size="xs"
          />
          {role === 'admin' ? (
            <>
              <CtrlBtn label="Pause"  onClick={() => onAction('pause')}  color={DS.warning} />
              <CtrlBtn label="Resume" onClick={() => onAction('resume')} color={DS.profit}  />
              <CtrlBtn label="Kill"   onClick={() => onAction('kill')}   color={DS.loss}    />
            </>
          ) : (
            <span className="text-[10px]" style={{ color: DS.textMuted, fontFamily: DS.mono }}>
              Controls locked
            </span>
          )}
          <CtrlBtn label="Logout" onClick={onLogout} color={DS.textSec} />
        </div>
      </div>

      {/* Halt banner */}
      {(system.state === 'HALTED' || system.state === 'KILLED') && (
        <div
          className="flex items-center gap-3 px-5 py-2 text-xs"
          style={{ background: `${DS.loss}10`, borderTop: `1px solid ${DS.lossBorder}` }}
        >
          <span className="font-bold uppercase tracking-wider" style={{ color: DS.loss }}>
            ⚠ {system.state}
          </span>
          {system.haltReason && (
            <span style={{ color: DS.textSec }}>— {system.haltReason}</span>
          )}
        </div>
      )}

      {/* Demo mode banner */}
      {system.mode === 'DEMO' && (
        <div
          className="flex items-center gap-2 px-5 py-1.5 text-[10px]"
          style={{ background: `${DS.warning}08`, borderTop: `1px solid ${DS.warningBorder}` }}
        >
          <span style={{ color: DS.warning }}>●</span>
          <span style={{ color: DS.textSec }}>
            Running in <strong style={{ color: DS.warning }}>DEMO</strong> mode — no real capital at risk.
            Switch to LIVE only after full validation.
          </span>
        </div>
      )}
    </header>
  );
}

function CtrlBtn({
  label,
  onClick,
  color,
}: {
  label: string;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded text-[11px] font-semibold uppercase tracking-wider transition-all"
      style={{
        color,
        background: `${color}10`,
        border: `1px solid ${color}25`,
        fontFamily: DS.mono,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = `${color}20`;
        (e.currentTarget as HTMLButtonElement).style.borderColor = `${color}50`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = `${color}10`;
        (e.currentTarget as HTMLButtonElement).style.borderColor = `${color}25`;
      }}
    >
      {label}
    </button>
  );
}
