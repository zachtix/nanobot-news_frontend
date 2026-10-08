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
  /** Stored AI analysis, when this viewer may see it (administrators, or a customer who unlocked it). */
  analysis?: NewsAnalysis | null;
  /** An analysis exists but this viewer has not unlocked it (`analysis` is null). */
  analysisLocked?: boolean;
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

/** Kind of event a story is about (picked by the AI; used to compare outcomes of similar events). */
export const EVENT_TYPES = [
  'hack_exploit',
  'etf_fund_flows',
  'regulation_legal',
  'listing_delisting',
  'token_unlock_supply',
  'institutional_treasury',
  'partnership_adoption',
  'product_upgrade',
  'exchange_business',
  'stablecoin',
  'macro_economy',
  'mining_infrastructure',
  'market_commentary',
  'other',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface NewsAnalysis {
  id: number;
  newsId: number;
  model: string;
  summaryTh: string;
  summaryEn: string;
  impact: 'low' | 'medium' | 'high';
  timeHorizon: 'short' | 'medium' | 'long';
  /** Null for analyses made before event types were asked for. */
  eventType?: EventType | null;
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
  /** New stories analysed right after the fetch. */
  analyzed: number;
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
  provider?: LlmProvider;
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

/** Where AI calls go (switchable on the settings page). */
export type LlmProvider = 'openrouter' | 'anthropic';

export interface AiAccount {
  enabled: boolean;
  fetchedAt: string;
  provider?: LlmProvider;
  /** Key accepted by a provider that has no balance API (Anthropic). */
  verified?: boolean;
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
  /** Translate new stories right after each fetch. */
  autoTranslate: boolean;
  /** Analyse new stories with the AI right after each fetch. */
  autoAnalyze: boolean;
  timezone: string;
  nextRunAt: string | null;
  running: boolean;
}

/** A Nanobot member account (signed in on the Nanobot member API). */
export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  /** Upper-cased, e.g. USER, ADMIN, SENIOR, ROOT. */
  role: string;
  /** ROOT / SENIOR / ADMIN: may open the settings, news sources and AI usage pages. */
  isStaff: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string | null;
}

export interface Health {
  status: string;
  ai: { enabled: boolean; provider?: LlmProvider; model: string };
  translation?: { enabled: boolean };
  analysis?: { enabled: boolean };
  chart?: { enabled: boolean };
  tagging?: { enabled: boolean };
  /** Display preferences set on the settings page. */
  ui?: { showModel: boolean };
  /** Credits a customer pays per unlock (administrators never pay). */
  credits?: CreditPrices;
}

export interface CreditPrices {
  news: number;
  chart: number;
  market: number;
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

export type PromptName = 'dedup' | 'translate' | 'tag' | 'analyze' | 'market' | 'chart';

// ---------------------------------------------------------------- market analysis

/** Only the latest 24 hours. */
export type MarketWindow = '1d';
export type Sentiment = 'bullish' | 'bearish' | 'neutral' | 'mixed';
export type MarketStatus = 'running' | 'success' | 'failed';
export type MarketStage = 'refresh' | 'content' | 'stories' | 'market';

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
  /** Stories whose full article text is not stored yet (fetched before the brief). */
  contentMissingCount: number;
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

export interface ModelSetting {
  value: string;
  source: 'settings' | 'env';
  envDefault: string;
}

export interface AiSettings {
  provider: { value: LlmProvider; source: 'settings' | 'env'; envDefault: LlmProvider };
  /** OpenRouter */
  apiKey: SecretView;
  managementKey: SecretView;
  model: ModelSetting;
  /** Anthropic API (console.anthropic.com) */
  anthropic: { apiKey: SecretView; model: ModelSetting };
  prompts: Record<PromptName, { value: string; isDefault: boolean; defaultValue: string }>;
  display: { showModel: boolean };
  /** Learning from outcomes. */
  learning: LearningSwitches;
}

export interface LearningSwitches {
  /** Record each asset call and measure the price afterwards. */
  tracking: boolean;
  /** Give the track record back to the AI with each analysis. */
  feedback: boolean;
}

/** null resets a field to .env / the built-in prompt. */
export interface AiSettingsPatch {
  provider?: LlmProvider | null;
  apiKey?: string | null;
  managementKey?: string | null;
  model?: string | null;
  anthropic?: { apiKey?: string | null; model?: string | null };
  prompts?: Partial<Record<PromptName, string | null>>;
  showModel?: boolean;
  learning?: Partial<LearningSwitches>;
}

export type SettingsWarning =
  | { code: 'promptNoJson'; prompt: PromptName }
  | { code: 'modelNotFound'; model: string }
  | { code: 'modelNoJson'; model: string }
  | { code: 'providerNoKey'; provider: LlmProvider };

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
  provider?: LlmProvider;
  key: { ok: boolean; label?: string | null; limitRemaining?: number | null; error?: string };
  model: { ok: boolean; id: string; latencyMs?: number; cost?: number | null; error?: string };
}

// ---- learning from outcomes (GET /outcomes/...)
export type PredictionSource = 'analysis' | 'market';
export type Horizon = '1h' | '4h' | '24h';
export type PredictionStatus = 'pending' | 'done' | 'unsupported' | 'error';

export interface OutcomeGroup {
  key: string;
  n: number;
  hits: number;
  /** 0-100 */
  hitRate: number | null;
  /** Average move (%) vs BTC. */
  avgMove: number | null;
  /** Enough calls to be given to the AI. */
  reliable: boolean;
}

export interface OutcomeSummary {
  source: PredictionSource;
  tracking: boolean;
  feedback: boolean;
  minSamples: number;
  mainHorizon: Horizon;
  counts: Record<PredictionStatus, number>;
  horizons: Record<Horizon, { n: number; hits: number; hitRate: number | null }>;
  byEventType: OutcomeGroup[];
  byConfidence: OutcomeGroup[];
  byDirection: OutcomeGroup[];
  byAsset: OutcomeGroup[];
  /** By the 4h chart setup when the call was made (a call can be in several groups). Shown only, never given to the AI. */
  byChartSetup: OutcomeGroup[];
  /** What the AI is given right now; null when switched off or not enough data. */
  feedbackText: string | null;
}

export interface PredictionView {
  id: number;
  source: PredictionSource;
  sourceKey: number;
  newsId: number | null;
  title: string | null;
  /** What the move is measured against (BTC for crypto, SPY for stocks), or null for the raw move. */
  benchmark: string | null;
  symbol: string;
  assetType: string;
  direction: Direction;
  confidence: number;
  eventType: EventType | null;
  model: string;
  baseTime: string;
  status: PredictionStatus;
  error: string | null;
  moves: Record<Horizon, number | null>;
  verdicts: Record<Horizon, 'hit' | 'miss' | null>;
  /** 4h chart setup at the base time (null: not looked up yet). */
  setups: ChartSetup[] | null;
}

export const CHART_SETUPS = [
  'rsi_oversold',
  'rsi_overbought',
  'rsi_cross_up_30',
  'rsi_cross_down_70',
  'bullish_divergence',
  'bearish_divergence',
  'macd_cross_up',
  'macd_cross_down',
  'above_ema200',
  'below_ema200',
] as const;
export type ChartSetup = (typeof CHART_SETUPS)[number];

// ---------------------------------------------------------------- chart analysis

export type ChartHorizon = '4h' | '24h' | '3d';
export type ChartTrend = 'up' | 'down' | 'sideways';
export type CandleInterval = '1h' | '4h' | '1d';

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface ChartCall {
  direction: Direction;
  confidence: number;
}

export interface ChartAnalysis {
  id: number;
  symbol: string;
  /** crypto = exchange pair in USDT; anything else = a market ticker in USD (trading hours). */
  assetType: AssetKind;
  pair: string;
  /** Only candles closed before this moment were used. */
  at: string;
  backtest: boolean;
  batchId: number | null;
  model: string;
  trend: ChartTrend;
  summaryTh: string;
  summaryEn: string;
  signals: { th: string; en: string; bias: Direction }[];
  supports: number[];
  resistances: number[];
  calls: Record<ChartHorizon, ChartCall>;
  thresholds: Record<ChartHorizon, number>;
  lastClose: number;
  /** Exactly what the AI was given. */
  input: string;
  cost: number | null;
  promptTokens: number;
  completionTokens: number;
  status: PredictionStatus;
  basePrice: number | null;
  price4h: number | null;
  price24h: number | null;
  price3d: number | null;
  error: string | null;
  createdAt: string;
  moves: Record<ChartHorizon, number | null>;
  actual: Record<ChartHorizon, Direction | null>;
  verdicts: Record<ChartHorizon, 'hit' | 'miss' | null>;
  /** Made with indexed prices (last close = 100), as analyses were before real prices were sent. */
  indexed: boolean;
}

export type AssetKind = 'crypto' | 'stock' | 'index' | 'commodity' | 'fiat' | 'other';

/** An asset to read the chart of. */
export interface ChartAsset {
  symbol: string;
  assetType: AssetKind;
}

/** The chart call about an asset, shown next to a news or market call about it. Made from the chart only, no news. */
export interface ChartCompanion {
  symbol: string;
  assetType: AssetKind;
  /** null: not analysed yet, or it could not be (see `error`). */
  analysis: ChartAnalysis | null;
  /** No market on the exchange, too little history, or the AI call failed. */
  error: string | null;
  /** A chart call exists but this viewer has not unlocked it (`analysis` is null). */
  locked?: boolean;
}

export type ChartMode = 'live' | 'backtest';

export interface BacktestRequest {
  symbols: string[];
  from: string;
  to: string;
  stepHours: number;
}

export interface BacktestPlan {
  symbols: string[];
  moments: number;
  total: number;
  maxTotal: number;
  from: string;
  to: string;
  estimatedCost: number | null;
}

export interface BacktestJob {
  id: number;
  status: 'running' | 'done' | 'stopped' | 'failed';
  symbols: string[];
  from: string;
  to: string;
  stepHours: number;
  total: number;
  done: number;
  reused: number;
  failed: number;
  cost: number;
  errors: string[];
  startedAt: string;
  finishedAt: string | null;
}

export interface ChartAccuracyGroup {
  key: string;
  n: number;
  hits: number;
  hitRate: number | null;
}

export interface ChartHorizonAccuracy {
  n: number;
  hits: number;
  hitRate: number | null;
  directional: { n: number; hits: number; hitRate: number | null };
  baselines: Record<Direction, number | null>;
}

export interface ChartAccuracySummary {
  filter: { symbol?: string; mode?: ChartMode };
  counts: Record<PredictionStatus, number>;
  mainHorizon: ChartHorizon;
  horizons: Record<ChartHorizon, ChartHorizonAccuracy>;
  byDirection: ChartAccuracyGroup[];
  byConfidence: ChartAccuracyGroup[];
  bySymbol: ChartAccuracyGroup[];
  byTrend: ChartAccuracyGroup[];
}
