import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { makeNews, renderWithI18n } from '../test/utils';
import { localizedText, NewsCard } from './NewsCard';

const english = makeNews({
  title: 'Bitwise launches first US spot NEAR ETF',
  summary: 'The fund starts trading on NYSE Arca.',
  language: 'en',
  titleEn: 'Bitwise launches first US spot NEAR ETF',
  summaryEn: 'The fund starts trading on NYSE Arca.',
  titleTh: 'Bitwise เปิดตัว spot NEAR ETF แห่งแรกในสหรัฐฯ',
  summaryTh: 'กองทุนเริ่มซื้อขายบน NYSE Arca',
  translationStatus: 'done',
});

const thaiUntranslated = makeNews({
  id: 2,
  title: 'กระเป๋าเชื่อมโยง Joseph Lubin ย้าย 133,000 ETH',
  summary: null,
  language: 'th',
  titleTh: 'กระเป๋าเชื่อมโยง Joseph Lubin ย้าย 133,000 ETH',
  titleEn: null,
  translationStatus: 'pending',
});

describe('localizedText', () => {
  it('uses the translation for the other language and the original otherwise', () => {
    expect(localizedText(english, 'th')).toMatchObject({ isTranslation: true, title: english.titleTh });
    expect(localizedText(english, 'en')).toMatchObject({ isTranslation: false, title: english.title });
    expect(localizedText(thaiUntranslated, 'en')).toMatchObject({ needsTranslation: true, title: thaiUntranslated.title });
  });
});

describe('NewsCard translation', () => {
  it('shows the Thai translation in the Thai UI, with an AI badge and a toggle to the original', async () => {
    renderWithI18n(<NewsCard news={english} />, 'th');

    expect(screen.getByRole('heading', { name: 'Bitwise เปิดตัว spot NEAR ETF แห่งแรกในสหรัฐฯ' })).toBeInTheDocument();
    expect(screen.getByText('กองทุนเริ่มซื้อขายบน NYSE Arca')).toBeInTheDocument();
    expect(screen.getByText('แปลโดย AI')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'ดูต้นฉบับ' }));
    expect(screen.getByRole('heading', { name: 'Bitwise launches first US spot NEAR ETF' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'ดูคำแปล' }));
    expect(screen.getByRole('heading', { name: 'Bitwise เปิดตัว spot NEAR ETF แห่งแรกในสหรัฐฯ' })).toBeInTheDocument();
  });

  it('shows English originals as-is in the English UI', () => {
    renderWithI18n(<NewsCard news={english} />, 'en');
    expect(screen.getByRole('heading', { name: 'Bitwise launches first US spot NEAR ETF' })).toBeInTheDocument();
    expect(screen.queryByText('Translated by AI')).not.toBeInTheDocument();
    expect(screen.getByText('1 source')).toBeInTheDocument();
  });

  it('offers on-demand translation for untranslated stories', async () => {
    const translated = { ...thaiUntranslated, titleEn: 'Wallet linked to Joseph Lubin moves 133,000 ETH', translationStatus: 'done' as const };
    const translate = vi.spyOn(api, 'translateNews').mockResolvedValue(translated);
    const onUpdated = vi.fn();
    renderWithI18n(<NewsCard news={thaiUntranslated} canTranslate onUpdated={onUpdated} />, 'en');

    expect(screen.getByText('Original in Thai')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Translate' }));

    expect(translate).toHaveBeenCalledWith(2);
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(translated));
  });

  it('hides the translate button when translation is unavailable', () => {
    renderWithI18n(<NewsCard news={thaiUntranslated} />, 'en');
    expect(screen.queryByRole('button', { name: 'Translate' })).not.toBeInTheDocument();
  });

  it('loads images without sending a Referer (publishers block hotlinking)', () => {
    const { container } = renderWithI18n(<NewsCard news={{ ...english, imageUrl: 'https://siamblockchain.com/a.jpg' }} />);
    expect(container.querySelector('img')).toHaveAttribute('referrerpolicy', 'no-referrer');
  });
});
