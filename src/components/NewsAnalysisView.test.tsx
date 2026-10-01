import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import type { NewsAnalysis } from '../api/types';
import { makeNews, renderWithI18n } from '../test/utils';
import { NewsCard } from './NewsCard';

const analysis: NewsAnalysis = {
  id: 1,
  newsId: 1,
  model: 'google/gemini-3.8-flash',
  summaryTh: 'เงินไหลเข้า ETF ต่อเนื่อง 9 วัน หนุน BTC ระยะสั้น',
  summaryEn: 'Nine days of ETF inflows support BTC short term.',
  impact: 'medium',
  timeHorizon: 'short',
  referenceCount: 1,
  createdAt: '2026-10-01T03:40:00.000Z',
  assets: [
    { id: 1, symbol: 'BTC', name: 'Bitcoin', assetType: 'crypto', direction: 'up', confidence: 65, rationaleTh: 'แรงซื้อสถาบัน', rationaleEn: 'Institutional demand' },
    { id: 2, symbol: 'ETH', name: 'Ethereum', assetType: 'crypto', direction: 'down', confidence: 45, rationaleTh: 'กองทุน ETH ไหลออก', rationaleEn: 'ETH fund outflows' },
  ],
};

describe('AI analysis on a news card', () => {
  it('shows stored analysis as asset chips with direction and confidence — without calling the AI', async () => {
    const analyze = vi.spyOn(api, 'analyzeNews');
    renderWithI18n(<NewsCard news={makeNews({ analysis })} canAnalyze />, 'th');

    expect(screen.getByLabelText('BTC ขึ้น มั่นใจ 65%')).toHaveAttribute('data-direction', 'up');
    expect(screen.getByLabelText('ETH ลง มั่นใจ 45%')).toHaveAttribute('data-direction', 'down');
    expect(screen.queryByRole('button', { name: /วิเคราะห์ด้วย AI/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'ดูบทวิเคราะห์' }));
    const panel = screen.getByRole('region', { name: 'บทวิเคราะห์ AI' });
    expect(within(panel).getByText(analysis.summaryTh)).toBeInTheDocument();
    expect(within(panel).getByText('ผลกระทบปานกลาง')).toBeInTheDocument();
    expect(within(panel).getByText('ระยะสั้น (วัน)')).toBeInTheDocument();
    expect(within(panel).getByText('แรงซื้อสถาบัน')).toBeInTheDocument();
    expect(within(panel).getAllByRole('meter').map((m) => m.getAttribute('aria-valuenow'))).toEqual(['65', '45']);
    expect(within(panel).getByText(/ไม่ใช่คำแนะนำการลงทุน/)).toBeInTheDocument();
    expect(analyze).not.toHaveBeenCalled();
  });

  it('renders the analysis in English for the English UI', async () => {
    renderWithI18n(<NewsCard news={makeNews({ analysis })} />, 'en');
    expect(screen.getByLabelText('BTC Up, 65% confidence')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show analysis' }));
    expect(screen.getByText(analysis.summaryEn)).toBeInTheDocument();
    expect(screen.getByText('Institutional demand')).toBeInTheDocument();
    expect(screen.getByText('Medium impact')).toBeInTheDocument();
  });

  it('analyses on click and hands the result to the parent (stored for everyone)', async () => {
    const analyze = vi.spyOn(api, 'analyzeNews').mockResolvedValue({ analysis, cached: false });
    const onUpdated = vi.fn();
    const news = makeNews({ analysis: null });
    renderWithI18n(<NewsCard news={news} canAnalyze onUpdated={onUpdated} />, 'th');

    await userEvent.click(screen.getByRole('button', { name: /วิเคราะห์ด้วย AI/ }));

    expect(analyze).toHaveBeenCalledWith(news.id, false);
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...news, analysis }));
  });

  it('hides the analyze button when the AI is unavailable', () => {
    renderWithI18n(<NewsCard news={makeNews({ analysis: null })} />, 'th');
    expect(screen.queryByRole('button', { name: /วิเคราะห์ด้วย AI/ })).not.toBeInTheDocument();
  });

  it('shows the error when analysis fails', async () => {
    vi.spyOn(api, 'analyzeNews').mockRejectedValue(new ApiError(502, 'AI analysis failed: OpenRouter 429'));
    renderWithI18n(<NewsCard news={makeNews({ analysis: null })} canAnalyze />, 'th');
    await userEvent.click(screen.getByRole('button', { name: /วิเคราะห์ด้วย AI/ }));
    expect(await screen.findByText('วิเคราะห์ไม่สำเร็จ: AI analysis failed: OpenRouter 429')).toBeInTheDocument();
  });

  it('flags analyses that predate newer sources and offers a forced re-analysis', async () => {
    const analyze = vi.spyOn(api, 'analyzeNews').mockResolvedValue({ analysis: { ...analysis, referenceCount: 3 }, cached: false });
    const news = makeNews({ analysis, referenceCount: 3 });
    renderWithI18n(<NewsCard news={news} canAnalyze onUpdated={vi.fn()} />, 'th');

    await userEvent.click(screen.getByRole('button', { name: 'ดูบทวิเคราะห์' }));
    expect(screen.getByText(/มีแหล่งข่าวเพิ่ม 2 แหล่งหลังวิเคราะห์/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'วิเคราะห์ใหม่' }));
    expect(analyze).toHaveBeenCalledWith(news.id, true);
  });

  it('says so when the story affects no specific asset', async () => {
    renderWithI18n(<NewsCard news={makeNews({ analysis: { ...analysis, assets: [] } })} />, 'th');
    await userEvent.click(screen.getByRole('button', { name: 'ดูบทวิเคราะห์' }));
    expect(screen.getByText('ข่าวนี้ไม่ได้ส่งผลต่อสินทรัพย์ใดโดยตรง')).toBeInTheDocument();
  });
});
