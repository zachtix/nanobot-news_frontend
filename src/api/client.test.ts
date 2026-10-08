import { describe, expect, it, vi } from 'vitest';
import { api, ApiError, describeError, toQuery } from './client';
import { authTokens, onSessionChange } from './nanobot';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('toQuery', () => {
  it('skips empty values', () => {
    expect(toQuery({ page: 2, q: '', sourceId: undefined, sort: 'latest', x: null })).toBe('?page=2&sort=latest');
    expect(toQuery({})).toBe('');
  });
});

describe('api client', () => {
  it('builds news list URLs from the query', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { items: [], total: 0 }));
    await api.listNews({ page: 2, q: 'etf', minRefs: 2 });
    expect(fetchMock).toHaveBeenCalledWith('/api/news?page=2&q=etf&minRefs=2', expect.anything());
  });

  it('sends JSON bodies', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(202, { id: 1 }));
    await api.runFetch([3, 4]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/fetch/run');
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ sourceIds: [3, 4] }) });
    expect((init!.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('returns undefined for 204 responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.deleteSource(1)).resolves.toBeUndefined();
  });

  it('throws ApiError with server message and details', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(400, { error: 'Validation failed', details: [{ path: 'url', message: 'Must be a valid http(s) URL' }] }),
    );
    const err = await api.createSource({ url: 'x' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(describeError(err)).toBe('Validation failed (url: Must be a valid http(s) URL)');
  });

  it('falls back to the HTTP status when the body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('oops', { status: 502 }));
    await expect(api.health()).rejects.toThrow('HTTP 502');
  });
});

describe('api client sign-in tokens', () => {
  const authOf = (init: RequestInit | undefined) => (init?.headers as Record<string, string> | undefined)?.Authorization;
  const nanobotOk = (data: unknown) => jsonResponse(200, { status: 200, data });

  it('sends the stored Nanobot access token as a Bearer header', async () => {
    authTokens.save({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, {}));
    await api.getAiSettings();
    expect(authOf(fetchMock.mock.calls[0][1])).toBe('Bearer acc-1');
  });

  it('sends no Authorization header when signed out', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, {}));
    await api.health();
    expect(authOf(fetchMock.mock.calls[0][1])).toBeUndefined();
  });

  it('renews an expired access token at Nanobot once and retries the call', async () => {
    authTokens.save({ accessToken: 'old', refreshToken: 'ref-1' });
    const seen: unknown[] = [];
    const off = onSessionChange((u) => seen.push(u));
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(nanobotOk({ token: { accessToken: 'new', refreshToken: 'ref-2' } }))
      .mockResolvedValueOnce(nanobotOk({ user_id: 'TH-1', email: 'a@nanobot.app', role: 'admin' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await expect(api.getAiSettings()).resolves.toEqual({ ok: true });
    off();
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/v1\/auth\/refresh-token$/);
    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toEqual({ refreshToken: 'ref-1' });
    expect(fetchMock.mock.calls[2][0]).toMatch(/\/v1\/auth\/me$/);
    expect(authOf(fetchMock.mock.calls[3][1])).toBe('Bearer new');
    expect(authTokens.access()).toBe('new');
    expect(authTokens.refresh()).toBe('ref-2');
    expect(seen).toEqual([{ id: 'TH-1', email: 'a@nanobot.app', name: null, role: 'ADMIN', isStaff: true }]);
  });

  it('ends the session when Nanobot refuses the refresh token too', async () => {
    authTokens.save({ accessToken: 'old', refreshToken: 'stale' });
    const seen: unknown[] = [];
    const off = onSessionChange((u) => seen.push(u));
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(401, { status: 401, error: 'Refresh token expired' }));

    const err = await api.getAiSettings().catch((e) => e);
    off();
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(authTokens.access()).toBeNull();
    expect(seen).toEqual([null]);
  });
});
