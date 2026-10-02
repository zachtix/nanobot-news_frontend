import type { ColumnDef } from '@tanstack/react-table';
import { CircleCheck, CircleX, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api, describeError } from '@/api/client';
import type { Horizon, OutcomeGroup, OutcomeSummary, Paginated, PredictionSource, PredictionView } from '@/api/types';
import { DataTable } from '@/components/DataTable';
import { DIRECTION } from '@/components/NewsAnalysisView';
import { Pagination, usePageSize } from '@/components/Pagination';
import { useI18n } from '@/i18n/I18nContext';
import type { MessageKey } from '@/i18n/messages';
import { formatDateTime } from '@/utils/format';

const HORIZONS: Horizon[] = ['1h', '4h', '24h'];
const SOURCES: PredictionSource[] = ['analysis', 'market'];
const STATUS_BADGE = { pending: 'secondary', done: 'success', unsupported: 'warning', error: 'danger' } as const;

const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

/** How right the AI's asset calls turned out against real prices, and what is fed back to it. */
export function AccuracyPage() {
  const { t } = useI18n();
  const [source, setSource] = useState<PredictionSource>('analysis');
  const [summary, setSummary] = useState<OutcomeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setSummary(null);
    api.outcomeSummary(source).then(
      (s) => {
        setSummary(s);
        setError(null);
      },
      (err) => setError(describeError(err)),
    );
  }, [source, reload]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await api.refreshOutcomes();
      setReload((n) => n + 1);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold">{t('acc.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('acc.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            value={source}
            onValueChange={(v) => v && setSource(v as PredictionSource)}
            aria-label={t('acc.source')}
          >
            {SOURCES.map((s) => (
              <ToggleGroupItem key={s} value={s} className="px-3">
                {t(`acc.source.${s}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button variant="outline" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && 'animate-spin')} aria-hidden />
            {t('acc.refresh')}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {summary && !summary.tracking && (
        <Alert role="status" className="border-warning/40 bg-warning-bg text-warning">
          <AlertDescription className="text-warning">
            {t('acc.trackingOff')}{' '}
            <Link to="/settings" className="underline">
              {t('nav.settings')}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {!summary && !error && <Skeleton className="h-32 rounded-xl" aria-label={t('common.loading')} />}
      {summary && (
        <>
          <section className="grid gap-3 sm:grid-cols-3" aria-label={t('acc.title')}>
            {HORIZONS.map((h) => {
              const r = summary.horizons[h];
              return (
                <Card key={h} role="group" aria-label={t('acc.horizon', { h })} className="gap-1 py-4">
                  <CardContent className="flex flex-col gap-1 px-4">
                    <span className="text-xs text-muted-foreground">{t('acc.horizon', { h })}</span>
                    <span className="text-2xl font-bold tabular-nums">
                      {r.hitRate == null ? t('acc.noneYet') : t('acc.hitRate', { pct: r.hitRate })}
                    </span>
                    <span className="text-xs text-muted-foreground">{t('acc.judged', { n: r.n })}</span>
                  </CardContent>
                </Card>
              );
            })}
          </section>
          <p className="-mt-2 text-xs text-muted-foreground">
            {t('acc.counts', { pending: summary.counts.pending, done: summary.counts.done, unsupported: summary.counts.unsupported })}
          </p>

          <FeedbackCard summary={summary} />
          <GroupsCard summary={summary} />
        </>
      )}

      <CallsCard source={source} reload={reload} />
    </div>
  );
}

function FeedbackCard({ summary }: { summary: OutcomeSummary }) {
  const { t } = useI18n();
  return (
    <Card role="region" aria-label={t('acc.feedbackTitle')}>
      <CardHeader>
        <CardTitle>{t('acc.feedbackTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {!summary.feedback ? (
          <p className="text-sm text-muted-foreground">{t('acc.feedbackOff')}</p>
        ) : summary.feedbackText ? (
          <pre className="rounded-md border bg-surface-sunken p-3 font-mono text-xs whitespace-pre-wrap">{summary.feedbackText}</pre>
        ) : (
          <p className="text-sm text-muted-foreground">{t('acc.feedbackNotYet', { n: summary.minSamples })}</p>
        )}
      </CardContent>
    </Card>
  );
}

function GroupsCard({ summary }: { summary: OutcomeSummary }) {
  const { t } = useI18n();
  const groups: [MessageKey, OutcomeGroup[], (key: string) => string][] = [
    ['acc.by.eventType', summary.byEventType, (k) => t(`event.${k}` as MessageKey)],
    ['acc.by.confidence', summary.byConfidence, (k) => `${k}%`],
    ['acc.by.direction', summary.byDirection, (k) => t(`analysis.dir.${k}` as MessageKey)],
    ['acc.by.asset', summary.byAsset, (k) => k],
  ];
  return (
    <Card role="region" aria-label={t('acc.groupsTitle', { h: summary.mainHorizon })}>
      <CardHeader>
        <CardTitle>{t('acc.groupsTitle', { h: summary.mainHorizon })}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-2">
        {groups.map(([title, rows, label]) => (
          <div key={title} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t(title)}</h3>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('acc.noGroups')}</p>
            ) : (
              <Table aria-label={t(title)}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('acc.col.group')}</TableHead>
                    <TableHead className="text-right">{t('acc.col.n')}</TableHead>
                    <TableHead className="text-right">{t('acc.col.hitRate')}</TableHead>
                    <TableHead className="text-right">{t('acc.col.avgMove')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((g) => (
                    <TableRow key={g.key}>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-1.5">
                          {label(g.key)}
                          {g.reliable && summary.feedback && (
                            <Badge variant="info" className="text-[10px]">
                              {t('acc.sentToAi')}
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{g.n}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.hitRate == null ? '-' : `${g.hitRate}%`}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.avgMove == null ? '-' : signed(g.avgMove)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MoveCell({ move, verdict }: { move: number | null; verdict: 'hit' | 'miss' | null }) {
  const { t } = useI18n();
  if (move == null) return <span className="text-muted-foreground">-</span>;
  return (
    <span
      className={cn('inline-flex items-center gap-1 tabular-nums', verdict === 'hit' ? 'text-success' : 'text-danger')}
      title={verdict ? t(`acc.${verdict}`) : undefined}
    >
      {verdict === 'hit' ? <CircleCheck className="size-3.5" aria-label={t('acc.hit')} /> : <CircleX className="size-3.5" aria-label={t('acc.miss')} />}
      {signed(move)}
    </span>
  );
}

function CallsCard({ source, reload }: { source: PredictionSource; reload: number }) {
  const { t, lang } = useI18n();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = usePageSize('outcome-calls');
  const [data, setData] = useState<Paginated<PredictionView> | null>(null);

  useEffect(() => setPage(1), [source]);
  useEffect(() => {
    api.outcomePredictions({ source, page, limit }).then(setData, () => setData({ items: [], total: 0, page, limit }));
  }, [source, page, limit, reload]);

  const story = useCallback(
    (p: PredictionView) => (p.source === 'market' ? t('acc.marketRun', { id: p.sourceKey }) : (p.title ?? `news#${p.newsId}`)),
    [t],
  );

  const columns = useMemo<ColumnDef<PredictionView, unknown>[]>(
    () => [
      { id: 'time', header: t('acc.col.time'), size: 150, minSize: 130, cell: ({ row }) => formatDateTime(row.original.baseTime, lang) },
      {
        id: 'story',
        header: t('acc.col.story'),
        size: 260,
        minSize: 160,
        meta: { grow: true },
        cell: ({ row }) => <span title={story(row.original)}>{story(row.original)}</span>,
      },
      { id: 'asset', header: t('acc.col.asset'), size: 90, minSize: 76, cell: ({ row }) => <strong>{row.original.symbol}</strong> },
      {
        id: 'call',
        header: t('acc.col.call'),
        size: 130,
        minSize: 110,
        cell: ({ row: { original: p } }) => {
          const { Icon, chip } = DIRECTION[p.direction];
          return (
            <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs', chip)}>
              <Icon className="size-3" aria-hidden />
              {t(`analysis.dir.${p.direction}` as MessageKey)} {p.confidence}%
            </span>
          );
        },
      },
      {
        id: 'event',
        header: t('acc.col.event'),
        size: 150,
        minSize: 110,
        cell: ({ row }) => (row.original.eventType ? t(`event.${row.original.eventType}` as MessageKey) : '-'),
      },
      ...HORIZONS.map(
        (h): ColumnDef<PredictionView, unknown> => ({
          id: `move-${h}`,
          header: h,
          size: 92,
          minSize: 80,
          meta: { align: 'right' },
          cell: ({ row }) => <MoveCell move={row.original.moves[h]} verdict={row.original.verdicts[h]} />,
        }),
      ),
      {
        id: 'status',
        header: t('acc.col.status'),
        size: 110,
        minSize: 96,
        cell: ({ row: { original: p } }) => (
          <Badge variant={STATUS_BADGE[p.status]} title={p.error ?? undefined}>
            {t(`acc.status.${p.status}`)}
          </Badge>
        ),
      },
    ],
    [t, lang, story],
  );

  return (
    <Card role="region" aria-label={t('acc.callsTitle')}>
      <CardHeader>
        <CardTitle>{t('acc.callsTitle')}</CardTitle>
        <CardDescription>{t(`acc.source.${source}`)}</CardDescription>
        <CardAction />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {data === null ? (
          <Skeleton className="h-40" aria-label={t('common.loading')} />
        ) : data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('acc.noCalls')}</p>
        ) : (
          <DataTable id="outcome-calls" label={t('acc.callsTitle')} columns={columns} data={data.items} getRowId={(p) => String(p.id)} />
        )}
        {data && (
          <Pagination
            page={data.page}
            limit={data.limit}
            total={data.total}
            onChange={setPage}
            onLimitChange={(size) => {
              setLimit(size);
              setPage(1);
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
