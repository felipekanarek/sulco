import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { decryptSecret } from '@/lib/crypto';
import { geminiAdapter } from './providers/gemini';
import { anthropicAdapter } from './providers/anthropic';
import { openaiCompatAdapter } from './providers/openai-compat';
import type { AIAdapter, AIConfig, AIConfigStatus, Provider } from './types';

export function getAdapter(provider: Provider): AIAdapter {
  switch (provider) {
    case 'gemini':
      return geminiAdapter;
    case 'anthropic':
      return anthropicAdapter;
    case 'openai':
    case 'deepseek':
    case 'qwen':
      return openaiCompatAdapter(provider);
  }
}

/**
 * Lê o status público da config (sem chave). Uso em RSCs e UIs que
 * precisam decidir habilitação de botões dependentes.
 */
export async function getUserAIConfigStatus(userId: number): Promise<AIConfigStatus> {
  const [row] = await db
    .select({ provider: users.aiProvider, model: users.aiModel })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row || !row.provider || !row.model) {
    return { configured: false };
  }
  return { configured: true, provider: row.provider as Provider, model: row.model };
}

/**
 * Lê config completa (com chave decifrada). USO RESTRITO a invocações
 * reais ao provider (ping, enrichTrackComment). NUNCA retornar de
 * Server Action de leitura externa.
 */
export async function getUserAIConfig(userId: number): Promise<AIConfig | null> {
  const [row] = await db
    .select({
      provider: users.aiProvider,
      model: users.aiModel,
      keyEncrypted: users.aiApiKeyEncrypted,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row || !row.provider || !row.model || !row.keyEncrypted) return null;

  return {
    provider: row.provider as Provider,
    model: row.model,
    apiKey: decryptSecret(row.keyEncrypted),
  };
}

/**
 * Função pública — Inc 13 vai consumir ao implementar o botão de
 * enriquecer comment. Inc 14 entrega só a estrutura.
 */
export async function enrichTrackComment(
  userId: number,
  prompt: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const config = await getUserAIConfig(userId);
  if (!config) {
    return { ok: false, error: 'Configure sua chave em /conta antes de usar IA.' };
  }
  const adapter = getAdapter(config.provider);
  const result = await adapter.enrichTrackComment({
    apiKey: config.apiKey,
    model: config.model,
    prompt,
  });
  if (result.ok) return { ok: true, text: result.text };
  return { ok: false, error: result.error.message };
}
