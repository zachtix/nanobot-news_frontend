import { ShieldX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';

/**
 * Shows its page (settings, news sources, AI usage) only to a Nanobot account with the ROOT / SENIOR / ADMIN role:
 * signed out → the login page (coming back here after), another role → a no-access card. The API checks again.
 */
export function RequireStaffRole({ children }: { children: ReactNode }) {
  return <RequireAccount staff>{children}</RequireAccount>;
}

/** Shows its page (market brief, chart analysis) to anyone signed in; signed out → the login page, back here after. */
export function RequireSignIn({ children }: { children: ReactNode }) {
  return <RequireAccount staff={false}>{children}</RequireAccount>;
}

function RequireAccount({ children, staff }: { children: ReactNode; staff: boolean }) {
  const { t } = useI18n();
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <Skeleton className="h-64 rounded-xl" aria-label={t('common.loading')} />;
  if (status === 'signedOut' || !user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!staff || user.isStaff) return <>{children}</>;

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldX className="size-5 text-destructive" aria-hidden />
          {t('auth.forbiddenTitle')}
        </CardTitle>
        <CardDescription>{t('auth.forbiddenHelp', { account: user.email ?? user.id, role: user.role })}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button variant="outline" asChild>
          <Link to="/login" state={{ from: location.pathname, switch: true }}>
            {t('auth.switchAccount')}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
