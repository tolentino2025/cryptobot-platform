'use client';

import { useMemo } from 'react';

// ─────────────────────────────────────────────────────────────────
// Terminal color palette (matches CSS vars)
// ─────────────────────────────────────────────────────────────────
export const T = {
  profit:  '#00FF9C',
  loss:    '#FF4D4D',
  warning: '#FFC857',
  info:    '#4DA3FF',
  purple:  '#A78BFA',
  neutral: '#5A7A8A',
  text:    '#C8D8E8',
  dim:     '#1E2A35',
  bg:      '#0B0F14',
  panel:   '#121820',
} as const;

// ─────────────────────────────────────────────────────────────────
// AreaChart — full chart with grid lines and labels
// ─────────────────────────────────────────────────────────────────

interface AreaChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showGrid?: boolean;
  formatLabel?: (v: number) => string;
  timeLabels?: string[];
}

export function AreaChart({
  data,
  width = 400,
  height = 100,
  color = T.profit,
  showGrid = true,
  formatLabel = (v) => v.toFixed(0),
  timeLabels,
}: AreaChartProps) {
  const pts = useMemo(() => {
    if (data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const pad = { t: 8, r: 4, b: timeLabels ? 20 : 8, l: 36 };
    const w = width  - pad.l - pad.r;
    const h = height - pad.t - pad.b;

    const toX = (i: number) => pad.l + (i / (data.length - 1)) * w;
    const toY = (v: number) => pad.t + h - ((v - min) / range) * h;

    const line = data.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
    const area = `${pad.l},${pad.t + h} ${line} ${pad.l + w},${pad.t + h}`;

    // 3 grid levels
    const grids = [0, 0.5, 1].map((f) => ({
      y:     toY(min + range * f),
      label: formatLabel(min + range * f),
    }));

    // Time labels (first, middle, last)
    const timePts = timeLabels
      ? [0, Math.floor((data.length - 1) / 2), data.length - 1].map((i) => ({
          x: toX(i),
          label: timeLabels[i] ?? '',
        }))
      : [];

    return { line, area, grids, timePts, pad };
  }, [data, width, height, formatLabel, timeLabels]);

  if (!pts) return null;
  const gradId = `ag-${color.replace('#', '')}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0"    />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {showGrid && pts.grids.map((g, i) => (
        <g key={i}>
          <line
            x1={pts.pad.l} x2={width - pts.pad.r}
            y1={g.y} y2={g.y}
            stroke={T.dim} strokeWidth="0.5"
          />
          <text x={pts.pad.l - 3} y={g.y + 3} textAnchor="end" fontSize="7" fill={T.neutral}>
            {g.label}
          </text>
        </g>
      ))}

      {/* Time labels */}
      {pts.timePts.map((tp, i) => (
        <text key={i} x={tp.x} y={height - 2} textAnchor="middle" fontSize="7" fill={T.neutral}>
          {tp.label}
        </text>
      ))}

      {/* Area fill */}
      <polygon points={pts.area} fill={`url(#${gradId})`} />

      {/* Line */}
      <polyline
        points={pts.line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────
// MiniLine — compact sparkline (no axes)
// ─────────────────────────────────────────────────────────────────
export function MiniLine({
  data,
  width = 80,
  height = 28,
  color = T.info,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const area = `0,${height} ${pts} ${width},${height}`;
  const gradId = `ml-${color.replace('#', '')}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0"   />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────
// HexRadar — 6-axis radar chart for AI signals
// ─────────────────────────────────────────────────────────────────
export interface RadarSignal {
  label: string;
  value: number; // 0-100
  color?: string;
}

export function HexRadar({
  signals,
  size = 160,
}: {
  signals: RadarSignal[];
  size?: number;
}) {
  const n       = signals.length;
  const cx      = size / 2;
  const cy      = size / 2;
  const maxR    = size * 0.38;
  const startA  = -Math.PI / 2;
  const step    = (2 * Math.PI) / n;

  const point = (i: number, r: number) => {
    const a = startA + i * step;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  const levels = [0.33, 0.67, 1.0];
  const dataColor = T.info;

  const dataPts = signals.map((s, i) => point(i, (s.value / 100) * maxR));
  const dataPolygon = dataPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <svg width={size} height={size}>
      {/* Background circles */}
      {levels.map((lv, li) => {
        const pts = signals.map((_, i) => {
          const p = point(i, lv * maxR);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        });
        return (
          <polygon
            key={li}
            points={pts.join(' ')}
            fill="none"
            stroke={T.dim}
            strokeWidth="0.8"
          />
        );
      })}

      {/* Axis lines */}
      {signals.map((_, i) => {
        const outer = point(i, maxR);
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={outer.x.toFixed(1)} y2={outer.y.toFixed(1)}
            stroke={T.dim} strokeWidth="0.8"
          />
        );
      })}

      {/* Data fill */}
      <polygon
        points={dataPolygon}
        fill={dataColor}
        fillOpacity="0.12"
        stroke={dataColor}
        strokeWidth="1.5"
      />

      {/* Data dots */}
      {dataPts.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="2.5" fill={dataColor} />
      ))}

      {/* Labels */}
      {signals.map((s, i) => {
        const lp = point(i, maxR * 1.32);
        return (
          <g key={i}>
            <text
              x={lp.x.toFixed(1)} y={(lp.y - 3).toFixed(1)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="7.5" fontFamily="JetBrains Mono, monospace"
              fill={T.neutral}
            >
              {s.label}
            </text>
            <text
              x={lp.x.toFixed(1)} y={(lp.y + 6).toFixed(1)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="8" fontWeight="bold"
              fontFamily="JetBrains Mono, monospace"
              fill={s.value >= 70 ? T.profit : s.value >= 40 ? T.warning : T.loss}
            >
              {s.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────
// SemiGauge — semicircular arc gauge
// ─────────────────────────────────────────────────────────────────
export function SemiGauge({
  value,
  max,
  color,
  size = 140,
  label,
  sublabel,
}: {
  value: number;
  max: number;
  color: string;
  size?: number;
  label?: string;
  sublabel?: string;
}) {
  const pct = Math.min(1, Math.max(0, max > 0 ? value / max : 0));
  const cx  = size / 2;
  const cy  = size * 0.6;
  const r   = size * 0.38;
  const sw  = size * 0.075;

  // Semicircle path (left → right over top)
  const arc = `M ${(cx - r).toFixed(1)} ${cy.toFixed(1)} A ${r} ${r} 0 0 1 ${(cx + r).toFixed(1)} ${cy.toFixed(1)}`;

  // Half circumference
  const halfC = Math.PI * r;
  const fill  = halfC * pct;
  const gap   = halfC * (1 - pct);

  const pctColor = pct >= 0.8 ? T.loss : pct >= 0.5 ? T.warning : color;

  return (
    <svg width={size} height={size * 0.68}>
      {/* Track */}
      <path d={arc} fill="none" stroke={T.dim} strokeWidth={sw} strokeLinecap="round" />

      {/* Fill — dash trick */}
      {pct > 0 && (
        <path
          d={arc}
          fill="none"
          stroke={pctColor}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={`${fill.toFixed(1)} ${(gap + 1000).toFixed(1)}`}
          style={{ filter: `drop-shadow(0 0 4px ${pctColor}60)` }}
        />
      )}

      {/* Center text */}
      <text
        x={cx} y={cy - sw * 0.3}
        textAnchor="middle" dominantBaseline="middle"
        fontSize={size * 0.16} fontWeight="bold"
        fontFamily="JetBrains Mono, monospace"
        fill={pctColor}
      >
        {Math.round(pct * 100)}%
      </text>

      {label && (
        <text
          x={cx} y={cy + size * 0.08}
          textAnchor="middle"
          fontSize={size * 0.075}
          fontFamily="JetBrains Mono, monospace"
          fill={T.neutral}
        >
          {label}
        </text>
      )}
      {sublabel && (
        <text
          x={cx} y={cy + size * 0.155}
          textAnchor="middle"
          fontSize={size * 0.065}
          fontFamily="JetBrains Mono, monospace"
          fill={T.dim}
        >
          {sublabel}
        </text>
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────
// ProgressTrack — horizontal progress bar with glow
// ─────────────────────────────────────────────────────────────────
export function ProgressTrack({
  value,
  max,
  color,
  height = 4,
}: {
  value: number;
  max: number;
  color: string;
  height?: number;
}) {
  const pct = Math.min(100, Math.max(0, max > 0 ? (value / max) * 100 : 0));
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height, background: T.dim }}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${pct}%`,
          background: color,
          boxShadow: `0 0 6px ${color}60`,
        }}
      />
    </div>
  );
}
