'use client';

import { Card, CardHeader, Badge, EmptyState, DS } from './ui';
import { fmt } from '@/lib/fmt';

type Pos = Record<string, unknown>;
type Order = Record<string, unknown>;
type Lifecycle = Record<string, unknown>;

function asNum(v: unknown): number | undefined {
  return typeof v === 'number' && isFinite(v) ? v : undefined;
}
function asStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

// ─── Single position card ────────────────────────────────────────
function PositionRow({ p }: { p: Pos }) {
  const symbol   = asStr(p.symbol) ?? '—';
  const side     = asStr(p.side) ?? '';
  const pnl      = asNum(p.unrealizedPnl) ?? 0;
  const pnlPct   = asNum(p.unrealizedPnlPercent) ?? 0;
  const entry    = asNum(p.entryPrice);
  const current  = asNum(p.currentPrice);
  const qty      = asNum(p.quantity);
  const notional = asNum(p.notional);
  const holdSec  = asNum(p.holdingTimeSec);

  const isLong   = side === 'LONG' || side === 'BUY';
  const pnlColor = pnl > 0 ? DS.profit : pnl < 0 ? DS.loss : DS.textSec;
  const sideColor = isLong ? DS.profit : DS.loss;

  return (
    <div
      className="rounded-lg p-3.5 space-y-2.5"
      style={{
        background: `${sideColor}05`,
        border: `1px solid ${sideColor}18`,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: DS.text, fontFamily: DS.mono }}>
            {symbol}
          </span>
          <Badge label={side || '—'} color={sideColor} size="xs" />
          {holdSec != null && holdSec > 0 && (
            <span className="text-[10px]" style={{ color: DS.textMuted, fontFamily: DS.mono }}>
              {fmt.duration(holdSec)}
            </span>
          )}
        </div>
        <div className="text-right">
          <div
            className="text-sm font-bold"
            style={{ color: pnlColor, fontFamily: DS.mono }}
          >
            {fmt.usd(pnl)}
          </div>
          <div className="text-[10px]" style={{ color: pnlColor, fontFamily: DS.mono }}>
            {pnlPct > 0 ? '+' : ''}{fmt.num(pnlPct, 2)}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-x-4 gap-y-1">
        {[
          { label: 'Entry',    value: fmt.usd(entry)    },
          { label: 'Mark',     value: fmt.usd(current)  },
          { label: 'Qty',      value: fmt.qty(qty, 5)   },
          { label: 'Notional', value: fmt.usd(notional) },
        ].map(({ label, value }) => (
          <div key={label}>
            <div className="text-[9px] uppercase tracking-wider" style={{ color: DS.textMuted }}>
              {label}
            </div>
            <div className="text-[11px] font-medium" style={{ color: DS.text, fontFamily: DS.mono }}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Order row ───────────────────────────────────────────────────
function OrderRow({ o }: { o: Order }) {
  const side    = asStr(o.side) ?? '';
  const status  = asStr(o.status) ?? '—';
  const symbol  = asStr(o.symbol) ?? '—';
  const purpose = asStr(o.purpose);
  const price   = asNum(o.price);
  const qty     = asNum(o.quantity);

  const sideColor   = side === 'BUY' ? DS.profit : DS.loss;
  const statusColor =
    status === 'FILLED'   ? DS.profit :
    status === 'REJECTED' || status === 'CANCELLED' ? DS.loss :
    DS.info;

  return (
    <div
      className="flex items-center gap-3 py-2"
      style={{ borderBottom: `1px solid ${DS.border}` }}
    >
      <span className="text-[10px] w-16 flex-shrink-0" style={{ color: DS.textMuted, fontFamily: DS.mono }}>
        {fmt.time(asStr(o.createdAt))}
      </span>
      <span className="text-xs font-semibold flex-shrink-0 w-20" style={{ color: DS.text, fontFamily: DS.mono }}>
        {symbol}
      </span>
      <span className="text-xs font-bold flex-shrink-0 w-8" style={{ color: sideColor, fontFamily: DS.mono }}>
        {side}
      </span>
      <span className="text-xs flex-1" style={{ color: DS.textSec, fontFamily: DS.mono }}>
        {price ? fmt.usd(price) : 'MKT'} · {fmt.qty(qty, 4)}
      </span>
      <Badge label={status.slice(0, 8)} color={statusColor} size="xs" />
      {purpose && (
        <span className="text-[9px] hidden sm:block" style={{ color: DS.textMuted }}>
          {purpose}
        </span>
      )}
    </div>
  );
}

// ─── Lifecycle / trade log row ───────────────────────────────────
function TradeRow({ lc }: { lc: Lifecycle }) {
  const symbol   = asStr(lc.symbol) ?? '—';
  const pnl      = asNum(lc.realizedPnl);
  const entry    = asNum(lc.avgEntryPrice);
  const exit     = asNum(lc.avgExitPrice);
  const isOpen   = lc.realizedPnl == null;
  const pnlColor = pnl == null ? DS.textSec : pnl > 0 ? DS.profit : pnl < 0 ? DS.loss : DS.textSec;

  return (
    <div
      className="flex items-center gap-3 py-2"
      style={{ borderBottom: `1px solid ${DS.border}` }}
    >
      <span className="text-[10px] w-16 flex-shrink-0" style={{ color: DS.textMuted, fontFamily: DS.mono }}>
        {fmt.time(asStr(lc.createdAt))}
      </span>
      <span className="text-xs font-semibold flex-shrink-0 w-20" style={{ color: DS.text, fontFamily: DS.mono }}>
        {symbol}
      </span>
      <span className="text-xs flex-1" style={{ color: DS.textSec, fontFamily: DS.mono }}>
        {fmt.usd(entry)} → {exit ? fmt.usd(exit) : '—'}
      </span>
      <span
        className="text-xs font-bold"
        style={{ color: pnlColor, fontFamily: DS.mono, minWidth: 60, textAlign: 'right' }}
      >
        {pnl != null ? `${fmt.usd(pnl)}${isOpen ? '*' : ''}` : '—'}
      </span>
    </div>
  );
}

// ─── Sub-tab toggle ──────────────────────────────────────────────
type Tab = 'orders' | 'trades';

function TabBtn({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all"
      style={{
        color: active ? DS.info : DS.textSec,
        background: active ? DS.infoBg : 'transparent',
        border: `1px solid ${active ? DS.infoBorder : 'transparent'}`,
        fontFamily: DS.mono,
      }}
    >
      {label}
      {count > 0 && (
        <span
          className="text-[9px] px-1 rounded-full"
          style={{
            background: active ? DS.infoBg : DS.border,
            color: active ? DS.info : DS.textMuted,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

interface Props {
  openPositions: Pos[];
  orders:        Order[];
  lifecycles:    Lifecycle[];
  activeTab:     Tab;
  setTab:        (t: Tab) => void;
}

export function PositionStatusCard({
  openPositions,
  orders,
  lifecycles,
  activeTab,
  setTab,
}: Props) {
  const exposure = openPositions.reduce(
    (s, p) => s + (asNum(p.notional) ?? 0),
    0
  );
  const totalPnl = openPositions.reduce(
    (s, p) => s + (asNum(p.unrealizedPnl) ?? 0),
    0
  );
  const closedTrades = lifecycles.filter((lc) => lc.realizedPnl != null);

  return (
    <Card>
      <CardHeader
        title="Positions & Execution"
        accent={DS.teal}
        right={
          <div className="flex items-center gap-2 text-[10px]" style={{ color: DS.textSec, fontFamily: DS.mono }}>
            {openPositions.length > 0 ? (
              <>
                <span>{openPositions.length} open</span>
                <span style={{ color: DS.border }}>|</span>
                <span>Exp: {fmt.usd(exposure)}</span>
                <span style={{ color: totalPnl >= 0 ? DS.profit : DS.loss }}>
                  uPnL: {fmt.usd(totalPnl)}
                </span>
              </>
            ) : (
              <span style={{ color: DS.profit }}>Flat — No open exposure</span>
            )}
          </div>
        }
      />

      <div className="p-5 space-y-4">
        {/* Open positions */}
        {openPositions.length === 0 ? (
          <div
            className="rounded-lg p-4 flex items-center gap-3"
            style={{ background: DS.elevated, border: `1px solid ${DS.border}` }}
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: DS.profit, boxShadow: `0 0 4px ${DS.profit}` }}
            />
            <div>
              <div className="text-sm font-medium" style={{ color: DS.text }}>
                Bot is flat — no active exposure
              </div>
              <div className="text-xs mt-0.5" style={{ color: DS.textMuted }}>
                No positions currently held
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {openPositions.slice(0, 3).map((p, i) => (
              <PositionRow key={String(p.id ?? i)} p={p} />
            ))}
            {openPositions.length > 3 && (
              <div className="text-xs text-center py-1" style={{ color: DS.textMuted }}>
                +{openPositions.length - 3} more positions
              </div>
            )}
          </div>
        )}

        {/* Sub-tabs: Orders / Trade Log */}
        <div>
          <div
            className="flex items-center gap-1 mb-3 pb-3"
            style={{ borderBottom: `1px solid ${DS.border}` }}
          >
            <TabBtn
              label="Orders"
              count={orders.length}
              active={activeTab === 'orders'}
              onClick={() => setTab('orders')}
            />
            <TabBtn
              label="Trade Log"
              count={closedTrades.length}
              active={activeTab === 'trades'}
              onClick={() => setTab('trades')}
            />
          </div>

          {activeTab === 'orders' && (
            orders.length === 0 ? (
              <EmptyState title="No orders recorded" subtitle="Recent order history will appear here" />
            ) : (
              <div>
                {/* Header */}
                <div
                  className="flex items-center gap-3 pb-1.5 mb-1"
                  style={{ borderBottom: `1px solid ${DS.border}` }}
                >
                  {['Time', 'Symbol', 'Side', 'Price · Qty', 'Status'].map((h) => (
                    <span
                      key={h}
                      className="text-[9px] uppercase tracking-wider"
                      style={{ color: DS.textMuted }}
                    >
                      {h}
                    </span>
                  ))}
                </div>
                {orders.slice(0, 15).map((o, i) => (
                  <OrderRow key={String(o.id ?? i)} o={o} />
                ))}
              </div>
            )
          )}

          {activeTab === 'trades' && (
            closedTrades.length === 0 ? (
              <EmptyState
                title="No closed trades yet"
                subtitle="Completed trades with realized PnL will appear here"
              />
            ) : (
              <div>
                {closedTrades.slice(0, 15).map((lc, i) => (
                  <TradeRow key={String(lc.id ?? i)} lc={lc} />
                ))}
                <div className="text-[9px] mt-2" style={{ color: DS.textMuted }}>
                  * Open trade — unrealized PnL shown
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </Card>
  );
}
