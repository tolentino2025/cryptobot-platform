'use client';

import { formatUSD, formatNumber, formatDate, formatDuration } from '@/lib/utils';
import { T } from './charts';

// ─────────────────────────────────────────────────────────────────
// Open position card
// ─────────────────────────────────────────────────────────────────
function PositionCard({ p }: { p: Record<string, unknown> }) {
  const pnl     = (p.unrealizedPnl as number) ?? 0;
  const pnlPct  = (p.unrealizedPnlPercent as number) ?? 0;
  const side    = String(p.side ?? '');
  const isLong  = side === 'LONG' || side === 'BUY';
  const pnlColor = pnl > 0 ? T.profit : pnl < 0 ? T.loss : T.neutral;
  const sideColor = isLong ? T.profit : T.loss;

  const holdingSec = (p.holdingTimeSec as number) ?? 0;

  return (
    <div
      className="rounded-xl border px-3 py-2"
      style={{ borderColor: `${sideColor}25`, background: `${sideColor}05` }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: 'JetBrains Mono, monospace', color: T.text, fontSize: 12, fontWeight: 700 }}>
            {String(p.symbol ?? '')}
          </span>
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded border"
            style={{ color: sideColor, borderColor: `${sideColor}30`, background: `${sideColor}10` }}
          >
            {side}
          </span>
          {holdingSec > 0 && (
            <span style={{ color: T.dim, fontSize: 8, fontFamily: 'JetBrains Mono, monospace' }}>
              {formatDuration(holdingSec)}
            </span>
          )}
        </div>
        <div className="text-right">
          <div style={{ fontFamily: 'JetBrains Mono, monospace', color: pnlColor, fontSize: 12, fontWeight: 700,
            textShadow: `0 0 6px ${pnlColor}60` }}>
            {formatUSD(pnl)}
          </div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', color: pnlColor, fontSize: 9 }}>
            {pnlPct > 0 ? '+' : ''}{pnlPct.toFixed(2)}%
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-x-3 gap-y-0.5">
        {[
          { k: 'Entry',    v: formatUSD((p.entryPrice   as number) ?? 0) },
          { k: 'Current',  v: formatUSD((p.currentPrice as number) ?? 0) },
          { k: 'Qty',      v: formatNumber((p.quantity  as number) ?? 0, 5) },
          { k: 'Notional', v: formatUSD((p.notional     as number) ?? 0) },
        ].map(({ k, v }) => (
          <div key={k}>
            <div style={{ color: T.dim, fontSize: 8 }}>{k}</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', color: T.text, fontSize: 9, fontWeight: 600 }}>
              {v}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Trade history row
// ─────────────────────────────────────────────────────────────────
function TradeRow({ lc }: { lc: Record<string, unknown> }) {
  const pnl       = (lc.realizedPnl as number) ?? (lc.unrealizedPnl as number) ?? null;
  const isOpen    = lc.realizedPnl == null;
  const pnlColor  = pnl !== null ? (pnl > 0 ? T.profit : pnl < 0 ? T.loss : T.neutral) : T.neutral;
  const status    = String(lc.reconciliationStatus ?? 'PENDING');
  const statusColor = status === 'RECONCILED' ? T.profit : status === 'DIVERGENT' ? T.loss : T.warning;

  return (
    <tr style={{ borderBottom: `1px solid #1E2A35` }}>
      <td className="py-1.5 pr-2" style={{ fontFamily: 'JetBrains Mono, monospace', color: T.neutral, fontSize: 8, whiteSpace: 'nowrap' }}>
        {new Date(lc.createdAt as string).toLocaleTimeString()}
      </td>
      <td className="py-1.5 pr-2" style={{ fontFamily: 'JetBrains Mono, monospace', color: T.text, fontSize: 9, fontWeight: 700 }}>
        {String(lc.symbol ?? '')}
      </td>
      <td className="py-1.5 pr-2" style={{ fontFamily: 'JetBrains Mono, monospace', color: T.info, fontSize: 9 }}>
        {formatUSD((lc.avgEntryPrice as number) ?? 0)}
      </td>
      <td className="py-1.5 pr-2" style={{ fontFamily: 'JetBrains Mono, monospace', color: T.neutral, fontSize: 9 }}>
        {lc.avgExitPrice ? formatUSD(lc.avgExitPrice as number) : '—'}
      </td>
      <td className="py-1.5 pr-2" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: pnlColor,
        textShadow: pnl !== null && pnl !== 0 ? `0 0 4px ${pnlColor}60` : undefined }}>
        {pnl !== null ? `${formatUSD(pnl)}${isOpen ? '*' : ''}` : '—'}
      </td>
      <td className="py-1.5" style={{ fontSize: 8 }}>
        <span style={{ color: statusColor, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
          {status.slice(0, 6)}
        </span>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────
// Order history row
// ─────────────────────────────────────────────────────────────────
function OrderRow({ o }: { o: Record<string, unknown> }) {
  const side = String(o.side ?? '');
  const status = String(o.status ?? '');
  const purpose = String(o.purpose ?? '');
  const sideColor = side === 'BUY' ? T.profit : T.loss;
  const statusColor = status === 'FILLED' ? T.profit : status === 'REJECTED' || status === 'CANCELLED' ? T.loss : T.info;

  const purposeColors: Record<string, string> = {
    ENTRY: T.profit, EXIT_AI: T.warning, STOP_LOSS: T.loss, TAKE_PROFIT: T.info,
  };
  const pColor = purposeColors[purpose] ?? T.neutral;

  return (
    <tr style={{ borderBottom: `1px solid #1E2A35` }}>
      <td className="py-1.5 pr-2" style={{ fontFamily: 'JetBrains Mono, monospace', color: T.neutral, fontSize: 8, whiteSpace: 'nowrap' }}>
        {new Date(o.createdAt as string).toLocaleTimeString()}
      </td>
      <td className="py-1.5 pr-2" style={{ fontFamily: 'JetBrains Mono, monospace', color: T.text, fontSize: 9, fontWeight: 700 }}>
        {String(o.symbol ?? '')}
      </td>
      <td className="py-1.5 pr-2" style={{ fontFamily: 'JetBrains Mono, monospace', color: sideColor, fontSize: 9, fontWeight: 700 }}>
        {side}
      </td>
      <td className="py-1.5 pr-2" style={{ fontFamily: 'JetBrains Mono, monospace', color: T.neutral, fontSize: 9 }}>
        {o.price ? formatUSD(o.price as number) : 'MKT'}
      </td>
      <td className="py-1.5 pr-2" style={{ fontFamily: 'JetBrains Mono, monospace', color: T.neutral, fontSize: 9 }}>
        {formatNumber((o.quantity as number) ?? 0, 4)}
      </td>
      <td className="py-1.5 pr-2" style={{ fontFamily: 'JetBrains Mono, monospace', color: statusColor, fontSize: 8 }}>
        {status.slice(0, 8)}
      </td>
      <td className="py-1.5" style={{ fontFamily: 'JetBrains Mono, monospace', color: pColor, fontSize: 8 }}>
        {purpose || '—'}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────
// Panel
// ─────────────────────────────────────────────────────────────────

type SubTab = 'lifecycle' | 'orders';

interface Props {
  positions:   Record<string, unknown>[];
  lifecycles:  Record<string, unknown>[];
  orders:      Record<string, unknown>[];
  activeSubTab: SubTab;
  setSubTab:    (t: SubTab) => void;
}

export function PanelTrading({ positions, lifecycles, orders, activeSubTab, setSubTab }: Props) {
  return (
    <div className="flex flex-col h-full gap-2 p-3">
      {/* Panel label */}
      <div className="flex items-center justify-between flex-shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: T.profit }}>
          ▸ TRADING ACTIVITY
        </span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', color: T.neutral, fontSize: 9 }}>
          {positions.length} open · {lifecycles.length} closed
        </span>
      </div>

      {/* Open positions */}
      <div className="flex-shrink-0">
        <span style={{ color: T.neutral, fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 4 }}>
          Open Positions
        </span>
        {positions.length === 0 ? (
          <div
            className="flex items-center justify-center py-3 rounded-xl border"
            style={{ borderColor: '#1E2A35', color: T.neutral, fontSize: 10 }}
          >
            No open positions — bot is flat
          </div>
        ) : (
          <div className="space-y-1.5">
            {positions.slice(0, 2).map((p) => (
              <PositionCard key={String(p.id)} p={p} />
            ))}
          </div>
        )}
      </div>

      {/* Sub-tab toggle */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {(['lifecycle', 'orders'] as SubTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className="px-2.5 py-1 rounded-lg text-[9px] font-semibold uppercase tracking-wider transition-colors"
            style={{
              color:   activeSubTab === t ? T.info    : T.neutral,
              background: activeSubTab === t ? `${T.info}15` : 'transparent',
              border: `1px solid ${activeSubTab === t ? `${T.info}30` : '#1E2A35'}`,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            {t === 'lifecycle' ? `Trades (${lifecycles.length})` : `Orders (${orders.length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeSubTab === 'lifecycle' ? (
          lifecycles.length === 0 ? (
            <div className="flex items-center justify-center h-full" style={{ color: T.neutral, fontSize: 11 }}>
              No trade history yet
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead style={{ position: 'sticky', top: 0, background: '#121820' }}>
                <tr>
                  {['Time', 'Symbol', 'Entry', 'Exit', 'PnL', 'Status'].map((h) => (
                    <th key={h} className="pb-1.5 pr-2 text-left"
                      style={{ color: T.dim, fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lifecycles.slice(0, 20).map((lc) => (
                  <TradeRow key={String(lc.id)} lc={lc} />
                ))}
              </tbody>
            </table>
          )
        ) : (
          orders.length === 0 ? (
            <div className="flex items-center justify-center h-full" style={{ color: T.neutral, fontSize: 11 }}>
              No orders yet
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead style={{ position: 'sticky', top: 0, background: '#121820' }}>
                <tr>
                  {['Time', 'Symbol', 'Side', 'Price', 'Qty', 'Status', 'Purpose'].map((h) => (
                    <th key={h} className="pb-1.5 pr-2 text-left"
                      style={{ color: T.dim, fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 20).map((o) => (
                  <OrderRow key={String(o.id)} o={o} />
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}
