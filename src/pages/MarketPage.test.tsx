import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { api } from '../api/client';
import type { MarketPreview, MarketRun, MarketRunDetail } from '../api/types';
import { makeSource, mockShellApi, renderPage } from '../test/utils';
import { MarketPage } from './MarketPage';

const preview = (overrides: Partial<MarketPreview> = {}): MarketPreview => ({
  window: '1d',
  storyCount: 81,
  analyzedCount: 8,
  missingCount: 73,
  truncatedCount: 0,
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
    // a source with fetching turned off can still be picked (its stored stories), marked as off
    expect(within(within(setup).getByRole('button', { name: 'Disabled' })).getByText('ปิดอยู่')).toBeInTheDocument();
    expect(within(setup).queryByText(/ปิดการดึงข่าวอยู่ทั้งหมด/)).not.toBeInTheDocument();

    await user.click(within(setup).getByRole('radio', { name: '7 วัน' }));
    await waitFor(() => expect(previewSpy).toHaveBeenLastCalledWith('7d', []));
    await user.click(within(setup).getByRole('button', { name: 'Decrypt' }));
    await waitFor(() => expect(previewSpy).toHaveBeenLastCalledWith('7d', [2]));
    await user.click(within(setup).getByRole('checkbox', { name: 'วิเคราะห์รายข่าวที่ยังไม่มีบทวิเคราะห์ก่อน' }));
    expect(within(setup).getByText('ค่าใช้จ่ายโดยประมาณ $0.208')).toBeInTheDocument();

    const start = vi.spyOn(api, 'startMarket').mockResolvedValue(runRow({ id: 5, status: 'running', stage: 'refresh', refresh: true, analyzeMissing: true }));
    runSpy
      .mockResolvedValueOnce(detail({ id: 5, status: 'running', stage: 'stories', result: null, refresh: true, analyzeMissing: true }))
      .mockResolvedValue(detail({ id: 5, newlyAnalyzed: 73, costStories: 0.19, cost: 0.21 }));
    await user.click(within(setup).getByRole('button', { name: 'วิเคราะห์ภาพรวม' }));

    expect(start).toHaveBeenCalledWith({ window: '7d', sourceIds: [2], refresh: true, analyzeMissing: true });
    const running = await screen.findByRole('region', { name: 'ผลวิเคราะห์ #5' });
    const steps = within(running).getByRole('list', { name: 'กำลังวิเคราะห์…' });
    expect(within(steps).getByText('วิเคราะห์รายข่าว').closest('li')).toHaveAttribute('aria-current', 'step');

    expect(await screen.findByText('Bitcoin ติดแนวต้าน $85,000', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText(/วิเคราะห์รายข่าวเพิ่ม 73 ข่าว/)).toBeInTheDocument();
    // The run's own setup is remembered for next time.
    expect(JSON.parse(localStorage.getItem('market:setup')!)).toMatchObject({ window: '7d', sourceIds: [2], analyzeMissing: true });
  });

  it('says when every chosen source has fetching turned off', async () => {
    const user = userEvent.setup();
    renderPage(<MarketPage />, { path: '/market' });
    const setup = await screen.findByRole('region', { name: 'ตั้งค่าการวิเคราะห์' });

    await user.click(await within(setup).findByRole('button', { name: 'Disabled' }));
    await waitFor(() => expect(previewSpy).toHaveBeenLastCalledWith('1d', [3]));
    expect(within(setup).getByText(/แหล่งที่เลือกปิดการดึงข่าวอยู่ทั้งหมด/)).toBeInTheDocument();
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
});
