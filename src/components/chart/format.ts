/** A coin price with sensible precision: 63,250 · 151.32 · 0.0001234. */
export function formatPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  return n.toPrecision(4);
}

import { formatCredit } from '@/utils/format';

/** A total or an estimate: cents are enough from one cent up; tiny amounts keep their digits. */
export const formatCost = (n: number) => (n >= 0.01 ? `$${n.toFixed(2)}` : formatCredit(n));

export const signedPct = (n: number, digits = 1) => `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
