import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFetchStatus } from '@/context/FetchStatusContext';
import { useI18n } from '@/i18n/I18nContext';

/** Icon-only "fetch now"; its name (tooltip and screen readers) says what it will do or is doing. */
export function FetchNowButton() {
  const { running, starting, trigger } = useFetchStatus();
  const { t } = useI18n();
  const busy = running || starting;
  const label = starting ? t('fetch.starting') : running ? t('fetch.running') : t('fetch.now');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button gets no hover events: the span keeps the tooltip working while a run is going. */}
        <span className="inline-flex">
          <Button size="icon" className="size-8" onClick={() => trigger()} disabled={busy} aria-busy={busy} aria-label={label}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
