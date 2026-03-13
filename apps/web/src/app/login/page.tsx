'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DS } from '@/components/v2/ui';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);

    startTransition(async () => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const message = await response
          .json()
          .then((data) => String(data.error ?? 'Authentication failed'))
          .catch(() => 'Authentication failed');
        setError(message);
        return;
      }

      router.replace('/');
      router.refresh();
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4" style={{ background: DS.bg }}>
      <div
        className="w-full max-w-md rounded-[28px] p-7 space-y-6"
        style={{
          background: DS.surface,
          border: `1px solid ${DS.border}`,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
          backdropFilter: 'blur(18px)',
        }}
      >
        <div className="space-y-2">
          <p
            className="text-[11px] uppercase tracking-[0.24em]"
            style={{ color: DS.teal, fontFamily: DS.mono }}
          >
            Operator Access
          </p>
          <h1 className="text-3xl font-bold" style={{ color: DS.text, fontFamily: DS.font }}>
            CryptoBot Dashboard
          </h1>
          <p className="text-sm" style={{ color: DS.textSec }}>
            Entre com uma conta `viewer` para monitoramento ou `admin` para controles operacionais.
          </p>
        </div>

        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-[11px] uppercase tracking-[0.16em]" style={{ color: DS.textMuted }}>
              Username
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl px-3 py-3 text-sm outline-none"
              style={{
                color: DS.text,
                background: DS.elevated,
                border: `1px solid ${DS.border}`,
              }}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-[11px] uppercase tracking-[0.16em]" style={{ color: DS.textMuted }}>
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isPending) submit();
              }}
              className="w-full rounded-xl px-3 py-3 text-sm outline-none"
              style={{
                color: DS.text,
                background: DS.elevated,
                border: `1px solid ${DS.border}`,
              }}
            />
          </label>
        </div>

        {error && (
          <div
            className="rounded-xl px-3 py-2 text-sm"
            style={{
              color: DS.loss,
              background: DS.lossBg,
              border: `1px solid ${DS.lossBorder}`,
            }}
          >
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={isPending || username.trim().length === 0 || password.length === 0}
          className="w-full rounded-xl px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] disabled:opacity-50"
          style={{
            color: DS.info,
            background: DS.infoBg,
            border: `1px solid ${DS.infoBorder}`,
            fontFamily: DS.mono,
          }}
        >
          {isPending ? 'Authenticating...' : 'Sign In'}
        </button>
      </div>
    </main>
  );
}
