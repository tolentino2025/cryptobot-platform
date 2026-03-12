'use client';

import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────
// Primitive design-system components
// ─────────────────────────────────────────────────────────────────────

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('bg-[#12121A] border border-[#1F1F2A] rounded-xl', className)}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold tracking-wide border',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-[0.12em] mb-3">
      {children}
    </p>
  );
}

export function StatusDot({
  color,
  pulse = true,
}: {
  color: 'green' | 'yellow' | 'red' | 'blue' | 'gray';
  pulse?: boolean;
}) {
  const map = {
    green:  'bg-[#22C55E] dot-green',
    yellow: 'bg-[#F59E0B] dot-yellow',
    red:    'bg-[#EF4444] dot-red',
    blue:   'bg-[#3B82F6] dot-blue',
    gray:   'bg-[#64748B]',
  };
  return (
    <span
      className={cn(
        'inline-block w-2 h-2 rounded-full flex-shrink-0',
        map[color],
        pulse && 'animate-pulse',
      )}
    />
  );
}

export function ProgressBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.min(100, Math.max(0, max > 0 ? (value / max) * 100 : 0));
  return (
    <div className="h-1.5 bg-[#1F1F2A] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

/** Inline SVG area sparkline — zero dependencies */
export function Sparkline({
  data,
  color,
  height = 36,
  width = 100,
}: {
  data: number[];
  color: string;
  height?: number;
  width?: number;
}) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line   = pts.join(' ');
  const area   = `0,${height} ${line} ${width},${height}`;
  const gradId = `sg${color.replace('#', '')}`;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0"    />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
