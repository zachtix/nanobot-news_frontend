import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors';
import { nanobot } from './nanobot';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Nanobot member API client', () => {
  it('signs in with the x-api-key header and reads the tokens out of the envelope', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { status: 200, data: { token: { accessToken: 'acc', refreshToken: 'ref' } } }));

    await expect(nanobot.login('a@nanobot.app', 'pw')).resolves.toEqual({ accessToken: 'acc', refreshToken: 'ref' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/v1\/auth\/login$/);
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ email: 'a@nanobot.app', password: 'pw' }) });
    expect(init!.headers).toHaveProperty('x-api-key');
    expect(init!.headers).not.toHaveProperty('Authorization');
  });

  it('reads the profile of a token and whether it is staff', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { status: 200, data: { user_id: 'TH-1', email: 'a@nanobot.app', first_name: 'Nano', last_name: 'Bot', role: 'senior' } }),
    );

    await expect(nanobot.me('acc')).resolves.toEqual({
      id: 'TH-1',
      email: 'a@nanobot.app',
      name: 'Nano Bot',
      role: 'SENIOR',
      isStaff: true,
    });
    expect((fetchMock.mock.calls[0][1]!.headers as Record<string, string>).Authorization).toBe('Bearer acc');

    fetchMock.mockResolvedValue(jsonResponse(200, { status: 200, data: { user_id: 'TH-2', role: 'USER' } }));
    await expect(nanobot.me('acc')).resolves.toMatchObject({ role: 'USER', isStaff: false });
  });

  it('rejects with the message Nanobot gives, on an HTTP error or a failed envelope status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(401, { status: 401, error: 'Your email or password is incorrect' }));
    const err = await nanobot.login('a@nanobot.app', 'x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, message: 'Your email or password is incorrect' });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(200, { status: 400, error: 'Your email is not verify' }));
    await expect(nanobot.login('a@nanobot.app', 'x')).rejects.toMatchObject({ status: 400, message: 'Your email is not verify' });
  });
});
