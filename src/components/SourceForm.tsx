import { ChevronRight, FlaskConical, Loader2, ScanSearch } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, describeError } from '@/api/client';
import type { DetectionResult, FetchedItem, HtmlSelectors, Source, SourceInput, SourceType } from '@/api/types';
import { useI18n } from '@/i18n/I18nContext';
import type { MessageKey } from '@/i18n/messages';
import { SourceTypeBadge } from './Badges';

interface Props {
  /** Edit an existing source; omit to create a new one. */
  initial?: Source;
  onSaved: (source: Source) => void;
  onCancel: () => void;
}

const SELECTOR_FIELDS: { key: keyof HtmlSelectors; label: MessageKey; placeholder: string }[] = [
  { key: 'item', label: 'form.sel.item', placeholder: 'article, .post-card' },
  { key: 'title', label: 'form.sel.title', placeholder: 'h2' },
  { key: 'link', label: 'form.sel.link', placeholder: 'a.title-link' },
  { key: 'summary', label: 'form.sel.summary', placeholder: '.excerpt' },
  { key: 'date', label: 'form.sel.date', placeholder: 'time' },
];

/** Radix Select has no empty value; this stands for "detect automatically". */
const AUTO = 'auto';

export function SourceForm({ initial, onSaved, onCancel }: Props) {
  const { t } = useI18n();
  const editing = Boolean(initial);
  const [url, setUrl] = useState(initial?.url ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<SourceType | ''>(initial?.type ?? '');
  const [feedUrl, setFeedUrl] = useState(initial?.feedUrl ?? '');
  const [selectors, setSelectors] = useState<HtmlSelectors>(initial?.selectors ?? { item: '' });
  const [advanced, setAdvanced] = useState(Boolean(initial));

  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [preview, setPreview] = useState<FetchedItem[] | null>(null);
  const [busy, setBusy] = useState<'detect' | 'preview' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async <T,>(kind: NonNullable<typeof busy>, fn: () => Promise<T>) => {
    setBusy(kind);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(describeError(err));
      return undefined;
    } finally {
      setBusy(null);
    }
  };

  const detect = () =>
    run('detect', async () => {
      const result = await api.detectSource(url.trim());
      setDetection(result);
      setPreview(result.preview);
      setType(result.type);
      setFeedUrl(result.feedUrl ?? '');
      if (!name) setName(result.name);
    });

  const buildInput = (): SourceInput => {
    const input: SourceInput = { url: url.trim(), name: name.trim() || undefined };
    if (type) input.type = type;
    if (type === 'rss') input.feedUrl = feedUrl.trim() || null;
    if (type === 'html') {
      const cleaned = Object.fromEntries(Object.entries(selectors).filter(([, v]) => v && v.trim())) as unknown as HtmlSelectors;
      input.selectors = cleaned.item ? cleaned : null;
    }
    return input;
  };

  const testFetch = () =>
    run('preview', async () => {
      const input = buildInput();
      const res = await api.previewSource({ ...input, type: input.type ?? 'rss' });
      setPreview(res.items);
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run('save', async () => {
      const input = buildInput();
      const saved = initial ? await api.updateSource(initial.id, input) : await api.createSource(input);
      onSaved(saved);
    });
  };

  const spinner = (kind: typeof busy) => (busy === kind ? <Loader2 className="animate-spin" aria-hidden /> : null);

  return (
    <Card>
      <form onSubmit={submit} aria-label={editing ? t('form.editLabel') : t('form.addLabel')} className="flex flex-col gap-4">
        <CardHeader>
          <CardTitle>{editing ? t('form.editTitle', { name: initial!.name }) : t('form.addTitle')}</CardTitle>
          <CardDescription>{t('form.intro')}</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-64 flex-1 flex-col gap-1.5">
              <Label htmlFor="source-url">{t('form.url')}</Label>
              <Input
                id="source-url"
                type="url"
                required
                placeholder={t('form.urlPlaceholder')}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <Button type="button" variant="outline" size="lg" onClick={detect} disabled={!url.trim() || busy !== null}>
              {spinner('detect') ?? <ScanSearch aria-hidden />}
              {busy === 'detect' ? t('form.detecting') : t('form.detect')}
            </Button>
          </div>

          {detection && (
            <Alert role="status">
              <AlertDescription className="flex flex-wrap items-center gap-2 text-foreground">
                <SourceTypeBadge type={detection.type} />
                <span className="break-all">
                  {detection.type === 'rss' ? t('form.feedFound', { url: detection.feedUrl ?? '' }) : t('form.noFeed')}
                </span>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="source-name">{t('form.name')}</Label>
            <Input id="source-name" placeholder={t('form.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <Collapsible open={advanced} onOpenChange={setAdvanced} className="flex flex-col gap-3">
            <CollapsibleTrigger asChild>
              <Button type="button" variant="link" className="h-auto self-start p-0">
                <ChevronRight className={cn('transition-transform', advanced && 'rotate-90')} aria-hidden />
                {t('form.advanced')}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-4 rounded-lg border border-dashed p-4">
              <div className="flex max-w-xs flex-col gap-1.5">
                <Label htmlFor="source-type">{t('form.type')}</Label>
                <Select value={type || AUTO} onValueChange={(v) => setType(v === AUTO ? '' : (v as SourceType))}>
                  <SelectTrigger id="source-type" aria-label={t('form.type')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {!editing && <SelectItem value={AUTO}>{t('form.type.auto')}</SelectItem>}
                    <SelectItem value="rss">{t('form.type.rss')}</SelectItem>
                    <SelectItem value="html">{t('form.type.html')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {type === 'rss' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="source-feed">{t('form.feedUrl')}</Label>
                  <Input id="source-feed" type="url" value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} />
                </div>
              )}

              {type === 'html' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {SELECTOR_FIELDS.map((f) => (
                    <div key={f.key} className="flex flex-col gap-1.5">
                      <Label htmlFor={`sel-${f.key}`}>{t(f.label)}</Label>
                      <Input
                        id={`sel-${f.key}`}
                        className="font-mono"
                        placeholder={f.placeholder}
                        value={selectors[f.key] ?? ''}
                        onChange={(e) => setSelectors((s) => ({ ...s, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              )}

              {type && (
                <Button type="button" variant="secondary" className="self-start" onClick={testFetch} disabled={!url.trim() || busy !== null}>
                  {spinner('preview') ?? <FlaskConical aria-hidden />}
                  {busy === 'preview' ? t('form.testing') : t('form.test')}
                </Button>
              )}
            </CollapsibleContent>
          </Collapsible>

          {preview && (
            <div className="flex flex-col gap-1.5">
              <div className="text-xs text-muted-foreground">{t('form.preview', { n: preview.length })}</div>
              {preview.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('form.previewEmpty')}</p>
              ) : (
                <ul className="list-disc pl-5 text-sm">
                  {preview.map((item) => (
                    <li key={item.url}>
                      <a href={item.url} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">
                        {item.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!url.trim() || busy !== null}>
            {spinner('save')}
            {busy === 'save' ? t('common.saving') : t('form.save')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
