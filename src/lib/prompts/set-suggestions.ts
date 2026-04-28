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

const aiSuggestionsSchema = z
  .array(
    z.object({
      trackId: z.number().int().positive(),
      justificativa: z.string().trim().min(1).max(500),
    }),
  )
  .min(0)
  .max(20);

export type AISuggestion = z.infer<typeof aiSuggestionsSchema>[number];

const FENCED_RE = /```(?:json)?\s*(\[[\s\S]*?\])\s*```/i;
const INLINE_RE = /(\[\s*\{[\s\S]*\}\s*\])/;

export function parseAISuggestionsResponse(
  text: string,
): { ok: true; data: AISuggestion[] } | { ok: false; error: string } {
  let raw: string | null = null;

  const fenced = text.match(FENCED_RE);
  if (fenced) {
    raw = fenced[1];
  } else {
    const inline = text.match(INLINE_RE);
    if (inline) raw = inline[1];
  }

  if (!raw) {
    return { ok: false, error: 'Resposta sem bloco JSON detectável.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'JSON inválido na resposta do provider.' };
  }

  const validated = aiSuggestionsSchema.safeParse(parsed);
  if (!validated.success) {
    return { ok: false, error: 'Estrutura de resposta inesperada.' };
  }

  return { ok: true, data: validated.data };
}
