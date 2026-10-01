import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import type { AiSettings, Health, NewsAnalysis } from '../api/types';
import { HealthProvider } from '../context/HealthContext';
import { I18nProvider } from '../i18n/I18nContext';
import { SettingsPage } from '../pages/SettingsPage';
import { makeNews, mockShellApi, renderPage } from '../test/utils';
import { NewsCard } from './NewsCard';

const health = (showModel: boolean): Health => ({
  status: 'ok',
  ai: { enabled: true, model: 'google/gemini-3.8-flash' },
  analysis: { enabled: true },
  ui: { showModel },
});

const analysis: NewsAnalysis = {
  id: 1,
  newsId: 1,
  model: 'google/gemini-3.8-flash',
  summaryTh: 'สรุป',
  summaryEn: 'Summary',
  impact: 'medium',
  timeHorizon: 'medium',
  referenceCount: 1,
  createdAt: '2026-10-01T04:22:00.000Z',
  assets: [],
};

const renderCard = () =>
  render(
    <I18nProvider defaultLang="th">
      <HealthProvider>
        <NewsCard news={makeNews({ analysis })} />
      </HealthProvider>
    </I18nProvider>,
  );

describe('show model name setting', () => {
  it('header badge shows the model by default and only "AI on" when hidden', async () => {
    mockShellApi();
    const { unmount } = renderPage(<div>page</div>);
    expect(await screen.findByText('AI: google/gemini-3.8-flash')).toBeInTheDocument();
    unmount();

    vi.spyOn(api, 'health').mockResolvedValue(health(false));
    renderPage(<div>page</div>);
    expect(await screen.findByText('AI เปิดอยู่')).toBeInTheDocument();
    expect(screen.queryByText(/gemini/)).not.toBeInTheDocument();
  });

  it('analysis footer omits the model when hidden', async () => {
    vi.spyOn(api, 'health').mockResolvedValue(health(false));
    renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'ดูบทวิเคราะห์' }));
    const panel = screen.getByRole('region', { name: 'บทวิเคราะห์ AI' });
    await waitFor(() => expect(within(panel).queryByText(/gemini/)).not.toBeInTheDocument());
    expect(within(panel).getByText(/วิเคราะห์เมื่อ .* · ไม่ใช่คำแนะนำการลงทุน/)).toBeInTheDocument();
  });

  it('analysis footer shows the model when enabled', async () => {
    vi.spyOn(api, 'health').mockResolvedValue(health(true));
    renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'ดูบทวิเคราะห์' }));
    expect(await screen.findByText(/google\/gemini-3\.8-flash · ไม่ใช่คำแนะนำการลงทุน/)).toBeInTheDocument();
  });

  it('settings switch saves immediately and refreshes the header', async () => {
    const shell = mockShellApi();
    const settings: AiSettings = {
      provider: { value: 'openrouter', source: 'env', envDefault: 'openrouter' },
      anthropic: {
        apiKey: { configured: false, masked: null, source: 'none' },
        model: { value: 'claude-haiku-4-5', source: 'env', envDefault: 'claude-haiku-4-5' },
      },
      apiKey: { configured: true, masked: 'sk-or-v1-f…af96', source: 'env' },
      managementKey: { configured: false, masked: null, source: 'none' },
      model: { value: 'google/gemini-3.8-flash', source: 'env', envDefault: 'google/gemini-3.8-flash' },
      prompts: {
        dedup: { value: 'p', isDefault: true, defaultValue: 'p' },
        translate: { value: 'p', isDefault: true, defaultValue: 'p' },
        tag: { value: 'p', isDefault: true, defaultValue: 'p' },
        analyze: { value: 'p', isDefault: true, defaultValue: 'p' },
        market: { value: 'p', isDefault: true, defaultValue: 'p' },
      },
      display: { showModel: true },
    };
    vi.spyOn(api, 'getAiSettings').mockResolvedValue(settings);
    vi.spyOn(api, 'listModels').mockResolvedValue([]);
    const update = vi
      .spyOn(api, 'updateAiSettings')
      .mockResolvedValue({ settings: { ...settings, display: { showModel: false } }, warnings: [] });
    renderPage(<SettingsPage />, { path: '/settings' });

    const card = await screen.findByRole('region', { name: 'การแสดงผล' });
    const toggle = within(card).getByRole('switch', { name: 'แสดงชื่อโมเดล AI ในหน้าเว็บ' });
    expect(toggle).toBeChecked();
    const healthCalls = shell.health.mock.calls.length;

    shell.health.mockResolvedValue(health(false));
    await userEvent.click(toggle);

    expect(update).toHaveBeenCalledWith({ showModel: false });
    await waitFor(() => expect(toggle).not.toBeChecked());
    await waitFor(() => expect(shell.health.mock.calls.length).toBeGreaterThan(healthCalls));
    expect(await screen.findByText('AI เปิดอยู่')).toBeInTheDocument();
  });
});
