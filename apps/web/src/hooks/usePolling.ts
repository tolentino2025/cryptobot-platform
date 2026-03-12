'use client';
import { useState, useEffect, useCallback } from 'react';

export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number = 5000,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await fetcher();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, intervalMs);
    return () => clearInterval(interval);
  }, [refresh, intervalMs]);

  return { data, error, loading, refresh };
}
