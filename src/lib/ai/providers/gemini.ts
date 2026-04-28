import 'server-only';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIAdapter, AdapterError } from '../types';

function mapGeminiError(err: unknown): AdapterError {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  // Log defensivo: a mensagem original do SDK ajuda a debugar
  // mappings errados em produção (ver hotfix de 2026-04-28).
  console.error('[ai/gemini] error:', msg.slice(0, 300));

  // Auth/permissão — códigos HTTP 401/403 e mensagens explícitas.
  if (
    lower.includes('api key not valid') ||
    lower.includes('api_key_invalid') ||
    lower.includes('permission denied') ||
    lower.includes('[401') ||
    lower.includes('[403')
  ) {
    return { kind: 'invalid_key', message: 'Chave inválida ou revogada — reconfigure.' };
  }

  // Modelo não disponível — apenas 404 explícito ou texto literal
  // "model not found". NÃO confiar em substring "models/" porque
  // toda URL de erro do Gemini contém "/v1beta/models/<nome>".
  if (
    lower.includes('[404') ||
    lower.includes('model not found') ||
    lower.includes('is not found for api version')
  ) {
    return { kind: 'invalid_model', message: 'Modelo não disponível pra esta chave.' };
  }

  // Rate limit / quota.
  if (
    lower.includes('[429') ||
    lower.includes('quota exceeded') ||
    lower.includes('resource has been exhausted') ||
    lower.includes('rate limit')
  ) {
    return {
      kind: 'rate_limit',
      message: 'Limite de uso atingido — tente novamente em alguns minutos.',
    };
  }

  // MODO DIAGNÓSTICO TEMPORÁRIO: exibe mensagem CRUA do SDK ao DJ
  // pra identificar causa real do erro do Inc 014 reportado em prod.
  // Reativar mapping específico depois que o erro for diagnosticado.
  return {
    kind: 'unknown',
    message: '[DEBUG] ' + msg.slice(0, 800),
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
