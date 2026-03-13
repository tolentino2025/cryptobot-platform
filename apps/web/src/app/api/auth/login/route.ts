import { NextRequest, NextResponse } from 'next/server';
import {
  authConfigIsReady,
  createSessionToken,
  getSessionCookieName,
  validateOperatorCredentials,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  if (!authConfigIsReady()) {
    return NextResponse.json(
      { error: 'Dashboard auth is not fully configured on the server' },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null) as {
    username?: string;
    password?: string;
  } | null;

  const username = body?.username?.trim() ?? '';
  const password = body?.password ?? '';
  const operator = validateOperatorCredentials(username, password);

  if (!operator) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  const token = await createSessionToken(operator.username, operator.role);
  const response = NextResponse.json({
    authenticated: true,
    role: operator.role,
    username: operator.username,
  });

  response.cookies.set({
    name: getSessionCookieName(),
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  });

  return response;
}
