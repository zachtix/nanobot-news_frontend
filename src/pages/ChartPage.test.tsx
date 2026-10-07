import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import type { Candle, ChartAccuracySummary, ChartAnalysis } from '../api/types';
import { chooseOption, mockShellApi, renderPage } from '../test/utils';
import { ChartPage } from './ChartPage';

// jsdom has no canvas: record what the page asks TradingView's chart to draw instead.
const lw = vi.hoisted(() => ({ priceLines: [] as { price: number }[], data: [] as unknown[], markers: [] as { text: string }[], removed: 0 }));
vi.mock('lightweight-charts', () => ({
  CandlestickSeries: {},
  ColorType: { Solid: 'solid' },
  CrosshairMode: { Normal: 0 },
  LineStyle: { Dashed: 2 },
  createChart: () => ({
    addSeries: () => ({
      setData: (d: unknown[]) => lw.data.push(d),
      createPriceLine: (o: { price: number }) => lw.priceLines.push(o),
      attachPrimitive: () => undefined,
    }),
    timeScale: () => ({ fitContent: () => undefined }),
    remove: () => (lw.removed += 1),
  }),
  createSeriesMarkers: (_s: unknown, markers: { text: string }[]) => lw.markers.push(...markers),
}));

const H = 3_600_000;
const AT = '2026-10-01T09:00:00.000Z';

const analysis = (overrides: Partial<ChartAnalysis> = {}): ChartAnalysis => ({
  id: 7,
  symbol: 'SOL',
  assetType: 'crypto',
  pair: 'SOLUSDT',
  at: AT,
  backtest: true,
  batchId: null,
  model: 'google/gemini-3.8-flash',
  trend: 'up',
  summaryTh: 'แนวโน้มขาขึ้น ยืนเหนือ EMA50',
  summaryEn: 'Uptrend above the EMA50.',
  signals: [{ th: 'RSI 4h ยังไม่ overbought', en: '4h RSI not overbought', bias: 'up' }],
  supports: [146.2],
  resistances: [155.8],
  calls: { '4h': { direction: 'neutral', confidence: 40 }, '24h': { direction: 'up', confidence: 55 }, '3d': { direction: 'down', confidence: 45 } },
  thresholds: { '4h': 0.6, '24h': 1.5, '3d': 2.8 },
  lastClose: 150,
  input: 'COIN: SOL (spot, priced in USDT). All prices are INDEXED: the last close = 100.00.',
  cost: 0.0031,
  promptTokens: 1200,
  completionTokens: 600,
  status: 'done',
  basePrice: 150,
  price4h: 150.3,
  price24h: 153,
  price3d: 154,
  error: null,
  createdAt: '2026-10-07T03:00:00.000Z',
  moves: { '4h': 0.2, '24h': 2, '3d': 2.67 },
  actual: { '4h': 'neutral', '24h': 'up', '3d': 'neutral' },
  verdicts: { '4h': 'hit', '24h': 'hit', '3d': 'miss' },
  indexed: false,
  ...overrides,
});

const summary = (): ChartAccuracySummary => ({
  filter: {},
  counts: { pending: 2, done: 40, unsupported: 0, error: 0 },
  mainHorizon: '24h',
  horizons: {
    '4h': { n: 40, hits: 22, hitRate: 55, directional: { n: 10, hits: 4, hitRate: 40 }, baselines: { up: 20, down: 18, neutral: 62 } },
    '24h': { n: 40, hits: 20, hitRate: 50, directional: { n: 20, hits: 9, hitRate: 45 }, baselines: { up: 35, down: 25, neutral: 40 } },
    '3d': { n: 40, hits: 14, hitRate: 35, directional: { n: 30, hits: 10, hitRate: 33.3 }, baselines: { up: 45, down: 30, neutral: 25 } },
  },
  byDirection: [{ key: 'up', n: 20, hits: 9, hitRate: 45 }],
  byConfidence: [],
  bySymbol: [{ key: 'SOL', n: 40, hits: 20, hitRate: 50 }],
  byTrend: [],
});

const candles = (): Candle[] =>
  Array.from({ length: 120 }, (_, i) => {
    const openTime = Date.parse(AT) - 80 * 4 * H + i * 4 * H;
    const close = 150 + 5 * Math.sin(i / 6);
    return { openTime, open: close - 1, high: close + 1, low: close - 2, close, volume: 10, closeTime: openTime + 4 * H - 1 };
  });

describe('ChartPage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    mockShellApi();
    vi.spyOn(api, 'chartSummary').mockResolvedValue(summary());
    vi.spyOn(api, 'chartAnalyses').mockResolvedValue({ items: [analysis()], total: 1, page: 1, limit: 20, totalCost: 0.959804 });
    vi.spyOn(api, 'chartCandles').mockResolvedValue(candles());
    vi.spyOn(api, 'backtestStatus').mockResolvedValue(null);
    vi.spyOn(api, 'planBacktest').mockResolvedValue({
      symbols: ['BTC', 'ETH', 'SOL'],
      moments: 13,
      total: 39,
      maxTotal: 300,
      from: '2026-09-27T17:00:00.000Z',
      to: '2026-10-03T16:00:00.000Z',
      estimatedCost: 0.12,
    });
  });

  it('analyses a past moment: sends the chosen time, shows each horizon with its outcome and what the AI was given', async () => {
    // Only the clock is pinned (timers stay real for the UI): "today" is 7 Oct 2026.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-07T12:30') });
    const analyze = vi.spyOn(api, 'analyzeChart').mockResolvedValue({ analysis: analysis(), cached: false });
    const user = userEvent.setup();
    renderPage(<ChartPage />, { path: '/chart' });

    const symbol = await screen.findByLabelText('เหรียญ (คู่กับ USDT บน Binance)');
    await user.clear(symbol);
    await user.type(symbol, 'sol');
    await user.click(screen.getByRole('radio', { name: 'เลือกเวลาย้อนหลัง' }));
    // shadcn calendar + hour grid; days after today are disabled.
    await user.click(screen.getByRole('button', { name: 'เวลาที่จะวิเคราะห์' }));
    const picker = await screen.findByRole('dialog');
    expect(within(picker).getByText('ตุลาคม 2569')).toBeInTheDocument();
    expect(within(picker).getByRole('button', { name: /ที่ 8 ตุลาคม/ })).toBeDisabled();
    await user.click(within(picker).getByRole('button', { name: /ที่ 1 ตุลาคม/ }));
    await user.click(within(picker).getByRole('button', { name: '16:00' }));
    await user.click(within(picker).getByRole('button', { name: 'เสร็จ' }));
    await user.click(screen.getByRole('button', { name: 'วิเคราะห์กราฟ' }));

    await waitFor(() => expect(analyze).toHaveBeenCalled());
    expect(analyze.mock.calls[0][0]).toEqual({ symbol: 'sol', at: new Date('2026-10-01T16:00').toISOString() });

    const result = await screen.findByRole('region', { name: 'ผลวิเคราะห์กราฟ SOL' });
    expect(within(result).getByText('ทดสอบย้อนหลัง')).toBeInTheDocument();
    expect(within(result).getByText('ขึ้น 55%')).toBeInTheDocument();
    expect(within(result).getByText('จริง +2.00% (ขึ้น)')).toBeInTheDocument();
    expect(within(result).getAllByLabelText('ถูก')).toHaveLength(2);
    expect(within(result).getByLabelText('ผิด')).toBeInTheDocument();
    expect(within(result).getByText('แนวต้าน', { selector: 'dt' }).nextElementSibling).toHaveTextContent('155.80');
    expect(within(result).getByText('แนวรับ', { selector: 'dt' }).nextElementSibling).toHaveTextContent('146.20');
    // A key under the chart names every mark it draws.
    const legend = within(result).getByRole('list', { name: 'สัญลักษณ์บนกราฟ' });
    for (const label of ['แนวรับ', 'แนวต้าน', 'AI เห็นถึงตรงนี้', 'หลังวิเคราะห์ 3 วัน (AI ไม่เห็น)', 'ครบกำหนด · ทายถูก ✓', 'ครบกำหนด · ทายผิด ✗']) {
      expect(within(legend).getByText(label)).toBeInTheDocument();
    }
    await user.click(within(result).getByRole('button', { name: 'ข้อมูลที่ส่งให้ AI' }));
    expect(within(result).getByText(/last close = 100\.00/)).toBeInTheDocument();
    expect(api.chartCandles).toHaveBeenCalledWith('SOL', '4h', expect.any(String), 'crypto');

    // Drawn with TradingView's chart: both levels as price lines, a marker where each horizon ends.
    await waitFor(() => expect(lw.priceLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ price: 146.2 }),
      expect.objectContaining({ price: 155.8 }),
    ])));
    expect(lw.markers.map((m) => m.text)).toEqual(expect.arrayContaining(['4ชม ✓', '24ชม ✓', '3วัน ✗']));
    await user.click(within(result).getByRole('radio', { name: '1 วัน' }));
    await waitFor(() => expect(api.chartCandles).toHaveBeenLastCalledWith('SOL', '1d', expect.any(String), 'crypto'));
  }, 20_000); // many clicks through the calendar: slow when the whole suite runs in parallel

  it('a cached result says so and offers a paid re-run', async () => {
    const analyze = vi.spyOn(api, 'analyzeChart').mockResolvedValue({ analysis: analysis({ backtest: false }), cached: true });
    const user = userEvent.setup();
    renderPage(<ChartPage />, { path: '/chart' });
    await user.click(await screen.findByRole('button', { name: 'วิเคราะห์กราฟ' }));
    expect(await screen.findByText('ผลเดิม (ข้อมูลเหมือนเดิม ไม่เสียเงิน)')).toBeInTheDocument();
    expect(analyze.mock.calls[0][0]).toEqual({ symbol: 'BTC' });
    await user.click(screen.getByRole('button', { name: 'วิเคราะห์ใหม่ (เสียค่า AI)' }));
    expect(analyze.mock.calls[1][0]).toEqual({ symbol: 'BTC', force: true });
  });

  it('shows accuracy next to always giving the same answer', async () => {
    renderPage(<ChartPage />, { path: '/chart' });
    const card = await screen.findByRole('region', { name: 'ความแม่นของการวิเคราะห์กราฟ' });
    const rows = await within(card).findAllByRole('row');
    // 4h: 55% loses to always "neutral" 62%; 24h: 50% beats the best (40%).
    expect(within(rows[1]).getByText('55%')).toBeInTheDocument();
    expect(within(rows[1]).getByText('ยังไม่ชนะ')).toBeInTheDocument();
    expect(within(rows[2]).getByText('ชนะ')).toBeInTheDocument();
  });

  it('the history shows the AI cost of each analysis and the total', async () => {
    renderPage(<ChartPage />, { path: '/chart' });
    const card = await screen.findByRole('region', { name: 'ประวัติการวิเคราะห์กราฟ' });
    expect(await within(card).findByText(/ทั้งหมด 1 ครั้ง · ค่า AI รวม \$0\.96 /)).toBeInTheDocument();
    expect(within(card).getByRole('columnheader', { name: 'ค่า AI' })).toBeInTheDocument();
    expect(within(card).getByTitle('input 1,200 · output 600 token')).toHaveTextContent('$0.0031');
  });

  it('the history page size can be changed (and starts again from page 1)', async () => {
    const list = vi.spyOn(api, 'chartAnalyses').mockResolvedValue({ items: [analysis()], total: 63, page: 1, limit: 20, totalCost: 0.96 });
    const user = userEvent.setup();
    renderPage(<ChartPage />, { path: '/chart' });
    const card = await screen.findByRole('region', { name: 'ประวัติการวิเคราะห์กราฟ' });
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 20 }));
    await user.click(within(card).getByRole('button', { name: 'หน้าถัดไป' }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 2, limit: 20 }));
    await chooseOption(user, within(card).getByRole('combobox', { name: 'ต่อหน้า' }), '50');
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 50 }));
  });

  it('plans a backtest with its size and cost, then starts it', async () => {
    const start = vi.spyOn(api, 'startBacktest').mockResolvedValue({
      id: 1,
      status: 'running',
      symbols: ['BTC', 'ETH', 'SOL'],
      from: '2026-09-27T17:00:00.000Z',
      to: '2026-10-03T16:00:00.000Z',
      stepHours: 12,
      total: 39,
      done: 0,
      reused: 0,
      failed: 0,
      cost: 0,
      errors: [],
      startedAt: '2026-10-07T03:00:00.000Z',
      finishedAt: null,
    });
    const user = userEvent.setup();
    renderPage(<ChartPage />, { path: '/chart' });
    const card = await screen.findByRole('region', { name: 'ทดสอบย้อนหลัง' });
    expect(await within(card).findByText(/13 ช่วงเวลา × 3 เหรียญ = วิเคราะห์ 39 ครั้ง/)).toBeInTheDocument();
    expect(within(card).getByText(/ค่า AI ประมาณ \$0\.12/)).toBeInTheDocument();
    expect(api.planBacktest).toHaveBeenCalledWith(expect.objectContaining({ symbols: ['BTC', 'ETH', 'SOL'], stepHours: 12 }));
    await user.click(within(card).getByRole('button', { name: 'เริ่มทดสอบ' }));
    expect(start).toHaveBeenCalled();
    expect(await within(card).findByRole('progressbar', { name: 'ความคืบหน้าการทดสอบย้อนหลัง' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'หยุด' })).toBeInTheDocument();
  });
});
