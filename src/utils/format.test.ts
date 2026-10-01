import { describe, expect, it } from 'vitest';
import { cronLabel, formatCredit, formatDuration, formatNumber, hostname, timeAgo } from './format';

describe('formatCredit / formatNumber', () => {
  it('keeps precision for tiny per-call costs and cents for balances', () => {
    expect(formatCredit(0.000284)).toBe('$0.000284');
    expect(formatCredit(0.0123)).toBe('$0.0123');
    expect(formatCredit(0.0042)).toBe('$0.0042');
    expect(formatCredit(0.5)).toBe('$0.50');
    expect(formatCredit(0.0000001)).toBe('$0.00');
    expect(formatCredit(37.5)).toBe('$37.50');
    expect(formatCredit(0)).toBe('$0');
    expect(formatCredit(-1.5)).toBe('-$1.50');
    expect(formatCredit(null)).toBe('-');
  });

  it('groups thousands', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  it('formats relative times in Thai', () => {
    expect(timeAgo('2026-10-01T11:59:30Z', 'th', now)).toBe('เมื่อสักครู่');
    expect(timeAgo('2026-10-01T11:45:00Z', 'th', now)).toBe('15 นาทีที่แล้ว');
    expect(timeAgo('2026-10-01T09:00:00Z', 'th', now)).toBe('3 ชม. ที่แล้ว');
    expect(timeAgo('2026-09-29T12:00:00Z', 'th', now)).toBe('2 วันที่แล้ว');
    expect(timeAgo(null, 'th', now)).toBe('-');
    expect(timeAgo('garbage', 'th', now)).toBe('-');
  });
});

describe('formatDuration', () => {
  it('formats seconds and minutes', () => {
    expect(formatDuration('2026-10-01T00:00:00Z', '2026-10-01T00:00:12Z')).toBe('12 วิ');
    expect(formatDuration('2026-10-01T00:00:00Z', '2026-10-01T00:02:05Z')).toBe('2 นาที 5 วิ');
    expect(formatDuration('2026-10-01T00:00:00Z', null)).toBe('-');
  });
});

describe('hostname / cronLabel', () => {
  it('extracts host without www', () => {
    expect(hostname('https://www.coindesk.com/x')).toBe('coindesk.com');
    expect(hostname('not a url')).toBe('not a url');
  });

  it('labels known presets and passes through custom cron', () => {
    expect(cronLabel('*/30 * * * *')).toBe('ทุก 30 นาที');
    expect(cronLabel('5 4 * * 1')).toBe('5 4 * * 1');
  });
});
