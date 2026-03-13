export type DashboardRole = 'viewer' | 'admin';

export interface DashboardSession {
  username: string;
  role: DashboardRole;
  exp: number;
}

const SESSION_COOKIE = 'cryptobot_dashboard_session';
const SESSION_TTL_SEC = 60 * 60 * 12;

function getAuthConfig() {
  return {
    sessionSecret: process.env['DASHBOARD_SESSION_SECRET'] ?? '',
    viewerUsername: process.env['DASHBOARD_VIEWER_USERNAME'] ?? '',
    viewerPassword: process.env['DASHBOARD_VIEWER_PASSWORD'] ?? '',
    adminUsername: process.env['DASHBOARD_ADMIN_USERNAME'] ?? '',
    adminPassword: process.env['DASHBOARD_ADMIN_PASSWORD'] ?? '',
  };
}

function encodeBase64Url(input: string): string {
  if (typeof btoa === 'function') {
    return btoa(input)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);

  if (typeof atob === 'function') {
    return atob(normalized + padding);
  }

  return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  const base64 = typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(binary, 'binary').toString('base64');

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signValue(value: string, secret: string): Promise<string> {
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE;
}

export async function createSessionToken(
  username: string,
  role: DashboardRole,
): Promise<string> {
  const { sessionSecret } = getAuthConfig();
  if (!sessionSecret) {
    throw new Error('DASHBOARD_SESSION_SECRET is not configured');
  }

  const payload: DashboardSession = {
    username,
    role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
  };

  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await signValue(encodedPayload, sessionSecret);
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(token: string | undefined): Promise<DashboardSession | null> {
  if (!token) return null;

  const { sessionSecret } = getAuthConfig();
  if (!sessionSecret) return null;

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = await signValue(encodedPayload, sessionSecret);
  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as DashboardSession;
    if (!payload.username || (payload.role !== 'viewer' && payload.role !== 'admin')) {
      return null;
    }
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function validateOperatorCredentials(
  username: string,
  password: string,
): { username: string; role: DashboardRole } | null {
  const config = getAuthConfig();

  if (
    username === config.adminUsername &&
    password === config.adminPassword &&
    username.length > 0
  ) {
    return { username, role: 'admin' };
  }

  if (
    username === config.viewerUsername &&
    password === config.viewerPassword &&
    username.length > 0
  ) {
    return { username, role: 'viewer' };
  }

  return null;
}

export function authConfigIsReady(): boolean {
  const config = getAuthConfig();
  return Boolean(
    config.sessionSecret &&
    config.viewerUsername &&
    config.viewerPassword &&
    config.adminUsername &&
    config.adminPassword,
  );
}
