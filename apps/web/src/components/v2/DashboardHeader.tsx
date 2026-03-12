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
}

const STATE_COLOR: Record<string, string> = {
  RUNNING: DS.profit, PAUSED: DS.warning, KILLED: DS.loss, HALTED: DS.loss,
};
const MODE_COLOR: Record<string, string> = {
  LIVE: DS.loss, DEMO: DS.warning, SIM: DS.info, SIMULATION: DS.info,
};

export function DashboardHeader({ system, lastUpdated, onAction }: Props) {
  const stateColor = STATE_COLOR[system.state] ?? DS.textSec;
  const modeColor  = MODE_COLOR[system.mode]  ?? DS.textSec;

  return (
    <header
      className="flex flex-col flex-shrink-0"
      style={{ background: DS.surface, borderBottom: `1px solid ${DS.border}` }}
    >
      {/* Main header bar */}
      <div className="flex items-center gap-4 px-5 h-14">
        {/* Logo */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: DS.info, boxShadow: `0 0 6px ${DS.info}` }}
          />
          <span
            className="text-sm font-bold tracking-widest uppercase"
            style={{ color: DS.text, fontFamily: DS.mono, letterSpacing: '0.15em' }}
          >
            CryptoBot
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ color: DS.textSec, background: DS.elevated, fontFamily: DS.mono }}
          >
            v{system.version}
          </span>
        </div>

        <div className="h-5 w-px flex-shrink-0" style={{ background: DS.border }} />

        {/* State + mode */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <StatusDot
              color={stateColor}
              pulse={system.state === 'RUNNING'}
            />
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: stateColor, fontFamily: DS.mono }}
            >
              {system.state}
            </span>
          </div>
          <Badge label={system.mode} color={modeColor} size="xs" />
        </div>

        <div className="h-5 w-px flex-shrink-0" style={{ background: DS.border }} />

        {/* Uptime */}
        <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: DS.textMuted }}>
            Uptime
          </span>
          <span
            className="text-[11px] font-medium"
            style={{ color: DS.textSec, fontFamily: DS.mono }}
          >
            {fmt.duration(system.uptime)}
          </span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Last updated */}
        <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: DS.profit, opacity: 0.7 }}
          />
          <span className="text-[10px]" style={{ color: DS.textMuted, fontFamily: DS.mono }}>
            {lastUpdated ? `updated ${lastUpdated.toLocaleTimeString()}` : 'connecting…'}
          </span>
        </div>

        <div className="h-5 w-px flex-shrink-0" style={{ background: DS.border }} />

        {/* Control buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <CtrlBtn label="Pause"  onClick={() => onAction('pause')}  color={DS.warning} />
          <CtrlBtn label="Resume" onClick={() => onAction('resume')} color={DS.profit}  />
          <CtrlBtn label="Kill"   onClick={() => onAction('kill')}   color={DS.loss}    />
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
