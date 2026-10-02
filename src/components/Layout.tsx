import { Sparkles } from 'lucide-react';
import { Suspense, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { toast } from 'sonner';
import { PROVIDER_LABEL } from '@/lib/providers';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFetchStatus } from '@/context/FetchStatusContext';
import { useHealth } from '@/context/HealthContext';
import { useI18n } from '@/i18n/I18nContext';
import type { MessageKey } from '@/i18n/messages';
import { FetchNowButton } from './FetchNowButton';
import { LanguageMenu } from './LanguageMenu';
import { ThemeToggle } from './ThemeToggle';

const NAV: { to: string; label: MessageKey; end?: boolean }[] = [
  { to: '/', label: 'nav.news', end: true },
  { to: '/market', label: 'nav.market' },
  { to: '/sources', label: 'nav.sources' },
  { to: '/ai-usage', label: 'nav.aiUsage' },
  { to: '/accuracy', label: 'nav.accuracy' },
  { to: '/settings', label: 'nav.settings' },
];

export function Layout() {
  const { completedRun, error, clearError } = useFetchStatus();
  const { t } = useI18n();
  const health = useHealth();

  useEffect(() => {
    if (!completedRun) return;
    const r = completedRun;
    toast.success(
      t('fetch.done', { id: r.id, created: r.created, merged: r.merged, skipped: r.skipped }) +
        (r.translated ? t('fetch.doneTranslated', { translated: r.translated }) : '') +
        (r.errors ? t('fetch.doneErrors', { errors: r.errors }) : ''),
      { id: `run-${r.id}`, duration: 8000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedRun]);

  useEffect(() => {
    if (!error) return;
    toast.error(error.kind === 'conflict' ? t('fetch.alreadyRunning') : t('fetch.failed', { error: error.detail }), {
      id: 'fetch-error',
      onDismiss: clearError,
      onAutoClose: clearError,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const aiText = !health
    ? null
    : !health.ai.enabled
      ? t('ai.off')
      : health.ui?.showModel === false
        ? t('ai.onNoModel')
        : t('ai.on', { model: health.ai.model });

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <span className="size-2.5 rotate-45 rounded-xs bg-primary" aria-hidden />
            Crypto News Hub
          </div>
          <nav className="flex flex-wrap gap-1" aria-label="main">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-muted-foreground', isActive && 'bg-muted text-foreground')
                }
              >
                {t(item.label)}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <LanguageMenu />
            <ThemeToggle />
            {aiText && health && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant={health.ai.enabled ? 'info' : 'secondary'} className="h-7 gap-1 px-2.5">
                    <Sparkles aria-hidden />
                    {aiText}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {t(health.ai.enabled ? 'ai.onTitle' : 'ai.offTitle', { provider: PROVIDER_LABEL[health.ai.provider ?? 'openrouter'] })}
                </TooltipContent>
              </Tooltip>
            )}
            <FetchNowButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Suspense fallback={<Skeleton className="h-64 rounded-xl" aria-label={t('common.loading')} />}>
          <Outlet />
        </Suspense>
      </main>
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}
