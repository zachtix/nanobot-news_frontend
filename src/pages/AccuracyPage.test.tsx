import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import type { OutcomeSummary, PredictionView } from '../api/types';
import { mockShellApi, renderPage } from '../test/utils';
import { AccuracyPage } from './AccuracyPage';

const FEEDBACK = 'TRACK RECORD of your earlier per-story calls, checked against real prices.\nOverall: all calls → 55% right (n=40).';

const summary = (overrides: Partial<OutcomeSummary> = {}): OutcomeSummary => ({
  source: 'analysis',
  tracking: true,
  feedback: true,
  minSamples: 20,
  mainHorizon: '24h',
  counts: { pending: 6, done: 40, unsupported: 3, error: 0 },
  horizons: {
    '1h': { n: 46, hits: 20, hitRate: 43.5 },
    '4h': { n: 44, hits: 22, hitRate: 50 },
    '24h': { n: 40, hits: 22, hitRate: 55 },
  },
  byEventType: [
    { key: 'hack_exploit', n: 24, hits: 18, hitRate: 75, avgMove: -6.2, reliable: true },
    { key: 'etf_fund_flows', n: 8, hits: 4, hitRate: 50, avgMove: 1.4, reliable: false },
  ],
  byConfidence: [{ key: '70-84', n: 25, hits: 13, hitRate: 52, avgMove: 0.3, reliable: true }],
  byDirection: [{ key: 'up', n: 30, hits: 14, hitRate: 46.7, avgMove: -0.4, reliable: true }],
  byAsset: [{ key: 'BTC', n: 12, hits: 7, hitRate: 58.3, avgMove: 0.8, reliable: false }],
  feedbackText: FEEDBACK,
  ...overrides,
});

const call = (overrides: Partial<PredictionView> = {}): PredictionView => ({
  id: 1,
  source: 'analysis',
  sourceKey: 412,
  newsId: 412,
  title: 'Exchange hacked for $40M',
  symbol: 'ETH',
  assetType: 'crypto',
  direction: 'down',
  confidence: 70,
  eventType: 'hack_exploit',
  model: 'google/gemini-3.8-flash',
  baseTime: '2026-10-01T05:00:00.000Z',
  status: 'done',
  error: null,
  moves: { '1h': -0.1, '4h': -1.2, '24h': -3.4 },
  verdicts: { '1h': 'miss', '4h': 'hit', '24h': 'hit' },
  ...overrides,
});

describe('AccuracyPage', () => {
  beforeEach(() => {
    mockShellApi();
    vi.spyOn(api, 'outcomeSummary').mockResolvedValue(summary());
    vi.spyOn(api, 'outcomePredictions').mockResolvedValue({ items: [call()], total: 1, page: 1, limit: 10 });
  });

  it('shows the hit rate per horizon, the groups and exactly what the AI is given', async () => {
    renderPage(<AccuracyPage />, { path: '/accuracy' });

    const day = await screen.findByRole('group', { name: 'หลังข่าว 24h' });
    expect(within(day).getByText('ถูก 55%')).toBeInTheDocument();
    expect(within(day).getByText('ตัดสินแล้ว 40 รายการ')).toBeInTheDocument();

    const events = screen.getByRole('table', { name: 'ประเภทเหตุการณ์' });
    const hack = within(events).getByText('แฮก / ช่องโหว่').closest('tr')!;
    expect(within(hack).getByText('ส่งให้ AI')).toBeInTheDocument(); // enough calls
    expect(within(hack).getByText('-6.2%')).toBeInTheDocument();
    expect(within(within(events).getByText('ETF / เงินไหลเข้าออกกองทุน').closest('tr')!).queryByText('ส่งให้ AI')).not.toBeInTheDocument();

    const feedback = screen.getByRole('region', { name: 'สิ่งที่ส่งให้ AI ตอนนี้' });
    expect(feedback.querySelector('pre')!.textContent).toBe(FEEDBACK);

    const calls = await screen.findByRole('region', { name: 'คำทำนายแต่ละรายการ' });
    expect(within(calls).getByText('Exchange hacked for $40M')).toBeInTheDocument();
    expect(within(calls).getByText('-3.4%')).toBeInTheDocument();
  });

  it('says when nothing is sent yet, or when the switches are off', async () => {
    vi.mocked(api.outcomeSummary).mockResolvedValueOnce(summary({ feedbackText: null }));
    const { unmount } = renderPage(<AccuracyPage />, { path: '/accuracy' });
    expect(await screen.findByText(/ต้องมีผลที่ตัดสินได้อย่างน้อย 20 รายการ/)).toBeInTheDocument();
    unmount();

    vi.mocked(api.outcomeSummary).mockResolvedValueOnce(summary({ tracking: false, feedback: false, feedbackText: null }));
    renderPage(<AccuracyPage />, { path: '/accuracy' });
    expect(await screen.findByText(/ปิดการเก็บผลอยู่/)).toBeInTheDocument();
    expect(screen.getByText(/AI วิเคราะห์แบบเดิม/)).toBeInTheDocument();
  });

  it('switches to the market brief’s calls and can update prices now', async () => {
    const user = userEvent.setup();
    const refresh = vi.spyOn(api, 'refreshOutcomes').mockResolvedValue({ updated: 3 });
    renderPage(<AccuracyPage />, { path: '/accuracy' });
    await screen.findByRole('group', { name: 'หลังข่าว 24h' });

    vi.mocked(api.outcomePredictions).mockResolvedValue({
      items: [call({ source: 'market', sourceKey: 7, newsId: null, title: null })],
      total: 1,
      page: 1,
      limit: 10,
    });
    await user.click(screen.getByRole('radio', { name: 'วิเคราะห์ตลาด' }));
    await waitFor(() => expect(api.outcomeSummary).toHaveBeenLastCalledWith('market'));
    expect(await screen.findByText('วิเคราะห์ตลาด #7')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'อัปเดตราคา' }));
    expect(refresh).toHaveBeenCalled();
    await waitFor(() => expect(vi.mocked(api.outcomeSummary).mock.calls.length).toBeGreaterThanOrEqual(3));
  });
});
