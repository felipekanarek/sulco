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
    'Escreva uma análise técnica curta da faixa, em pt-BR, 4-5 frases ' +
    'concisas, tom técnico e direto, como uma ficha pessoal de ' +
    'curadoria de DJ. A análise deve cobrir naturalmente, em prosa ' +
    'fluida (NÃO como tópicos): situar a faixa em gênero/sub-gênero ' +
    'específico, ancorar em metadados concretos (BPM, tom, período), ' +
    'descrever o que ela tem de notável tecnicamente (instrumentação, ' +
    'produção, dinâmica, vocais), apontar uso funcional em set ' +
    '(warm-up, pico, transição, encerramento, etc.) e sugerir ' +
    'transições com artistas ou faixas nominais quando possível.\n\n' +
    'CRÍTICO — evitar clichês: cada análise é única; NÃO repita as ' +
    'mesmas expressões em todas. Em particular, EVITE termos batidos ' +
    'como "ferramenta estratégica", "ímã emocional", "trunfo técnico", ' +
    '"alto impacto emocional", "clímax dramático", "apelo camp", ' +
    '"groove marcado", "obra-prima", "definitivo". Se for usar uma ' +
    'expressão de curadoria, que seja específica e ancorada em algo ' +
    'concreto da faixa, não fórmula reciclada.\n\n' +
    'Proibido: tom coloquial ("brother", "mano", "essa aqui"), ' +
    'vocativos, adjetivos vazios sem ancoragem ("incrível", "mágica", ' +
    '"imperdível"), construções como "trata-se de" ou "essa faixa é". ' +
    'Não inventar datas, gravações, formações ou colaborações ' +
    'específicas. Se a faixa for desconhecida, analisar com base ' +
    'apenas nos metadados informados, sem especular biografia.';

  return `${l1}\n${l2}\n\n${l3}`;
}
