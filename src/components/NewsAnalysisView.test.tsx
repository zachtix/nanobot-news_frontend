import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import type { NewsAnalysis, PredictionView } from '../api/types';
import { customerUser, makeChartAnalysis, makeNews, renderWithI18n } from '../test/utils';
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
  beforeEach(() => {
    // The chart side looks up its stored calls whenever the panel opens.
    vi.spyOn(api, 'chartCompanions').mockResolvedValue([]);
  });

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
    const analyze = vi.spyOn(api, 'analyzeNews').mockResolvedValue({ analysis, cached: false, credits: 0 });
    const onUpdated = vi.fn();
    const news = makeNews({ analysis: null });
    renderWithI18n(<NewsCard news={news} canAnalyze onUpdated={onUpdated} />, 'th');

    await userEvent.click(screen.getByRole('button', { name: /วิเคราะห์ด้วย AI/ }));

    expect(analyze).toHaveBeenCalledWith(news.id, false);
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...news, analysis, analysisLocked: false }));
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
    const analyze = vi.spyOn(api, 'analyzeNews').mockResolvedValue({ analysis: { ...analysis, referenceCount: 3 }, cached: false, credits: 0 });
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
  it('shows how right the calls turned out once prices are in', async () => {
    const call = (over: Partial<PredictionView>): PredictionView => ({
      id: 1, source: 'analysis', sourceKey: 1, newsId: 1, title: null, benchmark: null, symbol: 'BTC', assetType: 'crypto',
      direction: 'up', confidence: 65, eventType: null, model: analysis.model, baseTime: '2026-10-01T03:00:00.000Z',
      status: 'done', error: null, setups: null,
      moves: { '1h': 0.8, '4h': 1.4, '24h': -2.1 },
      verdicts: { '1h': 'hit', '4h': 'hit', '24h': 'miss' },
      ...over,
    });
    const list = vi.spyOn(api, 'newsOutcomes').mockResolvedValue([
      call({}),
      call({ id: 2, symbol: 'ETH', benchmark: 'BTC', direction: 'down', status: 'pending', moves: { '1h': -0.9, '4h': null, '24h': null }, verdicts: { '1h': 'hit', '4h': null, '24h': null } }),
    ]);
    renderWithI18n(<NewsCard news={makeNews({ analysis })} />, 'th');
    expect(list).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'ดูบทวิเคราะห์' }));
    const panel = screen.getByRole('region', { name: 'บทวิเคราะห์ AI' });
    expect(await within(panel).findByText('ทายถูก 3/4')).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith(1);

    const btc = within(panel).getByLabelText('ผลจริงของ BTC');
    expect(within(btc).getByText('ผลจริง')).toBeInTheDocument();
    expect(within(btc).getByText('+0.8%')).toBeInTheDocument();
    expect(within(btc).getByText('-2.1%')).toBeInTheDocument();
    expect(within(btc).getAllByLabelText('ผิด')).toHaveLength(1);

    const eth = within(panel).getByLabelText('ผลจริงของ ETH');
    expect(within(eth).getByText('ผลจริง (เทียบ BTC)')).toBeInTheDocument();
    expect(within(eth).getAllByText('รอผล')).toHaveLength(2);
  });

  describe('the chart side', () => {
    const btcChart = makeChartAnalysis();
    const crypto = (symbol: string) => ({ symbol, assetType: 'crypto' as const });
    const withStock = {
      ...analysis,
      assets: [...analysis.assets, { id: 3, symbol: 'MSTR', name: 'Strategy', assetType: 'stock' as const, direction: 'up' as const, confidence: 55, rationaleTh: 'กำไรทางบัญชี', rationaleEn: 'Book gain' }],
    };

    it('does not read any chart by itself after the news is analysed', async () => {
      vi.spyOn(api, 'analyzeNews').mockResolvedValue({ analysis, cached: false, credits: 0 });
      const runCharts = vi.spyOn(api, 'runChartCompanions');
      const { rerender } = renderWithI18n(<NewsCard news={makeNews({ analysis: null })} canAnalyze onUpdated={(n) => rerender(<NewsCard news={n} canAnalyze />)} />, 'th');
      await userEvent.click(screen.getByRole('button', { name: /วิเคราะห์ด้วย AI/ }));
      expect(await screen.findByRole('region', { name: 'วิเคราะห์จากกราฟ' })).toBeInTheDocument();
      expect(runCharts).not.toHaveBeenCalled();
    });

    it('offers every asset of the story, stock included, and reads only the one picked — apart from the news side', async () => {
      vi.spyOn(api, 'newsOutcomes').mockResolvedValue([]);
      const list = vi.spyOn(api, 'chartCompanions').mockResolvedValue([
        { ...crypto('BTC'), analysis: null, error: null },
        { ...crypto('ETH'), analysis: null, error: null },
        { symbol: 'MSTR', assetType: 'stock', analysis: null, error: null },
      ]);
      const runCharts = vi.spyOn(api, 'runChartCompanions').mockResolvedValue({ items: [{ ...crypto('BTC'), analysis: btcChart, error: null }], credits: 0 });
      const news = makeNews({ analysis: withStock });
      renderWithI18n(<NewsCard news={news} canAnalyze />, 'th');

      await userEvent.click(screen.getByRole('button', { name: 'ดูบทวิเคราะห์' }));
      const chartSide = screen.getByRole('region', { name: 'วิเคราะห์จากกราฟ' });
      expect(await within(chartSide).findByRole('button', { name: 'วิเคราะห์กราฟ MSTR' })).toBeInTheDocument();
      expect(list).toHaveBeenCalledWith([crypto('BTC'), crypto('ETH'), { symbol: 'MSTR', assetType: 'stock' }], news.publishedAt);

      await userEvent.click(within(chartSide).getByRole('button', { name: 'วิเคราะห์กราฟ BTC' }));
      const btc = await within(chartSide).findByRole('listitem', { name: 'กราฟ BTC' });
      // Only the asset and the moment go to the chart side.
      expect(runCharts).toHaveBeenCalledTimes(1);
      expect(runCharts).toHaveBeenCalledWith([crypto('BTC')], news.publishedAt, news.id);
      expect(within(btc).getByText('ราคา ณ ตอนวิเคราะห์ 62,000 USDT')).toBeInTheDocument();
      expect(within(btc).getByText('64,000')).toBeInTheDocument(); // resistance in real prices
      expect(within(btc).getByText('-3.2%')).toBeInTheDocument();
      expect(within(btc).getByRole('link', { name: /ดูกราฟเต็ม/ })).toHaveAttribute('href', '/chart?analysis=7');
      expect(within(chartSide).getByText('ทายถูก 2/3')).toBeInTheDocument();
      // The others are still there to pick.
      expect(within(chartSide).getByRole('button', { name: 'วิเคราะห์กราฟ ETH' })).toBeInTheDocument();
      expect(within(chartSide).getByRole('button', { name: 'วิเคราะห์กราฟ MSTR' })).toBeInTheDocument();

      const newsSide = screen.getByRole('region', { name: 'วิเคราะห์จากข่าว' });
      expect(within(newsSide).queryByText('ทายถูก 2/3')).not.toBeInTheDocument();
    });

    it('says why an asset has no chart, and offers nothing to run without an AI key', async () => {
      vi.spyOn(api, 'newsOutcomes').mockResolvedValue([]);
      vi.spyOn(api, 'chartCompanions').mockResolvedValue([
        { ...crypto('BTC'), analysis: btcChart, error: null },
        { ...crypto('ETH'), analysis: null, error: 'Not enough ETH price history' },
        { symbol: 'MSTR', assetType: 'stock', analysis: null, error: null },
      ]);
      renderWithI18n(<NewsCard news={makeNews({ analysis: withStock })} />, 'th');
      await userEvent.click(screen.getByRole('button', { name: 'ดูบทวิเคราะห์' }));
      const chartSide = screen.getByRole('region', { name: 'วิเคราะห์จากกราฟ' });
      expect(await within(chartSide).findByText('ไม่มีกราฟ (Not enough ETH price history)')).toBeInTheDocument();
      expect(within(within(chartSide).getByRole('listitem', { name: 'กราฟ MSTR' })).getByText('ยังไม่ได้วิเคราะห์กราฟ')).toBeInTheDocument();
      expect(within(chartSide).queryByRole('button', { name: /วิเคราะห์กราฟ/ })).not.toBeInTheDocument();
    });

    it('notes the index on analyses made before real prices were sent', async () => {
      vi.spyOn(api, 'newsOutcomes').mockResolvedValue([]);
      vi.spyOn(api, 'chartCompanions').mockResolvedValue([{ ...crypto('BTC'), analysis: makeChartAnalysis({ indexed: true }), error: null }]);
      renderWithI18n(<NewsCard news={makeNews({ analysis })} />, 'th');
      await userEvent.click(screen.getByRole('button', { name: 'ดูบทวิเคราะห์' }));
      expect(await screen.findByText(/ตอนที่ยังส่งราคาเป็นดัชนี: ตัวเลขในข้อความ 100 = 62,000/)).toBeInTheDocument();
    });
  });

  describe('for customers', () => {
    it('asks a visitor who is not signed in to sign in, and calls nothing', () => {
      const analyze = vi.spyOn(api, 'analyzeNews');
      renderWithI18n(<NewsCard news={makeNews({ analysis: null, analysisLocked: true })} canAnalyze />, 'th', null);
      expect(screen.getByRole('link', { name: 'เข้าสู่ระบบเพื่อดูผลวิเคราะห์' })).toHaveAttribute('href', '/login');
      expect(screen.queryByRole('button', { name: /วิเคราะห์ด้วย AI/ })).not.toBeInTheDocument();
      expect(analyze).not.toHaveBeenCalled();
    });

    it('offers a new analysis for a credit and says what it cost', async () => {
      const analyze = vi.spyOn(api, 'analyzeNews').mockResolvedValue({ analysis, cached: false, credits: 1 });
      const onUpdated = vi.fn();
      const news = makeNews({ analysis: null });
      renderWithI18n(<NewsCard news={news} canAnalyze onUpdated={onUpdated} />, 'th', customerUser);

      await userEvent.click(screen.getByRole('button', { name: 'วิเคราะห์ด้วย AI · 1 เครดิต' }));
      expect(analyze).toHaveBeenCalledWith(news.id, false);
      await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...news, analysis, analysisLocked: false }));
    });

    it('offers an analysis someone else made for a credit, even with the AI off', () => {
      renderWithI18n(<NewsCard news={makeNews({ analysis: null, analysisLocked: true })} />, 'th', customerUser);
      expect(screen.getByRole('button', { name: 'ดูผลวิเคราะห์ · 1 เครดิต' })).toBeInTheDocument();
    });

    it('cannot re-analyse a story, and opens an unlocked chart on the chart page', async () => {
      vi.spyOn(api, 'newsOutcomes').mockResolvedValue([]);
      vi.spyOn(api, 'chartCompanions').mockResolvedValue([{ symbol: 'BTC', assetType: 'crypto', analysis: makeChartAnalysis(), error: null, locked: false }]);
      renderWithI18n(<NewsCard news={makeNews({ analysis, referenceCount: 3 })} canAnalyze />, 'th', customerUser);

      await userEvent.click(screen.getByRole('button', { name: 'ดูบทวิเคราะห์' }));
      expect(screen.getByText(/มีแหล่งข่าวเพิ่ม 2 แหล่งหลังวิเคราะห์/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'วิเคราะห์ใหม่' })).not.toBeInTheDocument();
      const btc = await screen.findByRole('listitem', { name: 'กราฟ BTC' });
      expect(within(btc).getByRole('link', { name: /ดูกราฟเต็ม/ })).toHaveAttribute('href', '/chart?analysis=7');
    });

    it('unlocks the chart of one asset for a credit, the others stay as they are', async () => {
      vi.spyOn(api, 'newsOutcomes').mockResolvedValue([]);
      vi.spyOn(api, 'chartCompanions').mockResolvedValue([
        { symbol: 'BTC', assetType: 'crypto', analysis: null, error: null, locked: true },
        { symbol: 'ETH', assetType: 'crypto', analysis: null, error: null, locked: false },
      ]);
      const unlock = vi
        .spyOn(api, 'runChartCompanions')
        .mockResolvedValue({ items: [{ symbol: 'BTC', assetType: 'crypto', analysis: makeChartAnalysis(), error: null, locked: false }], credits: 1 });
      const news = makeNews({ analysis });
      renderWithI18n(<NewsCard news={news} />, 'th', customerUser);

      await userEvent.click(screen.getByRole('button', { name: 'ดูบทวิเคราะห์' }));
      const chartSide = screen.getByRole('region', { name: 'วิเคราะห์จากกราฟ' });
      // BTC was read before (no AI needed); ETH would need the AI, which is off here.
      await userEvent.click(await within(chartSide).findByRole('button', { name: 'ดูกราฟ BTC · 1 เครดิต' }));
      expect(unlock).toHaveBeenCalledWith([{ symbol: 'BTC', assetType: 'crypto' }], news.publishedAt, news.id);
      expect(await within(chartSide).findByRole('listitem', { name: 'กราฟ BTC' })).toBeInTheDocument();
      expect(within(chartSide).queryByRole('button', { name: /ดูกราฟ ETH/ })).not.toBeInTheDocument();
    });
  });
});
