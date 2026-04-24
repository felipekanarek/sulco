# Quickstart — Validação manual do 005

Guia passo-a-passo pra validar visualmente e funcionalmente a feature
após implementação. Complementa os testes automatizados.

## Pré-requisitos

- `.env.local` com `CRON_SECRET`, `DATABASE_URL`, `DATABASE_AUTH_TOKEN`,
  `CLERK_*`, `MASTER_ENCRYPTION_KEY` (mesmo `.env` dos incrementos
  anteriores).
- Acervo com pelo menos **5 discos sincronizados** do Discogs, sendo
  ao menos 2 pós-1980 (mais chance de ter MBID).
- `npm run db:push` já rodou (schema com `mbid`, `audioFeaturesSource`,
  `audioFeaturesSyncedAt`).

## Caminho golden

### 1. Forçar enriquecimento de um disco recente

```bash
cd sulco
npx tsx scripts/enrich-record.ts <userId> <recordId>   # utilitário local
```

Ou, alternativamente, disparar pelo cron:

```bash
curl -X POST http://localhost:3000/api/cron/sync-daily \
  -H "authorization: Bearer $CRON_SECRET"
```

**Esperado**:
- Logs mostrando `MB resolved mbid=... for track N` pra cada faixa.
- Logs mostrando `AB fetched bpm=... key=... energy=...` OU
  `AB 404 no data` pra cada MBID.
- Atualização em `tracks.audioFeaturesSource = 'acousticbrainz'`
  pra faixas que tinham dado.

### 2. Verificar UI em `/disco/[id]`

Abrir um disco que foi enriquecido:

- [ ] Campo BPM mostra valor numérico (ex. 120).
- [ ] Campo Tom mostra notação Camelot (ex. "8A").
- [ ] Campo Energia mostra número 1–5.
- [ ] Moods em array (ex. `["happy", "electronic"]`) se thresh ≥0.7 passou.
- [ ] **Badge "sugestão · acousticbrainz"** aparece próximo ao bloco
  dos 4 campos.
- [ ] Hover/title do badge: "Valor sugerido por fonte externa…".

### 3. Validar Princípio I (SC-003)

**Setup**: escolher uma faixa cujo BPM foi sugerido.

1. Editar BPM manualmente (ex. de 120 → 121) e salvar.
2. Recarregar `/disco/[id]`.

**Esperado**:
- Badge "sugestão" **desapareceu** (source agora é `manual`).
- BPM = 121 (valor do DJ).
- `audioFeaturesSource = 'manual'` no banco.

3. Rodar `curl POST /api/cron/sync-daily` de novo.

**Esperado**:
- BPM continua 121. **Valor autoral nunca é tocado.**

### 4. Validar FR-006b (bloco congelado após edição)

**Setup**: faixa com `source = 'acousticbrainz'` e `musicalKey = NULL`
(AB não tinha tom mas tinha BPM). BPM sugerido.

1. Editar **apenas** o BPM (não tocar no tom).
2. `source` vira `manual`.
3. Rodar enriquecimento de novo.

**Esperado**:
- `musicalKey` continua `NULL` (não recebe sugestão porque source
  agora é `manual`).

### 5. Validar trigger imediato pós-import

**Setup**: adicionar um disco novo no Discogs pela UI web do Discogs
(ou pelo app dele). Aguardar ~10 min (ou rodar sync manual pra trazer).

1. Rodar `runManualSync` (botão "Sincronizar agora" em `/conta` se
   existir, ou endpoint).
2. Imediatamente abrir `/disco/[id]` do novo disco.

**Esperado (janela de alguns segundos)**:
- Faixas do disco novo já têm pelo menos BPM pré-preenchido.
- Se não apareceu na primeira visita: aguardar 5–10s (promise
  pendente), atualizar a página. Alternativamente, cron do dia
  seguinte fecha o gap.

### 6. Validar observabilidade

Abrir `/status`:

**Esperado**:
- Nova seção "Audio features" com:
  - Total de faixas.
  - Fração com BPM (ex. "87 de 312, 28%").
  - Breakdown "vindo de acousticbrainz" vs. "confirmadas" vs. "vazias".
  - "Última execução: 2026-04-24 04:12 · 142 faixas atualizadas".

### 7. Validar multi-user isolation (SC-008)

**Setup**: segundo user de teste com alguns discos próprios.

1. Rodar enrich apenas pro user 1.
2. Verificar `tracks` do user 2 (via query direta ou `/disco/[id]` do
   user 2).

**Esperado**:
- Tracks do user 2 com `audioFeaturesSource = NULL` e
  `audioFeaturesSyncedAt = NULL`. Zero mudança.

## Cenários de falha

### 7.1 MusicBrainz fora do ar

Simular: adicionar hostname fake em `/etc/hosts` apontando `musicbrainz.org`
pra `127.0.0.1`, ou usar `MB_BASE_URL=http://nao-existe` (variável de
override durante dev).

**Esperado**:
- Enriquecimento aborta silenciosamente pro user afetado.
- `/status` mostra última execução com `outcome='erro'` e
  `errorMessage='MB unreachable'`.
- **Sync Discogs diário continua funcionando normalmente.**

### 7.2 AcousticBrainz sem dados pro MBID

Disco obscuro sem dados no AB (comum em brasileiro antigo).

**Esperado**:
- `mbid` fica preenchido.
- `audioFeaturesSource` fica `NULL`.
- `audioFeaturesSyncedAt` atualiza.
- Faixa não é re-tentada antes de 30 dias.

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| Badge "sugestão" não aparece | Source = `manual` ou `NULL` | Verificar `tracks.audio_features_source` no banco |
| BPM sugerido sumiu após edição | Esperado (FR-012 + FR-006b) | Comportamento correto — edição = confirmação |
| Enrich demora horas | MB rate limit 1 req/s + acervo grande | Esperar cron diário cobrir ao longo dos dias |
| `energy = NULL` mesmo com AB retornando | `mood_aggressive.probability` ausente no payload | Normal pra faixas muito antigas; aceitar |
| Moods em inglês conflitam com filtros /montar | Esperado (convivência aceita) | DJ adota editando a faixa (vira `manual`) |

## SLA das validações

- Golden path (1 → 6) em <15 min com acervo pequeno.
- Cenários de falha (7.x) não-bloqueantes do release — validar pós-MVP.

## Status da homologação (2026-04-24)

Implementação do 005 concluída em dev (Phases 1–7, 40 tasks, 135 testes
verdes). **Homologação ponta-a-ponta pendente** — sessão dedicada
precisa rodar os passos 1 → 7 deste quickstart em ambiente com acesso
real a MusicBrainz + AcousticBrainz (rede aberta). Ver
`MEMORY.md` → `project_pending_homolog`.

Pré-requisitos pra homologação:
- `sulco.db` com acervo Discogs sincronizado (o ambiente dev atual
  tem 1183 records + 11544 tracks).
- Backfill já rodou (confirmado em dev; re-rodar em prod é idempotente).
- Acesso de rede sem bloqueio a `musicbrainz.org` e `acousticbrainz.org`.
