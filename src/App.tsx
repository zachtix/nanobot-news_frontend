import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireSignIn, RequireStaffRole } from './components/RequireStaffRole';
import { AuthProvider } from './context/AuthContext';
import { FetchStatusProvider } from './context/FetchStatusContext';
import { HealthProvider } from './context/HealthContext';
import { I18nProvider } from './i18n/I18nContext';
import { NewsPage } from './pages/NewsPage';

// The news page ships in the main bundle; the rest load on first visit (charts, combobox…).
const SourcesPage = lazy(() => import('./pages/SourcesPage').then((m) => ({ default: m.SourcesPage })));
const AiUsagePage = lazy(() => import('./pages/AiUsagePage').then((m) => ({ default: m.AiUsagePage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const MarketPage = lazy(() => import('./pages/MarketPage').then((m) => ({ default: m.MarketPage })));
const ChartPage = lazy(() => import('./pages/ChartPage').then((m) => ({ default: m.ChartPage })));
const AccuracyPage = lazy(() => import('./pages/AccuracyPage').then((m) => ({ default: m.AccuracyPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));

export function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <HealthProvider>
          <FetchStatusProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<NewsPage />} />
                {/* Anyone signed in: customers unlock briefs and charts with credits, administrators run them free. */}
                <Route
                  path="market"
                  element={
                    <RequireSignIn>
                      <MarketPage />
                    </RequireSignIn>
                  }
                />
                <Route
                  path="chart"
                  element={
                    <RequireSignIn>
                      <ChartPage />
                    </RequireSignIn>
                  }
                />
                {/* Administrators only (ROOT / SENIOR / ADMIN); the API checks the role too. */}
                <Route
                  path="sources"
                  element={
                    <RequireStaffRole>
                      <SourcesPage />
                    </RequireStaffRole>
                  }
                />
                {/* Run history now lives on Sources and the schedule in Settings; keep old links working. */}
                <Route path="fetch" element={<Navigate to="/sources" replace />} />
                <Route
                  path="ai-usage"
                  element={
                    <RequireStaffRole>
                      <AiUsagePage />
                    </RequireStaffRole>
                  }
                />
                <Route
                  path="accuracy"
                  element={
                    <RequireStaffRole>
                      <AccuracyPage />
                    </RequireStaffRole>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <RequireStaffRole>
                      <SettingsPage />
                    </RequireStaffRole>
                  }
                />
                <Route path="login" element={<LoginPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </FetchStatusProvider>
        </HealthProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
