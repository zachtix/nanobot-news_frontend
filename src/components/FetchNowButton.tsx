import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFetchStatus } from '@/context/FetchStatusContext';
import { useI18n } from '@/i18n/I18nContext';

export function FetchNowButton() {
  const { running, starting, trigger } = useFetchStatus();
  const { t } = useI18n();
  const busy = running || starting;

  return (
    <Button size="lg" onClick={() => trigger()} disabled={busy} aria-busy={busy}>
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
      {starting ? t('fetch.starting') : running ? t('fetch.running') : t('fetch.now')}
    </Button>
  );
}
