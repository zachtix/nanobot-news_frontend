import type { ReactNode } from 'react';
import { useI18n } from '@/i18n/I18nContext';
import type { MessageKey } from '@/i18n/messages';

/** A small drawing of each mark, in the same colors and dashes the chart uses. */
const W = 26;
const H = 14;

const Swatch = ({ children }: { children: ReactNode }) => (
  <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="shrink-0">
    {children}
  </svg>
);

const hLine = (color: string) => (
  <Swatch>
    <line x1={1} x2={W - 1} y1={H / 2} y2={H / 2} stroke={color} strokeWidth={1.5} strokeDasharray="4 3" />
  </Swatch>
);

const dot = (color: string) => (
  <Swatch>
    <circle cx={W / 2} cy={H / 2} r={4} fill={color} />
  </Swatch>
);

const ITEMS: { key: MessageKey; mark: ReactNode }[] = [
  {
    key: 'chart.legend.candles',
    mark: (
      <Swatch>
        <line x1={8} x2={8} y1={1} y2={13} stroke="var(--up)" />
        <rect x={5} y={4} width={6} height={7} fill="var(--up)" />
        <line x1={18} x2={18} y1={1} y2={13} stroke="var(--down)" />
        <rect x={15} y={3} width={6} height={8} fill="var(--down)" />
      </Swatch>
    ),
  },
  { key: 'chart.legend.support', mark: hLine('var(--up)') },
  { key: 'chart.legend.resistance', mark: hLine('var(--down)') },
  {
    key: 'chart.legend.aiLine',
    mark: (
      <Swatch>
        <line x1={W / 2} x2={W / 2} y1={0} y2={H} stroke="var(--foreground)" strokeWidth={1.5} strokeDasharray="3 2" />
      </Swatch>
    ),
  },
  {
    key: 'chart.legend.after',
    mark: (
      <Swatch>
        <rect x={1} y={1} width={W - 2} height={H - 2} rx={2} fill="var(--muted)" stroke="var(--border)" />
      </Swatch>
    ),
  },
  { key: 'chart.legend.hit', mark: dot('var(--success)') },
  { key: 'chart.legend.miss', mark: dot('var(--danger)') },
  { key: 'chart.legend.pending', mark: dot('var(--muted-foreground)') },
];

/** What each line, band and dot on the analysis chart means. */
export function ChartLegend() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1.5 px-2 text-xs text-muted-foreground">
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label={t('chart.legend')}>
        {ITEMS.map((item) => (
          <li key={item.key} className="flex items-center gap-1.5">
            {item.mark}
            <span>{t(item.key)}</span>
          </li>
        ))}
      </ul>
      <p>{t('chart.legend.note')}</p>
    </div>
  );
}
