import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookieName, verifySessionToken } from '@/lib/auth';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
const API_TOKEN = process.env['API_AUTH_TOKEN'] ?? '';

export const dynamic = 'force-dynamic';

function buildTargetUrl(path: string[], request: NextRequest): string {
  const trimmedBase = API_BASE.replace(/\/$/, '');
  const pathname = path.map(encodeURIComponent).join('/');
  return `${trimmedBase}/${pathname}${request.nextUrl.search}`;
}

async function proxyRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  const session = await verifySessionToken(
    request.cookies.get(getSessionCookieName())?.value,
  );

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isReadOnlyRequest = request.method === 'GET' || request.method === 'HEAD';
  if (!isReadOnlyRequest && session.role !== 'admin') {
    return NextResponse.json(
      { error: 'Admin role required for this action' },
      { status: 403 },
    );
  }

  if (!API_TOKEN) {
    return NextResponse.json(
      { error: 'API_AUTH_TOKEN is not configured on the web server' },
      { status: 500 },
    );
  }

  const headers = new Headers();
  headers.set('Authorization', `Bearer ${API_TOKEN}`);

  const contentType = request.headers.get('content-type');
  if (contentType) {
    headers.set('Content-Type', contentType);
  }

  const upstream = await fetch(buildTargetUrl(path, request), {
    method: request.method,
    headers,
    body:
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.text(),
    cache: 'no-store',
  });

  const responseHeaders = new Headers();
  const responseContentType = upstream.headers.get('content-type');
  if (responseContentType) {
    responseHeaders.set('Content-Type', responseContentType);
  }

  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}
