import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  type IPrimitivePaneView,
  type ISeriesPrimitive,
  LineStyle,
  type SeriesAttachedParameter,
  type SeriesMarkerBar,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import type { Candle } from '@/api/types';
import { useI18n } from '@/i18n/I18nContext';
import { formatPrice } from './format';

/** Where a horizon ends and whether the call was right there (null = not known yet). */
export interface HorizonMark {
  at: number;
  label: string;
  hit: boolean | null;
}

interface Props {
  candles: Candle[];
  /** The analysis moment: candles before it are what the AI saw, after it is what happened. */
  at: number;
  /** End of the longest horizon (shaded up to here). */
  until: number;
  supports: number[];
  resistances: number[];
  horizons?: HorizonMark[];
  /** Show hours on the time axis (intraday candles). */
  intraday?: boolean;
  height?: number;
}

/**
 * The chart works in UTC; shifting every time by the local offset makes its axis and crosshair read in local time
 * (the rest of the app shows local times too).
 */
const toChartTime = (ms: number) => Math.floor((ms - new Date(ms).getTimezoneOffset() * 60_000) / 1000) as UTCTimestamp;

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Colors from the app's tokens (light or dark, whichever is on). */
function palette() {
  return {
    up: cssVar('--up'),
    down: cssVar('--down'),
    text: cssVar('--muted-foreground'),
    fg: cssVar('--foreground'),
    grid: cssVar('--border'),
    shade: cssVar('--muted'),
    success: cssVar('--success'),
    danger: cssVar('--danger'),
  };
}

/** A moment on the time axis: the candle it falls in and how far into that candle (0 = its open, 1 = its close). */
interface Moment {
  time: Time;
  frac: number;
}

/** Dashed vertical line at the analysis moment and a shaded band over what came after (what the AI did not see). */
class AnalysisWindow implements ISeriesPrimitive<Time> {
  private chart: SeriesAttachedParameter<Time>['chart'] | null = null;

  constructor(
    private readonly from: Moment,
    private readonly to: Moment | null,
    private readonly style: { line: string; shade: string; text: string; before: string; after: string },
  ) {}

  attached({ chart }: SeriesAttachedParameter<Time>) {
    this.chart = chart;
  }

  detached() {
    this.chart = null;
  }

  private readonly view: IPrimitivePaneView = {
    zOrder: () => 'bottom',
    renderer: () => ({
      draw: () => undefined,
      drawBackground: (target) =>
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
          const ts = this.chart?.timeScale();
          if (!ts) return;
          // At a candle's start plus a share of it (frac).
          const spacing = ts.options().barSpacing;
          const xOf = (m: Moment) => {
            const center = ts.timeToCoordinate(m.time);
            return center == null ? null : center - spacing / 2 + m.frac * spacing;
          };
          const x1 = xOf(this.from);
          if (x1 == null) return;
          const x2 = (this.to && xOf(this.to)) ?? mediaSize.width;
          ctx.save();
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = this.style.shade;
          ctx.fillRect(x1, 0, Math.max(0, x2 - x1), mediaSize.height);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = this.style.line;
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(x1) + 0.5, 0);
          ctx.lineTo(Math.round(x1) + 0.5, mediaSize.height);
          ctx.stroke();
          ctx.fillStyle = this.style.text;
          ctx.font = '11px system-ui, sans-serif';
          ctx.textBaseline = 'top';
          ctx.textAlign = 'right';
          ctx.fillText(this.style.before, x1 - 6, 8);
          ctx.textAlign = 'left';
          if (x2 - x1 > 60) ctx.fillText(this.style.after, x1 + 6, 8);
          ctx.restore();
        }),
    }),
  };

  paneViews() {
    return [this.view];
  }
}

/** TradingView Lightweight Charts: candles, the levels the AI named, and what happened after the call. */
export function CandleChart({ candles, at, until, supports, resistances, horizons = [], intraday = true, height = 360 }: Props) {
  const { t, lang } = useI18n();
  const { resolvedTheme } = useTheme();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || candles.length === 0) return;
    const c = palette();
    const locale = lang === 'th' ? 'th-TH' : 'en-US';
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: c.text,
        fontFamily: getComputedStyle(el).fontFamily,
        attributionLogo: false,
      },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.grid, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: c.grid, timeVisible: intraday, secondsVisible: false, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Normal },
      localization: {
        locale,
        priceFormatter: formatPrice,
        // Times are already shifted to local, so they are read back as UTC.
        timeFormatter: (time: Time) =>
          new Date((time as number) * 1000).toLocaleString(locale, {
            timeZone: 'UTC',
            dateStyle: 'medium',
            ...(intraday ? { timeStyle: 'short' as const } : {}),
          }),
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: c.up,
      downColor: c.down,
      borderUpColor: c.up,
      borderDownColor: c.down,
      wickUpColor: c.up,
      wickDownColor: c.down,
      priceLineVisible: false,
      // The last close's axis label looks just like a level's; only the levels get labels.
      lastValueVisible: false,
      priceFormat: { type: 'custom', formatter: formatPrice, minMove: 1e-8 },
    });
    series.setData(candles.map((k) => ({ time: toChartTime(k.openTime), open: k.open, high: k.high, low: k.low, close: k.close })));

    // Color alone tells support from resistance; a title on every line would crowd the price axis.
    for (const [prices, color] of [
      [supports, c.up],
      [resistances, c.down],
    ] as const) {
      for (const price of prices) series.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true });
    }

    // The candle a moment falls in (open ≤ moment < next open). Analyses are made on the hour, so on 4h and daily
    // charts the moment is often inside a candle: the AI saw only its first part (through the hourly candles).
    const step = candles.length > 1 ? candles[1].openTime - candles[0].openTime : 3_600_000;
    const candleAt = (ms: number) => candles.find((k) => k.openTime <= ms && ms < k.openTime + step);
    const momentAt = (ms: number): Moment | null => {
      const k = candleAt(ms);
      return k ? { time: toChartTime(k.openTime), frac: (ms - k.openTime) / step } : null;
    };
    // The line goes at the start of the candle the call fell in: every candle left of it was seen whole.
    // Hours of that candle seen through the 1h candles are named in the label instead of cutting the candle.
    const first = momentAt(at);
    if (first) {
      const seenHours = Math.round((first.frac * step) / 3_600_000);
      series.attachPrimitive(
        new AnalysisWindow({ time: first.time, frac: 0 }, momentAt(until), {
          line: c.fg,
          shade: c.shade,
          text: c.text,
          before: seenHours > 0 ? t('chart.aiSawPlus', { h: seenHours }) : t('chart.aiSaw'),
          after: t('chart.after'),
        }),
      );
    }

    // One marker on the candle each horizon ends in (on the daily chart several can share a candle).
    const byTime = new Map<number, SeriesMarkerBar<Time>>();
    horizons.forEach((h, i) => {
      const k = candleAt(h.at);
      if (!k) return;
      const time = toChartTime(k.openTime);
      const text = `${h.label}${h.hit == null ? '' : h.hit ? ' ✓' : ' ✗'}`;
      const prev = byTime.get(time);
      byTime.set(time, {
        time,
        // Alternate above / below so the 4h and 24h ends (close together) do not overlap.
        position: prev?.position ?? (i % 2 ? 'aboveBar' : 'belowBar'),
        shape: 'circle',
        color: h.hit == null ? c.text : h.hit ? c.success : c.danger,
        text: prev ? `${prev.text} · ${text}` : text,
      });
    });
    createSeriesMarkers(series, [...byTime.values()]);

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, at, until, supports, resistances, horizons, intraday, lang, resolvedTheme, t]);

  return <div ref={box} className="w-full" style={{ height }} role="img" aria-label={t('chart.chartLabel', { n: candles.length })} />;
}
