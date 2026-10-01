import { Check, Copy } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/api/client';
import type { AiCallLog } from '@/api/types';
import { useI18n } from '@/i18n/I18nContext';
import type { MessageKey } from '@/i18n/messages';
import { formatCredit, formatDateTime, formatNumber } from '@/utils/format';

type Tab = 'overview' | 'request' | 'response' | 'raw';
const TABS: { id: Tab; label: MessageKey }[] = [
  { id: 'overview', label: 'log.tab.overview' },
  { id: 'request', label: 'log.tab.request' },
  { id: 'response', label: 'log.tab.response' },
  { id: 'raw', label: 'log.tab.raw' },
];

/** Pretty-print JSON payloads (most prompts and replies are JSON); leave anything else as-is. */
export function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

const json = (value: unknown) => (typeof value === 'string' ? pretty(value) : JSON.stringify(value, null, 2));

// Loose readers for the provider's response body (shape varies by provider/model).
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function readResponse(body: unknown) {
  const b = obj(body);
  const choice = obj(Array.isArray(b.choices) ? b.choices[0] : undefined);
  const message = obj(choice.message);
  const usage = obj(b.usage);
  const costDetails = obj(usage.cost_details);
  return {
    id: str(b.id),
    model: str(b.model),
    provider: str(b.provider),
    finishReason: str(choice.finish_reason),
    nativeFinishReason: str(choice.native_finish_reason),
    content: str(message.content),
    reasoning: str(message.reasoning),
    refusal: str(message.refusal),
    inputCost: numOrNull(costDetails.upstream_inference_prompt_cost),
    outputCost: numOrNull(costDetails.upstream_inference_completions_cost),
  };
}

export function PromptLogView({ usageId }: { usageId: number }) {
  const { t } = useI18n();
  const [log, setLog] = useState<AiCallLog | null | 'missing'>(null);
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    api.aiCallLog(usageId).then(setLog, () => setLog('missing'));
  }, [usageId]);

  if (log === null) return <Skeleton className="h-24" aria-label={t('common.loading')} />;
  if (log === 'missing') return <p className="text-sm text-muted-foreground">{t('ai.log.none')}</p>;

  return (
    <section className="flex flex-col gap-3" aria-label={t('ai.log.title')}>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList aria-label={t('ai.log.title')} className="flex-wrap">
          {TABS.map((x) => (
            <TabsTrigger key={x.id} value={x.id}>
              {t(x.label)}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((x) => (
          <TabsContent key={x.id} value={x.id} aria-label={t(x.label)} className="pt-3">
            {x.id === 'overview' && <Overview log={log} />}
            {x.id === 'request' && <RequestTab log={log} />}
            {x.id === 'response' && <ResponseTab log={log} />}
            {x.id === 'raw' && <RawTab log={log} />}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {rows
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => (
          <div key={k} className="flex min-w-0 flex-col gap-0.5 rounded-md border bg-background px-3 py-2">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="text-sm break-words [&_code]:font-mono [&_code]:text-xs">{v}</dd>
          </div>
        ))}
    </dl>
  );
}

function Overview({ log }: { log: AiCallLog }) {
  const { t, lang } = useI18n();
  const r = readResponse(log.responseBody);
  const u = log.usage;
  const requestedModel = str(obj(log.request).model) ?? log.model;
  const attempts = log.attempts ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Facts
        rows={[
          [t('log.f.time'), formatDateTime(log.createdAt, lang)],
          [t('log.f.purpose'), t(`ai.purpose.${log.purpose}` as MessageKey)],
          [t('log.f.status'), u ? (u.success ? `✓ ${t('ai.success')}` : `✕ ${t('ai.failed')}`) : null],
          [t('log.f.error'), u?.error ? <span className="text-danger">{u.error}</span> : null],
          [t('log.f.modelRequested'), <code key="m">{requestedModel}</code>],
          [t('log.f.modelAnswered'), r.model ? <code key="a">{r.model}</code> : null],
          [t('log.f.provider'), r.provider],
          [t('log.f.generationId'), r.id ? <code key="g">{r.id}</code> : null],
          [t('log.f.endpoint'), log.url ? <code key="u">{log.url}</code> : null],
          [
            t('log.f.attempts'),
            attempts.length
              ? attempts.map((a) => `${a.status ?? t('log.networkError')} (${a.durationMs} ms)`).join(' → ')
              : null,
          ],
          [t('log.f.duration'), u ? `${formatNumber(u.durationMs)} ms` : null],
          [t('log.f.finish'), r.finishReason ? `${r.finishReason}${r.nativeFinishReason ? ` (${r.nativeFinishReason})` : ''}` : null],
          [t('log.f.run'), u?.fetchRunId ? `#${u.fetchRunId}` : null],
        ]}
      />

      {u && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t('log.tokens')}</h3>
          <Facts
            rows={[
              [t('log.f.inputTokens'), formatNumber(u.promptTokens)],
              [t('log.f.cachedTokens'), u.cachedTokens ? formatNumber(u.cachedTokens) : null],
              [t('log.f.outputTokens'), formatNumber(u.completionTokens)],
              [
                t('log.f.reasoningTokens'),
                u.reasoningTokens
                  ? t('log.reasoningShare', {
                      n: formatNumber(u.reasoningTokens),
                      pct: u.completionTokens ? Math.round((u.reasoningTokens / u.completionTokens) * 100) : 0,
                    })
                  : null,
              ],
              [t('log.f.totalTokens'), formatNumber(u.totalTokens)],
              [t('log.f.cost'), formatCredit(u.cost)],
              [t('log.f.inputCost'), r.inputCost !== null ? formatCredit(r.inputCost) : null],
              [t('log.f.outputCost'), r.outputCost !== null ? formatCredit(r.outputCost) : null],
            ]}
          />
        </div>
      )}

      {log.relatedNews && log.relatedNews.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t('log.relatedNews', { n: log.relatedNews.length })}</h3>
          <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm">
            {log.relatedNews.map((n) => (
              <li key={n.id}>
                <span className="text-muted-foreground">#{n.id}</span> {n.title ?? t('log.deletedNews')}
              </li>
            ))}
          </ul>
        </div>
      )}
      {u?.context?.startsWith('http') && (
        <p className="text-sm">
          {t('log.article')}{' '}
          <a href={u.context} target="_blank" rel="noreferrer">
            {u.context}
          </a>
        </p>
      )}
    </div>
  );
}

function RequestTab({ log }: { log: AiCallLog }) {
  const { t } = useI18n();
  const request = obj(log.request);
  const params = Object.entries(request).filter(([k]) => k !== 'messages');
  const messages = Array.isArray(request.messages) ? (request.messages as AiCallLog['messages']) : log.messages;

  return (
    <div className="flex flex-col gap-4">
      {params.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t('log.params')}</h3>
          <Facts rows={params.map(([k, v]) => [k, <code key={k}>{typeof v === 'string' ? v : JSON.stringify(v)}</code>])} />
        </div>
      )}
      <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t('log.messages', { n: messages.length })}</h3>
      {messages.map((m, i) => (
        <LogBlock
          key={i}
          title={`${i + 1}. ${m.role === 'system' ? t('ai.log.system') : m.role === 'user' ? t('ai.log.user') : m.role}`}
          meta={t('log.chars', { n: formatNumber(m.content.length) })}
          text={m.role === 'system' ? m.content : pretty(m.content)}
        />
      ))}
    </div>
  );
}

function ResponseTab({ log }: { log: AiCallLog }) {
  const { t } = useI18n();
  const r = readResponse(log.responseBody);
  const content = r.content ?? log.response;
  const failed = log.usage ? !log.usage.success : false;

  return (
    <div className="flex flex-col gap-4">
      <LogBlock
        title={t('log.answer')}
        meta={r.finishReason ? `finish_reason: ${r.finishReason}` : undefined}
        text={content ? pretty(content) : t('ai.log.noResponse')}
        tone={failed ? 'error' : undefined}
      />
      {r.reasoning && <LogBlock title={t('log.reasoning')} meta={t('log.reasoningHelp')} text={r.reasoning} />}
      {r.refusal && <LogBlock title={t('log.refusal')} text={r.refusal} tone="error" />}
      {log.usage?.error && <p className="text-sm text-danger">{log.usage.error}</p>}
      {(log.attempts ?? [])
        .filter((a) => a.error)
        .map((a, i) => (
          <LogBlock key={i} title={t('log.attemptError', { status: a.status ?? t('log.networkError') })} text={pretty(a.error!)} tone="error" />
        ))}
    </div>
  );
}

function RawTab({ log }: { log: AiCallLog }) {
  const { t } = useI18n();
  if (!log.request && !log.responseBody) return <p className="text-sm text-muted-foreground">{t('log.noRaw')}</p>;
  return (
    <div className="flex flex-col gap-4">
      <LogBlock title={t('log.rawRequest')} meta="POST" text={log.request ? json(log.request) : '-'} />
      <LogBlock title={t('log.rawResponse')} text={log.responseBody !== null && log.responseBody !== undefined ? json(log.responseBody) : '-'} />
    </div>
  );
}

export function LogBlock({ title, text, tone, meta }: { title: string; text: string; tone?: 'error'; meta?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (insecure context) — ignore
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">
          <strong>{title}</strong>
          {meta && <span className="text-muted-foreground"> · {meta}</span>}
        </span>
        <Button variant="ghost" size="xs" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? t('ai.log.copied') : t('ai.log.copy')}
        </Button>
      </div>
      <pre
        className={cn(
          'max-h-96 overflow-auto rounded-md border bg-background px-3 py-2.5 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap',
          tone === 'error' && 'border-danger/50',
        )}
      >
        {text}
      </pre>
    </div>
  );
}
