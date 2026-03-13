// ═══════════════════════════════════════════════════════════════
// API Client — Typed fetch wrapper for the Ops API
// ═══════════════════════════════════════════════════════════════

const API_BASE = '/api/ops';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const error = await res.text().catch(() => 'Unknown error');
    throw new Error(`API ${res.status}: ${error}`);
  }
  return res.json();
}

export const api = {
  // System
  health: () => apiFetch<unknown>('/health'),
  buildInfo: () => apiFetch<unknown>('/build-info'),
  systemState: () => apiFetch<unknown>('/system/state'),
  pause: (reason: string) => apiFetch<unknown>('/system/pause', { method: 'POST', body: JSON.stringify({ reason }) }),
  resume: (reason: string) => apiFetch<unknown>('/system/resume', { method: 'POST', body: JSON.stringify({ reason }) }),
  kill: (reason: string) => apiFetch<unknown>('/system/kill', { method: 'POST', body: JSON.stringify({ reason }) }),

  // Mode
  setModeSim: () => apiFetch<unknown>('/mode/sim', { method: 'POST' }),
  setModeDemo: () => apiFetch<unknown>('/mode/demo', { method: 'POST' }),
  setModeLive: (confirmationCode: string, reason: string) =>
    apiFetch<unknown>('/mode/live', { method: 'POST', body: JSON.stringify({ mode: 'LIVE', confirmationCode, reason }) }),

  // Data
  dashboard: () => apiFetch<unknown>('/dashboard/overview'),
  positions: (page = 1) => apiFetch<unknown>(`/positions?page=${page}`),
  balances: () => apiFetch<unknown>('/balances'),
  orders: (page = 1) => apiFetch<unknown>(`/orders?page=${page}`),
  fills: (page = 1) => apiFetch<unknown>(`/fills?page=${page}`),
  decisions: (page = 1) => apiFetch<unknown>(`/decisions?page=${page}`),
  incidents: (page = 1) => apiFetch<unknown>(`/incidents?page=${page}`),
  audit: (page = 1, filters?: Record<string, string>) => {
    const params = new URLSearchParams({ page: String(page), ...filters });
    return apiFetch<unknown>(`/audit?${params}`);
  },

  // Trade Lifecycle
  lifecycles: (page = 1) => apiFetch<unknown>(`/lifecycle?page=${page}`),
  lifecycleById: (id: string) => apiFetch<unknown>(`/lifecycle/${id}`),

  // Config
  config: () => apiFetch<unknown>('/config'),
  updateStrategy: (updates: Record<string, unknown>, reason: string) =>
    apiFetch<unknown>('/config/strategy', { method: 'PUT', body: JSON.stringify({ updates, reason }) }),
  updateRisk: (updates: Record<string, unknown>, reason: string) =>
    apiFetch<unknown>('/config/risk', { method: 'PUT', body: JSON.stringify({ updates, reason }) }),
};
