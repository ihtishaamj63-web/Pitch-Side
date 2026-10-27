import { useCallback, useEffect, useState } from 'react';
import { readableError } from '../../api';

interface QueryState<T> {
  key: string;
  data?: T;
  error?: string;
}

export function useApi<T>(key: string, load: () => Promise<T>, enabled = true) {
  const [state, setState] = useState<QueryState<T>>({ key: '' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    load().then(data => {
      if (!cancelled) setState({ key, data });
    }).catch(error => {
      if (!cancelled) setState({ key, error: readableError(error) });
    });
    return () => { cancelled = true; };
  }, [key, load, enabled, revision]);

  const setData = useCallback((value: T | ((current: T | undefined) => T)) => {
    setState(current => ({
      key,
      data: typeof value === 'function'
        ? (value as (current: T | undefined) => T)(current.key === key ? current.data : undefined)
        : value,
    }));
  }, [key]);
  const setError = useCallback((error: string) => setState({ key, error }), [key]);
  const refresh = useCallback(() => setRevision(current => current + 1), []);
  const current = state.key === key;

  return {
    data: current ? state.data : undefined,
    error: current ? state.error ?? '' : '',
    loading: enabled && !current,
    refresh,
    setData,
    setError,
  };
}
