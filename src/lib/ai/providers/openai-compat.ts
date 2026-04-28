import 'server-only';
import OpenAI from 'openai';
import type { AIAdapter, AdapterError, Provider } from '../types';

const BASE_URLS: Partial<Record<Provider, string>> = {
  openai: undefined as unknown as string, // default api.openai.com/v1
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
};

function buildClient(provider: Provider, apiKey: string): OpenAI {
  const baseURL = BASE_URLS[provider];
  return new OpenAI(baseURL ? { apiKey, baseURL } : { apiKey });
}

function mapOpenAIError(err: unknown): AdapterError {
  if (err instanceof OpenAI.AuthenticationError) {
    return { kind: 'invalid_key', message: 'Chave inválida ou revogada — reconfigure.' };
  }
  if (err instanceof OpenAI.NotFoundError) {
    return { kind: 'invalid_model', message: 'Modelo não disponível pra esta chave.' };
  }
  if (err instanceof OpenAI.RateLimitError) {
    return {
      kind: 'rate_limit',
      message: 'Limite de uso atingido — tente novamente em alguns minutos.',
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return {
    kind: 'unknown',
    message: 'Provider retornou erro: ' + msg.slice(0, 120) + '. Tente novamente.',
  };
}

/**
 * Factory: cria um AIAdapter ligado a um provider OpenAI-compatible
 * (OpenAI nativo, DeepSeek, Qwen). Diferença é apenas o `baseURL`.
 */
export function openaiCompatAdapter(provider: Provider): AIAdapter {
  return {
    async ping({ apiKey, model }) {
      try {
        const client = buildClient(provider, apiKey);
        await client.chat.completions.create({
          model,
          max_tokens: 5,
          temperature: 0,
          messages: [{ role: 'user', content: "Reply with 'ok'." }],
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: mapOpenAIError(err) };
      }
    },

    async enrichTrackComment({ apiKey, model, prompt }) {
      try {
        const client = buildClient(provider, apiKey);
        const completion = await client.chat.completions.create({
          model,
          // 800 tokens dá folga pras 3-4 frases pt-BR pedidas no prompt.
          max_tokens: 800,
          temperature: 0.7,
          messages: [{ role: 'user', content: prompt }],
        });
        const text = completion.choices[0]?.message?.content?.trim() ?? '';
        return { ok: true, text };
      } catch (err) {
        return { ok: false, error: mapOpenAIError(err) };
      }
    },
  };
}
