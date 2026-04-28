import type { Provider } from './types';

/**
 * Lista curada de modelos por provider. Revisar trimestralmente.
 * Modelo deprecado pelo provider exige PR de remoção + comunicação
 * aos DJs afetados (FUTURE).
 *
 * Última revisão: ver `MODELS_REVIEWED_AT`.
 */
export const MODELS_BY_PROVIDER: Record<Provider, readonly string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  anthropic: ['claude-haiku-4-5', 'claude-sonnet-4-6'],
  openai: ['gpt-4o-mini', 'gpt-4o'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  qwen: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
};

export const MODELS_REVIEWED_AT = '2026-04-28';

export const PROVIDER_LABELS: Record<Provider, string> = {
  gemini: 'Google Gemini',
  anthropic: 'Anthropic Claude',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  qwen: 'Alibaba Qwen',
};

export function isModelSupported(provider: Provider, model: string): boolean {
  return MODELS_BY_PROVIDER[provider].includes(model);
}
