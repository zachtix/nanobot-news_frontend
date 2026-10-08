import { ChevronDown, ExternalLink, Languages, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { api, describeError } from '@/api/client';
import type { News } from '@/api/types';
import { useI18n } from '@/i18n/I18nContext';
import { formatDateTime, timeAgo } from '@/utils/format';
import { MatchBadge } from './Badges';
import { NewsAnalysisView } from './NewsAnalysisView';

interface Props {
  news: News;
  /** Whether on-demand translation is available (AI key set, translation enabled). */
  canTranslate?: boolean;
  /** Whether a new AI analysis can be requested (AI key set). Stored analyses are always shown. */
  canAnalyze?: boolean;
  /** Called with the updated story after an on-demand translation or analysis. */
  onUpdated?: (news: News) => void;
}

/** Title/summary to show for the UI language, falling back to the original. */
export function localizedText(news: News, lang: 'th' | 'en') {
  const original = news.language ?? 'en';
  const title = lang === 'th' ? news.titleTh : news.titleEn;
  const summary = lang === 'th' ? news.summaryTh : news.summaryEn;
  const isTranslation = lang !== original && Boolean(title);
  return {
    original,
    isTranslation,
    needsTranslation: lang !== original && !title,
    title: isTranslation ? title! : news.title,
    summary: isTranslation ? (summary ?? news.summary) : news.summary,
  };
}

export function NewsCard({ news, canTranslate = false, canAnalyze = false, onUpdated }: Props) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  const text = localizedText(news, lang);
  const useTranslation = text.isTranslation && !showOriginal;
  const title = useTranslation ? text.title : news.title;
  const summary = useTranslation ? text.summary : news.summary;
  const primary = news.references[0];
  const multi = news.referenceCount > 1;

  // One chip per source, linking to that source's article.
  const bySource = new Map<string, string>();
  for (const ref of news.references) if (!bySource.has(ref.sourceName)) bySource.set(ref.sourceName, ref.url);

  const translateNow = async () => {
    setTranslating(true);
    setTranslateError(null);
    try {
      onUpdated?.(await api.translateNews(news.id));
    } catch (err) {
      setTranslateError(describeError(err));
    } finally {
      setTranslating(false);
    }
  };

  return (
    <Card role="article" lang={useTranslation ? lang : text.original} className="gap-0 py-0">
        <CardContent className="flex flex-col-reverse gap-4 p-4 sm:flex-row sm:p-5">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono tabular-nums select-all">#{news.id}</span>
              <time dateTime={news.publishedAt} title={formatDateTime(news.publishedAt, lang)}>
                {timeAgo(news.publishedAt, lang)}
              </time>
              <span data-multi={multi || undefined} className={cn('font-semibold', multi && 'text-warning')}>
                {news.referenceCount === 1 ? t('news.sourceCountOne') : t('news.sourceCount', { n: news.referenceCount })}
              </span>
              {text.isTranslation && (
                <span className="flex items-center gap-1">
                  <Badge variant="info">
                    <Sparkles aria-hidden />
                    {t('news.translated')}
                  </Badge>
                  <Button variant="link" size="xs" className="h-auto p-0" onClick={() => setShowOriginal((s) => !s)}>
                    {showOriginal ? t('news.showTranslation') : t('news.showOriginal')}
                  </Button>
                </span>
              )}
              {text.needsTranslation && (
                <span className="flex items-center gap-1.5">
                  <span>{t('news.originalIn', { lang: t(`lang.name.${text.original}`) })}</span>
                  {canTranslate && (
                    <Button variant="link" size="xs" className="h-auto p-0" onClick={translateNow} disabled={translating}>
                      <Languages aria-hidden />
                      {translating ? t('news.translating') : t('news.translateNow')}
                    </Button>
                  )}
                </span>
              )}
            </div>

            <h3 className="text-base leading-snug font-semibold">
              {primary ? (
                <a href={primary.url} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">
                  {title}
                </a>
              ) : (
                title
              )}
            </h3>
            {summary && <p className="line-clamp-2 text-sm text-muted-foreground">{summary}</p>}
            {translateError && <p className="text-sm text-danger">{t('news.translateError', { error: translateError })}</p>}

            <NewsAnalysisView news={news} canAnalyze={canAnalyze} onAnalyzed={(analysis) => onUpdated?.({ ...news, analysis, analysisLocked: false })} />

            <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {[...bySource].map(([name, url]) => (
                  <Badge key={name} variant="outline" asChild className="h-6 px-2.5">
                    <a href={url} target="_blank" rel="noreferrer">
                      {name}
                    </a>
                  </Badge>
                ))}
                <CollapsibleTrigger asChild>
                  <Button variant="link" size="sm" className="h-6 px-1">
                    {open ? t('news.hideRefs') : t('news.showRefs', { n: news.references.length })}
                    <ChevronDown className={cn('transition-transform', open && 'rotate-180')} aria-hidden />
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <ul className="divide-y border-t" aria-label={t('news.refs')}>
                  {news.references.map((ref) => (
                    <li key={ref.id} className="flex flex-col gap-1 py-2.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <strong className="text-sm">{ref.sourceName}</strong>
                        <MatchBadge method={ref.matchMethod} confidence={ref.matchConfidence} reason={ref.matchReason} />
                        <span className="text-muted-foreground">{formatDateTime(ref.publishedAt ?? ref.fetchedAt, lang)}</span>
                      </div>
                      <a href={ref.url} target="_blank" rel="noreferrer" className="flex items-start gap-1 text-sm hover:text-primary hover:underline">
                        {ref.title}
                        <ExternalLink className="mt-0.5 size-3 shrink-0 opacity-60" aria-hidden />
                      </a>
                      {ref.matchMethod !== 'new' && ref.matchReason && (
                        <p className="text-xs text-muted-foreground">{ref.matchReason}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </div>
          {news.imageUrl && (
            // Many publishers (e.g. Cloudflare hotlink protection) reject images requested with a foreign Referer.
            <img
              className="h-40 w-full shrink-0 rounded-lg bg-muted object-cover sm:h-24 sm:w-36"
              src={news.imageUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          )}
        </CardContent>
    </Card>
  );
}
