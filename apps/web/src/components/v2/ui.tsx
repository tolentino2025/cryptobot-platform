'use client';

import React from 'react';

// ─────────────────────────────────────────────────────────────────
// Design System tokens — institutional trading desk palette
// ─────────────────────────────────────────────────────────────────
export const DS = {
  bg:           '#061018',
  surface:      'rgba(7, 18, 28, 0.82)',
  elevated:     'rgba(12, 28, 41, 0.94)',
  border:       'rgba(111, 145, 171, 0.20)',
  borderActive: 'rgba(143, 187, 222, 0.48)',
  panel:        'rgba(15, 34, 49, 0.96)',
  panel2:       'rgba(11, 24, 36, 0.98)',

  text:         '#E7F1FA',
  textSec:      '#A1B8CA',
  textMuted:    '#5F788C',

  profit:       '#22C55E',
  loss:         '#EF4444',
  warning:      '#F59E0B',
  info:         '#3B82F6',
  purple:       '#D97706',
  teal:         '#14B8A6',

  // Semantic backgrounds
  profitBg:     'rgba(34,197,94,0.08)',
  lossBg:       'rgba(239,68,68,0.08)',
  warningBg:    'rgba(245,158,11,0.08)',
  infoBg:       'rgba(59,130,246,0.08)',
  purpleBg:     'rgba(217,119,6,0.08)',

  // Semantic borders
  profitBorder: 'rgba(34,197,94,0.2)',
  lossBorder:   'rgba(239,68,68,0.2)',
  warningBorder:'rgba(245,158,11,0.2)',
  infoBorder:   'rgba(59,130,246,0.2)',

  font:  "'Manrope', 'Space Grotesk', system-ui, sans-serif",
  mono:  "'IBM Plex Mono', 'JetBrains Mono', monospace",
} as const;

// Severity → color mapping
export function severityColor(s: string): string {
  const m: Record<string, string> = {
    CRITICAL: DS.loss, HIGH: DS.warning, MEDIUM: DS.info, LOW: DS.textSec, INFO: DS.textSec,
  };
  return m[s.toUpperCase()] ?? DS.textSec;
}

// ─────────────────────────────────────────────────────────────────
// Card — base container
// ─────────────────────────────────────────────────────────────────
export function Card({
  children,
  className = '',
  accent,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  accent?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-xl overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(180deg, ${DS.surface} 0%, ${DS.panel2} 100%)`,
        border: `1px solid ${DS.border}`,
        backdropFilter: 'blur(18px)',
        boxShadow: '0 20px 70px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255,255,255,0.03)',
        ...(accent ? { borderTop: `2px solid ${accent}` } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// CardHeader — section title row inside a Card
// ─────────────────────────────────────────────────────────────────
export function CardHeader({
  title,
  subtitle,
  right,
  accent = DS.info,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  accent?: string;
}) {
  return (
    <div
      className="flex items-center justify-between px-5 py-4 border-b"
      style={{ borderColor: DS.border, background: 'linear-gradient(180deg, rgba(255,255,255,0.02), transparent)' }}
    >
      <div className="flex items-center gap-3">
        <div className="w-0.5 h-4 rounded-full flex-shrink-0" style={{ background: accent }} />
        <div>
          <div
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: DS.text, letterSpacing: '0.12em' }}
        >
          {title}
        </div>
          {subtitle && (
            <div className="text-[10px] mt-0.5" style={{ color: DS.textSec }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function DataPill({
  label,
  value,
  tone = DS.info,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div
      className="rounded-xl px-3 py-2.5 min-w-0"
      style={{
        background: `${tone}10`,
        border: `1px solid ${tone}24`,
        boxShadow: `inset 0 1px 0 ${tone}12`,
      }}
    >
      <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: DS.textMuted }}>
        {label}
      </div>
      <div
        className="text-sm font-bold truncate"
        style={{ color: tone, fontFamily: DS.mono }}
      >
        {value}
      </div>
    </div>
  );
}

export function FlowStep({
  label,
  state,
  detail,
  tone,
}: {
  label: string;
  state: string;
  detail?: string;
  tone: string;
}) {
  return (
    <div
      className="rounded-xl p-3 min-w-0"
      style={{
        background: `linear-gradient(180deg, ${tone}14, rgba(255,255,255,0.01))`,
        border: `1px solid ${tone}26`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.16em]" style={{ color: DS.textMuted }}>
          {label}
        </span>
        <StatusDot color={tone} pulse={tone === DS.profit || tone === DS.info} />
      </div>
      <div className="mt-1 text-sm font-bold" style={{ color: tone, fontFamily: DS.mono }}>
        {state}
      </div>
      {detail && (
        <div className="mt-1 text-[11px] leading-relaxed" style={{ color: DS.textSec }}>
          {detail}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Badge — status / regime / label chip
// ─────────────────────────────────────────────────────────────────
export function Badge({
  label,
  color = DS.info,
  size = 'sm',
}: {
  label: string;
  color?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const pad: Record<string, string> = {
    xs: 'px-1.5 py-0.5 text-[9px]',
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3.5 py-1.5 text-sm',
  };
  return (
    <span
      className={`inline-block font-semibold uppercase tracking-wider rounded ${pad[size]} select-none`}
      style={{
        color,
        background: `${color}15`,
        border: `1px solid ${color}30`,
        fontFamily: DS.mono,
      }}
    >
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────
// StatusDot — colored indicator dot
// ─────────────────────────────────────────────────────────────────
export function StatusDot({ color, pulse = false }: { color: string; pulse?: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${pulse ? 'animate-pulse' : ''}`}
      style={{ background: color, boxShadow: `0 0 4px ${color}80` }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────
// MetricRow — compact label / value pair
// ─────────────────────────────────────────────────────────────────
export function MetricRow({
  label,
  value,
  valueColor,
  sub,
  bordered = true,
}: {
  label: string;
  value: string | React.ReactNode;
  valueColor?: string;
  sub?: string;
  bordered?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between py-2"
      style={bordered ? { borderBottom: `1px solid ${DS.border}` } : {}}
    >
      <span className="text-[11px] uppercase tracking-wider" style={{ color: DS.textSec }}>
        {label}
      </span>
      <div className="text-right">
        <span
          className="text-sm font-semibold"
          style={{ color: valueColor ?? DS.text, fontFamily: DS.mono }}
        >
          {value}
        </span>
        {sub && (
          <div className="text-[10px]" style={{ color: DS.textSec, fontFamily: DS.mono }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ProgressMetric — labeled progress bar with value/max
// ─────────────────────────────────────────────────────────────────
export function ProgressMetric({
  label,
  pct,            // 0-100 (pre-computed — must be correct!)
  usedLabel,
  maxLabel,
  pctLabel,
  alert,
  height = 4,
}: {
  label: string;
  pct: number | null;       // null = unavailable (shows N/A)
  usedLabel: string;
  maxLabel: string;
  pctLabel?: string;
  alert?: string;
  height?: number;
}) {
  const safePct = pct == null ? 0 : Math.min(100, Math.max(0, pct));
  const color =
    pct == null ? DS.textMuted :
    safePct >= 80 ? DS.loss :
    safePct >= 60 ? DS.warning :
    DS.profit;

  const displayPct = pct == null ? 'N/A' : `${safePct.toFixed(1)}%`;

  return (
    <div className="space-y-1.5 py-2" style={{ borderBottom: `1px solid ${DS.border}` }}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider" style={{ color: DS.textSec }}>
          {label}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: DS.textSec, fontFamily: DS.mono }}>
            {usedLabel}
            <span style={{ color: DS.textMuted }}> / {maxLabel}</span>
          </span>
          <span
            className="text-xs font-bold w-12 text-right"
            style={{ color, fontFamily: DS.mono }}
          >
            {pctLabel ?? displayPct}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-[4px] rounded-full overflow-hidden" style={{ background: DS.border, height }}>
        {pct !== null && (
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${safePct}%`,
              background: color,
              boxShadow: safePct > 60 ? `0 0 6px ${color}60` : undefined,
            }}
          />
        )}
      </div>

      {/* Alert */}
      {alert && (
        <div className="text-[10px]" style={{ color }}>
          {alert}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ScoreBar — horizontal progress bar for signal scores (0–100)
// ─────────────────────────────────────────────────────────────────
export function ScoreBar({
  label,
  value,
  color,
  width = 100,
}: {
  label: string;
  value: number;
  color: string;
  width?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="text-[10px] uppercase tracking-wider text-right flex-shrink-0"
        style={{ color: DS.textSec, width: 72 }}
      >
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: DS.border }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: color, boxShadow: `0 0 4px ${color}50` }}
        />
      </div>
      <span
        className="text-[11px] font-bold flex-shrink-0"
        style={{ color, fontFamily: DS.mono, width: 28, textAlign: 'right' }}
      >
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// EmptyState — professional placeholder when data isn't available
// ─────────────────────────────────────────────────────────────────
export function EmptyState({
  title,
  subtitle,
  icon = '○',
}: {
  title: string;
  subtitle?: string;
  icon?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div
        className="text-2xl mb-3 opacity-20"
        style={{ color: DS.textSec }}
      >
        {icon}
      </div>
      <div className="text-sm font-medium" style={{ color: DS.textSec }}>
        {title}
      </div>
      {subtitle && (
        <div className="text-xs mt-1" style={{ color: DS.textMuted }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Divider — subtle horizontal separator
// ─────────────────────────────────────────────────────────────────
export function Divider() {
  return <div className="h-px" style={{ background: DS.border }} />;
}

// ─────────────────────────────────────────────────────────────────
// KpiBlock — large hero metric (equity, PnL headline, etc.)
// ─────────────────────────────────────────────────────────────────
export function KpiBlock({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] uppercase tracking-widest" style={{ color: DS.textSec }}>
        {label}
      </div>
      <div
        className="text-xl font-bold leading-none"
        style={{ color: color ?? DS.text, fontFamily: DS.mono }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs" style={{ color: sub.startsWith('+') ? DS.profit : sub.startsWith('-') ? DS.loss : DS.textSec, fontFamily: DS.mono }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// LatencyChip — latency display with severity coloring
// ─────────────────────────────────────────────────────────────────
export function LatencyChip({
  ms,
  threshold = 200,
}: {
  ms: number | null | undefined;
  threshold?: number;
}) {
  if (ms == null || !isFinite(ms)) {
    return (
      <span className="text-[10px]" style={{ color: DS.textMuted, fontFamily: DS.mono }}>
        —
      </span>
    );
  }
  const color =
    ms > threshold * 5 ? DS.loss :
    ms > threshold     ? DS.warning :
    DS.profit;

  return (
    <span
      className="text-[10px] font-medium px-1.5 py-0.5 rounded"
      style={{ color, background: `${color}12`, fontFamily: DS.mono }}
    >
      {ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`}
    </span>
  );
}
