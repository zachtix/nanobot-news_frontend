import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { api } from '../api/client';
import type { MarketPreview, MarketRun, MarketRunDetail } from '../api/types';
import { customerUser, makeChartAnalysis, makeSource, mockShellApi, renderPage } from '../test/utils';
import { MarketPage } from './MarketPage';

const preview = (overrides: Partial<MarketPreview> = {}): MarketPreview => ({
  window: '1d',
  storyCount: 81,
  analyzedCount: 8,
  missingCount: 73,
  truncatedCount: 0,
  contentMissingCount: 12,
  staleSources: ['CoinDesk'],
  estimate: { market: 0.018, stories: 0.19 },
  cached: null,
  ...overrides,
});

const runRow = (overrides: Partial<MarketRun> = {}): MarketRun => ({
  id: 2,
  createdAt: '2026-10-01T07:44:13.000Z',
  finishedAt: '2026-10-01T07:44:45.000Z',
  status: 'success',
  stage: null,
  window: '1d',
  sourceIds: [],
  sourceNames: ['CoinDesk', 'Decrypt'],
  refresh: false,
  analyzeMissing: false,
  fetchRunId: null,
  storyCount: 81,
  analyzedCount: 8,
  newlyAnalyzed: 0,
  truncatedCount: 0,
  model: 'google/gemini-3.8-flash',
  reusedFromId: null,
  error: null,
  promptTokens: 8679,
  completionTokens: 3725,
  costMarket: 0.020478,
  costStories: 0,
  costFetch: 0,
  cost: 0.020478,
  headlineTh: 'Bitcoin ติดแนวต้าน $85,000',
  headlineEn: 'Bitcoin stalls below $85K',
  sentiment: 'mixed',
  assetCount: 2,
  ...overrides,
});

const detail = (overrides: Partial<MarketRunDetail> = {}): MarketRunDetail => ({
  ...runRow(),
  storyIds: [63, 40, 116],
  result: {
    headlineTh: 'Bitcoin ติดแนวต้าน $85,000',
    headlineEn: 'Bitcoin stalls below $85K',
    summaryTh: 'ตลาดเคลื่อนไหวแบบผสม',
    summaryEn: 'A mixed market.',
    sentiment: 'mixed',
    themes: [{ titleTh: 'แรงหนุน ETF', titleEn: 'ETF inflows', storyIds: [63] }],
    assets: [
      { symbol: 'BTC', name: 'Bitcoin', assetType: 'crypto', direction: 'neutral', confidence: 60, rationaleTh: 'ETF หนุนแต่บอนด์ยีลด์กด', rationaleEn: 'ETF vs yields', storyIds: [63] },
      { symbol: 'ETH', name: 'Ethereum', assetType: 'crypto', direction: 'down', confidence: 55, rationaleTh: 'เงินไหลออก', rationaleEn: 'Outflows', storyIds: [40, 999] },
    ],
  },
  stories: [
    { id: 63, title: 'Bitcoin ETFs extend inflow streak', titleEn: 'Bitcoin ETFs extend inflow streak', titleTh: 'ETF บิตคอยน์เงินไหลเข้าต่อเนื่อง', publishedAt: '2026-10-01T03:00:00Z', referenceCount: 2, url: 'https://coindesk.com/etf', sources: ['CoinDesk', 'Decrypt'] },
    { id: 40, title: 'Ether ETFs see outflows', titleEn: 'Ether ETFs see outflows', titleTh: null, publishedAt: '2026-10-01T02:00:00Z', referenceCount: 1, url: 'https://decrypt.co/eth', sources: ['Decrypt'] },
  ],
  ...overrides,
});

describe('MarketPage', () => {
  let previewSpy: MockInstance<typeof api.marketPreview>;
  let runsSpy: MockInstance<typeof api.marketRuns>;
  let runSpy: MockInstance<typeof api.marketRun>;
  let chartsSpy: MockInstance<typeof api.chartCompanions>;
  let runChartsSpy: MockInstance<typeof api.runChartCompanions>;

  beforeEach(() => {
    mockShellApi();
    vi.spyOn(api, 'listSources').mockResolvedValue([
      makeSource({ id: 1, name: 'CoinDesk' }),
      makeSource({ id: 2, name: 'Decrypt', url: 'https://decrypt.co/feed' }),
      makeSource({ id: 3, name: 'Disabled', url: 'https://x.test/feed', enabled: false }),
    ]);
    previewSpy = vi.spyOn(api, 'marketPreview').mockResolvedValue(preview());
    runsSpy = vi.spyOn(api, 'marketRuns').mockResolvedValue({ items: [runRow()], total: 1, page: 1, limit: 10 });
    runSpy = vi.spyOn(api, 'marketRun').mockResolvedValue(detail());
    vi.spyOn(api, 'marketOutcomes').mockResolvedValue([]);
    chartsSpy = vi.spyOn(api, 'chartCompanions').mockResolvedValue([
      { symbol: 'BTC', assetType: 'crypto', analysis: null, error: null },
      { symbol: 'ETH', assetType: 'crypto', analysis: null, error: null },
    ]);
    runChartsSpy = vi.spyOn(api, 'runChartCompanions').mockResolvedValue({
      items: [{ symbol: 'ETH', assetType: 'crypto', analysis: makeChartAnalysis({ id: 8, symbol: 'ETH', pair: 'ETHUSDT', verdicts: { '4h': 'miss', '24h': null, '3d': null } }), error: null }],
      credits: 0,
    });
  });

  it('shows the latest brief: tone, summary, assets with confidence and the stories behind them', async () => {
    renderPage(<MarketPage />, { path: '/market' });

    const result = await screen.findByRole('region', { name: 'ผลวิเคราะห์ #2' });
    expect(within(result).getByText('Bitcoin ติดแนวต้าน $85,000')).toBeInTheDocument();
    expect(within(result).getByText('ภาพรวม: ผสม')).toBeInTheDocument();
    expect(within(result).getByText('ตลาดเคลื่อนไหวแบบผสม')).toBeInTheDocument();

    const eth = within(result).getByRole('listitem', { name: 'ETH' });
    expect(within(eth).getByRole('meter')).toHaveAttribute('aria-valuenow', '55');
    expect(within(eth).getByText('ลง')).toBeInTheDocument();
    // Evidence links; unknown ids are ignored; Thai title falls back to the original.
    const evidence = within(eth).getByRole('list', { name: 'จากข่าว' });
    expect(within(evidence).getAllByRole('listitem')).toHaveLength(1);
    expect(within(evidence).getByRole('link', { name: /Ether ETFs see outflows/ })).toHaveAttribute('href', 'https://decrypt.co/eth');
    expect(within(result).getAllByRole('link', { name: /ETF บิตคอยน์เงินไหลเข้าต่อเนื่อง/ })[0]).toHaveAttribute('href', 'https://coindesk.com/etf');

    const themes = within(result).getByRole('region', { name: 'ประเด็นสำคัญ' });
    expect(within(themes).getByText('แรงหนุน ETF')).toBeInTheDocument();
    expect(within(result).getByText(/ค่าใช้จ่าย \$0\.020478/)).toBeInTheDocument();

    // The chart side is looked up, never analysed just by opening it: each asset is picked on its own.
    const chart = within(result).getByRole('region', { name: 'วิเคราะห์จากกราฟ' });
    expect(await within(chart).findByRole('button', { name: 'วิเคราะห์กราฟ BTC' })).toBeInTheDocument();
    const btcEth = [{ symbol: 'BTC', assetType: 'crypto' }, { symbol: 'ETH', assetType: 'crypto' }];
    expect(chartsSpy).toHaveBeenCalledWith(btcEth, '2026-10-01T07:44:45.000Z');
    expect(runChartsSpy).not.toHaveBeenCalled();

    await userEvent.click(within(chart).getByRole('button', { name: 'วิเคราะห์กราฟ ETH' }));
    expect(await within(chart).findByRole('listitem', { name: 'กราฟ ETH' })).toBeInTheDocument();
    // No story behind a market brief: no newsId.
    expect(runChartsSpy).toHaveBeenCalledWith([{ symbol: 'ETH', assetType: 'crypto' }], '2026-10-01T07:44:45.000Z', undefined);
    expect(within(chart).getByRole('button', { name: 'วิเคราะห์กราฟ BTC' })).toBeInTheDocument();
  });

  it('shows how the brief’s calls turned out, apart from the chart’s', async () => {
    const outcomes = vi.spyOn(api, 'marketOutcomes').mockResolvedValue([
      {
        id: 1, source: 'market', sourceKey: 2, newsId: null, title: null, benchmark: 'BTC', symbol: 'ETH', assetType: 'crypto',
        direction: 'down', confidence: 55, eventType: null, model: 'm', baseTime: '2026-10-01T07:44:45.000Z', status: 'done', error: null,
        setups: null, moves: { '1h': -0.9, '4h': -1.2, '24h': 0.4 }, verdicts: { '1h': 'hit', '4h': 'hit', '24h': 'miss' },
      },
    ]);
    chartsSpy.mockResolvedValue([
      { symbol: 'BTC', assetType: 'crypto', analysis: makeChartAnalysis(), error: null },
      { symbol: 'ETH', assetType: 'crypto', analysis: null, error: null },
    ]);
    renderPage(<MarketPage />, { path: '/market' });

    const result = await screen.findByRole('region', { name: 'ผลวิเคราะห์ #2' });
    const assets = within(result).getByRole('region', { name: 'สินทรัพย์ที่ได้รับผลกระทบ' });
    expect(await within(assets).findByText('ทายถูก 2/3')).toBeInTheDocument();
    expect(within(assets).getByLabelText('ผลจริงของ ETH')).toBeInTheDocument();
    expect(outcomes).toHaveBeenCalledWith(2);

    const chart = within(result).getByRole('region', { name: 'วิเคราะห์จากกราฟ' });
    const btc = await within(chart).findByRole('listitem', { name: 'กราฟ BTC' });
    expect(within(btc).getByRole('link', { name: /ดูกราฟเต็ม/ })).toHaveAttribute('href', '/chart?analysis=7');
    expect(within(chart).getByText('ทายถูก 2/3')).toBeInTheDocument();
  });

  it('shows the first 3 supporting stories and the rest on demand', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: 100 + i,
      title: `Story ${i + 1}`,
      titleEn: `Story ${i + 1}`,
      titleTh: null,
      publishedAt: '2026-10-01T03:00:00Z',
      referenceCount: 1,
      url: `https://x.test/${i}`,
      sources: ['CoinDesk'],
    }));
    const base = detail();
    runSpy.mockResolvedValue({
      ...base,
      stories: many,
      result: { ...base.result!, themes: [], assets: [{ ...base.result!.assets[0], storyIds: many.map((s) => s.id) }] },
    });
    renderPage(<MarketPage />, { path: '/market' });

    const btc = await screen.findByRole('listitem', { name: 'BTC' });
    const evidence = within(btc).getByRole('list', { name: 'จากข่าว' });
    expect(within(evidence).getAllByRole('link')).toHaveLength(3);
    await user.click(within(btc).getByRole('button', { name: 'ดูอีก 2 ข่าว' }));
    expect(within(evidence).getAllByRole('link')).toHaveLength(5);
    await user.click(within(btc).getByRole('button', { name: 'ย่อ' }));
    expect(within(evidence).getAllByRole('link')).toHaveLength(3);
  });

  it('previews the run, then starts it with the chosen period, sources and options and follows its progress', async () => {
    const user = userEvent.setup();
    runsSpy.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 });
    renderPage(<MarketPage />, { path: '/market' });

    const setup = await screen.findByRole('region', { name: 'ตั้งค่าการวิเคราะห์' });
    expect(await within(setup).findByText('81 ข่าว · มีบทวิเคราะห์รายข่าวแล้ว 8 · ยังไม่มี 73')).toBeInTheDocument();
    expect(within(setup).getByText(/จะดึงใหม่: CoinDesk/)).toBeInTheDocument();
    expect(within(setup).getByText(/73 ข่าว · ประมาณ \$0\.19/)).toBeInTheDocument();
    expect(within(setup).getByText('ค่าใช้จ่ายโดยประมาณ $0.018')).toBeInTheDocument();
    expect(within(setup).getByText(/ยังไม่มีเนื้อหาเต็ม 12 ข่าว/)).toBeInTheDocument();
    // a source with automatic fetch turned off is offered like any other
    expect(within(setup).getByRole('button', { name: 'Disabled' })).toBeInTheDocument();

    expect(within(setup).getByText('24 ชั่วโมงล่าสุด')).toBeInTheDocument();
    expect(within(setup).queryByRole('radio', { name: '7 วัน' })).not.toBeInTheDocument();
    await waitFor(() => expect(previewSpy).toHaveBeenLastCalledWith('1d', []));
    await user.click(within(setup).getByRole('button', { name: 'Decrypt' }));
    await waitFor(() => expect(previewSpy).toHaveBeenLastCalledWith('1d', [2]));
    await user.click(within(setup).getByRole('checkbox', { name: 'วิเคราะห์รายข่าวที่ยังไม่มีบทวิเคราะห์ก่อน' }));
    expect(within(setup).getByText('ค่าใช้จ่ายโดยประมาณ $0.208')).toBeInTheDocument();

    const start = vi.spyOn(api, 'startMarket').mockResolvedValue({ ...runRow({ id: 5, status: 'running', stage: 'refresh', refresh: true, analyzeMissing: true }), credits: 0 });
    runSpy
      .mockResolvedValueOnce(detail({ id: 5, status: 'running', stage: 'stories', result: null, refresh: true, analyzeMissing: true }))
      .mockResolvedValue(detail({ id: 5, newlyAnalyzed: 73, costStories: 0.19, cost: 0.21 }));
    await user.click(within(setup).getByRole('button', { name: 'วิเคราะห์ภาพรวม' }));

    expect(start).toHaveBeenCalledWith({ window: '1d', sourceIds: [2], refresh: true, analyzeMissing: true });
    const running = await screen.findByRole('region', { name: 'ผลวิเคราะห์ #5' });
    const steps = within(running).getByRole('list', { name: 'กำลังวิเคราะห์…' });
    expect(within(steps).getByText('วิเคราะห์รายข่าว').closest('li')).toHaveAttribute('aria-current', 'step');
    // full article text was fetched before the per-story step
    expect(within(steps).getByText('ดึงเนื้อหาข่าวเต็ม').closest('li')).not.toHaveAttribute('aria-current');

    expect(await screen.findByText('Bitcoin ติดแนวต้าน $85,000', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText(/วิเคราะห์รายข่าวเพิ่ม 73 ข่าว/)).toBeInTheDocument();
    // Even a brief that finished in front of the user reads no chart until an asset is picked.
    expect(await screen.findByRole('button', { name: 'วิเคราะห์กราฟ ETH' })).toBeInTheDocument();
    expect(runChartsSpy).not.toHaveBeenCalled();
    // The run's own setup is remembered for next time.
    expect(JSON.parse(localStorage.getItem('market:setup')!)).toMatchObject({ window: '1d', sourceIds: [2], analyzeMissing: true });
  });

  it('tells when the same data was analysed before and when a result was reused', async () => {
    previewSpy.mockResolvedValue(preview({ cached: { id: 2, createdAt: '2026-10-01T07:44:13.000Z' } }));
    runsSpy.mockResolvedValue({ items: [runRow({ id: 3, reusedFromId: 2, cost: 0, costMarket: 0 }), runRow()], total: 2, page: 1, limit: 10 });
    runSpy.mockResolvedValue(detail({ id: 3, reusedFromId: 2, cost: 0, costMarket: 0 }));
    renderPage(<MarketPage />, { path: '/market' });

    expect(await screen.findByText(/ข้อมูลชุดนี้วิเคราะห์ไว้แล้ว \(#2\)/)).toBeInTheDocument();
    const result = await screen.findByRole('region', { name: 'ผลวิเคราะห์ #3' });
    expect(within(result).getByText(/ใช้ผลเดิมจาก #2/)).toBeInTheDocument();

    const history = screen.getByRole('region', { name: 'ประวัติการวิเคราะห์' });
    const rows = within(history).getAllByRole('row');
    expect(within(rows[1]).getByText('ใช้ผลเดิม')).toBeInTheDocument();
    expect(within(rows[2]).getByText('สำเร็จ')).toBeInTheDocument();
  });

  it('opens an older run from the history by clicking its row', async () => {
    const user = userEvent.setup();
    runsSpy.mockResolvedValue({
      items: [runRow({ id: 9, status: 'failed', error: 'No stories in this period for the selected sources', headlineEn: null, headlineTh: null }), runRow()],
      total: 2,
      page: 1,
      limit: 10,
    });
    runSpy.mockImplementation(async (id) =>
      id === 9 ? detail({ id: 9, status: 'failed', result: null, error: 'No stories in this period for the selected sources' }) : detail(),
    );
    renderPage(<MarketPage />, { path: '/market' });

    expect(await screen.findByRole('alert')).toHaveTextContent('วิเคราะห์ไม่สำเร็จ: No stories in this period');
    const history = screen.getByRole('region', { name: 'ประวัติการวิเคราะห์' });
    await user.click(within(history).getByText('Bitcoin ติดแนวต้าน $85,000'));
    expect(await screen.findByRole('region', { name: 'ผลวิเคราะห์ #2' })).toBeInTheDocument();
    expect(runSpy).toHaveBeenLastCalledWith(2);
  });

  it('cannot run without an API key', async () => {
    vi.spyOn(api, 'health').mockResolvedValue({ status: 'ok', ai: { enabled: false, model: 'google/gemini-3.8-flash' } });
    renderPage(<MarketPage />, { path: '/market' });
    const setup = await screen.findByRole('region', { name: 'ตั้งค่าการวิเคราะห์' });
    expect(await within(setup).findByText(/ต้องตั้ง OpenRouter API key/)).toBeInTheDocument();
    expect(within(setup).getByRole('button', { name: 'วิเคราะห์ภาพรวม' })).toBeDisabled();
  });

  it('gives a customer no options and no AI cost: fresh news every time, priced in credits', async () => {
    const start = vi.spyOn(api, 'startMarket').mockResolvedValue({ ...runRow({ id: 5, status: 'running', stage: 'refresh' }), credits: 10 });
    renderPage(<MarketPage />, { path: '/market', user: customerUser });

    const setup = await screen.findByRole('region', { name: 'ตั้งค่าการวิเคราะห์' });
    // Once the preview is in: what happens on each run instead of options and a USD estimate.
    expect(await within(setup).findByText(/ดึงข่าวล่าสุดจากแหล่งที่เลือกก่อนวิเคราะห์ทุกครั้ง/)).toBeInTheDocument();
    expect(within(setup).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(setup).queryByText(/ค่าใช้จ่ายโดยประมาณ/)).not.toBeInTheDocument();

    await userEvent.click(await within(setup).findByRole('button', { name: 'วิเคราะห์ภาพรวม · 10 เครดิต' }));
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ refresh: true, analyzeMissing: false }));
    expect(screen.queryByRole('columnheader', { name: 'ค่าใช้จ่าย' })).not.toBeInTheDocument();
  });

  it('shows a customer why their brief is not shown when the GAS charge was refused', async () => {
    runSpy.mockResolvedValue(detail({ result: null, headlineTh: null, headlineEn: null, charge: { status: 'failed', credits: 10, error: 'E2001' } }));
    renderPage(<MarketPage />, { path: '/market?run=2', user: customerUser });
    expect(await screen.findByText(/ตัดเครดิตไม่สำเร็จ จึงยังแสดงผลไม่ได้: GAS ที่ใช้ได้ไม่เพียงพอ/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'ผลวิเคราะห์ #2' })).not.toBeInTheDocument();
  });
});
