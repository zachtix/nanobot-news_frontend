import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api, describeError } from '@/api/client';
import type { SchedulerStatus } from '@/api/types';
import { useI18n } from '@/i18n/I18nContext';
import { CRON_PRESETS, cronLabel, formatDateTime } from '@/utils/format';

/** Automatic fetch schedule: on/off plus a cron preset or a custom expression. */
export function SchedulerCard() {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [cron, setCron] = useState('');
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: true } | { ok: false; text: string } | null>(null);

  const apply = (s: SchedulerStatus) => {
    setStatus(s);
    setEnabled(s.enabled);
    setCron(s.cron);
    setAutoTranslate(s.autoTranslate);
    setAutoAnalyze(s.autoAnalyze);
  };

  useEffect(() => {
    api.getScheduler().then(apply, (err) => setMessage({ ok: false, text: describeError(err) }));
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      apply(await api.updateScheduler({ enabled, cron: cron.trim(), autoTranslate, autoAnalyze }));
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

  const dirty =
    enabled !== status.enabled || cron.trim() !== status.cron || autoTranslate !== status.autoTranslate || autoAnalyze !== status.autoAnalyze;
  const afterFetch = [
    { id: 'autoTranslate', value: autoTranslate, set: setAutoTranslate },
    { id: 'autoAnalyze', value: autoAnalyze, set: setAutoAnalyze },
  ] as const;
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
        <Separator />
        <div className="flex flex-col gap-3" role="group" aria-label={t('sched.afterFetch')}>
          <p className="text-sm font-medium">{t('sched.afterFetch')}</p>
          {afterFetch.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor={`sched-${s.id}`}>{t(`sched.${s.id}`)}</Label>
                <p className="text-sm text-muted-foreground">{t(`sched.${s.id}Help`)}</p>
              </div>
              <Switch id={`sched-${s.id}`} checked={s.value} onCheckedChange={s.set} aria-label={t(`sched.${s.id}`)} />
            </div>
          ))}
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
