import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeNews, makeRef, renderWithI18n as render } from '../test/utils';
import { NewsCard } from './NewsCard';

describe('NewsCard', () => {
  const news = makeNews({
    title: 'SEC approves spot Solana ETF',
    references: [
      makeRef({ id: 1, sourceName: 'CoinDesk', url: 'https://coindesk.com/sol', title: 'SEC approves spot Solana ETF' }),
      makeRef({
        id: 2,
        sourceName: 'Decrypt',
        url: 'https://decrypt.co/sol',
        title: 'Solana ETF gets green light',
        matchMethod: 'ai',
        matchConfidence: 0.93,
        matchReason: 'Same ETF approval',
      }),
      makeRef({
        id: 3,
        sourceName: 'Decrypt',
        url: 'https://decrypt.co/sol-live',
        title: 'Live: Solana ETF trading begins',
        matchMethod: 'heuristic',
        matchConfidence: 0.61,
      }),
    ],
  });

  it('links the headline to the first reference and shows the source count', () => {
    render(<NewsCard news={news} />);
    expect(screen.getByRole('link', { name: 'SEC approves spot Solana ETF' })).toHaveAttribute(
      'href',
      'https://coindesk.com/sol',
    );
    expect(screen.getByText('3 แหล่งข่าว')).toHaveAttribute('data-multi');
    // one chip per source, not per article
    expect(screen.getByRole('link', { name: 'CoinDesk' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Decrypt' })).toHaveLength(1);
  });

  it('expands to list every reference with how it was matched', async () => {
    render(<NewsCard news={news} />);
    expect(screen.queryByRole('list', { name: 'แหล่งอ้างอิง' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /ดูแหล่งอ้างอิงทั้งหมด \(3\)/ }));

    const list = screen.getByRole('list', { name: 'แหล่งอ้างอิง' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText('ต้นเรื่อง')).toBeInTheDocument();
    expect(within(items[1]).getByText('AI จับคู่ 93%')).toHaveAttribute('title', 'Same ETF approval');
    expect(within(items[1]).getByRole('link', { name: 'Solana ETF gets green light' })).toHaveAttribute(
      'href',
      'https://decrypt.co/sol',
    );
    expect(within(items[2]).getByText('ข้อความคล้าย 61%')).toBeInTheDocument();
  });

  it('shows a single-source story without the multi highlight', () => {
    render(<NewsCard news={makeNews()} />);
    expect(screen.getByText('1 แหล่งข่าว')).not.toHaveAttribute('data-multi');
  });
});
