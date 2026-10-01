import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import type { AiUsageCall, NewsAnalysis } from '../api/types';
import { AiUsagePage } from '../pages/AiUsagePage';
import { chooseOption, makeNews, mockShellApi, renderPage, renderWithI18n } from '../test/utils';
import { NewsCard } from './NewsCard';

const tags = [
  { id: 1, symbol: 'BTC', name: 'Bitcoin', assetType: 'crypto' },
  { id: 2, symbol: 'GOLD', name: 'Gold', assetType: 'commodity' },
];

describe('auto asset tags on news cards', () => {
  it('shows tags captured at fetch time when the story has not been analysed', () => {
    renderWithI18n(<NewsCard news={makeNews({ tags, analysis: null })} />, 'th');
    const list = screen.getByLabelText('สินทรัพย์ที่เกี่ยวข้อง');
    expect(within(list).getByText('BTC')).toHaveAttribute('title', 'Bitcoin');
    expect(within(list).getByText('GOLD')).toBeInTheDocument();
  });

  it('shows the analysis chips (with direction) instead once analysed', () => {
    const analysis: NewsAnalysis = {
      id: 1,
      newsId: 1,
      model: 'm',
      summaryTh: 's',
      summaryEn: 's',
      impact: 'low',
      timeHorizon: 'short',
      referenceCount: 1,
      createdAt: '2026-10-01T00:00:00Z',
      assets: [{ id: 1, symbol: 'BTC', name: 'Bitcoin', assetType: 'crypto', direction: 'down', confidence: 55, rationaleTh: 'x', rationaleEn: 'x' }],
    };
    renderWithI18n(<NewsCard news={makeNews({ tags, analysis })} />, 'th');
    expect(screen.queryByLabelText('สินทรัพย์ที่เกี่ยวข้อง')).not.toBeInTheDocument();
    expect(screen.getByLabelText('BTC ลง มั่นใจ 55%')).toBeInTheDocument();
  });

  it('renders nothing extra for untagged stories without AI', () => {
    renderWithI18n(<NewsCard news={makeNews({ tags: [], analysis: null })} />, 'th');
    expect(screen.queryByLabelText('สินทรัพย์ที่เกี่ยวข้อง')).not.toBeInTheDocument();
  });
});

const call = (overrides: Partial<AiUsageCall>): AiUsageCall => ({
  id: 1,
  createdAt: '2026-10-01T04:00:00Z',
  purpose: 'tag',
  model: 'google/gemini-3.8-flash',
  generationId: 'gen-1',
  success: true,
  error: null,
  promptTokens: 1266,
  completionTokens: 608,
  totalTokens: 1874,
  cachedTokens: 0,
  reasoningTokens: 0,
  cost: 0.0032,
  durationMs: 4100,
  fetchRunId: 12,
  context: 'news#116,115',
  hasLog: true,
  ...overrides,
});

describe('prompt log on the AI usage page', () => {
  let calls: MockInstance<typeof api.aiUsageCalls>;

  beforeEach(() => {
    mockShellApi();
    vi.spyOn(api, 'aiUsageSummary').mockRejectedValue(new Error('skip'));
    vi.spyOn(api, 'aiAccount').mockResolvedValue({ enabled: true, fetchedAt: '', key: null, credits: null, errors: [] });
    calls = vi.spyOn(api, 'aiUsageCalls').mockResolvedValue({
      items: [call({ id: 1 }), call({ id: 2, purpose: 'dedup', hasLog: false, success: false, error: 'OpenRouter 503' })],
      total: 2,
      page: 1,
      limit: 20,
    });
  });

  it('labels each call with its type and filters by type', async () => {
    const user = userEvent.setup();
    renderPage(<AiUsagePage />, { path: '/ai-usage' });
    const section = await screen.findByRole('region', { name: 'การเรียก AI ล่าสุด' });
    const rows = await within(section).findAllByRole('row');
    expect(within(rows[1]).getByText('ติดแท็กสินทรัพย์')).toHaveAttribute('data-purpose', 'tag');
    expect(within(rows[2]).getByText('ตรวจข่าวซ้ำ')).toHaveAttribute('data-purpose', 'dedup');

    await chooseOption(user, within(section).getByRole('combobox', { name: 'กรองตามประเภท' }), 'วิเคราะห์ข่าว');
    await waitFor(() => expect(calls).toHaveBeenLastCalledWith(expect.objectContaining({ purpose: 'analyze', page: 1 })));
  });

  it('explains when a log is no longer available', async () => {
    vi.spyOn(api, 'aiCallLog').mockRejectedValue(new ApiError(404, 'No prompt log for this call'));
    renderPage(<AiUsagePage />, { path: '/ai-usage' });
    const section = await screen.findByRole('region', { name: 'การเรียก AI ล่าสุด' });
    const rows = await within(section).findAllByRole('row');
    await userEvent.click(within(rows[1]).getByRole('button', { name: 'ดู prompt' }));
    expect(await within(section).findByText(/ไม่มี log ของการเรียกนี้/)).toBeInTheDocument();
  });
});

describe('shortContext', () => {
  it('shortens long batch contexts and keeps short ones', async () => {
    const { shortContext } = await import('../pages/AiUsagePage');
    expect(shortContext('news#116,115,114,113,112')).toBe('news#116,115,114 +2');
    expect(shortContext('news#7,8')).toBe('news#7,8');
    expect(shortContext(null)).toBe('-');
    expect(shortContext('settings: test connection')).toBe('settings: test connection');
  });
});
