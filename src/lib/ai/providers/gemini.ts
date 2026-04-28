import 'server-only';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIAdapter, AdapterError } from '../types';

function mapGeminiError(err: unknown): AdapterError {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (
    lower.includes('api key not valid') ||
    lower.includes('api_key_invalid') ||
    lower.includes('permission denied') ||
    lower.includes('unauthorized') ||
    lower.includes('401') ||
    lower.includes('403')
  ) {
    return { kind: 'invalid_key', message: 'Chave inválida ou revogada — reconfigure.' };
  }
  if (
    lower.includes('not found') ||
    lower.includes('models/') ||
    lower.includes('404')
  ) {
    return { kind: 'invalid_model', message: 'Modelo não disponível pra esta chave.' };
  }
  if (lower.includes('quota') || lower.includes('rate') || lower.includes('429')) {
    return {
      kind: 'rate_limit',
      message: 'Limite de uso atingido — tente novamente em alguns minutos.',
    };
  }
  return {
    kind: 'unknown',
    message: 'Provider retornou erro: ' + msg.slice(0, 120) + '. Tente novamente.',
  };
}

export const geminiAdapter: AIAdapter = {
  async ping({ apiKey, model }) {
    try {
      const client = new GoogleGenerativeAI(apiKey);
      const m = client.getGenerativeModel({ model });
      await m.generateContent({
        contents: [{ role: 'user', parts: [{ text: "Reply with 'ok'." }] }],
        generationConfig: { maxOutputTokens: 5, temperature: 0 },
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: mapGeminiError(err) };
    }
  },

  async enrichTrackComment({ apiKey, model, prompt }) {
    try {
      const client = new GoogleGenerativeAI(apiKey);
      const m = client.getGenerativeModel({ model });
      // Gemini 2.5 Flash usa "thinking tokens" (raciocínio interno) que
      // consomem do maxOutputTokens. Por isso precisamos um budget bem
      // generoso (2048) — caso contrário o modelo "pensa" demais e o
      // texto final fica truncado mid-frase.
      const result = await m.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
      });
      const text = result.response.text();
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: mapGeminiError(err) };
    }
  },
};
