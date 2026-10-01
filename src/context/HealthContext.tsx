import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Health } from '../api/types';

interface HealthValue {
  health: Health | null;
  /** Reload after something that changes capabilities (e.g. a new API key or model in settings). */
  refresh: () => void;
}

/** Backend capabilities (AI key set, model, translation/analysis enabled), shared by the whole app. */
const HealthContext = createContext<HealthValue>({ health: null, refresh: () => {} });

export function HealthProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<Health | null>(null);
  const refresh = useCallback(() => {
    api.health().then(setHealth, () => setHealth(null));
  }, []);
  useEffect(refresh, [refresh]);
  return <HealthContext.Provider value={{ health, refresh }}>{children}</HealthContext.Provider>;
}

export function useHealth(): Health | null {
  return useContext(HealthContext).health;
}

export function useRefreshHealth(): () => void {
  return useContext(HealthContext).refresh;
}
