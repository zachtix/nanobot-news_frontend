import type { CreditPrices } from '@/api/types';
import { useHealth } from '@/context/HealthContext';

/** Until /api/health has answered (same defaults as the backend's CREDITS_* settings). */
const DEFAULT_PRICES: CreditPrices = { news: 1, chart: 1, market: 10 };

/** Credits a customer pays per unlock, as the backend charges them. */
export function useCreditPrices(): CreditPrices {
  return useHealth()?.credits ?? DEFAULT_PRICES;
}
