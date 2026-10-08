import { ApiError } from './errors';
import { authTokens, endSession, renewSession } from './nanobot';
import type {
  BacktestJob,
  BacktestPlan,
  BacktestRequest,
  Candle,
  CandleInterval,
  ChartAccuracySummary,
  ChartAnalysis,
  ChartAsset,
  ChartCompanion,
  ChartMode,
  AiCallLog,
  AiSettings,
  AiSettingsPatch,
  ConnectionTestResult,
  LlmProvider,
  OutcomeSummary,
  PredictionSource,
  PredictionStatus,
  Direction,
  EventType,
  PredictionView,
  MarketPreview,
  MarketRequest,
  MarketRun,
  MarketRunDetail,
  MarketWindow,
  ModelInfo,
  PromptExample,
  PromptName,
  SettingsWarning,
  AiAccount,
  AiUsageCall,
  AiUsageSummary,
  AssetOption,
  DetectionResult,
  FetchedItem,
  FetchRun,
  FetchStatus,
  Health,
  News,
  NewsAnalysis,
  NewsQuery,
  NewsStats,
  Paginated,
  SchedulerStatus,
  Source,
  SourceInput,
  TranslationStatus,
} from './types';

export { ApiError };

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const send = (token: string | null) =>
    fetch(`${BASE}/api${path}`, {
      ...rest,
      headers: {
        ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers as Record<string, string> | undefined),
      },
      body: json === undefined ? rest.body : JSON.stringify(json),
    });

  const token = authTokens.access();
  let res = await send(token);
  // An expired Nanobot access token: renew once and retry; if that fails the session is over.
  if (res.status === 401 && token) {
    if (await renewSession()) res = await send(authTokens.access());
    else endSession();
  }
  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `HTTP ${res.status}`, data?.details);
  return data as T;
}

export function toQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** Human-readable message including validation details from the API. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError && Array.isArray(err.details) && err.details.length) {
    const parts = err.details.map((d: { path?: string; message?: string }) =>
      d.path ? `${d.path}: ${d.message}` : String(d.message),
    );
    return `${err.message} (${parts.join(', ')})`;
  }
  return err instanceof Error ? err.message : String(err);
}

export const api = {
  health: () => request<Health>('/health'),


  listNews: (query: NewsQuery = {}) => request<Paginated<News>>(`/news${toQuery({ ...query })}`),
  newsStats: () => request<NewsStats>('/news/stats'),
  deleteNews: (id: number) => request<void>(`/news/${id}`, { method: 'DELETE' }),
  translateNews: (id: number) => request<News>(`/news/${id}/translate`, { method: 'POST' }),
  /**
   * Administrators: the stored analysis, or run the AI once (force = re-analyse). Customers: unlock it (the stored one,
   * or the AI for the first to ask); `credits` = what it cost (0 when already theirs).
   */
  analyzeNews: (id: number, force = false) =>
    request<{ analysis: NewsAnalysis; cached: boolean; credits: number }>(`/news/${id}/analysis`, {
      method: 'POST',
      json: force ? { force } : {},
    }),
  /** How the calls of a story's analysis turned out (same access as the analysis). */
  newsOutcomes: (id: number) => request<PredictionView[]>(`/news/${id}/outcomes`),
  newsAssets: () => request<AssetOption[]>('/news/assets'),

  translationStatus: () => request<TranslationStatus>('/translate/status'),
  runTranslation: (opts: { limit?: number; includeFailed?: boolean } = {}) =>
    request<TranslationStatus>('/translate/run', { method: 'POST', json: opts }),

  listSources: () => request<Source[]>('/sources'),
  detectSource: (url: string) => request<DetectionResult>('/sources/detect', { method: 'POST', json: { url } }),
  previewSource: (input: Required<Pick<SourceInput, 'url' | 'type'>> & SourceInput) =>
    request<{ count: number; items: FetchedItem[] }>('/sources/preview', { method: 'POST', json: input }),
  createSource: (input: SourceInput) => request<Source>('/sources', { method: 'POST', json: input }),
  updateSource: (id: number, patch: Partial<SourceInput>) =>
    request<Source>(`/sources/${id}`, { method: 'PUT', json: patch }),
  deleteSource: (id: number) => request<void>(`/sources/${id}`, { method: 'DELETE' }),

  runFetch: (sourceIds?: number[]) =>
    request<FetchRun>('/fetch/run', { method: 'POST', json: sourceIds?.length ? { sourceIds } : {} }),
  fetchStatus: () => request<FetchStatus>('/fetch/status'),
  listRuns: (query: { page?: number; limit?: number; trigger?: FetchRun['trigger']; status?: FetchRun['status']; q?: string } = {}) => request<Paginated<FetchRun>>(`/fetch/runs${toQuery(query)}`),

  aiUsageSummary: (days = 30) => request<AiUsageSummary>(`/ai-usage/summary${toQuery({ days })}`),
  aiUsageCalls: (
    query: { page?: number; limit?: number; fetchRunId?: number; success?: boolean; purpose?: string; q?: string } = {},
  ) =>
    request<Paginated<AiUsageCall>>(`/ai-usage/calls${toQuery(query)}`),
  /** Full prompt + raw reply of one call (404 if not logged or pruned). */
  aiCallLog: (usageId: number) => request<AiCallLog>(`/ai-usage/calls/${usageId}/log`),
  aiAccount: (refresh = false) => request<AiAccount>(`/ai-usage/account${refresh ? '?refresh=1' : ''}`),

  getAiSettings: () => request<AiSettings>('/settings/ai'),
  updateAiSettings: (patch: AiSettingsPatch) =>
    request<{ settings: AiSettings; warnings: SettingsWarning[] }>('/settings/ai', { method: 'PUT', json: patch }),
  /** Check a key/model without saving (current settings are used for anything omitted). */
  testAiConnection: (candidate: { provider?: LlmProvider; apiKey?: string; model?: string } = {}) =>
    request<ConnectionTestResult>('/settings/ai/test', { method: 'POST', json: candidate }),
  /** Model list of a provider (default: the active one). */
  listModels: (provider?: LlmProvider) => request<ModelInfo[]>(`/settings/ai/models${toQuery({ provider })}`),
  promptExamples: () => request<Record<PromptName, PromptExample>>('/settings/ai/examples'),

  outcomeSummary: (source: PredictionSource) => request<OutcomeSummary>(`/outcomes/summary${toQuery({ source })}`),
  outcomePredictions: (query: {
    source: PredictionSource;
    page: number;
    limit: number;
    status?: PredictionStatus;
    symbol?: string;
    direction?: Direction;
    eventType?: EventType;
    q?: string;
  }) =>
    request<Paginated<PredictionView>>(`/outcomes/predictions${toQuery(query)}`),
  refreshOutcomes: () => request<{ updated: number }>('/outcomes/refresh', { method: 'POST' }),

  marketPreview: (window: MarketWindow, sourceIds: number[]) =>
    request<MarketPreview>(`/market/preview${toQuery({ window, sourceIds: sourceIds.join(',') || undefined })}`),
  /** Customers: always on fresh news, `credits` charged once the brief is done (administrators: 0). */
  startMarket: (body: MarketRequest) => request<MarketRun & { credits: number }>('/market/analyses', { method: 'POST', json: body }),
  /** How a brief's calls turned out (same access as the brief; a reused brief: the original's calls). */
  marketOutcomes: (id: number) => request<PredictionView[]>(`/market/analyses/${id}/outcomes`),
  marketRuns: (query: { page: number; limit: number; status?: MarketRun['status']; q?: string }) =>
    request<Paginated<MarketRun>>(`/market/analyses${toQuery(query)}`),
  marketRun: (id: number) => request<MarketRunDetail>(`/market/analyses/${id}`),

  /** Analyse a coin's chart as of now (no `at`) or a past moment; the same input is reused for free unless forced. */
  analyzeChart: (body: { symbol: string; at?: string; force?: boolean }) =>
    request<{ analysis: ChartAnalysis; cached: boolean; credits: number }>('/chart/analyses', { method: 'POST', json: body }),
  chartAnalyses: (query: { symbol?: string; mode?: ChartMode; batchId?: number; page?: number; limit?: number } = {}) =>
    request<Paginated<ChartAnalysis> & { totalCost: number }>(`/chart/analyses${toQuery(query)}`),
  chartAnalysis: (id: number) => request<ChartAnalysis>(`/chart/analyses/${id}`),
  /** Stored chart calls of these assets as of a news / market call's moment (never calls the AI). */
  chartCompanions: (assets: ChartAsset[], at: string) =>
    request<ChartCompanion[]>(`/chart/companions${toQuery({ assets: assets.map((a) => `${a.assetType}:${a.symbol}`).join(','), at })}`),
  /**
   * Unlock (customers) or run (administrators) the chart call of the assets given: the stored one, or one AI call per
   * asset from the chart alone. `credits` = what it cost; `newsId` = the story whose moment it is.
   */
  runChartCompanions: (assets: ChartAsset[], at: string, newsId?: number) =>
    request<{ items: ChartCompanion[]; credits: number }>('/chart/companions', { method: 'POST', json: { assets, at, newsId } }),
  chartSummary: (query: { symbol?: string; mode?: ChartMode } = {}) => request<ChartAccuracySummary>(`/chart/summary${toQuery(query)}`),
  chartCandles: (symbol: string, interval: CandleInterval, before?: string, assetType?: ChartAsset['assetType']) =>
    request<Candle[]>(`/chart/candles${toQuery({ symbol, interval, before, assetType })}`),
  planBacktest: (body: BacktestRequest) =>
    request<BacktestPlan>(`/chart/backtests/plan${toQuery({ ...body, symbols: body.symbols.join(',') })}`),
  startBacktest: (body: BacktestRequest) => request<BacktestJob>('/chart/backtests', { method: 'POST', json: body }),
  backtestStatus: () => request<BacktestJob | null>('/chart/backtests/current'),
  stopBacktest: () => request<BacktestJob | null>('/chart/backtests/current/stop', { method: 'POST' }),
  refreshChartOutcomes: () => request<{ updated: number }>('/chart/refresh', { method: 'POST' }),

  getScheduler: () => request<SchedulerStatus>('/scheduler'),
  updateScheduler: (patch: Partial<Pick<SchedulerStatus, 'enabled' | 'cron' | 'autoTranslate' | 'autoAnalyze'>>) =>
    request<SchedulerStatus>('/scheduler', { method: 'PUT', json: patch }),
};
