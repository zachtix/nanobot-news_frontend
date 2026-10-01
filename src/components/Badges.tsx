import { CircleAlert, CircleCheck, CircleX, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { FetchRun, MatchMethod, SourceType } from '@/api/types';
import { useI18n } from '@/i18n/I18nContext';

const pct = (v: number | null) => (v === null ? '' : ` ${Math.round(v * 100)}%`);

export function MatchBadge({
  method,
  confidence,
  reason,
}: {
  method: MatchMethod;
  confidence: number | null;
  reason: string | null;
}) {
  const { t } = useI18n();
  if (method === 'new') return <Badge variant="secondary">{t('match.new')}</Badge>;
  return (
    <Badge variant={method === 'ai' ? 'info' : 'warning'} title={reason ?? undefined}>
      {t(method === 'ai' ? 'match.ai' : 'match.heuristic', { pct: pct(confidence) })}
    </Badge>
  );
}

// Status color never stands alone: each status also has an icon and a label.
const RUN_STATUS = {
  running: { variant: 'info', Icon: Loader2 },
  success: { variant: 'success', Icon: CircleCheck },
  partial: { variant: 'warning', Icon: CircleAlert },
  failed: { variant: 'danger', Icon: CircleX },
} as const;

export function RunStatusBadge({ status }: { status: FetchRun['status'] }) {
  const { t } = useI18n();
  const { variant, Icon } = RUN_STATUS[status];
  return (
    <Badge variant={variant}>
      <Icon className={status === 'running' ? 'animate-spin' : undefined} aria-hidden />
      {t(`run.${status}`)}
    </Badge>
  );
}

export function SourceTypeBadge({ type }: { type: SourceType }) {
  return <Badge variant={type === 'rss' ? 'info' : 'secondary'}>{type.toUpperCase()}</Badge>;
}
