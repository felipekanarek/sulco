import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { AIAdapter, AdapterError } from '../types';

function mapAnthropicError(err: unknown): AdapterError {
  if (err instanceof Anthropic.AuthenticationError) {
    return { kind: 'invalid_key', message: 'Chave inválida ou revogada — reconfigure.' };
  }
  if (err instanceof Anthropic.NotFoundError) {
    return { kind: 'invalid_model', message: 'Modelo não disponível pra esta chave.' };
  }
  if (err instanceof Anthropic.RateLimitError) {
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

export const anthropicAdapter: AIAdapter = {
  async ping({ apiKey, model }) {
    try {
      const client = new Anthropic({ apiKey });
      await client.messages.create({
        model,
        max_tokens: 5,
        messages: [{ role: 'user', content: "Reply with 'ok'." }],
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: mapAnthropicError(err) };
    }
  },

  async enrichTrackComment({ apiKey, model, prompt }) {
    try {
      const client = new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model,
        // 2048 tokens — alinhado com Gemini (que precisa de budget alto
        // por causa de thinking tokens). Anthropic não tem thinking, mas
        // padronizar evita pegadinha futura.
        max_tokens: 2048,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = msg.content
        .filter((b) => b.type === 'text')
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
        .trim();
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: mapAnthropicError(err) };
    }
  },
};
