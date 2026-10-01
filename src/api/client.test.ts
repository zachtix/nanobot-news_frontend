import { describe, expect, it, vi } from 'vitest';
import { api, ApiError, describeError, toQuery } from './client';

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
