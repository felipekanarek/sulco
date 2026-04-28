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
    'Escreva uma análise técnica curta da faixa, no formato de ficha ' +
    'de curadoria de DJ. Em pt-BR, 4-5 frases concisas, tom técnico-' +
    'curatorial ensaístico. Estrutura sugerida (sem listar como ' +
    'tópicos): (a) abre situando a faixa em micro-gênero/categoria ' +
    'específica ("Sophisti-pop brasileiro", "Soul instrumental ' +
    'orquestral", "Disco-funk de pista") e/ou definindo seu uso ' +
    'funcional (warm-up, sing-along, pico, transição, encerramento, ' +
    'slow-jam); (b) ancora em metadados concretos (BPM, tom, período, ' +
    'gêneros/estilos) e aponta o trunfo técnico — instrumentação, ' +
    'produção, dinâmica, vocais, linha de baixo, sintetizadores; (c) ' +
    'sugere artistas/faixas nominais para transição quando possível ' +
    '("transição fluida com Sade ou Marina Lima", "casa com Caetano ' +
    'fase 80"); senão, gêneros específicos ("baladas de MPB", "R&B ' +
    'contemporâneo"); (d) quando aplicável, oferece leituras duplas de ' +
    'uso (clássico para um público vs camp/vintage/re-edit para outro, ' +
    'set de "Brasilidades" vs Nu-Disco); (e) opcionalmente fecha com ' +
    'síntese funcional em uma linha ("Slow jam definitivo do pop ' +
    'nacional 80", "Coringa de pico para sets de soul"). Linguagem ' +
    'direta mas com permissão pra prosa de curadoria — expressões como ' +
    '"ferramenta estratégica", "trunfo técnico", "clímax dramático", ' +
    '"alto impacto emocional", "ímã emocional", "groove marcado" são ' +
    'bem-vindas quando ancoradas. Proibido: tom coloquial ou de papo ' +
    '("brother", "mano", "essa aqui"), vocativos, adjetivos vazios ' +
    'sem ancoragem técnica ("incrível", "mágica", "imperdível"), ' +
    'construções como "trata-se de" ou "essa faixa é". Não inventar ' +
    'datas, gravações, formações ou colaborações específicas. Se a ' +
    'faixa for desconhecida, analisar apenas com base nos metadados ' +
    'informados, sem especular biografia.';

  return `${l1}\n${l2}\n\n${l3}`;
}
