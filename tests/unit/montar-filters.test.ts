import { describe, it } from 'vitest';

/**
 * T086 — Unit tests sobre o query builder de candidatos + derivação de bag.
 *
 * Exige fixture DB in-memory (`:memory:` via @libsql/client) + seed mínimo
 * com 2 users para garantir isolamento. Fica como iteração futura.
 */
describe.skip('queryCandidates — montar', () => {
  it.todo('AND entre moods: ["solar","denso"] → só faixas com AMBOS');
  it.todo('AND entre contexts: análogo a moods');
  it.todo('OR entre Camelot keys (multi): aparece se combina com QUALQUER um');
  it.todo('BPM range: gte/lte inclusivos');
  it.todo('Bomba tri-state: only filtra apenas isBomb=true; none filtra apenas false; any não filtra');
  it.todo('Texto livre: LIKE em título, artista, recordTitle, fineGenre');
  it.todo('FR-029a: addTrackToSet rejeita com mensagem ao atingir 300 faixas');
  it.todo('isolamento: user A nunca vê candidatos de user B');
});

describe.skip('derivePhysicalBag', () => {
  it.todo('1 disco com 3 faixas no set → bag tem 1 item, tracksInSet=3');
  it.todo('2 discos distintos → bag tem 2 itens em ordem de shelfLocation');
  it.todo('disco sem shelfLocation → ordenado depois dos com localização');
  it.todo('hasBomb=true se ALGUMA faixa do disco no set tem isBomb=true');
});
