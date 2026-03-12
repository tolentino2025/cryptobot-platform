'use client';

import { cn, formatUSD, formatNumber, formatDate, verdictColor, pnlColor } from '@/lib/utils';
import { Badge } from './ui';

// ─────────────────────────────────────────────────────
// AI Decisions table
// ─────────────────────────────────────────────────────

export function DecisionsTable({ decisions }: { decisions: Record<string, unknown>[] }) {
  if (decisions.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-[#64748B] text-sm">No AI decisions recorded yet</p>
      </div>
    );
  }

  const actionBadge = (action: string) => {
    const map: Record<string, string> = {
      BUY:  'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20',
      SELL: 'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20',
      EXIT: 'text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/20',
      HOLD: 'text-[#64748B] bg-[#64748B]/10 border-[#64748B]/20',
    };
    return map[action] ?? map.HOLD;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#1F1F2A]">
            {['Time', 'Action', 'Symbol', 'Conf.', 'Regime', 'Verdict', 'Latency', 'Thesis'].map((h) => (
              <th
                key={h}
                className="text-left pb-2.5 pr-4 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {decisions.map((d) => {
            const action = (d.action as string) ?? 'HOLD';
            // regime may be in d.regime OR d.decision.regime
            const decisionJson = d.decision as Record<string, unknown> | undefined;
            const regime = (d.regime as string) ?? decisionJson?.regime ?? '—';

            return (
              <tr
                key={d.id as string}
                className="border-b border-[#1F1F2A]/50 hover:bg-[#1F1F2A]/30 transition-colors"
              >
                <td className="py-2.5 pr-4 font-mono text-[#64748B] whitespace-nowrap">
                  {formatDate(d.createdAt as string)}
                </td>
                <td className="py-2.5 pr-4">
                  <Badge className={cn('text-[10px]', actionBadge(action))}>
                    {String(action)}
                  </Badge>
                </td>
                <td className="py-2.5 pr-4 font-mono font-bold text-white">{d.symbol as string}</td>
                <td className="py-2.5 pr-4 font-mono text-white">
                  {formatNumber(d.confidence as number, 1)}
                </td>
                <td className="py-2.5 pr-4 text-[#64748B]">{regime as string}</td>
                <td className="py-2.5 pr-4">
                  <span className={verdictColor(d.verdict as string)}>{(d.verdict as string) ?? '—'}</span>
                  {!!d.denialReason && (
                    <span className="text-[#EF4444]/50 ml-1 text-[10px]">
                      ({String(d.denialReason)})
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-4 font-mono text-[#64748B] whitespace-nowrap">
                  {d.latencyMs as number}ms
                </td>
                <td className="py-2.5 text-[#64748B] max-w-[220px] truncate">
                  {d.thesis as string}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Orders table
// ─────────────────────────────────────────────────────

const PURPOSE_TAGS: Record<string, string> = {
  ENTRY:       'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20',
  EXIT_AI:     'text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/20',
  STOP_LOSS:   'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20',
  TAKE_PROFIT: 'text-[#3B82F6] bg-[#3B82F6]/10 border-[#3B82F6]/20',
};

export function OrdersTable({ orders }: { orders: Record<string, unknown>[] }) {
  if (orders.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-[#64748B] text-sm">No orders yet</p>
      </div>
    );
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      FILLED:    'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20',
      CANCELLED: 'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20',
      REJECTED:  'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20',
      OPEN:      'text-[#3B82F6] bg-[#3B82F6]/10 border-[#3B82F6]/20',
      SENT:      'text-[#3B82F6] bg-[#3B82F6]/10 border-[#3B82F6]/20',
    };
    return map[status] ?? 'text-[#64748B] bg-[#64748B]/10 border-[#64748B]/20';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#1F1F2A]">
            {['Time', 'Symbol', 'Side', 'Type', 'Qty', 'Price', 'Status', 'Purpose'].map((h) => (
              <th
                key={h}
                className="text-left pb-2.5 pr-4 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr
              key={o.id as string}
              className="border-b border-[#1F1F2A]/50 hover:bg-[#1F1F2A]/30 transition-colors"
            >
              <td className="py-2.5 pr-4 font-mono text-[#64748B] whitespace-nowrap">
                {formatDate(o.createdAt as string)}
              </td>
              <td className="py-2.5 pr-4 font-mono font-bold text-white">{o.symbol as string}</td>
              <td className="py-2.5 pr-4">
                <span
                  className={cn(
                    'font-bold',
                    (o.side as string) === 'BUY' ? 'text-[#22C55E]' : 'text-[#EF4444]',
                  )}
                >
                  {o.side as string}
                </span>
              </td>
              <td className="py-2.5 pr-4 text-[#64748B]">{o.type as string}</td>
              <td className="py-2.5 pr-4 font-mono text-white">
                {formatNumber(o.quantity as number, 5)}
              </td>
              <td className="py-2.5 pr-4 font-mono text-white">
                {o.price ? formatUSD(o.price as number) : 'MKT'}
              </td>
              <td className="py-2.5 pr-4">
                <Badge className={cn('text-[10px]', statusBadge(o.status as string))}>
                  {String(o.status)}
                </Badge>
              </td>
              <td className="py-2.5">
                {!!o.purpose && (
                  <Badge
                    className={cn(
                      'text-[10px]',
                      PURPOSE_TAGS[o.purpose as string] ?? 'text-[#64748B] bg-[#64748B]/10 border-[#64748B]/20',
                    )}
                  >
                    {String(o.purpose)}
                  </Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Lifecycle table
// ─────────────────────────────────────────────────────

const LC_STATUS: Record<string, string> = {
  RECONCILED:    'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20',
  DIVERGENT:     'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20',
  MANUAL_REVIEW: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  PENDING:       'text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/20',
};

export function LifecycleTable({ lifecycles }: { lifecycles: Record<string, unknown>[] }) {
  if (lifecycles.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-[#64748B] text-sm">No trade lifecycles yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#1F1F2A]">
            {['Time', 'Symbol', 'Qty Req', 'Qty Fill', 'Entry', 'Exit', 'Fees', 'Slip bps', 'PnL', 'Status'].map((h) => (
              <th
                key={h}
                className="text-left pb-2.5 pr-3 text-[10px] font-semibold text-[#64748B] uppercase tracking-wider whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lifecycles.map((lc) => {
            const pnl    = (lc.realizedPnl as number) ?? (lc.unrealizedPnl as number) ?? null;
            const isOpen = lc.realizedPnl == null;
            const lcStatus = (lc.reconciliationStatus as string) ?? 'PENDING';

            return (
              <tr
                key={lc.id as string}
                className="border-b border-[#1F1F2A]/50 hover:bg-[#1F1F2A]/30 transition-colors"
              >
                <td className="py-2.5 pr-3 font-mono text-[#64748B] whitespace-nowrap">
                  {formatDate(lc.createdAt as string)}
                </td>
                <td className="py-2.5 pr-3 font-mono font-bold text-white">{lc.symbol as string}</td>
                <td className="py-2.5 pr-3 font-mono text-white">
                  {formatNumber(lc.entryQtyRequested as number, 5)}
                </td>
                <td className="py-2.5 pr-3 font-mono">
                  <span
                    className={
                      (lc.entryQtyFilled as number) < (lc.entryQtyRequested as number)
                        ? 'text-[#F59E0B]'
                        : 'text-white'
                    }
                  >
                    {formatNumber(lc.entryQtyFilled as number, 5)}
                  </span>
                </td>
                <td className="py-2.5 pr-3 font-mono text-white">
                  {formatUSD(lc.avgEntryPrice as number)}
                </td>
                <td className="py-2.5 pr-3 font-mono text-[#64748B]">
                  {lc.avgExitPrice ? formatUSD(lc.avgExitPrice as number) : '—'}
                </td>
                <td className="py-2.5 pr-3 font-mono text-[#64748B]">
                  {formatUSD(lc.feesTotal as number)}
                </td>
                <td className="py-2.5 pr-3 font-mono text-[#64748B]">
                  {(lc.slippageBps as number).toFixed(1)}
                </td>
                <td className="py-2.5 pr-3 font-mono">
                  {pnl != null ? (
                    <span className={pnlColor(pnl)}>
                      {formatUSD(pnl)}
                      {isOpen ? ' *' : ''}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2.5">
                  <Badge className={cn('text-[10px]', LC_STATUS[lcStatus] ?? LC_STATUS.PENDING)}>
                    {lcStatus}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-[#64748B] mt-2">* Unrealized PnL — position still open</p>
    </div>
  );
}
