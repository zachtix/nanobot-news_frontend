import { Check, ChevronsUpDown, CircleCheck, CircleX, KeyRound, Loader2, PlugZap, RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { api, describeError } from '@/api/client';
import type {
  AiSettings,
  AiSettingsPatch,
  ConnectionTestResult,
  ModelInfo,
  PromptExample,
  PromptName,
  SecretView,
  SettingsWarning,
} from '@/api/types';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PromptUserExample } from '@/components/PromptUserExample';
import { useRefreshHealth } from '@/context/HealthContext';
import { useI18n } from '@/i18n/I18nContext';
import { formatCredit, formatNumber } from '@/utils/format';

const PROMPTS: PromptName[] = ['dedup', 'translate', 'tag', 'analyze', 'market'];

type Notice = { kind: 'ok' | 'error'; text: string } | null;
type SaveFn = (patch: AiSettingsPatch) => Promise<boolean>;

export function SettingsPage() {
  const { t } = useI18n();
  const refreshHealth = useRefreshHealth();
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<SettingsWarning[]>([]);

  useEffect(() => {
    api.getAiSettings().then(setSettings, (err) => setLoadError(describeError(err)));
  }, []);

  /** Save a patch; returns true on success. Every section goes through here. */
  const save: SaveFn = async (patch) => {
    const res = await api.updateAiSettings(patch);
    setSettings(res.settings);
    setWarnings(res.warnings);
    if (patch.apiKey !== undefined || patch.model !== undefined || patch.showModel !== undefined) refreshHealth();
    return true;
  };

  if (loadError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }
  if (!settings) return <Skeleton className="h-64 rounded-xl" aria-label={t('common.loading')} />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('settings.subtitle')}</p>
      </div>

      {warnings.length > 0 && (
        <Alert role="alert" className="border-warning/40 bg-warning-bg text-warning">
          <TriangleAlert aria-hidden />
          <AlertDescription className="text-warning">
            <ul className="list-disc pl-4">
              {warnings.map((w) => (
                <li key={JSON.stringify(w)}>{warningText(w, t)}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <DisplayCard settings={settings} save={save} />
      <KeysCard settings={settings} save={save} />
      <ModelCard settings={settings} save={save} />
      <PromptsCard settings={settings} save={save} />
    </div>
  );
}

function warningText(w: SettingsWarning, t: ReturnType<typeof useI18n>['t']): string {
  if (w.code === 'promptNoJson') return t('settings.warn.promptNoJson', { prompt: t(`settings.prompt.${w.prompt}`) });
  if (w.code === 'modelNoJson') return t('settings.warn.modelNoJson', { model: w.model });
  return t('settings.warn.modelNotFound', { model: w.model });
}

function SourceBadge({ source }: { source: SecretView['source'] }) {
  const { t } = useI18n();
  const variant = source === 'settings' ? 'info' : source === 'env' ? 'secondary' : 'warning';
  return <Badge variant={variant}>{t(`settings.source.${source}`)}</Badge>;
}

function useSaver(save: SaveFn) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const run = async (patch: AiSettingsPatch, after?: () => void) => {
    setBusy(true);
    setNotice(null);
    try {
      await save(patch);
      after?.();
      setNotice({ kind: 'ok', text: t('settings.saved') });
    } catch (err) {
      setNotice({ kind: 'error', text: describeError(err) });
    } finally {
      setBusy(false);
    }
  };
  return { busy, notice, run };
}

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p className={cn('text-sm', notice.kind === 'ok' ? 'text-success' : 'text-danger')} role={notice.kind === 'ok' ? 'status' : 'alert'}>
      {notice.text}
    </p>
  );
}

function TestResult({ result }: { result: ConnectionTestResult }) {
  const { t } = useI18n();
  const line = (ok: boolean, text: string) => (
    <li className={cn('flex items-start gap-2', ok ? 'text-success' : 'text-danger')}>
      {ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <span className="break-all">{text}</span>
    </li>
  );
  return (
    <ul className="flex flex-col gap-1 rounded-lg border bg-surface-sunken p-3 text-sm" aria-label={t('settings.test')}>
      {line(
        result.key.ok,
        result.key.ok
          ? t('settings.testKeyOk', {
              label: result.key.label ?? '-',
              remaining: result.key.limitRemaining == null ? '∞' : formatCredit(result.key.limitRemaining),
            })
          : t('settings.testKeyFail', { error: result.key.error ?? '-' }),
      )}
      {line(
        result.model.ok,
        result.model.ok
          ? t('settings.testModelOk', { model: result.model.id, ms: result.model.latencyMs ?? 0, cost: formatCredit(result.model.cost) })
          : t('settings.testModelFail', { model: result.model.id, error: result.model.error ?? '-' }),
      )}
    </ul>
  );
}

function useConnectionTest() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const test = async (candidate: { apiKey?: string; model?: string }) => {
    setTesting(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.testAiConnection(candidate));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setTesting(false);
    }
  };
  return { testing, result, error, test };
}

/** Display preferences: saved as soon as the switch is flipped. */
function DisplayCard({ settings, save }: { settings: AiSettings; save: SaveFn }) {
  const { t } = useI18n();
  const saver = useSaver(save);
  return (
    <Card role="region" aria-label={t('settings.displayTitle')}>
      <CardHeader>
        <CardTitle>{t('settings.displayTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="show-model">{t('settings.showModel')}</Label>
            <p className="text-sm text-muted-foreground">{t('settings.showModelHelp')}</p>
          </div>
          <Switch
            id="show-model"
            checked={settings.display.showModel}
            disabled={saver.busy}
            onCheckedChange={(checked) => saver.run({ showModel: checked })}
            aria-label={t('settings.showModel')}
          />
        </div>
        <NoticeLine notice={saver.notice} />
      </CardContent>
    </Card>
  );
}

function SecretRow({
  id,
  label,
  help,
  inputLabel,
  view,
  busy,
  onSave,
  onRemove,
  extra,
}: {
  id: string;
  label: string;
  help: string;
  inputLabel: string;
  view: SecretView;
  busy: boolean;
  onSave: (value: string, clear: () => void) => void;
  onRemove: () => void;
  extra?: (value: string) => React.ReactNode;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {view.masked && <code className="rounded-md border bg-muted px-2 py-0.5 font-mono text-xs">{view.masked}</code>}
        <SourceBadge source={view.source} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-64 flex-1 flex-col gap-1.5">
          <Label htmlFor={id}>{inputLabel}</Label>
          <Input id={id} type="password" autoComplete="off" placeholder="sk-or-v1-…" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <Button disabled={!value.trim() || busy} onClick={() => onSave(value.trim(), () => setValue(''))}>
          {busy ? t('common.saving') : t('common.save')}
        </Button>
        {extra?.(value.trim())}
        {view.source === 'settings' && (
          <ConfirmDialog
            trigger={
              <Button variant="destructive" disabled={busy}>
                <Trash2 aria-hidden />
                {t('settings.removeKey')}
              </Button>
            }
            title={t('settings.confirmRemoveKey')}
            confirmLabel={t('settings.removeKey')}
            destructive
            onConfirm={onRemove}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
}

function KeysCard({ settings, save }: { settings: AiSettings; save: SaveFn }) {
  const { t } = useI18n();
  const saver = useSaver(save);
  const conn = useConnectionTest();

  return (
    <Card role="region" aria-label={t('settings.apiTitle')}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-primary" aria-hidden />
          {t('settings.apiTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <SecretRow
          id="api-key"
          label={t('settings.apiKey')}
          help={t('settings.apiKeyHelp')}
          inputLabel={t('settings.newKey')}
          view={settings.apiKey}
          busy={saver.busy}
          onSave={(apiKey, clear) => saver.run({ apiKey }, clear)}
          onRemove={() => saver.run({ apiKey: null })}
          extra={(candidate) => (
            <Button variant="outline" disabled={conn.testing} onClick={() => conn.test(candidate ? { apiKey: candidate } : {})}>
              {conn.testing ? <Loader2 className="animate-spin" aria-hidden /> : <PlugZap aria-hidden />}
              {conn.testing ? t('settings.testing') : candidate ? t('settings.testNew') : t('settings.test')}
            </Button>
          )}
        />
        <Separator />
        <SecretRow
          id="mgmt-key"
          label={t('settings.mgmtKey')}
          help={t('settings.mgmtKeyHelp')}
          inputLabel={t('settings.newMgmtKey')}
          view={settings.managementKey}
          busy={saver.busy}
          onSave={(managementKey, clear) => saver.run({ managementKey }, clear)}
          onRemove={() => saver.run({ managementKey: null })}
        />
        <NoticeLine notice={saver.notice} />
        {conn.error && <p className="text-sm text-danger">{conn.error}</p>}
        {conn.result && <TestResult result={conn.result} />}
      </CardContent>
    </Card>
  );
}

/** Searchable OpenRouter model picker (shadcn Popover + Command). Free text is allowed too. */
function ModelPicker({ value, onChange, models }: { value: string; onChange: (v: string) => void; models: ModelInfo[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const custom = search.trim() && !models.some((m) => m.id === search.trim()) ? search.trim() : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id="model-id" variant="outline" role="combobox" aria-expanded={open} aria-label={t('settings.model')} className="w-full justify-between font-mono font-normal">
          <span className="truncate">{value || t('settings.modelPick')}</span>
          <ChevronsUpDown className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder={t('settings.modelSearch')} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{t('settings.modelNone')}</CommandEmpty>
            {custom && (
              <CommandGroup>
                <CommandItem
                  value={`custom:${custom}`}
                  onSelect={() => {
                    onChange(custom);
                    setOpen(false);
                  }}
                >
                  {t('settings.modelUseCustom', { model: custom })}
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {models.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.id} ${m.name}`}
                  onSelect={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('size-4', value === m.id ? 'opacity-100' : 'opacity-0')} aria-hidden />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-mono text-xs">{m.id}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {m.name}
                      {m.promptPrice !== null && ` · $${m.promptPrice.toFixed(2)} / $${(m.completionPrice ?? 0).toFixed(2)}`}
                      {!m.supportsJson && ` · ${t('settings.modelNoJsonBadge')}`}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ModelCard({ settings, save }: { settings: AiSettings; save: SaveFn }) {
  const { t } = useI18n();
  const [model, setModel] = useState(settings.model.value);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const saver = useSaver(save);
  const conn = useConnectionTest();

  useEffect(() => setModel(settings.model.value), [settings.model.value]);
  useEffect(() => {
    api.listModels().then(setModels, (err) => setModelsError(describeError(err)));
  }, []);

  const info = useMemo(() => models.find((m) => m.id === model.trim()), [models, model]);
  const dirty = model.trim() !== settings.model.value;

  return (
    <Card role="region" aria-label={t('settings.modelTitle')}>
      <CardHeader>
        <CardTitle>{t('settings.modelTitle')}</CardTitle>
        <CardDescription>
          {t('settings.modelHelp')} · {t('settings.modelDefault', { model: settings.model.envDefault })}
        </CardDescription>
        <CardAction>
          <SourceBadge source={settings.model.source} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex max-w-xl flex-col gap-1.5">
          <Label htmlFor="model-id">{t('settings.model')}</Label>
          <ModelPicker value={model} onChange={setModel} models={models} />
        </div>
        {modelsError && <p className="text-sm text-danger">{t('settings.modelsError', { error: modelsError })}</p>}

        {info && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-surface-sunken px-3 py-2 text-sm" aria-label={info.name}>
            <strong>{info.name}</strong>
            {info.promptPrice !== null && info.completionPrice !== null && (
              <span>
                {t('settings.modelPrice', { input: `$${info.promptPrice.toFixed(2)}`, output: `$${info.completionPrice.toFixed(2)}` })}
              </span>
            )}
            {info.contextLength && <span className="text-muted-foreground">{t('settings.modelContext', { n: formatNumber(info.contextLength) })}</span>}
            <Badge variant={info.supportsJson ? 'success' : 'warning'}>
              {info.supportsJson ? t('settings.modelJson') : t('settings.modelNoJsonBadge')}
            </Badge>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button disabled={!dirty || !model.trim() || saver.busy} onClick={() => saver.run({ model: model.trim() })}>
            {saver.busy ? t('common.saving') : t('common.save')}
          </Button>
          <Button variant="outline" disabled={conn.testing || !model.trim()} onClick={() => conn.test({ model: model.trim() })}>
            {conn.testing ? <Loader2 className="animate-spin" aria-hidden /> : <PlugZap aria-hidden />}
            {conn.testing ? t('settings.testing') : t('settings.testModel')}
          </Button>
          {settings.model.source === 'settings' && (
            <Button variant="ghost" disabled={saver.busy} onClick={() => saver.run({ model: null })}>
              <RotateCcw aria-hidden />
              {t('settings.resetModel')}
            </Button>
          )}
        </div>

        <NoticeLine notice={saver.notice} />
        {conn.error && <p className="text-sm text-danger">{conn.error}</p>}
        {conn.result && <TestResult result={conn.result} />}
      </CardContent>
    </Card>
  );
}

function PromptsCard({ settings, save }: { settings: AiSettings; save: SaveFn }) {
  const { t } = useI18n();
  const [active, setActive] = useState<PromptName>('dedup');
  const [drafts, setDrafts] = useState<Record<PromptName, string>>(
    () => Object.fromEntries(PROMPTS.map((p) => [p, settings.prompts[p].value])) as Record<PromptName, string>,
  );
  const [showDefault, setShowDefault] = useState(false);
  const saver = useSaver(save);
  const [examples, setExamples] = useState<Record<PromptName, PromptExample> | null>(null);
  const [examplesError, setExamplesError] = useState<string | null>(null);

  useEffect(() => {
    api.promptExamples().then(setExamples, (err) => setExamplesError(describeError(err)));
  }, []);

  const current = settings.prompts[active];
  const draft = drafts[active];
  const dirty = draft !== current.value;
  const setDraft = (value: string) => setDrafts((d) => ({ ...d, [active]: value }));

  // Only the prompt being saved is touched, so unsaved edits in other tabs survive.
  const saveDraft = async () => {
    const name = active;
    const value = draft.trim(); // the server stores prompts trimmed
    await saver.run({ prompts: { [name]: value } }, () => setDrafts((d) => ({ ...d, [name]: value })));
  };
  const reset = async () => {
    await saver.run({ prompts: { [active]: null } }, () => setDraft(current.defaultValue));
  };

  return (
    <Card role="region" aria-label={t('settings.promptsTitle')}>
      <CardHeader>
        <CardTitle>{t('settings.promptsTitle')}</CardTitle>
        <CardDescription>{t('settings.promptsHelp')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs
          value={active}
          onValueChange={(v) => {
            setActive(v as PromptName);
            setShowDefault(false);
          }}
        >
          <TabsList aria-label={t('settings.promptsTitle')} className="flex-wrap">
            {PROMPTS.map((p) => (
              <TabsTrigger key={p} value={p}>
                {t(`settings.prompt.${p}`)}
                {!settings.prompts[p].isDefault && <span className="size-1.5 rounded-full bg-primary" aria-hidden />}
              </TabsTrigger>
            ))}
          </TabsList>
          {PROMPTS.map((p) => (
            <TabsContent key={p} value={p} aria-label={t(`settings.prompt.${p}`)} className="flex flex-col gap-3 pt-3">
              {p === active && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={current.isDefault ? 'secondary' : 'info'}>
                      {current.isDefault ? t('settings.promptDefault') : t('settings.promptCustom')}
                    </Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t('settings.promptChars', { n: formatNumber(draft.length) })}
                    </span>
                  </div>
                  <Textarea
                    aria-label={t(`settings.prompt.${p}`)}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    spellCheck={false}
                    rows={18}
                    className="min-h-80 font-mono text-xs leading-relaxed"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button disabled={!dirty || !draft.trim() || saver.busy} onClick={saveDraft}>
                      {saver.busy ? t('common.saving') : t('common.save')}
                    </Button>
                    {dirty && (
                      <Button variant="ghost" onClick={() => setDraft(current.value)}>
                        {t('settings.discard')}
                      </Button>
                    )}
                    {!current.isDefault && (
                      <ConfirmDialog
                        trigger={
                          <Button variant="destructive" disabled={saver.busy}>
                            <RotateCcw aria-hidden />
                            {t('settings.resetPrompt')}
                          </Button>
                        }
                        title={t('settings.confirmResetPrompt', { name: t(`settings.prompt.${p}`) })}
                        confirmLabel={t('settings.resetPrompt')}
                        destructive
                        onConfirm={reset}
                      />
                    )}
                  </div>
                  {!current.isDefault && (
                    <Collapsible open={showDefault} onOpenChange={setShowDefault}>
                      <CollapsibleTrigger asChild>
                        <Button variant="link" className="h-auto p-0">
                          {showDefault ? t('settings.hideDefault') : t('settings.showDefault')}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <pre className="mt-2 max-h-80 overflow-auto rounded-md border border-dashed bg-surface-sunken p-3 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                          {current.defaultValue}
                        </pre>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                  <NoticeLine notice={saver.notice} />
                  {examples ? (
                    <PromptUserExample key={p} example={examples[p]} />
                  ) : examplesError ? (
                    <p className="text-sm text-danger">{t('settings.userMsg.loadError', { error: examplesError })}</p>
                  ) : (
                    <Skeleton className="h-40" aria-label={t('common.loading')} />
                  )}
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

