import { useState } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { PromptExample } from '@/api/types';
import { LogBlock } from '@/components/PromptLogView';
import { useI18n } from '@/i18n/I18nContext';
import { formatDateTime } from '@/utils/format';

type Source = 'latest' | 'sample';

/** JSON payloads are sent as one line; show them indented. Plain text (dedup) is shown as is. */
function pretty(content: string): { text: string; json: boolean } {
  try {
    return { text: JSON.stringify(JSON.parse(content), null, 2), json: true };
  } catch {
    return { text: content, json: false };
  }
}

/**
 * The `user` message that goes out with a system prompt: the latest real one from the prompt log,
 * or a sample built by the same code. Read-only — it is generated from the stories on every call.
 */
export function PromptUserExample({ example }: { example: PromptExample }) {
  const { t, lang } = useI18n();
  const [source, setSource] = useState<Source>(example.latest ? 'latest' : 'sample');
  const shown = source === 'latest' && example.latest ? example.latest.content : example.sample;
  const { text, json } = pretty(shown);
  const meta =
    source === 'latest' && example.latest
      ? t('settings.userMsg.latestMeta', { time: formatDateTime(example.latest.createdAt, lang), model: example.latest.model })
      : t('settings.userMsg.sampleMeta');

  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-surface-sunken/40 p-3" aria-label={t('settings.userMsg.title')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-medium">{t('settings.userMsg.title')}</h3>
          <p className="text-xs text-muted-foreground">{t('settings.userMsg.help')}</p>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={source}
          onValueChange={(v) => v && setSource(v as Source)}
          aria-label={t('settings.userMsg.source')}
        >
          <ToggleGroupItem value="latest" disabled={!example.latest} className="px-3">
            {t('settings.userMsg.latest')}
          </ToggleGroupItem>
          <ToggleGroupItem value="sample" className="px-3">
            {t('settings.userMsg.sample')}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {!example.latest && <p className="text-xs text-muted-foreground">{t('settings.userMsg.noLatest')}</p>}
      <LogBlock title="role: user" meta={meta} text={text} />
      {json && <p className="text-xs text-muted-foreground">{t('settings.userMsg.pretty')}</p>}
    </section>
  );
}
