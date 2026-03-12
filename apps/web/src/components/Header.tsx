'use client';

import { cn, formatDuration } from '@/lib/utils';
import { Badge, StatusDot } from './ui';

interface SystemState {
  state: string;
  mode:  string;
  uptime: number;
  version: string;
  haltReason: string | null;
}

const STATE_CONFIG: Record<
  string,
  { dot: 'green' | 'yellow' | 'red' | 'blue' | 'gray'; bg: string }
> = {
  RUNNING:      { dot: 'green',  bg: 'border-[#22C55E]/20 bg-[#22C55E]/5'  },
  PAUSED:       { dot: 'yellow', bg: 'border-[#F59E0B]/20 bg-[#F59E0B]/5'  },
  DEGRADED:     { dot: 'yellow', bg: 'border-[#F59E0B]/20 bg-[#F59E0B]/5'  },
  KILLED:       { dot: 'red',    bg: 'border-[#EF4444]/20 bg-[#EF4444]/5'  },
  SAFE_MODE:    { dot: 'red',    bg: 'border-[#EF4444]/20 bg-[#EF4444]/5'  },
  INITIALIZING: { dot: 'blue',   bg: 'border-[#3B82F6]/20 bg-[#3B82F6]/5'  },
  RECONCILING:  { dot: 'blue',   bg: 'border-[#3B82F6]/20 bg-[#3B82F6]/5'  },
  BOOTING:      { dot: 'gray',   bg: 'border-[#64748B]/20 bg-[#64748B]/5'  },
};

const MODE_CLS: Record<string, string> = {
  LIVE:  'text-[#EF4444] border-[#EF4444]/30 bg-[#EF4444]/10',
  DEMO:  'text-[#F59E0B] border-[#F59E0B]/30 bg-[#F59E0B]/10',
  SIM:   'text-[#3B82F6] border-[#3B82F6]/30 bg-[#3B82F6]/10',
};

export function Header({
  system,
  activeIncidents,
  onAction,
  lastUpdated,
}: {
  system: SystemState;
  activeIncidents: number;
  onAction: (action: string) => void;
  lastUpdated: Date | null;
}) {
  const cfg = STATE_CONFIG[system.state] ?? STATE_CONFIG.BOOTING;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-[#0A0A0F]/95 backdrop-blur-md border-b border-[#1F1F2A] flex items-center px-4 gap-3">
      {/* Brand mark */}
      <div className="flex items-center gap-2 mr-1">
        <div className="w-7 h-7 rounded-lg bg-[#3B82F6]/15 border border-[#3B82F6]/30 flex items-center justify-center">
          <span className="text-[#3B82F6] text-xs font-black">C</span>
        </div>
        <span className="font-bold text-white text-sm tracking-tight hidden sm:block">CryptoBot</span>
      </div>

      <div className="w-px h-5 bg-[#1F1F2A]" />

      {/* State pill */}
      <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold', cfg.bg)}>
        <StatusDot color={cfg.dot} />
        <span className="text-white font-bold">{system.state}</span>
      </div>

      {/* Meta row */}
      <div className="hidden md:flex items-center gap-3 text-xs text-[#64748B]">
        <span className="font-mono font-semibold text-[#94A3B8]">BTCUSDT</span>
        <div className="w-px h-3 bg-[#1F1F2A]" />
        <span>Binance</span>
        <div className="w-px h-3 bg-[#1F1F2A]" />
        <Badge className={cn('font-mono text-[10px]', MODE_CLS[system.mode] ?? MODE_CLS.SIM)}>
          {system.mode}
        </Badge>
        <div className="w-px h-3 bg-[#1F1F2A]" />
        <span>⏱ {formatDuration(Math.floor(system.uptime))}</span>
        <div className="w-px h-3 bg-[#1F1F2A]" />
        <span className="text-[#3B82F6] font-mono">v{system.version}</span>
      </div>

      {/* Active incidents badge */}
      {activeIncidents > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg text-[11px] text-[#EF4444] font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-ping flex-shrink-0" />
          {activeIncidents} incident{activeIncidents > 1 ? 's' : ''}
        </div>
      )}

      <div className="flex-1" />

      {/* Last updated */}
      {lastUpdated && (
        <span className="hidden lg:block text-[10px] text-[#2A2A3A] font-mono">
          {lastUpdated.toLocaleTimeString()}
        </span>
      )}

      {/* Control buttons */}
      <div className="flex items-center gap-2">
        {system.state === 'RUNNING' && (
          <button
            onClick={() => onAction('pause')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/25 rounded-lg text-xs font-semibold hover:bg-[#F59E0B]/20 transition-colors"
          >
            ⏸ <span className="hidden sm:inline">Pause</span>
          </button>
        )}
        {system.state === 'PAUSED' && (
          <button
            onClick={() => onAction('resume')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/25 rounded-lg text-xs font-semibold hover:bg-[#22C55E]/20 transition-colors"
          >
            ▶ <span className="hidden sm:inline">Resume</span>
          </button>
        )}
        {system.state !== 'KILLED' && (
          <button
            onClick={() => onAction('kill')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/25 rounded-lg text-xs font-semibold hover:bg-[#EF4444]/20 transition-colors"
          >
            ⛔ <span className="hidden sm:inline">Kill</span>
          </button>
        )}
      </div>
    </header>
  );
}

export function LiveBanner({ mode }: { mode: string }) {
  if (mode !== 'LIVE') return null;
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-[#EF4444]/10 border border-[#EF4444]/40 rounded-xl mb-4">
      <span className="text-[#EF4444] text-lg animate-pulse">⚠</span>
      <div>
        <p className="text-[#EF4444] font-bold text-sm">LIVE MODE — REAL FUNDS AT RISK</p>
        <p className="text-[#EF4444]/60 text-xs">All orders are executed on the live exchange with real capital.</p>
      </div>
    </div>
  );
}

export function HaltBanner({ state, reason }: { state: string; reason: string | null }) {
  if (state === 'RUNNING') return null;
  const isKilled = state === 'KILLED' || state === 'SAFE_MODE';
  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-xl mb-4 border',
        isKilled
          ? 'bg-[#EF4444]/10 border-[#EF4444]/40'
          : 'bg-[#F59E0B]/10 border-[#F59E0B]/30',
      )}
    >
      <span className={cn('text-xl mt-0.5', isKilled ? 'text-[#EF4444]' : 'text-[#F59E0B]')}>
        {isKilled ? '🛑' : '⏸'}
      </span>
      <div>
        <p className={cn('font-bold text-sm', isKilled ? 'text-[#EF4444]' : 'text-[#F59E0B]')}>
          Trading {state === 'DEGRADED' ? 'DEGRADED' : 'HALTED'} — {state}
        </p>
        {reason && (
          <p className={cn('text-xs mt-0.5', isKilled ? 'text-[#EF4444]/70' : 'text-[#F59E0B]/70')}>
            {reason}
          </p>
        )}
        {isKilled && (
          <p className="text-[10px] text-[#EF4444]/50 mt-1">
            Process restart required to resume trading.
          </p>
        )}
      </div>
    </div>
  );
}
