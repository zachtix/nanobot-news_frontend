import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { authTokens, nanobot } from '../api/nanobot';
import type { AuthUser } from '../api/types';
import { Layout } from '../components/Layout';
import { RequireStaffRole } from '../components/RequireStaffRole';
import { AuthProvider } from '../context/AuthContext';
import { FetchStatusProvider } from '../context/FetchStatusContext';
import { HealthProvider } from '../context/HealthContext';
import { I18nProvider } from '../i18n/I18nContext';
import { customerUser, mockShellApi, renderPage, UiProviders } from '../test/utils';
import { LoginPage } from './LoginPage';

const account = (role: string): AuthUser => ({
  id: `uid-${role}`,
  email: `${role.toLowerCase()}@nanobot.app`,
  name: null,
  role,
  isStaff: ['ROOT', 'SENIOR', 'ADMIN'].includes(role),
});

/** The app shell with a guarded stand-in for the settings page. */
function renderApp(path: string) {
  return render(
    <UiProviders>
      <I18nProvider defaultLang="th">
        <AuthProvider>
          <HealthProvider>
            <MemoryRouter initialEntries={[path]}>
              <FetchStatusProvider idlePollMs={60_000}>
                <Routes>
                  <Route element={<Layout />}>
                    <Route index element={<p>หน้าข่าว</p>} />
                    <Route
                      path="settings"
                      element={
                        <RequireStaffRole>
                          <p>เนื้อหาหน้าตั้งค่า</p>
                        </RequireStaffRole>
                      }
                    />
                    <Route path="login" element={<LoginPage />} />
                  </Route>
                </Routes>
              </FetchStatusProvider>
            </MemoryRouter>
          </HealthProvider>
        </AuthProvider>
      </I18nProvider>
    </UiProviders>,
  );
}

async function signIn(email: string, password = 'secret') {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('อีเมล'), email);
  await user.type(screen.getByLabelText('รหัสผ่าน'), password);
  await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
  return user;
}

describe('sign-in and the settings guard', () => {
  it('sends a signed-out visitor of Settings to sign in, then back to Settings', async () => {
    mockShellApi();
    const login = vi.spyOn(nanobot, 'login').mockResolvedValue({ accessToken: 'acc', refreshToken: 'ref' });
    const me = vi.spyOn(nanobot, 'me').mockResolvedValue(account('ADMIN'));
    renderApp('/settings');

    expect(await screen.findByText(/หน้านี้ต้องเข้าสู่ระบบก่อน/)).toBeInTheDocument();
    expect(screen.queryByText('เนื้อหาหน้าตั้งค่า')).not.toBeInTheDocument();

    await signIn(' admin@nanobot.app ');
    expect(await screen.findByText('เนื้อหาหน้าตั้งค่า')).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith('admin@nanobot.app', 'secret');
    expect(me).toHaveBeenCalledWith('acc');
    expect(authTokens.access()).toBe('acc');
    expect(authTokens.refresh()).toBe('ref');
  });

  it('shows the API message when the sign-in is refused', async () => {
    mockShellApi();
    vi.spyOn(nanobot, 'login').mockRejectedValue(new ApiError(401, 'Your email or password is incorrect'));
    renderApp('/login');

    await signIn('admin@nanobot.app', 'wrong');
    expect(await screen.findByText('เข้าสู่ระบบไม่สำเร็จ: Your email or password is incorrect')).toBeInTheDocument();
    expect(authTokens.access()).toBeNull();
  });

  it('keeps other roles out of Settings', async () => {
    mockShellApi();
    vi.spyOn(nanobot, 'login').mockResolvedValue({ accessToken: 'acc', refreshToken: 'ref' });
    vi.spyOn(nanobot, 'me').mockResolvedValue(account('USER'));
    renderApp('/settings');

    await signIn('user@nanobot.app');
    expect(await screen.findByText('ไม่มีสิทธิ์เข้าหน้านี้')).toBeInTheDocument();
    expect(screen.getByText(/user@nanobot\.app มี role USER/)).toBeInTheDocument();
    expect(screen.queryByText('เนื้อหาหน้าตั้งค่า')).not.toBeInTheDocument();
  });

  it.each(['ROOT', 'SENIOR'])('lets %s in with a stored session, and signs out from the header', async (role) => {
    mockShellApi();
    authTokens.save({ accessToken: 'acc', refreshToken: 'ref' });
    vi.spyOn(nanobot, 'me').mockResolvedValue(account(role));
    const logout = vi.spyOn(nanobot, 'logout').mockResolvedValue(undefined);
    renderApp('/settings');

    expect(await screen.findByText('เนื้อหาหน้าตั้งค่า')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: `บัญชี: ${role.toLowerCase()}@nanobot.app` }));
    expect(screen.getByText(`Role: ${role}`)).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'ออกจากระบบ' }));

    await waitFor(() => expect(logout).toHaveBeenCalledWith('acc'));
    expect(await screen.findByLabelText('อีเมล')).toBeInTheDocument();
    expect(authTokens.access()).toBeNull();
  });

  it('drops a stored token the API refuses', async () => {
    mockShellApi();
    authTokens.save({ accessToken: 'revoked', refreshToken: null });
    vi.spyOn(nanobot, 'me').mockRejectedValue(new ApiError(401, 'Unauthorized'));
    renderApp('/');

    expect(await screen.findByRole('link', { name: 'เข้าสู่ระบบ' })).toBeInTheDocument();
    expect(authTokens.access()).toBeNull();
  });

  it('shows administrators every page and the fetch button, customers the news, market and chart', async () => {
    mockShellApi();
    const { unmount } = renderPage(<p>x</p>, { user: customerUser });
    const nav = screen.getByRole('navigation', { name: 'main' });
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['ข่าว', 'วิเคราะห์ตลาด', 'วิเคราะห์กราฟ']);
    // Fetching news now is for administrators.
    expect(screen.queryByRole('button', { name: 'ดึงข่าวตอนนี้' })).not.toBeInTheDocument();
    unmount();

    renderPage(<p>x</p>);
    expect(within(screen.getByRole('navigation', { name: 'main' })).getAllByRole('link')).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'ดึงข่าวตอนนี้' })).toBeInTheDocument();
  });
});
