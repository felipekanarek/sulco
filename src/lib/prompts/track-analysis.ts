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
    'Você é um DJ experiente conversando com outro DJ sobre essa faixa. ' +
    'Em pt-BR, escreva 3-5 frases curtas e diretas, com perspectiva ' +
    'prática de uso em set. Cubra de forma natural (sem listar como ' +
    'tópicos): (1) quando ela funciona — warm-up, pico, after, transição, ' +
    'fechamento; (2) que tipo de pista/público recebe bem; (3) com que ' +
    'sonoridades ela conversa, faixas ou artistas que casam antes ou ' +
    'depois. Use vocabulário de DJ — direto, sem floreio crítico nem ' +
    'literário, sem "trata-se de", sem adjetivos vazios ("incrível", ' +
    '"mágica"). Não invente datas, gravações ou colaborações. Se não ' +
    'conhecer a faixa, seja honesto e use só os metadados disponíveis.';

  return `${l1}\n${l2}\n\n${l3}`;
}
