import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import type { FetchRun, Paginated } from '../api/types';
import { chooseOption, makeRun, makeSource, mockShellApi, renderPage } from '../test/utils';
import { SourcesPage } from './SourcesPage';

const paged = (items: FetchRun[], total = items.length, page = 1, limit = 20): Paginated<FetchRun> => ({ items, total, page, limit });

describe('SourcesPage', () => {
  beforeEach(() => {
    mockShellApi();
    vi.spyOn(api, 'listSources').mockResolvedValue([
      makeSource({ id: 1, name: 'CoinDesk', articleCount: 12, lastStatus: 'ok', lastFetchedAt: new Date().toISOString() }),
      makeSource({ id: 2, name: 'Broken Site', type: 'html', lastStatus: 'error', lastError: 'HTTP 500' }),
    ]);
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

  it('lists sources with type, article count and errors', async () => {
    renderPage(<SourcesPage />, { path: '/sources' });
    const row = (await screen.findByText('CoinDesk')).closest('tr')!;
    expect(within(row).getByText('RSS')).toBeInTheDocument();
    expect(within(row).getByText('12')).toBeInTheDocument();
    const broken = screen.getByText('Broken Site').closest('tr')!;
    expect(within(broken).getByText('HTML')).toBeInTheDocument();
    expect(within(broken).getByText('HTTP 500')).toBeInTheDocument();
  });

  it('adds a source: detect the link, then save', async () => {
    const detect = vi.spyOn(api, 'detectSource').mockResolvedValue({
      url: 'https://decrypt.co',
      type: 'rss',
      feedUrl: 'https://decrypt.co/feed',
      name: 'Decrypt',
      selectors: null,
      preview: [{ title: 'Preview headline', url: 'https://decrypt.co/1' }],
    });
    const create = vi.spyOn(api, 'createSource').mockResolvedValue(makeSource({ id: 3, name: 'Decrypt' }));
    const user = userEvent.setup();
    renderPage(<SourcesPage />, { path: '/sources' });

    await user.click(await screen.findByRole('button', { name: 'เพิ่มแหล่งข่าว' }));
    const form = screen.getByRole('form', { name: 'เพิ่มแหล่งข่าว' });
    await user.type(within(form).getByLabelText('ลิงก์แหล่งข่าว'), 'https://decrypt.co');
    await user.click(within(form).getByRole('button', { name: 'ตรวจสอบลิงก์' }));

    expect(detect).toHaveBeenCalledWith('https://decrypt.co');
    expect(await within(form).findByText('พบ feed: https://decrypt.co/feed')).toBeInTheDocument();
    expect(within(form).getByLabelText('ชื่อแหล่งข่าว')).toHaveValue('Decrypt');
    expect(within(form).getByRole('link', { name: 'Preview headline' })).toBeInTheDocument();

    await user.click(within(form).getByRole('button', { name: 'บันทึกแหล่งข่าว' }));
    expect(create).toHaveBeenCalledWith({
      url: 'https://decrypt.co',
      name: 'Decrypt',
      type: 'rss',
      feedUrl: 'https://decrypt.co/feed',
    });
    await waitFor(() => expect(screen.queryByRole('form')).not.toBeInTheDocument());
  });

  it('adds an HTML source with CSS selectors and shows API errors', async () => {
    const create = vi
      .spyOn(api, 'createSource')
      .mockRejectedValue(new ApiError(409, 'This source URL already exists'));
    const user = userEvent.setup();
    renderPage(<SourcesPage />, { path: '/sources' });

    await user.click(await screen.findByRole('button', { name: 'เพิ่มแหล่งข่าว' }));
    const form = screen.getByRole('form', { name: 'เพิ่มแหล่งข่าว' });
    await user.type(within(form).getByLabelText('ลิงก์แหล่งข่าว'), 'https://site.th/news');
    await user.click(within(form).getByRole('button', { name: /ตั้งค่าขั้นสูง/ }));
    await chooseOption(user, within(form).getByRole('combobox', { name: 'ประเภท' }), 'หน้าเว็บ HTML');
    await user.type(within(form).getByLabelText('กล่องข่าวแต่ละชิ้น (จำเป็น)'), '.card');
    await user.type(within(form).getByLabelText('หัวข้อ'), 'h3');
    await user.click(within(form).getByRole('button', { name: 'บันทึกแหล่งข่าว' }));

    expect(create).toHaveBeenCalledWith({
      url: 'https://site.th/news',
      name: undefined,
      type: 'html',
      selectors: { item: '.card', title: 'h3' },
    });
    expect(await within(form).findByRole('alert')).toHaveTextContent('This source URL already exists');
  });

  it('toggles, fetches one source, and deletes after confirmation', async () => {
    const update = vi.spyOn(api, 'updateSource').mockResolvedValue(makeSource({ id: 1, enabled: false }));
    const run = vi.spyOn(api, 'runFetch').mockResolvedValue(makeRun({ status: 'running' }));
    const del = vi.spyOn(api, 'deleteSource').mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage(<SourcesPage />, { path: '/sources' });

    const row = (await screen.findByText('CoinDesk')).closest('tr')!;
    await user.click(within(row).getByRole('switch', { name: 'เปิดใช้ CoinDesk' }));
    expect(update).toHaveBeenCalledWith(1, { enabled: false });
    await waitFor(() => expect(within(row).getByRole('switch')).not.toBeChecked());

    await user.click(within(row).getByRole('button', { name: 'ดึงตอนนี้' }));
    expect(run).toHaveBeenCalledWith([1]);

    await user.click(within(row).getByRole('button', { name: 'ลบ' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('ลบแหล่งข่าว "CoinDesk"?');
    expect(del).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'ลบ' }));
    expect(del).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.queryByText('CoinDesk')).not.toBeInTheDocument());
  });

  it('does not delete when the confirmation is cancelled', async () => {
    const del = vi.spyOn(api, 'deleteSource');
    const user = userEvent.setup();
    renderPage(<SourcesPage />, { path: '/sources' });
    const row = (await screen.findByText('CoinDesk')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'ลบ' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'ยกเลิก' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(del).not.toHaveBeenCalled();
  });

  it('edits an existing source', async () => {
    const update = vi.spyOn(api, 'updateSource').mockResolvedValue(makeSource({ name: 'CoinDesk RSS' }));
    const user = userEvent.setup();
    renderPage(<SourcesPage />, { path: '/sources' });

    const row = (await screen.findByText('CoinDesk')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'แก้ไข' }));
    const form = screen.getByRole('form', { name: 'แก้ไขแหล่งข่าว' });
    const name = within(form).getByLabelText('ชื่อแหล่งข่าว');
    await user.clear(name);
    await user.type(name, 'CoinDesk RSS');
    await user.click(within(form).getByRole('button', { name: 'บันทึกแหล่งข่าว' }));

    expect(update).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'CoinDesk RSS', type: 'rss' }));
  });

  it('lists runs and expands per-source details', async () => {
    const user = userEvent.setup();
    renderPage(<SourcesPage />, { path: '/sources' });

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
    const { unmount } = renderPage(<SourcesPage />, { path: '/sources' });

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
    renderPage(<SourcesPage />, { path: '/sources' });
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 50 }));
  });
});
