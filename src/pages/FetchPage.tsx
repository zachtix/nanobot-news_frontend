import type { ColumnDef } from '@tanstack/react-table';
import { ChevronRight, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api, describeError } from '@/api/client';
import type { FetchRun, Paginated, SchedulerStatus } from '@/api/types';
import { RunStatusBadge } from '@/components/Badges';
import { DataTable } from '@/components/DataTable';
import { Pagination, usePageSize } from '@/components/Pagination';
import { useFetchStatus } from '@/context/FetchStatusContext';
import { useI18n } from '@/i18n/I18nContext';
import { CRON_PRESETS, cronLabel, formatCredit, formatDateTime, formatDuration, formatNumber } from '@/utils/format';

export function FetchPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">{t('fetchPage.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('fetchPage.subtitle')}</p>
      </div>
      <SchedulerCard />
      <RunHistory />
    </div>
  );
}

function SchedulerCard() {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [cron, setCron] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: true } | { ok: false; text: string } | null>(null);

  const apply = (s: SchedulerStatus) => {
    setStatus(s);
    setEnabled(s.enabled);
    setCron(s.cron);
  };

  useEffect(() => {
    api.getScheduler().then(apply, (err) => setMessage({ ok: false, text: describeError(err) }));
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      apply(await api.updateScheduler({ enabled, cron: cron.trim() }));
      setMessage({ ok: true });
    } catch (err) {
      setMessage({ ok: false, text: describeError(err) });
    } finally {
      setSaving(false);
    }
  };

  if (!status) {
    return message && !message.ok ? (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{message.text}</AlertDescription>
      </Alert>
    ) : (
      <Skeleton className="h-56 rounded-xl" aria-label={t('common.loading')} />
    );
  }

  const dirty = enabled !== status.enabled || cron.trim() !== status.cron;
  const preset = CRON_PRESETS.find((p) => p.cron === cron)?.cron ?? '';

  return (
    <Card role="region" aria-label={t('sched.label')}>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>{t('sched.title')}</CardTitle>
          <CardDescription>
            {status.enabled && status.nextRunAt
              ? t('sched.current', { label: cronLabel(status.cron, lang), next: formatDateTime(status.nextRunAt, lang) })
              : t('sched.currentOff')}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="sched-enabled" className="text-muted-foreground">
            {enabled ? t('sched.on') : t('sched.off')}
          </Label>
          <Switch id="sched-enabled" checked={enabled} onCheckedChange={setEnabled} aria-label={t('sched.toggle')} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ToggleGroup
          type="single"
          variant="outline"
          value={preset}
          onValueChange={(v) => v && setCron(v)}
          aria-label={t('sched.frequency')}
          className="flex-wrap justify-start"
        >
          {CRON_PRESETS.map((p) => (
            <ToggleGroupItem key={p.cron} value={p.cron} className="px-3">
              {t(p.key)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex max-w-md flex-col gap-1.5">
          <Label htmlFor="sched-cron">{t('sched.cronHelp', { tz: status.timezone })}</Label>
          <Input id="sched-cron" className="font-mono" value={cron} onChange={(e) => setCron(e.target.value)} aria-label="Cron expression" />
        </div>
        {message && (
          <p className={cn('text-sm', message.ok ? 'text-success' : 'text-danger')} role={message.ok ? 'status' : 'alert'}>
            {message.ok ? t('sched.saved') : message.text}
          </p>
        )}
      </CardContent>
      <CardFooter className="justify-end border-t pt-4">
        <Button onClick={save} disabled={saving || !dirty || !cron.trim()}>
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      </CardFooter>
    </Card>
  );
}

function RunHistory() {
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
