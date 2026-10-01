import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import type { FetchRun, Paginated, SchedulerStatus } from '../api/types';
import { chooseOption, makeRun, mockShellApi, renderPage } from '../test/utils';
import { FetchPage } from './FetchPage';

const paged = (items: FetchRun[], total = items.length, page = 1, limit = 20): Paginated<FetchRun> => ({ items, total, page, limit });

const scheduler: SchedulerStatus = {
  enabled: true,
  cron: '*/30 * * * *',
  timezone: 'Asia/Bangkok',
  nextRunAt: '2026-10-01T05:30:00.000Z',
  running: false,
};

describe('FetchPage', () => {
  beforeEach(() => {
    mockShellApi();
    vi.spyOn(api, 'getScheduler').mockResolvedValue(scheduler);
    vi.spyOn(api, 'listRuns').mockResolvedValue(paged([
      makeRun({
        id: 2,
        trigger: 'schedule',
        status: 'partial',
        errors: 1,
        aiCalls: 6,
        promptTokens: 4870,
        completionTokens: 186,
        aiCost: 0.001734,
        details: [
          { sourceId: 1, sourceName: 'CoinDesk', fetched: 10, created: 7, merged: 2, skipped: 1 },
          { sourceId: 2, sourceName: 'Broken', fetched: 0, created: 0, merged: 0, skipped: 0, error: 'HTTP 500' },
        ],
      }),
      makeRun({ id: 1 }),
    ]));
  });

  it('shows the current schedule', async () => {
    renderPage(<FetchPage />, { path: '/fetch' });
    expect(await screen.findByLabelText('Cron expression')).toHaveValue('*/30 * * * *');
    const presets = screen.getByRole('radiogroup', { name: 'ความถี่' });
    expect(within(presets).getByRole('radio', { name: 'ทุก 30 นาที' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/ปัจจุบัน: ทุก 30 นาที · รอบถัดไป/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'บันทึก' })).toBeDisabled(); // nothing changed yet
  });

  it('saves a preset and the enabled flag', async () => {
    const update = vi
      .spyOn(api, 'updateScheduler')
      .mockResolvedValue({ ...scheduler, cron: '0 */3 * * *', enabled: false, nextRunAt: null });
    const user = userEvent.setup();
    renderPage(<FetchPage />, { path: '/fetch' });

    await user.click(await screen.findByRole('radio', { name: 'ทุก 3 ชั่วโมง' }));
    await user.click(screen.getByRole('switch', { name: 'เปิดการดึงอัตโนมัติ' }));
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));

    expect(update).toHaveBeenCalledWith({ enabled: false, cron: '0 */3 * * *' });
    expect(await screen.findByText('บันทึกการตั้งเวลาแล้ว')).toBeInTheDocument();
    expect(screen.getByText('ปัจจุบัน: ปิดการดึงอัตโนมัติ')).toBeInTheDocument();
  });

  it('shows validation errors for a bad cron', async () => {
    vi.spyOn(api, 'updateScheduler').mockRejectedValue(new ApiError(400, 'Invalid cron expression: "nope"'));
    const user = userEvent.setup();
    renderPage(<FetchPage />, { path: '/fetch' });

    const input = await screen.findByLabelText('Cron expression');
    await user.clear(input);
    await user.type(input, 'nope');
    await user.click(screen.getByRole('button', { name: 'บันทึก' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid cron expression');
  });

  it('lists runs and expands per-source details', async () => {
    const user = userEvent.setup();
    renderPage(<FetchPage />, { path: '/fetch' });

    const history = await screen.findByRole('region', { name: 'ประวัติการดึงข่าว' });
    const rows = await within(history).findAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2 runs
    expect(within(rows[1]).getByText('ตั้งเวลา')).toBeInTheDocument();
    expect(within(rows[1]).getByText('สำเร็จบางส่วน')).toBeInTheDocument();
    expect(within(rows[1]).getByText('4,870 / 186')).toBeInTheDocument();
    expect(within(rows[1]).getByText('$0.001734')).toBeInTheDocument();
    expect(within(rows[2]).getByText('$0')).toBeInTheDocument();
    expect(within(rows[2]).getByText('กดเอง')).toBeInTheDocument();

    const expand = () => within(history).getByRole('button', { name: 'ดูรายละเอียดรอบ #2' });
    expect(expand()).toHaveAttribute('aria-expanded', 'false');
    await user.click(expand());
    expect(within(history).getByText('CoinDesk')).toBeInTheDocument();
    expect(within(history).getByText(/HTTP 500/)).toBeInTheDocument();
    expect(expand()).toHaveAttribute('aria-expanded', 'true');
    await user.click(expand());
    await waitFor(() => expect(within(history).queryByText(/HTTP 500/)).not.toBeInTheDocument());

    // Clicking anywhere on the row toggles it too.
    await user.click(within(rows[1]).getByText('4,870 / 186'));
    expect(within(history).getByText(/HTTP 500/)).toBeInTheDocument();
    expect(expand()).toHaveAttribute('aria-expanded', 'true');
    await user.click(within(history).getAllByRole('row')[1].querySelector('td:nth-child(2)')!);
    await waitFor(() => expect(within(history).queryByText(/HTTP 500/)).not.toBeInTheDocument());
  });

  it('pages through the run history and changes the page size (remembered)', async () => {
    const list = vi.mocked(api.listRuns);
    list.mockImplementation(async ({ page = 1, limit = 20 } = {}) =>
      paged([makeRun({ id: 100 - (page - 1) * limit })], 45, page, limit),
    );
    const user = userEvent.setup();
    const { unmount } = renderPage(<FetchPage />, { path: '/fetch' });

    const history = await screen.findByRole('region', { name: 'ประวัติการดึงข่าว' });
    const nav = await within(history).findByRole('navigation', { name: 'เปลี่ยนหน้า' });
    expect(within(nav).getByText('1–10 จาก 45')).toBeInTheDocument(); // default 10 per page
    expect(within(nav).getByText('หน้า 1 / 5')).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 10 });

    await user.click(within(nav).getByRole('button', { name: 'หน้าสุดท้าย' }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 5, limit: 10 }));
    expect(await within(nav).findByText('41–45 จาก 45')).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'หน้าถัดไป' })).toBeDisabled();

    await chooseOption(user, within(nav).getByRole('combobox', { name: 'ต่อหน้า' }), '50');
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 50 })); // back to page 1
    expect(await within(history).findByText('1–45 จาก 45')).toBeInTheDocument();
    expect(localStorage.getItem('page-size:fetch-runs')).toBe('50');

    unmount();
    renderPage(<FetchPage />, { path: '/fetch' });
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 50 }));
  });
});
