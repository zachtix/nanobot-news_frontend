import type { ColumnDef } from '@tanstack/react-table';
import { ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/api/client';
import type { FetchRun, Paginated } from '@/api/types';
import { RunStatusBadge } from '@/components/Badges';
import { DataTable } from '@/components/DataTable';
import { Pagination, usePageSize } from '@/components/Pagination';
import { useFetchStatus } from '@/context/FetchStatusContext';
import { useI18n } from '@/i18n/I18nContext';
import { formatCredit, formatDateTime, formatDuration, formatNumber } from '@/utils/format';

/** Every fetch run, newest first; a row expands to the per-source results. Refreshes while a run is going. */
export function RunHistory() {
  const { t, lang } = useI18n();
  const { status, completedRun } = useFetchStatus();
  const [data, setData] = useState<Paginated<FetchRun> | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = usePageSize('fetch-runs');
  const [expanded, setExpanded] = useState<number | null>(null);
  const activeRun = status?.running ? status.run : null;
  const runs = data?.items ?? null;

  useEffect(() => {
    api.listRuns({ page, limit }).then(setData, () => setData({ items: [], total: 0, page, limit }));
  }, [page, limit, completedRun?.id, activeRun?.id, activeRun?.fetched]);

  const columns = useMemo<ColumnDef<FetchRun, unknown>[]>(() => {
    const num = (id: keyof FetchRun, header: string, size = 92): ColumnDef<FetchRun, unknown> => ({
      id,
      header,
      size,
      minSize: 72,
      meta: { align: 'right' },
      cell: ({ row }) => formatNumber(Number(row.original[id] ?? 0)),
    });
    return [
      {
        id: 'id',
        header: '#',
        size: 76,
        minSize: 64,
        cell: ({ row: { original: r } }) => (
          <Button
            variant="ghost"
            size="xs"
            aria-expanded={expanded === r.id}
            aria-label={t('runs.details', { id: r.id })}
            onClick={() => setExpanded((e) => (e === r.id ? null : r.id))}
          >
            <ChevronRight className={cn('transition-transform', expanded === r.id && 'rotate-90')} aria-hidden />
            {r.id}
          </Button>
        ),
      },
      {
        id: 'trigger',
        header: t('runs.col.trigger'),
        size: 100,
        minSize: 84,
        cell: ({ row }) => (row.original.trigger === 'manual' ? t('runs.manual') : t('runs.schedule')),
      },
      { id: 'status', header: t('runs.col.status'), size: 150, minSize: 140, cell: ({ row }) => <RunStatusBadge status={row.original.status} /> },
      {
        id: 'started',
        header: t('runs.col.started'),
        size: 170,
        minSize: 140,
        meta: { grow: true },
        cell: ({ row }) => formatDateTime(row.original.startedAt, lang),
      },
      {
        id: 'duration',
        header: t('runs.col.duration'),
        size: 100,
        minSize: 84,
        cell: ({ row }) => formatDuration(row.original.startedAt, row.original.finishedAt, lang),
      },
      num('fetched', t('runs.col.fetched')),
      num('created', t('runs.col.created')),
      num('merged', t('runs.col.merged'), 104),
      num('skipped', t('runs.col.skipped')),
      num('errors', t('runs.col.errors')),
      num('tagged', t('runs.col.tagged')),
      num('translated', t('runs.col.translated')),
      num('analyzed', t('runs.col.analyzed')),
      num('aiCalls', t('runs.col.aiCalls')),
      {
        id: 'tokens',
        header: t('runs.col.tokens'),
        size: 150,
        minSize: 130,
        meta: { align: 'right' },
        cell: ({ row: { original: r } }) => `${formatNumber(r.promptTokens)} / ${formatNumber(r.completionTokens)}`,
      },
      {
        id: 'cost',
        header: t('runs.col.cost'),
        size: 110,
        minSize: 92,
        meta: { align: 'right' },
        cell: ({ row }) => formatCredit(row.original.aiCost),
      },
    ];
  }, [t, lang, expanded]);

  return (
    <Card role="region" aria-label={t('runs.title')}>
      <CardHeader>
        <CardTitle>{t('runs.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {runs === null ? (
          <Skeleton className="h-40" aria-label={t('common.loading')} />
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('runs.empty')}</p>
        ) : (
          <DataTable
            id="fetch-runs"
            label={t('runs.title')}
            columns={columns}
            data={runs}
            getRowId={(r) => String(r.id)}
            isExpanded={(r) => expanded === r.id}
            renderExpanded={(r) => <RunDetails run={r} />}
            onRowClick={(r) => setExpanded((e) => (e === r.id ? null : r.id))}
          />
        )}
        {data && data.total > 0 && (
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

function RunDetails({ run: r }: { run: FetchRun }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2 text-sm">
      {r.error && <p className="text-muted-foreground">{r.error}</p>}
      {(r.details ?? []).length === 0 ? (
        <p className="text-muted-foreground">{t('runs.noDetails')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {r.details!.map((d) => (
            <li key={d.sourceId}>
              <strong>{d.sourceName}</strong>
              {d.error ? (
                <span className="text-danger"> — {d.error}</span>
              ) : (
                <span className="text-muted-foreground">
                  {t('runs.detail', { fetched: d.fetched, created: d.created, merged: d.merged, skipped: d.skipped })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
