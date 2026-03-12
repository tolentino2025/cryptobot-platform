// ═══════════════════════════════════════════════════════════════
// API Client — Typed fetch wrapper for the Ops API
// ═══════════════════════════════════════════════════════════════

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
const AUTH_TOKEN = process.env['NEXT_PUBLIC_API_TOKEN'] ?? '';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AUTH_TOKEN}`,
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
  health: () => apiFetch<any>('/health'),
  buildInfo: () => apiFetch<any>('/build-info'),
  systemState: () => apiFetch<any>('/system/state'),
  pause: (reason: string) => apiFetch<any>('/system/pause', { method: 'POST', body: JSON.stringify({ reason }) }),
  resume: (reason: string) => apiFetch<any>('/system/resume', { method: 'POST', body: JSON.stringify({ reason }) }),
  kill: (reason: string) => apiFetch<any>('/system/kill', { method: 'POST', body: JSON.stringify({ reason }) }),

  // Mode
  setModeSim: () => apiFetch<any>('/mode/sim', { method: 'POST' }),
  setModeDemo: () => apiFetch<any>('/mode/demo', { method: 'POST' }),
  setModeLive: (confirmationCode: string, reason: string) =>
    apiFetch<any>('/mode/live', { method: 'POST', body: JSON.stringify({ mode: 'LIVE', confirmationCode, reason }) }),

  // Data
  dashboard: () => apiFetch<any>('/dashboard/overview'),
  positions: (page = 1) => apiFetch<any>(`/positions?page=${page}`),
  balances: () => apiFetch<any>('/balances'),
  orders: (page = 1) => apiFetch<any>(`/orders?page=${page}`),
  fills: (page = 1) => apiFetch<any>(`/fills?page=${page}`),
  decisions: (page = 1) => apiFetch<any>(`/decisions?page=${page}`),
  incidents: (page = 1) => apiFetch<any>(`/incidents?page=${page}`),
  audit: (page = 1, filters?: Record<string, string>) => {
    const params = new URLSearchParams({ page: String(page), ...filters });
    return apiFetch<any>(`/audit?${params}`);
  },

  // Trade Lifecycle
  lifecycles: (page = 1) => apiFetch<any>(`/lifecycle?page=${page}`),
  lifecycleById: (id: string) => apiFetch<any>(`/lifecycle/${id}`),

  // Config
  config: () => apiFetch<any>('/config'),
  updateStrategy: (updates: Record<string, unknown>, reason: string) =>
    apiFetch<any>('/config/strategy', { method: 'PUT', body: JSON.stringify({ updates, reason }) }),
  updateRisk: (updates: Record<string, unknown>, reason: string) =>
    apiFetch<any>('/config/risk', { method: 'PUT', body: JSON.stringify({ updates, reason }) }),
};
