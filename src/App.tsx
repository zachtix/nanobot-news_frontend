import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
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

export function App() {
  return (
    <I18nProvider>
      <HealthProvider>
        <FetchStatusProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<NewsPage />} />
              <Route path="market" element={<MarketPage />} />
              <Route path="chart" element={<ChartPage />} />
              <Route path="sources" element={<SourcesPage />} />
              {/* Run history now lives on Sources and the schedule in Settings; keep old links working. */}
              <Route path="fetch" element={<Navigate to="/sources" replace />} />
              <Route path="ai-usage" element={<AiUsagePage />} />
              <Route path="accuracy" element={<AccuracyPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </FetchStatusProvider>
      </HealthProvider>
    </I18nProvider>
  );
}
