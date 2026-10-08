import { ApiError } from './errors';
import type { AuthTokens, AuthUser } from './types';

/**
 * Sign-in straight against the Nanobot member API, as member-frontend does: POST /v1/auth/login, /v1/auth/me,
 * /v1/auth/refresh-token and /v1/auth/logout with the `x-api-key` header. Replies are envelopes
 * `{ status, data }` whose own `status` decides success; failures carry `{ error }`.
 */
const MEMBER_URL = ((import.meta.env.VITE_API_URL_MEMBER as string | undefined) ?? '').replace(/\/+$/, '');
const MEMBER_KEY = (import.meta.env.VITE_API_KEY_MEMBER as string | undefined) ?? '';

/** Nanobot staff roles: only these may open the settings, news sources and AI usage (the backend checks again). */
export const STAFF_ROLES = ['ROOT', 'SENIOR', 'ADMIN'];

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

async function post(path: string, body: unknown, accessToken?: string | null): Promise<unknown> {
  const res = await fetch(`${MEMBER_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': MEMBER_KEY,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const envelope = (await res.json().catch(() => null)) as { status?: unknown; data?: unknown; error?: unknown; message?: unknown } | null;
  const status = typeof envelope?.status === 'number' ? envelope.status : res.status;
  if (res.ok && status >= 200 && status < 300) return envelope?.data ?? null;
  throw new ApiError(status, text(envelope?.error) ?? text(envelope?.message) ?? `HTTP ${res.status}`);
}

function tokensOf(data: unknown): AuthTokens {
  const token = (data as { token?: { accessToken?: unknown; refreshToken?: unknown } } | null)?.token;
  const accessToken = text(token?.accessToken);
  if (!accessToken) throw new ApiError(502, 'Nanobot returned no access token');
  return { accessToken, refreshToken: text(token?.refreshToken) };
}

function userOf(data: unknown): AuthUser {
  const d = (data ?? {}) as Record<string, unknown>;
  const id = d.user_id ?? d.id;
  const role = text(d.role)?.toUpperCase();
  if ((typeof id !== 'string' && typeof id !== 'number') || !role) throw new ApiError(502, 'Nanobot returned a profile without a role');
  const name = [text(d.first_name), text(d.last_name)].filter(Boolean).join(' ');
  return { id: String(id), email: text(d.email), name: name || null, role, isStaff: STAFF_ROLES.includes(role) };
}

export const nanobot = {
  login: async (email: string, password: string) => tokensOf(await post('/v1/auth/login', { email, password })),
  refresh: async (refreshToken: string) => tokensOf(await post('/v1/auth/refresh-token', { refreshToken })),
  me: async (accessToken: string) => userOf(await post('/v1/auth/me', {}, accessToken)),
  logout: async (accessToken: string) => {
    await post('/v1/auth/logout', {}, accessToken);
  },
};

// ---- The session: tokens kept in this browser, sent as `Authorization: Bearer` to the backend too
const ACCESS_KEY = 'auth.accessToken';
const REFRESH_KEY = 'auth.refreshToken';

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage unavailable (private mode etc.)
  }
}

export const authTokens = {
  access: () => readStored(ACCESS_KEY),
  refresh: () => readStored(REFRESH_KEY),
  save(tokens: AuthTokens) {
    try {
      localStorage.setItem(ACCESS_KEY, tokens.accessToken);
      if (tokens.refreshToken) localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    } catch {
      // ignore
    }
  },
  clear() {
    try {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    } catch {
      // ignore
    }
  },
};

type SessionListener = (user: AuthUser | null) => void;
const sessionListeners = new Set<SessionListener>();

/** Told when the session is renewed (the account) or over (null). Returns the unsubscribe. */
export function onSessionChange(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

/** Drop the stored tokens and tell the app the session is over. */
export function endSession() {
  authTokens.clear();
  sessionListeners.forEach((l) => l(null));
}

let renewing: Promise<boolean> | null = null;

/** Swap the refresh token for a new access token at Nanobot; concurrent callers share one attempt. */
export function renewSession(): Promise<boolean> {
  const refreshToken = authTokens.refresh();
  if (!refreshToken) return Promise.resolve(false);
  renewing ??= nanobot
    .refresh(refreshToken)
    .then(async (tokens) => {
      authTokens.save(tokens);
      const user = await nanobot.me(tokens.accessToken);
      sessionListeners.forEach((l) => l(user));
      return true;
    })
    .catch(() => false)
    .finally(() => {
      renewing = null;
    });
  return renewing;
}
