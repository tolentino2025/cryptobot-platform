// ═══════════════════════════════════════════════════════════════
// CRYPTOBOT PLATFORM — Enumerations
// All system-wide enums. Single source of truth.
// ═══════════════════════════════════════════════════════════════

/** Trading execution mode */
export enum TradingMode {
  SIM = 'SIM',
  DEMO = 'DEMO',
  LIVE = 'LIVE',
}

/** Global system state — drives all operational decisions */
export enum SystemState {
  BOOTING = 'BOOTING',           // System is starting up (pre-init)
  INITIALIZING = 'INITIALIZING', // Legacy alias for BOOTING — prefer BOOTING in new code
  RUNNING = 'RUNNING',           // Normal operation — only state where trading is allowed
  DEGRADED = 'DEGRADED',         // Market data stale (>2s) — trading suspended, auto-recoverable
  PAUSED = 'PAUSED',             // Manual or automatic pause — requires explicit resume
  RECONCILING = 'RECONCILING',   // Exchange reconciliation in progress
  SAFE_MODE = 'SAFE_MODE',       // Critical discrepancies found — requires human intervention
  KILLED = 'KILLED',             // Terminal state — no restart without process restart
}

/** States that BLOCK all trading activity */
export const NON_TRADING_STATES: ReadonlySet<SystemState> = new Set([
  SystemState.BOOTING,
  SystemState.INITIALIZING,
  SystemState.DEGRADED,
  SystemState.PAUSED,
  SystemState.KILLED,
  SystemState.RECONCILING,
  SystemState.SAFE_MODE,
]);

/**
 * Explicit state transition map — defines legal transitions.
 * KILLED and SAFE_MODE are terminal/restricted: no exit without human intervention.
 */
export const ALLOWED_STATE_TRANSITIONS: ReadonlyMap<SystemState, ReadonlySet<SystemState>> = new Map([
  [SystemState.BOOTING,       new Set([SystemState.RUNNING, SystemState.RECONCILING, SystemState.KILLED, SystemState.SAFE_MODE])],
  [SystemState.INITIALIZING,  new Set([SystemState.RUNNING, SystemState.RECONCILING, SystemState.KILLED, SystemState.SAFE_MODE, SystemState.BOOTING])],
  [SystemState.RUNNING,       new Set([SystemState.DEGRADED, SystemState.PAUSED, SystemState.RECONCILING, SystemState.KILLED])],
  [SystemState.DEGRADED,      new Set([SystemState.RUNNING, SystemState.PAUSED, SystemState.KILLED])],
  [SystemState.PAUSED,        new Set([SystemState.RUNNING, SystemState.RECONCILING, SystemState.KILLED])],
  [SystemState.RECONCILING,   new Set([SystemState.RUNNING, SystemState.PAUSED, SystemState.SAFE_MODE])],
  [SystemState.SAFE_MODE,     new Set([SystemState.KILLED])], // Human must kill and restart
  [SystemState.KILLED,        new Set()],                     // Terminal — no exit
]);

/** AI model proposed action */
export enum TradeAction {
  BUY = 'BUY',
  SELL = 'SELL',
  HOLD = 'HOLD',
  EXIT = 'EXIT',
}

/** Order entry type */
export enum EntryType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
}

/** Order side */
export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

/** Order lifecycle status */
export enum OrderStatus {
  PENDING = 'PENDING',         // Created locally, not yet sent
  SENT = 'SENT',               // Sent to exchange, awaiting ACK
  OPEN = 'OPEN',               // Acknowledged by exchange, on book
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED',           // Local failure (network, etc.)
}

/** Terminal order states — no further transitions */
export const TERMINAL_ORDER_STATES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.FILLED,
  OrderStatus.CANCELLED,
  OrderStatus.REJECTED,
  OrderStatus.EXPIRED,
  OrderStatus.FAILED,
]);

/** Risk Engine review result */
export enum RiskVerdict {
  APPROVED = 'APPROVED',
  ADJUSTED = 'ADJUSTED',       // Approved with modified sizing
  DENIED = 'DENIED',
}

/** Risk denial reason categories */
export enum RiskDenialReason {
  MAX_POSITION_EXCEEDED = 'MAX_POSITION_EXCEEDED',
  MAX_EXPOSURE_EXCEEDED = 'MAX_EXPOSURE_EXCEEDED',
  DAILY_LOSS_EXCEEDED = 'DAILY_LOSS_EXCEEDED',
  WEEKLY_LOSS_EXCEEDED = 'WEEKLY_LOSS_EXCEEDED',
  MAX_OPEN_POSITIONS = 'MAX_OPEN_POSITIONS',
  MAX_TRADES_PER_HOUR = 'MAX_TRADES_PER_HOUR',
  CONSECUTIVE_LOSSES = 'CONSECUTIVE_LOSSES',
  COOLDOWN_ACTIVE = 'COOLDOWN_ACTIVE',
  SPREAD_TOO_WIDE = 'SPREAD_TOO_WIDE',
  SLIPPAGE_TOO_HIGH = 'SLIPPAGE_TOO_HIGH',
  SYMBOL_NOT_ALLOWED = 'SYMBOL_NOT_ALLOWED',
  SESSION_NOT_ALLOWED = 'SESSION_NOT_ALLOWED',
  DATA_STALE = 'DATA_STALE',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  SYSTEM_NOT_RUNNING = 'SYSTEM_NOT_RUNNING',
  EXCHANGE_DESYNC = 'EXCHANGE_DESYNC',
  MARKET_DATA_GAP = 'MARKET_DATA_GAP',
  UNEXPECTED_POSITION = 'UNEXPECTED_POSITION',
  REPEATED_REJECTIONS = 'REPEATED_REJECTIONS',
  ACTIVE_INCIDENT = 'ACTIVE_INCIDENT',
  BALANCE_BELOW_THRESHOLD = 'BALANCE_BELOW_THRESHOLD',
  INVALID_STOP_TP = 'INVALID_STOP_TP',
  PYRAMIDING_NOT_ALLOWED = 'PYRAMIDING_NOT_ALLOWED',
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',
  ORDER_RETRY_LIMIT = 'ORDER_RETRY_LIMIT',
}

/** Position status */
export enum PositionStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  LIQUIDATING = 'LIQUIDATING',  // Exit in progress
  EXIT_PENDING = 'EXIT_PENDING', // Exit order sent, awaiting fill
  EXIT_FAILED = 'EXIT_FAILED',   // Exit order failed, reverted to OPEN
}

/** Position exit reason */
export enum ExitReason {
  // ── Primary reasons ──────────────────────────────────────────────
  TAKE_PROFIT      = 'TAKE_PROFIT',
  STOP_LOSS        = 'STOP_LOSS',
  TIME_EXIT        = 'TIME_EXIT',         // Position held too long
  VOLATILITY_EXIT  = 'VOLATILITY_EXIT',   // Regime turned excessively volatile
  REGIME_EXIT      = 'REGIME_EXIT',       // Trend reversed or regime changed
  EMERGENCY_EXIT   = 'EMERGENCY_EXIT',    // Kill-switch triggered
  // ── Legacy ───────────────────────────────────────────────────────
  TIMEOUT          = 'TIMEOUT',           // Superseded by TIME_EXIT — kept for DB compatibility
  INVALIDATION     = 'INVALIDATION',
  MANUAL           = 'MANUAL',
  KILL_SWITCH      = 'KILL_SWITCH',       // Superseded by EMERGENCY_EXIT
  AI_EXIT          = 'AI_EXIT',           // Superseded by regime/volatility/time variants
}

/** Classified market regime — output of the AI assessment layer */
export enum AIMarketRegime {
  BULL_TREND    = 'BULL_TREND',
  BEAR_TREND    = 'BEAR_TREND',
  RANGE         = 'RANGE',
  VOLATILE      = 'VOLATILE',
  LOW_LIQUIDITY = 'LOW_LIQUIDITY',
}

/** Incident severity */
export enum IncidentSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
  FATAL = 'FATAL',
}

/** Incident type */
export enum IncidentType {
  MARKET_DATA_GAP = 'MARKET_DATA_GAP',
  WEBSOCKET_DISCONNECT = 'WEBSOCKET_DISCONNECT',
  EXCHANGE_ERROR = 'EXCHANGE_ERROR',
  EXCHANGE_DESYNC = 'EXCHANGE_DESYNC',
  ORDER_REJECTED = 'ORDER_REJECTED',
  REPEATED_REJECTIONS = 'REPEATED_REJECTIONS',
  BALANCE_INCONSISTENCY = 'BALANCE_INCONSISTENCY',
  UNEXPECTED_POSITION = 'UNEXPECTED_POSITION',
  DAILY_LOSS_LIMIT = 'DAILY_LOSS_LIMIT',
  WEEKLY_LOSS_LIMIT = 'WEEKLY_LOSS_LIMIT',
  CONSECUTIVE_LOSSES = 'CONSECUTIVE_LOSSES',
  EXECUTION_FAILED = 'EXECUTION_FAILED',    // critical execution failure — triggers pause + reconcile
  SPREAD_TOO_WIDE = 'SPREAD_TOO_WIDE',      // repeated spread violations
  CLOCK_DRIFT = 'CLOCK_DRIFT',              // local clock diverged from exchange clock
  CLAUDE_API_ERROR = 'CLAUDE_API_ERROR',
  CLAUDE_INVALID_RESPONSE = 'CLAUDE_INVALID_RESPONSE',
  KILL_SWITCH_ACTIVATED = 'KILL_SWITCH_ACTIVATED',
  RECONCILIATION_FAILED = 'RECONCILIATION_FAILED',
  HIGH_LATENCY = 'HIGH_LATENCY',
  CONFIG_CHANGE = 'CONFIG_CHANGE',
  MODE_CHANGE = 'MODE_CHANGE',
}

/** Audit event type */
export enum AuditEventType {
  SYSTEM_START = 'SYSTEM_START',
  SYSTEM_STOP = 'SYSTEM_STOP',
  STATE_CHANGE = 'STATE_CHANGE',
  MODE_CHANGE = 'MODE_CHANGE',
  CONFIG_CHANGE = 'CONFIG_CHANGE',
  DECISION_REQUESTED = 'DECISION_REQUESTED',
  DECISION_RECEIVED = 'DECISION_RECEIVED',
  DECISION_FALLBACK = 'DECISION_FALLBACK',
  RISK_APPROVED = 'RISK_APPROVED',
  RISK_ADJUSTED = 'RISK_ADJUSTED',
  RISK_DENIED = 'RISK_DENIED',
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_SENT = 'ORDER_SENT',
  ORDER_FILLED = 'ORDER_FILLED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  ORDER_REJECTED = 'ORDER_REJECTED',
  ORDER_FAILED = 'ORDER_FAILED',
  POSITION_OPENED = 'POSITION_OPENED',
  POSITION_CLOSED = 'POSITION_CLOSED',
  INCIDENT_CREATED = 'INCIDENT_CREATED',
  INCIDENT_RESOLVED = 'INCIDENT_RESOLVED',
  ADMIN_ACTION = 'ADMIN_ACTION',
  PAUSE_TRIGGERED = 'PAUSE_TRIGGERED',
  RESUME_TRIGGERED = 'RESUME_TRIGGERED',
  KILL_TRIGGERED = 'KILL_TRIGGERED',
  RECONCILIATION_START = 'RECONCILIATION_START',
  RECONCILIATION_COMPLETE = 'RECONCILIATION_COMPLETE',
  RECONCILIATION_FAILED = 'RECONCILIATION_FAILED',
}

/** Supported exchanges */
export enum Exchange {
  BINANCE = 'BINANCE',
  COINBASE = 'COINBASE',  // Future
  KRAKEN = 'KRAKEN',      // Future
  SIMULATED = 'SIMULATED',
}

/**
 * Trade lifecycle reconciliation status.
 * Tracks whether the lifecycle record has been verified against the exchange.
 */
export enum ReconciliationStatus {
  PENDING       = 'PENDING',        // Entry filled; not yet reconciled
  RECONCILED    = 'RECONCILED',     // Exit confirmed; fully consistent
  DIVERGENT     = 'DIVERGENT',      // Mismatch detected — incident raised
  MANUAL_REVIEW = 'MANUAL_REVIEW',  // Requires human review (cannot auto-resolve)
}

/** Admin action types */
export enum AdminActionType {
  PAUSE = 'PAUSE',
  RESUME = 'RESUME',
  KILL = 'KILL',
  MODE_CHANGE = 'MODE_CHANGE',
  CONFIG_UPDATE = 'CONFIG_UPDATE',
  RISK_UPDATE = 'RISK_UPDATE',
  STRATEGY_UPDATE = 'STRATEGY_UPDATE',
}
