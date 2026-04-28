/**
 * Smoke real do `enrichTrackComment` (Inc 014/BYOK, T022b).
 *
 * Uso:
 *   tsx -r scripts/_no-server-only.cjs scripts/_smoke-ai.mjs <userId>
 *
 * Pré-requisito: o DJ alvo precisa ter config de IA salva via UI
 * (`/conta` → Inteligência Artificial → Testar conexão). Sem isso,
 * a chamada retorna `{ ok: false, error: 'Configure sua chave...' }`.
 *
 * O script faz 1 chamada de geração real (não ping) com prompt de
 * teste musical. Não escreve nada no DB. Pode ser deletado após uso.
 */

import { enrichTrackComment } from '../src/lib/ai/index.ts';

const userId = Number(process.argv[2]);
if (!userId || Number.isNaN(userId)) {
  console.error('Uso: tsx -r scripts/_no-server-only.cjs scripts/_smoke-ai.mjs <userId>');
  process.exit(1);
}

const prompt =
  "Em 2-3 frases, em português, descreva a sensação musical de 'Águas de Março' " +
  "do Tom Jobim (MPB, 1972). Foque em mood/contexto/uso em set, sem biografia.";

console.log(`[smoke-ai] userId=${userId}`);
console.log(`[smoke-ai] prompt:\n${prompt}\n`);
console.log('[smoke-ai] chamando enrichTrackComment…');

const result = await enrichTrackComment(userId, prompt);

if (result.ok) {
  console.log('\n[smoke-ai] ✓ ok');
  console.log('[smoke-ai] resposta:\n');
  console.log(result.text);
} else {
  console.error('\n[smoke-ai] ✗ erro:', result.error);
  process.exit(2);
}
