/**
 * Tipos compartilhados do módulo de IA (Inc 014/BYOK).
 */

export type Provider = 'gemini' | 'anthropic' | 'openai' | 'deepseek' | 'qwen';

/** Config completa em memória. NÃO retornar de Server Actions de leitura. */
export type AIConfig = {
  provider: Provider;
  model: string;
  apiKey: string;
};

/** Status público (sem chave). É o que páginas/componentes consomem. */
export type AIConfigStatus =
  | { configured: false }
  | { configured: true; provider: Provider; model: string };

export type AdapterErrorKind =
  | 'invalid_key'
  | 'invalid_model'
  | 'rate_limit'
  | 'timeout'
  | 'unknown';

export type AdapterError = {
  kind: AdapterErrorKind;
  message: string;
};

export type AIAdapter = {
  ping(args: { apiKey: string; model: string }): Promise<
    { ok: true } | { ok: false; error: AdapterError }
  >;
  enrichTrackComment(args: {
    apiKey: string;
    model: string;
    prompt: string;
  }): Promise<{ ok: true; text: string } | { ok: false; error: AdapterError }>;
};
