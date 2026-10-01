import { describe, expect, it } from 'vitest';
import { accumulate, bucketLabel, bucketText, isHourly } from './UsageCharts';

describe('usage chart helpers', () => {
  it('turns per-bucket values into running totals per series (growth view)', () => {
    const data = [
      { date: 'd1', a: 1, b: 0 },
      { date: 'd2', a: 0, b: 2 },
      { date: 'd3', a: 3, b: null },
    ];
    expect(accumulate(data, ['a', 'b'])).toEqual([
      { date: 'd1', a: 1, b: 0 },
      { date: 'd2', a: 1, b: 2 },
      { date: 'd3', a: 4, b: 2 },
    ]);
    expect(data[1].a).toBe(0); // input untouched
  });

  it('labels day and hour buckets', () => {
    expect(bucketText('2026-10-01')).toBe('2026-10-01');
    expect(bucketText('2026-10-01T09')).toBe('2026-10-01 09:00');
    expect(bucketLabel('2026-10-01T09', 'en')).toBe('09:00');
    expect(bucketLabel('2026-10-01T09', 'en', true)).toBe('Oct 1 09:00');
    expect(bucketLabel('2026-10-01', 'en')).toBe('Oct 1');
    expect(isHourly([{ date: '2026-10-01T09' } as never])).toBe(true);
    expect(isHourly([{ date: '2026-10-01' } as never])).toBe(false);
  });
});
