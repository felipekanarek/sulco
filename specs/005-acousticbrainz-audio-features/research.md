# Phase 0 — Research: Audio features via AcousticBrainz (005)

**Data**: 2026-04-24
**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Consolida decisões técnicas pros unknowns deixados pela spec em
"Notas de implementação" e pelas clarificações da sessão. Cada decisão
fica com racional e alternativa rejeitada.

---

## 1. Cadeia de resolução: Discogs → MusicBrainz → AcousticBrainz

**Decisão**: Resolver MBID **por release do Discogs**, não por ISRC
faixa-a-faixa.

1. `records.discogsId` → MusicBrainz `GET /ws/2/release?query=discogs:{id}&fmt=json`
   — retorna zero ou mais releases MB. Pegar o primeiro match.
2. `GET /ws/2/release/{mbReleaseId}?inc=recordings&fmt=json` — retorna
   a lista de recordings (faixas MB) com título e posição.
3. Matching por `tracks.position` (Discogs) vs. MB medium/track number
   — reusa `compareTrackPositions` já existente pro 003.
4. MBID da recording vira `tracks.mbid`.
5. Para cada MBID, chamar AcousticBrainz `GET /api/v1/{mbid}/low-level`
   e `/high-level`. Combinar os dois numa estrutura interna.

**Racional**:
- Menos requisições: 1 busca MB + 1 fetch MB por *release* (não por
  faixa). Se release tem 10 faixas e a busca retorna todas, saímos
  com ~2 requests MB pra 10 MBIDs.
- ISRC em Discogs é mal estruturado (array `identifiers` no nível da
  release, com descrição free-text tentando indicar posição). Busca
  inversa por MBID é mais robusta.
- Cache natural por `discogsId` (global — um user pagar a resolução
  beneficia outros que tenham o mesmo disco; detalhe de implementação
  opcional, não obrigatório no MVP).

**Alternativas consideradas**:
- *ISRC-first (Discogs identifiers → MB /isrc/{isrc})*: cobertura
  pior por ISRC ausente ou mal associado em vinil. Rejeitado.
- *Barcode lookup (EAN/UPC)*: fallback plausível se `discogs:{id}`
  não retornar nada — mas barcode também falha em vinil antigo sem
  código. Fica como melhoria futura.

---

## 2. Storage de ISRC

**Decisão**: **NÃO persistir ISRC** neste incremento.

**Racional**:
- Cadeia escolhida não precisa de ISRC no caminho crítico.
- ISRC seria útil pro incremento 5b (preview Deezer). Melhor adicionar
  quando for usar — evita campo morto em `tracks`.
- Constituição III (schema = fonte da verdade): colunas só entram
  quando há consumidor ativo.

**Alternativas**:
- Persistir `tracks.isrc` agora pensando no 5b: rejeitado — YAGNI. Se
  5b usar uma estratégia diferente (ex. busca Deezer por artist+title),
  ISRC vira peso morto.

---

## 3. Conversão de tom pra Camelot (schema atual)

**Decisão**: **Converter na escrita**. Persistir em `tracks.musicalKey`
sempre no formato Camelot `1A..12A` (minor) / `1B..12B` (major).

**Racional**:
- `tracks.musicalKey` já é Camelot por decisão de 001 (FR-017b). UI
  de edição assume Camelot.
- Converter no render adicionaria complexidade em N pontos da UI
  (`/disco/[id]`, `/montar`, etc.). Converter uma vez na escrita é
  simples e local.

**Mapeamento** (AB `tonal.key_key` + `tonal.key_scale` → Camelot):

| Key (AB) | Major → Camelot | Minor → Camelot |
|---|---|---|
| C      | 8B  | 5A  |
| G      | 9B  | 6A  |
| D      | 10B | 7A  |
| A      | 11B | 8A  |
| E      | 12B | 9A  |
| B      | 1B  | 10A |
| F#/Gb  | 2B  | 11A |
| C#/Db  | 3B  | 12A |
| Ab/G#  | 4B  | 1A  |
| Eb/D#  | 5B  | 2A  |
| Bb/A#  | 6B  | 3A  |
| F      | 7B  | 4A  |

AcousticBrainz retorna key como string (ex. `"C"`, `"C#"`, `"Bb"`) e
scale como `"major"` / `"minor"`. Tabela estática em
`src/lib/acousticbrainz/camelot.ts`.

**Alternativas**:
- Armazenar em notação padrão (C major, etc.) e converter no render:
  quebraria o invariante atual da UI. Rejeitado.

---

## 4. Derivação de `energy` 1..5

**Decisão**: Usar **`highlevel.mood_aggressive.probability`** da
AcousticBrainz como proxy de energia, mapear `[0..1] → [1..5]` via
bucket fixo (`ceil(p*5)`, com `0` → `1`).

**Racional**:
- AB não tem um campo `energy` direto (conceito é da Spotify). Modelos
  de mood do AB high-level oferecem proxies.
- `mood_aggressive` tem correlação prática com "energia alta" em DJ-sets
  (acústico/calmo tendem a 1–2; agressivo tende a 4–5).
- Alternativa com derivação mais complexa (combinar `danceability` +
  `timbre` + BPM) é ajustável mas frágil. Começa simples.

**Alternativas**:
- Pular `energy` do pré-preenchimento neste incremento: considerado,
  mas tira ~25% do valor percebido. Rejeitado.
- Calcular `(aggressive + party) / 2`: soa bem mas dobra dependência.
  Fica como melhoria quando tivermos medição real do uso.

**Importante**: documentar na UI que o valor sugerido pode ser
impreciso e que o DJ tem autoridade (que aliás é o comportamento
default — basta editar).

---

## 5. Filtragem e vocabulário de `moods`

**Decisão** (confirmada em Q3 da sessão de clarify):
- Threshold **≥ 0.7** em `probability` no high-level.
- Gravar termos diretamente como vêm do AB (`happy`, `electronic`,
  `relaxed`, etc.), sem prefixo, sem tradução.
- Null-guard se aplica: só grava se `tracks.moods` for array vazio
  ou `null`.

**Moods considerados do AB high-level**:
`mood_acoustic`, `mood_aggressive`, `mood_electronic`, `mood_happy`,
`mood_party`, `mood_relaxed`, `mood_sad`, `danceability`, `tonal_atonal`.
`danceability` e `tonal_atonal` são omitidos da escrita (conceitos
tech, não são "moods" pro DJ). Os 7 restantes entram; cada um vira
a string após `mood_`: `acoustic`, `aggressive`, `electronic`, `happy`,
`party`, `relaxed`, `sad`.

**Trade-off aceito**: termos em inglês podem conviver temporariamente
com vocabulário pt-BR do DJ (`bailão`, `relaxante`, etc.) nos filtros
do `/montar`. DJ "adota" editando a faixa (que vira `manual` e
permite renomear no campo).

---

## 6. Gatilhos: cron diário + trigger imediato pós-sync

**Decisão** (confirmada em Q2 da sessão de clarify):

**(a) Cron diário** — estende `src/app/api/cron/sync-daily/route.ts`:
após `runDailyAutoSync(userId)` pra cada user, roda
`enrichUserBacklog(userId)` sequencialmente. Falha de `enrichUserBacklog`
NÃO bloqueia o cron do próximo user (try/catch agregador).

**(b) Trigger imediato** — estende `src/lib/discogs/apply-update.ts`:
após `INSERT` de novas faixas de um disco novo ou novo-em-update,
dispara `enrichRecord(userId, recordId)` em background:

```ts
// Node 20 runtime suporta `queueMicrotask` / `setImmediate`. Para
// fire-and-forget em Server Action / RSC, usamos:
enrichRecord(userId, recordId).catch((err) => {
  console.warn('[enrich] immediate trigger failed', { recordId, err });
});
// NÃO aguardar a promise (não bloqueia import).
```

**Racional**:
- Vercel permite `waitUntil()` pra estender execução de handler além
  da resposta, mas em Server Action dentro do request/response isso
  não se aplica diretamente. `fire-and-forget com catch` é suficiente
  pro SLA do Felipe (se falhar, cron do dia seguinte compensa).
- Em desenvolvimento local, a promise completa antes do processo
  morrer (Next.js dev server mantém process vivo).
- Em Vercel Serverless, a Lambda pode ser ceifada antes da promise
  resolver. Mitigação: fallback pelo cron + considerar migrar pra
  `after()` do Next 15 depois do MVP se isso virar problema
  observável.

**Alternativas**:
- Queue dedicada (Inngest, Vercel Queues): sobrecaria o MVP. Rejeitado.
- Bloquear o import aguardando enriquecimento: degrada UX. Rejeitado.

---

## 7. Política de retry e deduplicação

**Decisão**:

- `tracks.audioFeaturesSyncedAt` é atualizado **toda vez** que uma
  tentativa é feita (sucesso ou "não achou"), permitindo que o worker
  pule faixas tentadas recentemente.
- Critério de elegibilidade pra uma execução da rotina:
  ```sql
  WHERE audioFeaturesSource IS NULL        -- nunca enriquecida e nunca manual
    AND (audioFeaturesSyncedAt IS NULL
         OR audioFeaturesSyncedAt < now() - 30 days)
  ```
- Faixas com `source = 'acousticbrainz'` ficam elegíveis pra
  **não** ser retentadas (já resolveram uma vez). Se AB adicionar
  dados depois (improvável — congelado 2022), faixa só receberia
  upgrade via rebuild manual.
- Se MBID já foi resolvido (`tracks.mbid IS NOT NULL`) mas AB não
  tinha dados, marcamos `syncedAt` e seguimos. Só re-tentamos após
  janela de 30 dias.

**Racional**:
- 30 dias é cadência razoável. Menor seria ruído; maior seria esperar
  demais se fonte ganhar dados.
- Evita chamar MB/AB pra faixas já conhecidas como "sem dados".
- Mantém custo de network baixo em cron diário.

---

## 8. Rate limiting

**Decisão**:

- MusicBrainz: usar header `User-Agent: Sulco/0.1 ( marcus@infoprice.co )`
  (e-mail real no formato que MB pede pra considerar o cliente
  identificado). Rate limit efetivo de 1 req/s — manter gap de 1100ms
  entre calls sequenciais via `await sleep(1100)`.
- AcousticBrainz: sem rate limit documentado. Adotar mesmo User-Agent
  e ser gentil: 500ms entre calls.
- Concorrência: cron roda sequencial por user. Dentro de um user,
  processamento sequencial release-a-release.

**Racional**:
- Atender à ética das APIs abertas (MB é mantido por volunteers).
- Ritmo suficiente pros SCs (500 discos em 15 min assume ~1 release
  MB + 10 faixas AB = 11 requests × ~0.6s = 6.6s/disco). 500 discos
  × 6.6s ≈ 55 min — **excede o SC-005**. Ajustar expectativa ou
  dobrar tolerância via concorrência moderada.

**Ajuste**: SC-005 é aspiracional. Na prática, o cron diário rodando
continuamente cobre o acervo em 1–2 dias. Documentar isso em
`quickstart.md`.

---

## 9. Observabilidade (página /status)

**Decisão**: Adicionar bloco "Audio features" em
`/status` exibindo:
- Total de faixas ativas (selected=true + record ativo).
- Quantas com `bpm IS NOT NULL` (e por source: `acousticbrainz` vs.
  `manual` vs. `null`).
- Último `audioFeaturesSyncedAt` (max global do user).
- Contagem agregada da última execução da rotina (a partir de
  `syncRuns` com kind novo `audio_features` OU agregando sem novo
  kind — decisão simples: usar campo existente `newCount` /
  `errorMessage` de uma linha dedicada).

Nova entrada em enum `syncRuns.kind`: `'audio_features'` (migração
menor, aditiva).

**Alternativas**:
- Tabela nova `enrichmentRuns`: overkill pro MVP. Rejeitado. Reusar
  `syncRuns` mantém um único modelo de histórico.
- Sem persistência (só log): não atende FR-022 (timestamp da última
  execução bem-sucedida). Rejeitado.

---

## 10. Isolamento multi-user (SC-008)

**Decisão**: Rotina roda **por user**. Escrita tocando `tracks.id`
sempre via JOIN em `records` com `records.userId = :userId`.
Updates null-guardados incluem `WHERE records.userId = :userId`
explícito pra defesa em profundidade.

**Racional**:
- 002-multi-conta estabeleceu que `records.userId` é a linha de
  defesa. Replicamos o padrão.
- Cache eventual de MBID por `discogsId` pode ser compartilhado (MBID
  é global, não pertence a user específico), mas nunca se propaga
  pra `tracks` sem passar pelo filtro de ownership.

---

## Unknowns resolvidos

✅ Cadeia de resolução
✅ Storage ISRC (não persiste agora)
✅ Conversão Camelot (na escrita)
✅ Derivação energy (proxy via mood_aggressive)
✅ Filtragem moods (threshold 0.7, sem tradução)
✅ Gatilhos (cron + trigger imediato fire-and-forget)
✅ Retry policy (30 dias)
✅ Rate limiting (MB 1 req/s, AB 2 req/s)
✅ Observabilidade (bloco em /status, kind `audio_features` em syncRuns)
✅ Multi-user isolation (filtro em `records.userId` + JOIN seguro)

Nenhum NEEDS CLARIFICATION remanescente pra Phase 1.
