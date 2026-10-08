import { LogIn, LogOut, UserRound } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';

/** Header: "Sign in" when signed out, else the Nanobot account (email + role) with "Sign out". */
export function AccountMenu() {
  const { t } = useI18n();
  const { status, user, logout } = useAuth();
  const location = useLocation();

  if (status === 'loading') return null;
  if (!user) {
    if (location.pathname === '/login') return null;
    return (
      <Button variant="outline" size="sm" className="h-8" asChild>
        <Link to="/login" state={{ from: location.pathname }}>
          <LogIn aria-hidden />
          {t('auth.login')}
        </Link>
      </Button>
    );
  }

  const label = user.name ?? user.email ?? user.id;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 max-w-48 gap-1.5 px-2.5" aria-label={`${t('auth.account')}: ${label}`}>
          <UserRound aria-hidden />
          <span className="truncate text-xs font-semibold">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="truncate">{user.email ?? user.id}</span>
          <span className="text-xs font-normal text-muted-foreground">{t('auth.role', { role: user.role })}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut aria-hidden />
          {t('auth.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
