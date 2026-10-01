import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Radio, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api, describeError } from '@/api/client';
import type { Source } from '@/api/types';
import { SourceTypeBadge } from '@/components/Badges';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable } from '@/components/DataTable';
import { SourceForm } from '@/components/SourceForm';
import { useFetchStatus } from '@/context/FetchStatusContext';
import { useI18n } from '@/i18n/I18nContext';
import { hostname, timeAgo } from '@/utils/format';

type FormState = { mode: 'create' } | { mode: 'edit'; source: Source } | null;

export function SourcesPage() {
  const { trigger, running, completedRun } = useFetchStatus();
  const { t, lang } = useI18n();
  const [sources, setSources] = useState<Source[] | null>(null);
  const [form, setForm] = useState<FormState>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listSources().then(
      (list) => {
        setSources(list);
        setError(null);
      },
      (err) => setError(describeError(err)),
    );
  }, []);

  useEffect(load, [load, completedRun?.id]);

  const toggle = useCallback(async (source: Source) => {
    try {
      const updated = await api.updateSource(source.id, { enabled: !source.enabled });
      setSources((list) => list?.map((s) => (s.id === source.id ? { ...s, ...updated } : s)) ?? null);
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  const remove = useCallback(async (source: Source) => {
    try {
      await api.deleteSource(source.id);
      setSources((list) => list?.filter((s) => s.id !== source.id) ?? null);
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  const columns = useMemo<ColumnDef<Source, unknown>[]>(
    () => [
      {
        id: 'source',
        header: t('sources.col.source'),
        size: 260,
        minSize: 180,
        meta: { grow: true },
        cell: ({ row: { original: s } }) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{s.name}</span>
            <a className="truncate text-xs text-muted-foreground hover:text-primary hover:underline" href={s.url} target="_blank" rel="noreferrer">
              {hostname(s.url)}
            </a>
          </div>
        ),
      },
      {
        id: 'type',
        header: t('sources.col.type'),
        size: 90,
        minSize: 76,
        cell: ({ row }) => <SourceTypeBadge type={row.original.type} />,
      },
      {
        id: 'articles',
        header: t('sources.col.articles'),
        size: 100,
        minSize: 84,
        meta: { align: 'right' },
        cell: ({ row }) => row.original.articleCount ?? 0,
      },
      {
        id: 'lastFetched',
        header: t('sources.col.lastFetched'),
        size: 190,
        minSize: 140,
        meta: { wrap: true },
        cell: ({ row: { original: s } }) => (
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  'size-2 rounded-full',
                  s.lastStatus === 'error' ? 'bg-danger' : s.lastStatus === 'ok' ? 'bg-success' : 'bg-muted-foreground',
                )}
              />
              {timeAgo(s.lastFetchedAt, lang)}
            </span>
            {s.lastStatus === 'error' && <span className="text-xs text-danger">{s.lastError}</span>}
          </div>
        ),
      },
      {
        id: 'enabled',
        header: t('sources.col.enabled'),
        size: 96,
        minSize: 84,
        meta: { align: 'center' },
        cell: ({ row: { original: s } }) => (
          <Switch checked={s.enabled} onCheckedChange={() => toggle(s)} aria-label={t('sources.enable', { name: s.name })} />
        ),
      },
      {
        id: 'actions',
        header: t('sources.col.actions'),
        size: 290,
        minSize: 270,
        meta: { align: 'right' },
        cell: ({ row: { original: s } }) => (
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="outline" disabled={running} onClick={() => trigger([s.id])}>
              <RefreshCw aria-hidden />
              {t('sources.fetchOne')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setForm({ mode: 'edit', source: s })}>
              <Pencil aria-hidden />
              {t('sources.edit')}
            </Button>
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="destructive">
                  <Trash2 aria-hidden />
                  {t('sources.delete')}
                </Button>
              }
              title={t('sources.deleteTitle', { name: s.name })}
              description={t('sources.deleteDesc')}
              confirmLabel={t('sources.delete')}
              destructive
              onConfirm={() => remove(s)}
            />
          </div>
        ),
      },
    ],
    [t, lang, running, trigger, toggle, remove],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('sources.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('sources.subtitle')}</p>
        </div>
        {!form && (
          <Button size="lg" onClick={() => setForm({ mode: 'create' })}>
            <Plus aria-hidden />
            {t('sources.add')}
          </Button>
        )}
      </div>

      {form && (
        <SourceForm
          key={form.mode === 'edit' ? form.source.id : 'new'}
          initial={form.mode === 'edit' ? form.source : undefined}
          onCancel={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {sources === null ? (
        <Skeleton className="h-48 rounded-xl" aria-label={t('common.loading')} />
      ) : sources.length === 0 ? (
        <Card className="items-center gap-1 border-dashed py-10 text-center shadow-none">
          <Radio className="mb-2 size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">{t('sources.empty')}</p>
          <p className="text-sm text-muted-foreground">{t('sources.emptyHint')}</p>
        </Card>
      ) : (
        <DataTable
          id="sources"
          label={t('sources.title')}
          columns={columns}
          data={sources}
          getRowId={(s) => String(s.id)}
          rowClassName={(row) => (row.original.enabled ? undefined : 'text-muted-foreground')}
          paginate
        />
      )}
    </div>
  );
}
