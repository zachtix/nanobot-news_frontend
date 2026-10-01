import type { LlmProvider } from '@/api/types';

export const PROVIDERS: LlmProvider[] = ['openrouter', 'anthropic'];

/** Brand names are not translated. */
export const PROVIDER_LABEL: Record<LlmProvider, string> = {
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
};

/** Where the remaining Anthropic credit can be seen (there is no API for it). */
export const ANTHROPIC_BILLING_URL = 'https://console.anthropic.com/settings/billing';
