import { render, screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { ThemeProvider } from 'next-themes';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { api } from '../api/client';
import type { FetchRun, FetchStatus, News, NewsReference, Source } from '../api/types';
import { Layout } from '../components/Layout';
import { TooltipProvider } from '../components/ui/tooltip';
import { FetchStatusProvider } from '../context/FetchStatusContext';
import { HealthProvider } from '../context/HealthContext';
import { I18nProvider } from '../i18n/I18nContext';
import type { Lang } from '../i18n/messages';

export function makeRef(overrides: Partial<NewsReference> = {}): NewsReference {
  return {
    id: 1,
    newsId: 1,
    sourceId: 1,
    sourceName: 'CoinDesk',
    url: 'https://coindesk.com/a',
    title: 'Bitcoin hits record',
    summary: null,
    author: null,
    imageUrl: null,
    publishedAt: '2026-09-30T08:00:00.000Z',
    matchMethod: 'new',
    matchConfidence: null,
    matchReason: null,
    fetchedAt: '2026-09-30T08:05:00.000Z',
    ...overrides,
  };
}

export function makeNews(overrides: Partial<News> = {}): News {
  const references = overrides.references ?? [makeRef()];
  return {
    id: 1,
    title: 'Bitcoin hits record',
    summary: 'BTC rallied past a new high.',
    imageUrl: null,
    publishedAt: '2026-09-30T08:00:00.000Z',
    referenceCount: references.length,
    language: 'en',
    titleEn: overrides.title ?? 'Bitcoin hits record',
    titleTh: null,
    summaryEn: null,
    summaryTh: null,
    translationStatus: 'pending',
    translatedAt: null,
    createdAt: '2026-09-30T08:05:00.000Z',
    updatedAt: '2026-09-30T08:05:00.000Z',
    ...overrides,
    references,
  };
}

export function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: 1,
    name: 'CoinDesk',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    type: 'rss',
    feedUrl: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    selectors: null,
    enabled: true,
    lastFetchedAt: null,
    lastStatus: null,
    lastError: null,
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:00:00.000Z',
    articleCount: 0,
    ...overrides,
  };
}

export function makeRun(overrides: Partial<FetchRun> = {}): FetchRun {
  return {
    id: 1,
    trigger: 'manual',
    status: 'success',
    startedAt: '2026-09-30T08:00:00.000Z',
    finishedAt: '2026-09-30T08:00:12.000Z',
    fetched: 10,
    created: 7,
    merged: 2,
    skipped: 1,
    errors: 0,
    tagged: 0,
    translated: 0,
    analyzed: 0,
    aiCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    aiCost: 0,
    details: [],
    error: null,
    ...overrides,
  };
}

export const idleStatus: FetchStatus = { running: false, run: null, lastRun: null };

/** Stub every endpoint the shell (layout + status polling) touches. */
export function mockShellApi(status: FetchStatus = idleStatus) {
  return {
    health: vi.spyOn(api, 'health').mockResolvedValue({ status: 'ok', ai: { enabled: true, model: 'google/gemini-3.8-flash' } }),
    fetchStatus: vi.spyOn(api, 'fetchStatus').mockResolvedValue(status),
  };
}

/** Render a page inside the real layout, router and fetch-status provider. */
export function renderPage(page: ReactElement, { path = '/', activePollMs = 20, lang = 'th' as Lang } = {}) {
  return render(
    <UiProviders>
      <I18nProvider defaultLang={lang}>
        <HealthProvider>
          <MemoryRouter initialEntries={[path]}>
            <FetchStatusProvider activePollMs={activePollMs} idlePollMs={60_000}>
              <Routes>
                <Route element={<Layout />}>
                  <Route path="*" element={page} />
                </Route>
              </Routes>
            </FetchStatusProvider>
          </MemoryRouter>
        </HealthProvider>
      </I18nProvider>
    </UiProviders>,
  );
}

/** Render a single component with only the i18n provider. */
export function renderWithI18n(ui: ReactElement, lang: Lang = 'th') {
  // `wrapper` (not wrapping `ui`) so `rerender` keeps the providers.
  return render(ui, {
    wrapper: ({ children }) => (
      <UiProviders>
        <I18nProvider defaultLang={lang}>{children}</I18nProvider>
      </UiProviders>
    ),
  });
}

/** The same theme + tooltip providers main.tsx mounts. */
export function UiProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider>{children}</TooltipProvider>
    </ThemeProvider>
  );
}

/** Pick an item from a Radix (shadcn) Select: open the trigger, then click the option by its visible label. */
export async function chooseOption(user: UserEvent, trigger: HTMLElement, option: string | RegExp) {
  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name: option }));
}
