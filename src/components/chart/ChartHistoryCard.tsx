import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, describeError } from '@/api/client';
import type { ChartAnalysis, Paginated } from '@/api/types';
import { Pagination, usePageSize } from '@/components/Pagination';
import { useI18n } from '@/i18n/I18nContext';
import { formatCredit, formatDateTime, formatNumber } from '@/utils/format';
import { CallChip, CHART_HORIZONS, Verdict } from './ChartAnalysisView';
import { formatCost } from './format';

/** Every chart analysis, newest moment first; a row opens it above. */
export function ChartHistoryCard({ reload, onOpen }: { reload: number; onOpen: (a: ChartAnalysis) => void }) {
  const { t, lang } = useI18n();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = usePageSize('chart-history', 20);
  const [data, setData] = useState<(Paginated<ChartAnalysis> & { totalCost: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.chartAnalyses({ page, limit }).then(
      (d) => {
        setData(d);
        setError(null);
      },
      (err) => setError(describeError(err)),
    );
  }, [page, limit, reload]);

  return (
    <Card role="region" aria-label={t('chart.history')}>
      <CardHeader>
        <CardTitle>{t('chart.history')}</CardTitle>
        {data && data.total > 0 && (
          <CardDescription className="tabular-nums">{t('chart.historyTotal', { n: formatNumber(data.total), cost: formatCost(data.totalCost) })}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <p className="text-sm text-danger">{error}</p>}
        {!data && !error && <Skeleton className="h-32" aria-label={t('common.loading')} />}
        {data && data.items.length === 0 && <p className="text-sm text-muted-foreground">{t('chart.historyEmpty')}</p>}
        {data && data.items.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('chart.col.at')}</TableHead>
                  <TableHead>{t('chart.col.coin')}</TableHead>
                  {CHART_HORIZONS.map((h) => (
                    <TableHead key={h}>{t(`chart.h.${h}`)}</TableHead>
                  ))}
                  <TableHead className="text-right">{t('chart.col.cost')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(a.at, lang)}
                      {a.backtest && (
                        <Badge variant="info" className="ml-2">
                          {t('chart.mode.backtest')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{a.symbol}</TableCell>
                    {CHART_HORIZONS.map((h) => (
                      <TableCell key={h}>
                        <span className="flex items-center gap-1.5">
                          <CallChip call={a.calls[h]} size="sm" />
                          <Verdict verdict={a.verdicts[h]} />
                        </span>
                      </TableCell>
                    ))}
                    <TableCell
                      className="text-right whitespace-nowrap tabular-nums"
                      title={t('chart.tokens', { input: formatNumber(a.promptTokens), output: formatNumber(a.completionTokens) })}
                    >
                      {formatCredit(a.cost)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => onOpen(a)}>
                        {t('chart.open')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {data && (
          <Pagination
            page={page}
            limit={limit}
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
