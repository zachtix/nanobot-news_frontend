import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { api } from '../api/client';
import type { AiAccount, AiUsageCall, AiUsageSummary, UsageTotals } from '../api/types';
import { mockShellApi, renderPage } from '../test/utils';
import { AiUsagePage } from './AiUsagePage';

const totals = (overrides: Partial<UsageTotals> = {}): UsageTotals => ({
  calls: 0,
  failed: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cachedTokens: 0,
  reasoningTokens: 0,
  cost: 0,
  ...overrides,
});

const summary: AiUsageSummary = {
  model: 'google/gemini-3.8-flash',
  aiEnabled: true,
  timezone: 'Asia/Bangkok',
  today: totals({ calls: 12, promptTokens: 9800, completionTokens: 360, cost: 0.0042 }),
  last7d: totals({ calls: 80, failed: 2, promptTokens: 65000, completionTokens: 2400, cost: 0.0281 }),
  last30d: totals({ calls: 300, promptTokens: 240000, completionTokens: 9000, cost: 0.1034 }),
  allTime: totals({ calls: 420, promptTokens: 336000, completionTokens: 12600, cost: 0.1448 }),
  byModel: [{ model: 'google/gemini-3.8-flash', ...totals({ calls: 420, promptTokens: 336000, completionTokens: 12600, cost: 0.1448 }) }],
  byPurpose: [],
  period: {
    days: 30,
    current: totals({ calls: 300, failed: 2, promptTokens: 240000, completionTokens: 9000, totalTokens: 249000, cachedTokens: 60000, cost: 0.1034 }),
    previous: totals({ calls: 150, promptTokens: 120000, completionTokens: 4500, totalTokens: 124500, cost: 0.0517 }),
    byModel: [{ model: 'google/gemini-3.8-flash', ...totals({ calls: 300, promptTokens: 240000, completionTokens: 9000, cost: 0.1034 }) }],
  },
  daily: [
    { date: '2026-09-29', ...totals(), byPurpose: {} }, // no calls
    {
      date: '2026-09-30',
      ...totals({ calls: 5, promptTokens: 4000, completionTokens: 150, cost: 0.0017 }),
      byPurpose: { dedup: { calls: 5, cost: 0.0017, totalTokens: 4150 } },
      byModel: { 'google/gemini-3.8-flash': { calls: 5, cost: 0.0017, totalTokens: 4150 } },
    },
    {
      date: '2026-10-01',
      ...totals({ calls: 12, promptTokens: 9800, completionTokens: 360, cost: 0.0042 }),
      byPurpose: { dedup: { calls: 8, cost: 0.002, totalTokens: 6000 }, analyze: { calls: 4, cost: 0.0022, totalTokens: 4160 } },
      byModel: { 'google/gemini-3.8-flash': { calls: 12, cost: 0.0042, totalTokens: 10160 } },
    },
  ],
};

const call = (overrides: Partial<AiUsageCall> = {}): AiUsageCall => ({
  id: 1,
  createdAt: '2026-10-01T03:00:00.000Z',
  purpose: 'dedup',
  model: 'google/gemini-3.8-flash',
  generationId: 'gen-1',
  success: true,
  error: null,
  promptTokens: 812,
  completionTokens: 31,
  totalTokens: 843,
  cachedTokens: 0,
  reasoningTokens: 0,
  cost: 0.000284,
  durationMs: 1430,
  fetchRunId: 9,
  context: 'https://www.coindesk.com/markets/btc',
  ...overrides,
});

const account: AiAccount = {
  enabled: true,
  fetchedAt: '2026-10-01T03:00:00.000Z',
  key: {
    label: 'sk-or-v1-abc',
    usage: 12.5,
    usageDaily: 0.42,
    usageWeekly: 2.1,
    usageMonthly: 8,
    limit: 100,
    limitRemaining: 87.5,
    limitReset: 'monthly',
    isFreeTier: false,
  },
  credits: { totalCredits: 50, totalUsage: 12.5, remaining: 37.5 },
  errors: [],
};

describe('AiUsagePage', () => {
  let calls: MockInstance<typeof api.aiUsageCalls>;
  let accountSpy: MockInstance<typeof api.aiAccount>;

  beforeEach(() => {
    mockShellApi();
    vi.spyOn(api, 'aiUsageSummary').mockResolvedValue(summary);
    accountSpy = vi.spyOn(api, 'aiAccount').mockResolvedValue(account);
    calls = vi.spyOn(api, 'aiUsageCalls').mockResolvedValue({
      items: [call(), call({ id: 2, success: false, error: 'OpenRouter 503', cost: null, promptTokens: 0, completionTokens: 0 })],
      total: 2,
      page: 1,
      limit: 20,
    });
  });

  it('shows remaining credit and key usage from OpenRouter', async () => {
    renderPage(<AiUsagePage />, { path: '/ai-usage' });
    expect(await screen.findByTestId('credits-remaining')).toHaveTextContent('$37.50');
    expect(screen.getByText('เติมทั้งหมด $50.00 · ใช้ไป $12.50')).toBeInTheDocument();
    expect(screen.getByTestId('key-remaining')).toHaveTextContent('เหลือ $87.50');
    expect(screen.getByText('วงเงิน $100.00 · รีเซ็ต monthly')).toBeInTheDocument();
  });

  it('shows how much credit and key limit is left as bars that warn when running low', async () => {
    renderPage(<AiUsagePage />, { path: '/ai-usage' });
    const credits = await screen.findByRole('meter', { name: 'เครดิตคงเหลือในบัญชี' });
    expect(credits).toHaveAttribute('aria-valuenow', '75'); // 37.5 of 50
    expect(credits).toHaveAttribute('data-level', 'ok');
    expect(screen.getByText('เหลือ 75%')).toBeInTheDocument();
    const keyBar = screen.getByRole('meter', { name: 'วงเงินของ API key นี้' });
    expect(keyBar).toHaveAttribute('aria-valuenow', '88'); // 87.5 of 100
  });

  it('flags credits that are almost gone and a key that is over half used', async () => {
    accountSpy.mockResolvedValue({
      ...account,
      key: { ...account.key!, limit: 1, limitRemaining: 0.4, limitReset: 'daily' },
      credits: { totalCredits: 5, totalUsage: 4.75, remaining: 0.25 },
    });
    renderPage(<AiUsagePage />, { path: '/ai-usage' });
    const credits = await screen.findByRole('meter', { name: 'เครดิตคงเหลือในบัญชี' });
    expect(credits).toHaveAttribute('data-level', 'critical');
    expect(screen.getByText('เหลือ 5.0%')).toBeInTheDocument();
    expect(screen.getByText('ใกล้หมดแล้ว — ควรเติมเครดิต')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'วงเงินของ API key นี้' })).toHaveAttribute('data-level', 'warning');
    expect(screen.getByText('ใช้ไปเกินครึ่งแล้ว')).toBeInTheDocument();
  });

  it('shows no limit bar for a key without a limit', async () => {
    accountSpy.mockResolvedValue({ ...account, key: { ...account.key!, limit: null, limitRemaining: null } });
    renderPage(<AiUsagePage />, { path: '/ai-usage' });
    await screen.findByRole('meter', { name: 'เครดิตคงเหลือในบัญชี' });
    expect(screen.queryByRole('meter', { name: 'วงเงินของ API key นี้' })).not.toBeInTheDocument();
  });

  it('refreshes the account on demand', async () => {
    renderPage(<AiUsagePage />, { path: '/ai-usage' });
    await screen.findByTestId('credits-remaining');
    await userEvent.click(screen.getByRole('button', { name: 'รีเฟรช' }));
    await waitFor(() => expect(accountSpy).toHaveBeenLastCalledWith(true));
  });

  it('explains when the account balance needs a management key', async () => {
    accountSpy.mockResolvedValue({ ...account, credits: null, errors: ['credits: OpenRouter 403'] });
    renderPage(<AiUsagePage />, { path: '/ai-usage' });
    expect(await screen.findByText('ต้องตั้ง OPENROUTER_MANAGEMENT_KEY เพื่อดูยอดคงเหลือทั้งบัญชี')).toBeInTheDocument();
    expect(screen.getByText('credits: OpenRouter 403')).toBeInTheDocument();
  });

  it('shows KPI tiles against the previous period, and the usage charts', async () => {
    renderPage(<AiUsagePage />, { path: '/ai-usage' });

    const spend = await screen.findByRole('group', { name: 'เครดิตที่ใช้' });
    expect(within(spend).getByText('$0.1034')).toBeInTheDocument();
    expect(within(spend).getByText('+100.0% เทียบช่วงก่อนหน้า')).toBeInTheDocument();
    const requests = screen.getByRole('group', { name: 'จำนวนการเรียก' });
    expect(within(requests).getByText('300')).toBeInTheDocument();
    expect(within(requests).getByText('(2 ล้มเหลว)')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'ปริมาณ token' })).getByText('249K')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'อัตรา cache hit' })).getByText('25.0%')).toBeInTheDocument();

    // Everything is a line chart now: trend (in its region), tokens, cost per 1M, cache hit, models.
    for (const chart of ['Token แยกประเภท', 'อัตรา cache hit', 'ราคาเฉลี่ยต่อ 1 ล้าน token']) {
      expect(screen.getByRole('figure', { name: chart })).toBeInTheDocument();
    }
    await waitFor(() => expect(document.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(0));
    expect(document.querySelectorAll('.recharts-line').length).toBeGreaterThan(0);
  });

  it('marks real data points on rate lines (no dot for buckets without calls)', async () => {
    renderPage(<AiUsagePage />, { path: '/ai-usage' });
    const cache = await screen.findByRole('figure', { name: 'อัตรา cache hit' });
    // 3 days in the fixture, one without calls → 2 dots, not 3.
    await waitFor(() => expect(cache.querySelectorAll('.recharts-line-dot')).toHaveLength(2));
  });

  it('switches the usage trend between credits, calls and tokens, per day or cumulative', async () => {
    const user = userEvent.setup();
    renderPage(<AiUsagePage />, { path: '/ai-usage' });
    const trend = await screen.findByRole('region', { name: 'แนวโน้มการใช้งาน' });
    const metric = within(trend).getByRole('radiogroup', { name: 'ตัวชี้วัด' });
    expect(within(metric).getByRole('radio', { name: 'เครดิต' })).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(within(trend).getAllByText(/^\$/).length).toBeGreaterThan(0)); // $ axis ticks
    // Only tasks that ran get a line (legend): dedup + analyze in the fixture.
    expect(within(trend).getByText('ตรวจข่าวซ้ำ')).toBeInTheDocument();
    expect(within(trend).getByText('วิเคราะห์ข่าว')).toBeInTheDocument();
    expect(within(trend).queryByText('แปลภาษา')).not.toBeInTheDocument();

    await user.click(within(metric).getByRole('radio', { name: 'จำนวนครั้ง' }));
    await waitFor(() => expect(within(trend).queryAllByText(/^\$/)).toHaveLength(0));

    const mode = within(trend).getByRole('radiogroup', { name: 'การแสดงผล' });
    expect(within(mode).getByRole('radio', { name: 'รายวัน' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(mode).getByRole('radio', { name: 'สะสม' }));
    expect(within(mode).getByRole('radio', { name: 'สะสม' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows models over time with a legend, and remembered table views', async () => {
    const user = userEvent.setup();
    const { unmount } = renderPage(<AiUsagePage />, { path: '/ai-usage' });

    const trend = await screen.findByRole('region', { name: 'แนวโน้มการใช้งาน' });
    expect(within(trend).getByRole('radio', { name: 'กราฟ' })).toHaveAttribute('aria-checked', 'true');
    expect(within(trend).queryByRole('table')).not.toBeInTheDocument();
    expect(within(trend).getByText('30 วันล่าสุด · เลือก "สะสม" เพื่อดูการเติบโต')).toBeInTheDocument();

    await user.click(within(trend).getByRole('radio', { name: 'ตาราง' }));
    const dailyRows = within(trend).getAllByRole('row');
    expect(within(dailyRows[1]).getByText('2026-10-01')).toBeInTheDocument(); // newest first

    // Models: a line per model (named in the legend); the table ranks the selected period.
    const models = screen.getByRole('region', { name: 'แยกตามโมเดล' });
    expect(within(models).getByText(/^30 วันล่าสุด · เครดิตของแต่ละโมเดลตามเวลา/)).toBeInTheDocument();
    expect(within(models).getByText('google/gemini-3.8-flash')).toBeInTheDocument();
    await user.click(within(models).getByRole('radio', { name: 'ตาราง' }));
    expect(within(models).getByText('$0.1034')).toBeInTheDocument();
    expect(within(models).queryByText('$0.1448')).not.toBeInTheDocument();

    unmount();
    renderPage(<AiUsagePage />, { path: '/ai-usage' });
    const again = await screen.findByRole('region', { name: 'แนวโน้มการใช้งาน' });
    expect(within(again).getByRole('radio', { name: 'ตาราง' })).toHaveAttribute('aria-checked', 'true');
    expect(within(again).getByRole('table')).toBeInTheDocument();
  });

  it('switches the summary period, including 1 day charted hour by hour', async () => {
    const user = userEvent.setup();
    const spy = vi.mocked(api.aiUsageSummary);
    renderPage(<AiUsagePage />, { path: '/ai-usage' });
    await screen.findByRole('group', { name: 'เครดิตที่ใช้' });
    expect(spy).toHaveBeenLastCalledWith(30);
    expect(screen.getByRole('radio', { name: '30 วัน' })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('radio', { name: '7 วัน' }));
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(7));

    spy.mockResolvedValue({
      ...summary,
      period: { ...summary.period!, days: 1, granularity: 'hour' },
      daily: [
        { date: '2026-10-01T09', ...totals(), byPurpose: {}, byModel: {} },
        { date: '2026-10-01T10', ...totals({ calls: 2, promptTokens: 900, cost: 0.001 }), byPurpose: { dedup: { calls: 2, cost: 0.001, totalTokens: 950 } } },
      ],
    });
    await user.click(screen.getByRole('radio', { name: '1 วัน' }));
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(1));

    const trend = await screen.findByText('24 ชั่วโมงล่าสุด · เลือก "สะสม" เพื่อดูการเติบโต');
    const region = trend.closest('[role="region"]') as HTMLElement;
    expect(within(region).getByRole('radio', { name: 'รายชั่วโมง' })).toBeInTheDocument();
    await user.click(within(region).getByRole('radio', { name: 'ตาราง' }));
    expect(within(region).getByRole('columnheader', { name: /เวลา/ })).toBeInTheDocument();
    expect(within(region).getByText('2026-10-01 10:00')).toBeInTheDocument();
  });

  it('lists individual calls and filters failures', async () => {
    const user = userEvent.setup();
    renderPage(<AiUsagePage />, { path: '/ai-usage' });

    const section = await screen.findByRole('region', { name: 'การเรียก AI ล่าสุด' });
    const rows = await within(section).findAllByRole('row');
    expect(within(rows[1]).getByText('ตรวจข่าวซ้ำ')).toBeInTheDocument();
    expect(within(rows[1]).getByText('812')).toBeInTheDocument();
    expect(within(rows[1]).getByText('$0.000284')).toBeInTheDocument();
    expect(within(rows[1]).getByText('#9')).toBeInTheDocument();
    expect(within(rows[1]).getByRole('link', { name: 'coindesk.com' })).toHaveAttribute(
      'href',
      'https://www.coindesk.com/markets/btc',
    );
    expect(within(rows[2]).getByText('ล้มเหลว')).toHaveAttribute('title', 'OpenRouter 503');

    await user.click(within(section).getByRole('checkbox', { name: 'เฉพาะที่ล้มเหลว' }));
    await waitFor(() => expect(calls).toHaveBeenLastCalledWith({ page: 1, limit: 10, success: false }));
  });

  it('on Anthropic: shows the key status and where to see the credit (no balance API)', async () => {
    accountSpy.mockResolvedValue({
      enabled: true,
      fetchedAt: '',
      provider: 'anthropic',
      verified: true,
      key: null,
      credits: null,
      errors: [],
    });
    renderPage(<AiUsagePage />, { path: '/ai-usage' });
    const card = await screen.findByRole('region', { name: 'เครดิต Anthropic' });
    expect(await within(card).findByTestId('anthropic-key')).toHaveTextContent('ใช้ได้');
    expect(within(card).getByText(/Anthropic ไม่มี API ให้ดูเครดิตคงเหลือ/)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'เปิด console.anthropic.com' })).toHaveAttribute(
      'href',
      'https://console.anthropic.com/settings/billing',
    );
    expect(within(card).queryByRole('meter')).not.toBeInTheDocument();
  });

  it('tells the user when no API key is configured', async () => {
    accountSpy.mockResolvedValue({ enabled: false, fetchedAt: '', key: null, credits: null, errors: [] });
    renderPage(<AiUsagePage />, { path: '/ai-usage' });
    expect(await screen.findByText(/ยังไม่ได้ตั้ง API key ของ OpenRouter/)).toBeInTheDocument();
  });
});
