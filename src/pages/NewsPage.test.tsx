import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { api } from '../api/client';
import { chooseOption, makeNews, makeSource, mockShellApi, renderPage } from '../test/utils';
import { NewsPage } from './NewsPage';

const stats = { news: 2, references: 3, sources: 2, last24h: 2, multiSource: 1 };
const translation = { enabled: true, running: false, pending: 0, failed: 0, done: 2, lastResult: null };

describe('NewsPage', () => {
  let listNews: MockInstance<typeof api.listNews>;

  beforeEach(() => {
    mockShellApi();
    vi.spyOn(api, 'newsStats').mockResolvedValue(stats);
    vi.spyOn(api, 'translationStatus').mockResolvedValue({ ...translation, enabled: false });
    vi.spyOn(api, 'newsAssets').mockResolvedValue([{ symbol: 'BTC', name: 'Bitcoin', count: 3 }]);
    vi.spyOn(api, 'listSources').mockResolvedValue([makeSource({ id: 7, name: 'Decrypt' })]);
    listNews = vi.spyOn(api, 'listNews').mockResolvedValue({
      items: [makeNews({ id: 1, title: 'Solana ETF approved' }), makeNews({ id: 2, title: 'Exchange hacked' })],
      total: 2,
      page: 1,
      limit: 20,
    });
  });

  it('shows stats and the news list', async () => {
    renderPage(<NewsPage />);
    expect(await screen.findByText('Solana ETF approved')).toBeInTheDocument();
    expect(screen.getByText('Exchange hacked')).toBeInTheDocument();
    expect(screen.getByText('ข่าวที่หลายแหล่งรายงาน').previousSibling).toHaveTextContent('1');
    expect(listNews).toHaveBeenCalledWith({ page: 1, limit: 10, sort: 'latest' }); // default 10 per page
  });

  it('searches (debounced) and filters', async () => {
    renderPage(<NewsPage />);
    await screen.findByText('Solana ETF approved');
    const user = userEvent.setup();

    await user.type(screen.getByRole('searchbox', { name: 'ค้นหาข่าว' }), 'etf');
    await waitFor(() => expect(listNews).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'etf', page: 1 })));

    await chooseOption(user, screen.getByRole('combobox', { name: 'กรองตามแหล่งข่าว' }), 'Decrypt');
    await waitFor(() => expect(listNews).toHaveBeenLastCalledWith(expect.objectContaining({ sourceId: 7 })));

    await chooseOption(user, screen.getByRole('combobox', { name: 'เรียงลำดับ' }), 'มีหลายแหล่งรายงานมากสุด');
    await waitFor(() => expect(listNews).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'popular' })));

    await user.click(screen.getByRole('checkbox', { name: /เฉพาะข่าวที่มี ≥ 2 แหล่ง/ }));
    await waitFor(() => expect(listNews).toHaveBeenLastCalledWith(expect.objectContaining({ minRefs: 2 })));
  });

  it('shows an empty state', async () => {
    listNews.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    renderPage(<NewsPage />);
    expect(await screen.findByText('ยังไม่มีข่าว')).toBeInTheDocument();
  });

  it('pages through results', async () => {
    listNews.mockResolvedValue({ items: [makeNews()], total: 45, page: 1, limit: 10 });
    renderPage(<NewsPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'หน้าถัดไป' }));
    await waitFor(() => expect(listNews).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, limit: 10 })));

    await chooseOption(user, screen.getByRole('combobox', { name: 'ต่อหน้า' }), '50');
    await waitFor(() => expect(listNews).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, limit: 50 })));
    expect(localStorage.getItem('page-size:news')).toBe('50');
  });

  it('shows load errors', async () => {
    listNews.mockRejectedValue(new Error('network down'));
    renderPage(<NewsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('โหลดข่าวไม่สำเร็จ: network down');
  });

  describe('translation backlog banner', () => {
    it('is hidden when translation is disabled or nothing is pending', async () => {
      renderPage(<NewsPage />);
      await screen.findByText('Solana ETF approved');
      expect(screen.queryByRole('button', { name: 'แปลทั้งหมด' })).not.toBeInTheDocument();
    });

    it('translates the backlog and reloads the news when it finishes', async () => {
      const status = vi
        .spyOn(api, 'translationStatus')
        .mockResolvedValueOnce({ ...translation, pending: 3, failed: 1 })
        .mockResolvedValue({ ...translation, pending: 0, done: 6 });
      const run = vi.spyOn(api, 'runTranslation').mockResolvedValue({ ...translation, running: true, pending: 4 });
      const user = userEvent.setup();
      renderPage(<NewsPage />);

      expect(await screen.findByText('มี 4 ข่าวที่ยังไม่ได้แปล')).toBeInTheDocument();
      const loadsBefore = listNews.mock.calls.length;
      await user.click(screen.getByRole('button', { name: 'แปลทั้งหมด' }));

      expect(run).toHaveBeenCalledWith({ includeFailed: true });
      expect(await screen.findByText('กำลังแปล… เหลือ 4 ข่าว')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText(/กำลังแปล/)).not.toBeInTheDocument(), { timeout: 4000 });
      expect(status).toHaveBeenCalledTimes(2);
      await waitFor(() => expect(listNews.mock.calls.length).toBeGreaterThan(loadsBefore));
    });
  });

  it('filters by analysed asset and direction', async () => {
    const user = userEvent.setup();
    renderPage(<NewsPage />);
    await screen.findByText('Solana ETF approved');

    await chooseOption(user, await screen.findByRole('combobox', { name: 'กรองตามสินทรัพย์' }), /^BTC/);
    await waitFor(() => expect(listNews).toHaveBeenLastCalledWith(expect.objectContaining({ asset: 'BTC', page: 1 })));
    await chooseOption(user, screen.getByRole('combobox', { name: 'กรองตามทิศทาง' }), /ลง/);
    await waitFor(() =>
      expect(listNews).toHaveBeenLastCalledWith(expect.objectContaining({ asset: 'BTC', direction: 'down' })),
    );
  });

  it('enables analysis on cards when the backend reports it available', async () => {
    vi.spyOn(api, 'health').mockResolvedValue({
      status: 'ok',
      ai: { enabled: true, model: 'm' },
      analysis: { enabled: true },
    });
    renderPage(<NewsPage />);
    expect(await screen.findAllByRole('button', { name: /วิเคราะห์ด้วย AI/ })).toHaveLength(2);
  });
});
