import { z } from 'zod';
import type { Candidate } from '@/lib/queries/montar';

/**
 * Builder do prompt de sugestões de faixas pra um set (Inc 014).
 *
 * Função pura. Sem 'server-only' — testável de qualquer lugar.
 *
 * Estrutura multi-linha:
 *   L1 — briefing + metadados do set
 *   L2 — faixas atualmente no set (sem ceiling — todas vão)
 *   L3 — catálogo elegível (já truncado em 50 pelo caller)
 *   L4 — instrução pedindo JSON exclusivo
 */

export type SetSuggestionsPromptInput = {
  briefing: string | null;
  setName: string;
  eventDate: Date | null;
  location: string | null;
  setTracks: Array<{
    artist: string;
    title: string;
    position: string;
  }>;
  candidates: Candidate[];
};

const BRIEFING_MAX_CHARS = 2000;
const COMMENT_TRUNCATE = 80;
const ANALYSIS_TRUNCATE = 120;

function formatDateBR(d: Date | null): string {
  if (!d) return '(não definida)';
  // YYYY-MM-DD em UTC at-rest, exibe local (consistente com projeto)
  return d.toISOString().slice(0, 10);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

function formatCandidateLine(c: Candidate): string {
  const parts: string[] = [
    `trackId=${c.id}`,
    `${c.artist} - ${c.title} (${c.position})`,
  ];
  if (c.recordGenres.length) parts.push(`Gêneros: ${c.recordGenres.join(', ')}`);
  if (c.recordStyles.length) parts.push(`Estilos: ${c.recordStyles.join(', ')}`);
  if (c.bpm != null) parts.push(`BPM: ${c.bpm}`);
  if (c.musicalKey) parts.push(`Tom: ${c.musicalKey}`);
  if (c.energy != null) parts.push(`Energia: ${c.energy}/5`);
  if (c.moods.length) parts.push(`Mood: ${c.moods.join(',')}`);
  if (c.contexts.length) parts.push(`Contexto: ${c.contexts.join(',')}`);
  if (c.fineGenre) parts.push(`Subgênero: ${c.fineGenre}`);
  if (c.comment) parts.push(`Comentário: ${truncate(c.comment, COMMENT_TRUNCATE)}`);
  // aiAnalysis vive em tracks mas não está no tipo Candidate atualmente.
  // Quando Candidate ganhar aiAnalysis (refator futuro), adicionar aqui.
  return parts.join(' | ');
}

export function buildSetSuggestionsPrompt(input: SetSuggestionsPromptInput): string {
  // Truncar briefing pra evitar custo descontrolado (mitiga U1 do speckit.analyze)
  let briefing = input.briefing;
  if (briefing && briefing.length > BRIEFING_MAX_CHARS) {
    briefing = briefing.slice(0, BRIEFING_MAX_CHARS) + '… [truncado]';
  }

  const l1 = [
    '=== L1: Briefing do set ===',
    `Nome: ${input.setName}`,
    `Data: ${formatDateBR(input.eventDate)}`,
    `Local: ${input.location ?? '(não definido)'}`,
    '',
    `Briefing: ${briefing ?? '(sem briefing — usar metadados como única referência)'}`,
  ].join('\n');

  const l2Lines =
    input.setTracks.length === 0
      ? ['(set vazio — primeira sugestão)']
      : input.setTracks.map((t) => `- ${t.artist} - ${t.title} (${t.position})`);
  const l2 = [
    `=== L2: Faixas atualmente no set (${input.setTracks.length}) ===`,
    ...l2Lines,
  ].join('\n');

  const l3 = [
    `=== L3: Catálogo elegível (${input.candidates.length} candidatos) ===`,
    ...input.candidates.map(formatCandidateLine),
  ].join('\n');

  const l4 = [
    '=== L4: Instrução ===',
    'Você é um DJ experiente analisando um set em construção. Sugira',
    'faixas do "Catálogo elegível" (L3) que **complementem** as faixas',
    'atuais (L2) e atendam ao briefing (L1).',
    '',
    'Retorne EXCLUSIVAMENTE um array JSON com 5-10 objetos, no formato:',
    '',
    '```json',
    '[',
    '  {"trackId": 123, "justificativa": "Casa com X por Y"},',
    '  {"trackId": 456, "justificativa": "..."}',
    ']',
    '```',
    '',
    'NÃO escreva nada antes ou depois do bloco JSON.',
    '',
    'Regras:',
    '- Use trackIds APENAS do "Catálogo elegível" — não invente IDs.',
    '- NÃO sugira faixas que já estão em "Faixas atuais" (L2).',
    '- Cada justificativa em pt-BR, 1-2 frases curtas, perspectiva',
    '  técnica de DJ (uso em set, BPM/tom relevantes, sonoridades que',
    '  dialogam com o briefing ou com faixas atuais).',
    '- Priorize diversidade — não repita o mesmo artista 5 vezes.',
    '- Se catálogo for muito pequeno e fizer sentido só sugerir 3-4,',
    '  retorne menos. Mínimo 0 (array vazio se nada se aplica).',
  ].join('\n');

  return `${l1}\n\n${l2}\n\n${l3}\n\n${l4}`;
}

/* ============================================================
   parseAISuggestionsResponse — extração defensiva de JSON
   ============================================================ */

const aiSuggestionItemSchema = z.object({
  trackId: z.coerce.number().int().positive(),
  justificativa: z.string().trim().min(1).max(500),
});

const aiSuggestionsArraySchema = z.array(aiSuggestionItemSchema).min(0).max(20);

// Aceita também envelopes comuns que LLMs usam:
// { suggestions: [...] } | { sugestoes: [...] } | { tracks: [...] }
const aiSuggestionsEnvelopeSchema = z
  .object({
    suggestions: aiSuggestionsArraySchema.optional(),
    sugestoes: aiSuggestionsArraySchema.optional(),
    sugestões: aiSuggestionsArraySchema.optional(),
    tracks: aiSuggestionsArraySchema.optional(),
    data: aiSuggestionsArraySchema.optional(),
  })
  .transform((v) =>
    v.suggestions ?? v.sugestoes ?? v.sugestões ?? v.tracks ?? v.data ?? null,
  );

export type AISuggestion = z.infer<typeof aiSuggestionItemSchema>;

// Múltiplos extractors, do mais estrito ao mais flexível.
const EXTRACTORS: Array<{ name: string; re: RegExp }> = [
  // ```json [ ... ] ```  com fence fechado
  { name: 'fenced-json-array', re: /```(?:json|javascript)?\s*(\[[\s\S]*?\])\s*```/i },
  // ```json { ... } ```  com fence fechado
  { name: 'fenced-object', re: /```(?:json|javascript)?\s*(\{[\s\S]*?\})\s*```/i },
  // ```json [ ... ]  fence ABERTO (sem fechamento — caso comum quando
  // modelo corta no fim) — pega tudo entre fence inicial e último `]`
  { name: 'fenced-array-open', re: /```(?:json|javascript)?\s*(\[[\s\S]*\])/i },
  // [ ... ]  inline (sem fence nenhum). Greedy pra pegar até último ].
  { name: 'inline-array-greedy', re: /(\[\s*\{[\s\S]*\}\s*\])/ },
  // { ... }  inline (envelope sem fence)
  { name: 'inline-object', re: /(\{\s*"[\s\S]*\}\s*)/ },
];

/**
 * Fallback: extrai do primeiro `[` ao último `]` do texto.
 * Resgate quando todos os regex falham (ex: fence sem closing,
 * texto desalinhado, etc).
 */
function extractByBrackets(text: string): string | null {
  const firstOpen = text.indexOf('[');
  const lastClose = text.lastIndexOf(']');
  if (firstOpen === -1 || lastClose === -1 || lastClose <= firstOpen) return null;
  return text.slice(firstOpen, lastClose + 1);
}

/**
 * Recovery de array JSON parcial truncado: encontra o último objeto
 * `{...}` completo dentro do array e fecha o array com `]`.
 *
 * Útil quando provider trunca a resposta no meio de uma string
 * (`max_tokens` exhausted) — vimos isso com Gemini 2.5 Flash
 * em prompts grandes do Inc 014.
 *
 * Algoritmo: state machine que respeita strings e escapes pra
 * evitar contar `{`/`}` dentro de aspas como balanced brackets.
 */
function recoverPartialJSONArray(text: string): string | null {
  const firstOpen = text.indexOf('[');
  if (firstOpen === -1) return null;

  let depth = 0;
  let lastCompleteObjEnd = -1;
  let inString = false;
  let escape = false;

  for (let i = firstOpen + 1; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        lastCompleteObjEnd = i;
      }
    }
  }

  if (lastCompleteObjEnd === -1) return null;
  // Reconstrói array com objetos completos + fechamento
  return text.slice(firstOpen, lastCompleteObjEnd + 1) + ']';
}

function tryParseRaw(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function validateParsed(parsed: unknown): AISuggestion[] | null {
  // Tenta como array direto.
  const asArray = aiSuggestionsArraySchema.safeParse(parsed);
  if (asArray.success) return asArray.data;
  // Tenta como envelope.
  const asEnvelope = aiSuggestionsEnvelopeSchema.safeParse(parsed);
  if (asEnvelope.success && asEnvelope.data) return asEnvelope.data;
  return null;
}

export function parseAISuggestionsResponse(
  text: string,
): { ok: true; data: AISuggestion[] } | { ok: false; error: string } {
  // Estratégia 1: tentar parse do texto inteiro (modelos disciplinados)
  const fullParse = tryParseRaw(text.trim());
  if (fullParse) {
    const validated = validateParsed(fullParse);
    if (validated) return { ok: true, data: validated };
  }

  // Estratégia 2: extractors regex em ordem.
  for (const { re } of EXTRACTORS) {
    const m = text.match(re);
    if (!m) continue;
    const parsed = tryParseRaw(m[1] ?? m[0]);
    if (!parsed) continue;
    const validated = validateParsed(parsed);
    if (validated) return { ok: true, data: validated };
  }

  // Estratégia 3: extrai do primeiro `[` ao último `]`. Cobre casos
  // onde fence inicial veio mas closing não, ou texto tem prosa
  // antes/depois da array.
  const bracketed = extractByBrackets(text);
  if (bracketed) {
    const parsed = tryParseRaw(bracketed);
    if (parsed) {
      const validated = validateParsed(parsed);
      if (validated) return { ok: true, data: validated };
    }
  }

  // Estratégia 4 (último recurso): recovery de array parcial truncado.
  // Salva os objetos completos e descarta o último (corrompido).
  const recovered = recoverPartialJSONArray(text);
  if (recovered) {
    const parsed = tryParseRaw(recovered);
    if (parsed) {
      const validated = validateParsed(parsed);
      if (validated) {
        console.warn(
          '[ai/parse] recuperou JSON truncado, usando',
          validated.length,
          'objetos completos',
        );
        return { ok: true, data: validated };
      }
    }
  }

  // Falhou em tudo — log defensivo pra debug em prod.
  console.error(
    '[ai/parse] resposta não-parseável (primeiras 500 chars):',
    text.slice(0, 500),
  );

  return { ok: false, error: 'Estrutura de resposta inesperada.' };
}
