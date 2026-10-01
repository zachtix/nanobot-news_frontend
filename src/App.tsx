import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { FetchStatusProvider } from './context/FetchStatusContext';
import { HealthProvider } from './context/HealthContext';
import { I18nProvider } from './i18n/I18nContext';
import { NewsPage } from './pages/NewsPage';

// The news page ships in the main bundle; the rest load on first visit (charts, combobox…).
const SourcesPage = lazy(() => import('./pages/SourcesPage').then((m) => ({ default: m.SourcesPage })));
const FetchPage = lazy(() => import('./pages/FetchPage').then((m) => ({ default: m.FetchPage })));
const AiUsagePage = lazy(() => import('./pages/AiUsagePage').then((m) => ({ default: m.AiUsagePage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const MarketPage = lazy(() => import('./pages/MarketPage').then((m) => ({ default: m.MarketPage })));

export function App() {
  return (
    <I18nProvider>
      <HealthProvider>
        <FetchStatusProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<NewsPage />} />
              <Route path="market" element={<MarketPage />} />
              <Route path="sources" element={<SourcesPage />} />
              <Route path="fetch" element={<FetchPage />} />
              <Route path="ai-usage" element={<AiUsagePage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </FetchStatusProvider>
      </HealthProvider>
    </I18nProvider>
  );
}
