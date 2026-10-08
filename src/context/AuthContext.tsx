import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/errors';
import { authTokens, nanobot, onSessionChange, renewSession } from '../api/nanobot';
import type { AuthUser } from '../api/types';

type AuthStatus = 'loading' | 'signedIn' | 'signedOut';

interface AuthValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** Rejects with the API's message (e.g. wrong password) and leaves the state unchanged. */
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  status: 'signedOut',
  user: null,
  login: () => Promise.reject(new Error('AuthProvider missing')),
  logout: async () => {},
});

/**
 * The Nanobot account signed in on this browser (tokens in localStorage, checked with Nanobot on load).
 * `user` gives the account up front instead (tests): null = nobody signed in.
 */
export function AuthProvider({ children, user: known }: { children: ReactNode; user?: AuthUser | null }) {
  const [user, setUser] = useState<AuthUser | null>(known ?? null);
  const [status, setStatus] = useState<AuthStatus>(() =>
    known !== undefined ? (known ? 'signedIn' : 'signedOut') : authTokens.access() ? 'loading' : 'signedOut',
  );

  useEffect(() => {
    // A call elsewhere renewed the session or found it over.
    const off = onSessionChange((next) => {
      setUser(next);
      setStatus(next ? 'signedIn' : 'signedOut');
    });
    const token = authTokens.access();
    if (token && known === undefined) {
      nanobot.me(token).then(
        (me) => {
          setUser(me);
          setStatus('signedIn');
        },
        async (err) => {
          // An expired token is renewed once; only a refused session ends it (an unreachable API keeps it).
          if (err instanceof ApiError && err.status === 401) {
            if (await renewSession()) return;
            authTokens.clear();
          }
          setUser(null);
          setStatus('signedOut');
        },
      );
    }
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `known` only matters on mount
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await nanobot.login(email, password);
    const me = await nanobot.me(tokens.accessToken);
    authTokens.save(tokens);
    setUser(me);
    setStatus('signedIn');
    return me;
  }, []);

  const logout = useCallback(async () => {
    const token = authTokens.access();
    // Signing out here must not wait on Nanobot being up: the tokens are dropped either way.
    if (token) await nanobot.logout(token).catch(() => undefined);
    authTokens.clear();
    setUser(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}
