import { useCallback } from 'react';
import { ApiError, describeError } from '@/api/client';
import type { CreditPrices } from '@/api/types';
import { useHealth } from '@/context/HealthContext';
import { useI18n } from '@/i18n/I18nContext';
import { type MessageKey, messages, type Params } from '@/i18n/messages';

/** Until /api/health has answered (same defaults as the backend's CREDITS_* settings). */
const DEFAULT_PRICES: CreditPrices = { news: 1, chart: 1, market: 10 };

/** Credits (GAS) a customer pays per unlock, as the backend charges them. */
export function useCreditPrices(): CreditPrices {
  return useHealth()?.credits ?? DEFAULT_PRICES;
}

/** The Nanobot wallet's error code behind a failed unlock (e.g. E2001: not enough GAS), if any. */
export function chargeCode(err: unknown): string | null {
  const code = err instanceof ApiError ? (err.details as { code?: unknown } | undefined)?.code : undefined;
  return typeof code === 'string' ? code : null;
}

/** What to tell the customer about a wallet error code (its own message, or a generic one with the code). */
export function gasErrorText(t: (key: MessageKey, params?: Params) => string, code: string): string {
  const key = `gas.${code}`;
  return key in messages.th ? t(key as MessageKey) : t('gas.failed', { code });
}

/** Error text for anything that may have charged GAS: the wallet's code in words, otherwise the API's message. */
export function useErrorText(): (err: unknown) => string {
  const { t } = useI18n();
  return useCallback(
    (err: unknown) => {
      const code = chargeCode(err);
      return code ? gasErrorText(t, code) : describeError(err);
    },
    [t],
  );
}
