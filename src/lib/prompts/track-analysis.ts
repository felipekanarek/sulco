/**
 * Builder do prompt de análise de faixa via IA (Inc 013).
 *
 * Função pura, sem side-effects. Pode ser chamada de qualquer lugar
 * (Server Action, script, teste). NÃO declara `'server-only'`.
 *
 * Estrutura multi-linha:
 *   L1 essencial: identificação da faixa (artista, álbum, ano, título, posição)
 *   L2 contexto:  metadados Discogs + audio features (só campos não-nulos)
 *   L3 instrução: idioma, tamanho, tom, anti-hallucination
 */

export type TrackAnalysisPromptInput = {
  artist: string;
  album: string;
  year: number | null;
  trackTitle: string;
  position: string;
  genres: string[];
  styles: string[];
  bpm: number | null;
  musicalKey: string | null;
  energy: number | null;
};

export function buildTrackAnalysisPrompt(input: TrackAnalysisPromptInput): string {
  // L1 — essencial
  const yearStr = input.year ? ` (${input.year})` : '';
  const l1 = `${input.artist} - ${input.album}${yearStr} - ${input.trackTitle} (${input.position})`;

  // L2 — contexto adicional (só campos não-nulos)
  const ctx: string[] = [];
  if (input.genres.length) ctx.push(`Gêneros: ${input.genres.join(', ')}`);
  if (input.styles.length) ctx.push(`Estilos: ${input.styles.join(', ')}`);
  if (input.bpm) ctx.push(`BPM: ${input.bpm}`);
  if (input.musicalKey) ctx.push(`Tom: ${input.musicalKey}`);
  if (input.energy) ctx.push(`Energia: ${input.energy}/5`);
  const l2 = ctx.length ? ctx.join(' | ') : '(sem metadados adicionais)';

  // L3 — instrução
  const l3 =
    'Escreva uma análise técnica curta da faixa para ficha de curadoria ' +
    'de DJ. Em pt-BR, 3-5 frases, tom impessoal e direto. Cubra: ' +
    'características musicais relevantes (estrutura, dinâmica, ' +
    'instrumentação, andamento, intensidade), posição funcional em set ' +
    '(warm-up, pico, transição, encerramento) e referências de ' +
    'sonoridade que dialogam. Linguagem técnica e factual. Proibido: ' +
    'tom coloquial ou de conversa, vocativos ("brother", "mano"), ' +
    'adjetivos vazios ("incrível", "mágica", "imperdível"), construções ' +
    'como "trata-se de" ou "essa faixa é". Não inventar datas, ' +
    'gravações, formações ou colaborações. Se a faixa for desconhecida, ' +
    'analisar apenas com base nos metadados informados.';

  return `${l1}\n${l2}\n\n${l3}`;
}
