import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockShellApi, renderPage } from '../test/utils';
import { formatDuration, timeAgo } from '../utils/format';
import { messages, translate } from './messages';

describe('messages', () => {
  it('has an English string for every Thai key, and no empty strings', () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.th).sort());
    for (const lang of ['th', 'en'] as const) {
      for (const [key, value] of Object.entries(messages[lang])) expect(value, `${lang}:${key}`).not.toBe('');
    }
  });

  it('interpolates parameters and leaves unknown placeholders alone', () => {
    expect(translate('en', 'page.of', { page: 2, pages: 5 })).toBe('Page 2 / 5');
    expect(translate('th', 'page.of', { page: 2, pages: 5 })).toBe('หน้า 2 / 5');
    expect(translate('en', 'page.of', { page: 2 })).toBe('Page 2 / {pages}');
  });

  it('formats relative times and durations in English', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    expect(timeAgo('2026-10-01T11:45:00Z', 'en', now)).toBe('15 min ago');
    expect(timeAgo('2026-09-29T12:00:00Z', 'en', now)).toBe('2 days ago');
    expect(formatDuration('2026-10-01T00:00:00Z', '2026-10-01T00:02:05Z', 'en')).toBe('2m 5s');
  });
});

describe('language switch', () => {
  it('switches the whole UI between TH and EN and remembers the choice', async () => {
    mockShellApi();
    const user = userEvent.setup();
    renderPage(<div>page</div>);

    expect(await screen.findByRole('link', { name: 'แหล่งข่าว' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ดึงข่าวตอนนี้' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'TH' })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('radio', { name: 'EN' }));

    expect(screen.getByRole('link', { name: 'Sources' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fetch now' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'EN' })).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('lang')).toBe('en');
  });

  it('starts in the stored language', async () => {
    localStorage.setItem('lang', 'en');
    mockShellApi();
    renderPage(<div>page</div>);
    await waitFor(() => expect(screen.getByRole('link', { name: 'AI usage' })).toBeInTheDocument());
  });
});
