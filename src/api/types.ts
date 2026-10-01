// Mirrors the backend JSON (dates arrive as ISO strings).

export type SourceType = 'rss' | 'html';

export interface HtmlSelectors {
  item: string;
  title?: string;
  link?: string;
  summary?: string;
  date?: string;
}

export interface Source {
  id: number;
  name: string;
  url: string;
  type: SourceType;
  feedUrl: string | null;
  selectors: HtmlSelectors | null;
  enabled: boolean;
  lastFetchedAt: string | null;
  lastStatus: 'ok' | 'error' | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  articleCount?: number;
}

export interface SourceInput {
  url: string;
  name?: string;
  type?: SourceType;
  feedUrl?: string | null;
  selectors?: HtmlSelectors | null;
  enabled?: boolean;
}

export interface FetchedItem {
  title: string;
  url: string;
  summary?: string | null;
  publishedAt?: string | null;
  author?: string | null;
  imageUrl?: string | null;
}

export interface DetectionResult {
  url: string;
  type: SourceType;
  feedUrl: string | null;
  name: string;
  selectors: HtmlSelectors | null;
  preview: FetchedItem[];
}

export type MatchMethod = 'new' | 'ai' | 'heuristic';

export interface NewsReference {
  id: number;
  newsId: number;
  sourceId: number | null;
  sourceName: string;
  url: string;
  title: string;
  summary: string | null;
  author: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  matchMethod: MatchMethod;
  matchConfidence: number | null;
  matchReason: string | null;
  fetchedAt: string;
}

export type ContentLang = 'en' | 'th';

export interface News {
  id: number;
  /** Original title/summary as published (in `language`). */
  title: string;
  summary: string | null;
  imageUrl: string | null;
  publishedAt: string;
  referenceCount: number;
  language: ContentLang | null;
  titleEn: string | null;
  titleTh: string | null;
  summaryEn: string | null;
  summaryTh: string | null;
  translationStatus: 'pending' | 'done' | 'failed';
  translatedAt: string | null;
  /** Assets tagged automatically when the story was fetched (no direction). */
  tags?: NewsTag[];
  /** Stored AI analysis; null until someone analyses the story. */
  analysis?: NewsAnalysis | null;
  createdAt: string;
  updatedAt: string;
  references: NewsReference[];
}

export type Direction = 'up' | 'down' | 'neutral';

export interface NewsTag {
  id: number;
  symbol: string;
  name: string;
  assetType: string;
}

export interface AnalysisAsset {
  id: number;
  symbol: string;
  name: string;
  assetType: 'crypto' | 'stock' | 'index' | 'commodity' | 'fiat' | 'other';
  direction: Direction;
  /** 0–100 */
  confidence: number;
  rationaleTh: string;
  rationaleEn: string;
}

export interface NewsAnalysis {
  id: number;
  newsId: number;
  model: string;
  summaryTh: string;
  summaryEn: string;
  impact: 'low' | 'medium' | 'high';
  timeHorizon: 'short' | 'medium' | 'long';
  /** References the story had when analysed. */
  referenceCount: number;
  assets: AnalysisAsset[];
  createdAt: string;
}

export interface AssetOption {
  symbol: string;
  name: string;
  count: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface NewsQuery {
  page?: number;
  limit?: number;
  q?: string;
  sourceId?: number;
  minRefs?: number;
  sort?: 'latest' | 'popular';
  asset?: string;
  direction?: Direction;
}

export interface NewsStats {
  news: number;
  references: number;
  sources: number;
  last24h: number;
  multiSource: number;
  analyzed?: number;
}

export interface SourceRunDetail {
  sourceId: number;
  sourceName: string;
  fetched: number;
  created: number;
  merged: number;
  skipped: number;
  error?: string;
}

export interface FetchRun {
  id: number;
  trigger: 'manual' | 'schedule';
  status: 'running' | 'success' | 'partial' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  fetched: number;
  created: number;
  merged: number;
  skipped: number;
  errors: number;
  tagged: number;
  translated: number;
  aiCalls: number;
  promptTokens: number;
  completionTokens: number;
  aiCost: number;
  details: SourceRunDetail[] | null;
  error: string | null;
}

export interface UsageTotals {
  calls: number;
  failed: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  /** Credits (1 credit = 1 USD on OpenRouter) */
  cost: number;
}

export interface AiUsageSummary {
  model: string;
  aiEnabled: boolean;
  timezone: string;
  today: UsageTotals;
  last7d: UsageTotals;
  last30d: UsageTotals;
  allTime: UsageTotals;
  byModel: (UsageTotals & { model: string })[];
  byPurpose: (UsageTotals & { purpose: string })[];
  /** One entry per day of the selected period (oldest first), with a per-task split. */
  daily: DailyUsage[];
  /** Selected period vs the equally long period before it (for "vs prev period"). */
  period?: {
    days: number;
    /** 'hour' for the 1-day view (last 24 hours; daily[].date = "YYYY-MM-DDTHH"), otherwise 'day'. */
    granularity?: 'day' | 'hour';
    current: UsageTotals;
    previous: UsageTotals;
    byModel?: (UsageTotals & { model: string })[];
  };
}

export type DailyUsage = UsageTotals & {
  date: string;
  byPurpose?: Record<string, { calls: number; cost: number; totalTokens: number }>;
  byModel?: Record<string, { calls: number; cost: number; totalTokens: number }>;
}

export interface AiUsageCall {
  id: number;
  createdAt: string;
  purpose: string;
  model: string;
  generationId: string | null;
  success: boolean;
  error: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  cost: number | null;
  durationMs: number;
  fetchRunId: number | null;
  context: string | null;
  /** A prompt log exists for this call (logging on and not yet pruned). */
  hasLog?: boolean;
}

export interface AiCallLog {
  id: number;
  usageId: number;
  purpose: string;
  model: string;
  messages: { role: string; content: string }[];
  response: string | null;
  /** Endpoint called (null for logs recorded before full tracing). */
  url?: string | null;
  /** Exact JSON body sent: model, messages, parameters. */
  request?: Record<string, unknown> | null;
  /** Full JSON the provider returned (reasoning, finish reason, usage, cost details…). */
  responseBody?: unknown;
  /** Each HTTP attempt; status null = network error / timeout. */
  attempts?: { status: number | null; durationMs: number; error?: string }[] | null;
  /** The call's usage row (tokens, cost, status). */
  usage?: AiUsageCall | null;
  /** Stories the call was about (batched calls list several). */
  relatedNews?: { id: number; title: string | null }[];
  createdAt: string;
}

export interface AiAccount {
  enabled: boolean;
  fetchedAt: string;
  key: {
    label: string | null;
    usage: number;
    usageDaily: number;
    usageWeekly: number;
    usageMonthly: number;
    limit: number | null;
    limitRemaining: number | null;
    limitReset: string | null;
    isFreeTier: boolean;
  } | null;
  credits: { totalCredits: number; totalUsage: number; remaining: number } | null;
  errors: string[];
}

export interface FetchStatus {
  running: boolean;
  run: FetchRun | null;
  lastRun: FetchRun | null;
}

export interface SchedulerStatus {
  enabled: boolean;
  cron: string;
  timezone: string;
  nextRunAt: string | null;
  running: boolean;
}

export interface Health {
  status: string;
  ai: { enabled: boolean; model: string };
  translation?: { enabled: boolean };
  analysis?: { enabled: boolean };
  tagging?: { enabled: boolean };
  /** Display preferences set on the settings page. */
  ui?: { showModel: boolean };
}

export interface TranslationStatus {
  enabled: boolean;
  running: boolean;
  pending: number;
  failed: number;
  done: number;
  lastResult: { translated: number; failed: number; remaining: number; finishedAt: string } | null;
}

// ---- AI settings ----

export type PromptName = 'dedup' | 'translate' | 'tag' | 'analyze' | 'market';

// ---------------------------------------------------------------- market analysis

export type MarketWindow = '1d' | '7d';
export type Sentiment = 'bullish' | 'bearish' | 'neutral' | 'mixed';
export type MarketStatus = 'running' | 'success' | 'failed';
export type MarketStage = 'refresh' | 'stories' | 'market';

export interface MarketAsset extends Omit<AnalysisAsset, 'id'> {
  /** News ids driving this call, most important first. */
  storyIds: number[];
}

export interface MarketTheme {
  titleTh: string;
  titleEn: string;
  storyIds: number[];
}

export interface MarketResult {
  headlineTh: string;
  headlineEn: string;
  summaryTh: string;
  summaryEn: string;
  sentiment: Sentiment;
  themes: MarketTheme[];
  assets: MarketAsset[];
}

/** One request in the history (result body left out). */
export interface MarketRun {
  id: number;
  createdAt: string;
  finishedAt: string | null;
  status: MarketStatus;
  stage: MarketStage | null;
  window: MarketWindow;
  /** Empty = all sources. */
  sourceIds: number[];
  sourceNames: string[];
  refresh: boolean;
  analyzeMissing: boolean;
  fetchRunId: number | null;
  storyCount: number;
  analyzedCount: number;
  newlyAnalyzed: number;
  truncatedCount: number;
  model: string | null;
  /** Set when the input was identical to an earlier run, whose result was reused (no AI call). */
  reusedFromId: number | null;
  error: string | null;
  promptTokens: number;
  completionTokens: number;
  costMarket: number;
  costStories: number;
  costFetch: number;
  cost: number;
  headlineTh: string | null;
  headlineEn: string | null;
  sentiment: Sentiment | null;
  assetCount: number;
}

export interface MarketStory {
  id: number;
  title: string;
  titleEn: string | null;
  titleTh: string | null;
  publishedAt: string;
  referenceCount: number;
  url: string | null;
  sources: string[];
}

export interface MarketRunDetail extends MarketRun {
  result: MarketResult | null;
  storyIds: number[];
  /** The stories cited by the result. */
  stories: MarketStory[];
}

export interface MarketPreview {
  window: MarketWindow;
  storyCount: number;
  analyzedCount: number;
  missingCount: number;
  truncatedCount: number;
  staleSources: string[];
  estimate: { market: number; stories: number };
  cached: { id: number; createdAt: string } | null;
}

export interface MarketRequest {
  window: MarketWindow;
  sourceIds: number[];
  refresh: boolean;
  analyzeMissing: boolean;
}

/** The `user` message sent with a system prompt (GET /settings/ai/examples). */
export interface PromptExample {
  /** Built from sample stories by the same builder the service uses. */
  sample: string;
  /** Latest real one from the prompt log; null if none yet or pruned. */
  latest: { usageId: number; model: string; createdAt: string; content: string } | null;
}
export type SettingSource = 'settings' | 'env' | 'none';

export interface SecretView {
  configured: boolean;
  /** e.g. "sk-or-v1-0…cdef" — the full key never leaves the server. */
  masked: string | null;
  source: SettingSource;
}

export interface AiSettings {
  apiKey: SecretView;
  managementKey: SecretView;
  model: { value: string; source: 'settings' | 'env'; envDefault: string };
  prompts: Record<PromptName, { value: string; isDefault: boolean; defaultValue: string }>;
  display: { showModel: boolean };
}

/** null resets a field to .env / the built-in prompt. */
export interface AiSettingsPatch {
  apiKey?: string | null;
  managementKey?: string | null;
  model?: string | null;
  prompts?: Partial<Record<PromptName, string | null>>;
  showModel?: boolean;
}

export type SettingsWarning =
  | { code: 'promptNoJson'; prompt: PromptName }
  | { code: 'modelNotFound'; model: string }
  | { code: 'modelNoJson'; model: string };

export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number | null;
  /** USD per 1M tokens */
  promptPrice: number | null;
  completionPrice: number | null;
  supportsJson: boolean;
}

export interface ConnectionTestResult {
  ok: boolean;
  key: { ok: boolean; label?: string | null; limitRemaining?: number | null; error?: string };
  model: { ok: boolean; id: string; latencyMs?: number; cost?: number | null; error?: string };
}
