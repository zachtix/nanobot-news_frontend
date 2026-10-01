import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, ApiError, describeError } from '../api/client';
import type { FetchRun, FetchStatus } from '../api/types';

interface FetchStatusValue {
  status: FetchStatus | null;
  running: boolean;
  /** True between clicking "fetch" and the API accepting the run. */
  starting: boolean;
  /** Last trigger error: "conflict" when a run is already in progress, otherwise the failure detail. */
  error: { kind: 'conflict' } | { kind: 'failed'; detail: string } | null;
  /** The most recent run that finished while this page was open (manual or scheduled). */
  completedRun: FetchRun | null;
  trigger: (sourceIds?: number[]) => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

const FetchStatusContext = createContext<FetchStatusValue | null>(null);

interface ProviderProps {
  children: ReactNode;
  /** Poll interval while a run is in progress. */
  activePollMs?: number;
  /** Poll interval while idle, so scheduled runs are noticed too. */
  idlePollMs?: number;
}

export function FetchStatusProvider({ children, activePollMs = 2000, idlePollMs = 30000 }: ProviderProps) {
  const [status, setStatus] = useState<FetchStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<FetchStatusValue['error']>(null);
  const [completedRun, setCompletedRun] = useState<FetchRun | null>(null);
  const wasRunning = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await api.fetchStatus();
      if (wasRunning.current && !next.running && next.lastRun) setCompletedRun(next.lastRun);
      wasRunning.current = next.running;
      setStatus(next);
    } catch {
      // backend unreachable; keep the last known status and retry on the next tick
    }
  }, []);

  const running = status?.running ?? false;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const tick = async () => {
      await refresh();
      if (!cancelled) timer = setTimeout(tick, wasRunning.current ? activePollMs : idlePollMs);
    };
    timer = setTimeout(tick, running ? activePollMs : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refresh, running, activePollMs, idlePollMs]);

  const trigger = useCallback(
    async (sourceIds?: number[]) => {
      setStarting(true);
      setError(null);
      try {
        const run = await api.runFetch(sourceIds);
        wasRunning.current = true;
        setStatus((prev) => ({ running: true, run, lastRun: prev?.lastRun ?? null }));
      } catch (err) {
        setError(
          err instanceof ApiError && err.status === 409
            ? { kind: 'conflict' }
            : { kind: 'failed', detail: describeError(err) },
        );
        await refresh();
      } finally {
        setStarting(false);
      }
    },
    [refresh],
  );

  return (
    <FetchStatusContext.Provider
      value={{
        status,
        running,
        starting,
        error,
        completedRun,
        trigger,
        refresh,
        clearError: () => setError(null),
      }}
    >
      {children}
    </FetchStatusContext.Provider>
  );
}

export function useFetchStatus(): FetchStatusValue {
  const ctx = useContext(FetchStatusContext);
  if (!ctx) throw new Error('useFetchStatus must be used inside <FetchStatusProvider>');
  return ctx;
}
