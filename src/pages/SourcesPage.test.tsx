import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import { chooseOption, makeRun, makeSource, mockShellApi, renderPage } from '../test/utils';
import { SourcesPage } from './SourcesPage';

describe('SourcesPage', () => {
  beforeEach(() => {
    mockShellApi();
    vi.spyOn(api, 'listSources').mockResolvedValue([
      makeSource({ id: 1, name: 'CoinDesk', articleCount: 12, lastStatus: 'ok', lastFetchedAt: new Date().toISOString() }),
      makeSource({ id: 2, name: 'Broken Site', type: 'html', lastStatus: 'error', lastError: 'HTTP 500' }),
    ]);
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
});
