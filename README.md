# Sulco

Curadoria de vinil para DJs. Espelha sua coleção do Discogs e deixa você
selecionar faixas, anotar BPM/tom/energia/moods/contextos, marcar Bombas
💣, e montar bags de set com bag física derivada.

## Requisitos

- Node.js 20+
- npm 10+
- Conta Clerk (free tier cobre): https://dashboard.clerk.com
- Personal Access Token do Discogs: https://www.discogs.com/settings/developers

## Instalação

```bash
npm install
cp .env.example .env.local
# preencha as chaves da Clerk (pk + sk + webhook secret)
# MASTER_ENCRYPTION_KEY e CRON_SECRET podem ser gerados com:
#   openssl rand -base64 32
```

## Banco de dados

```bash
# criar/aplicar schema
npm run db:push

# popular seed de dev (5 discos + user fixture com clerkUserId 'user_seed_dev')
npm run db:seed

# limpar e recriar tudo
npm run db:reset
```

O seed só insere se o user `user_seed_dev` ainda não existe — idempotente.

## Desenvolvimento

```bash
npm run dev
```

Abre em http://localhost:3000. Sem login válido, redireciona pra `/sign-in`
da Clerk.

## Testes

```bash
npm test                     # vitest: unit + integração
npm run test:watch           # modo watch
npm run test:constitution    # gate FR-054 (Princípio I da Constituição)
npm run test:e2e             # playwright (exige dev rodando)
```

O gate `test:constitution` é executado em CI (`.github/workflows/ci.yml`) como
condição bloqueante de merge. Se qualquer código futuro fizer sync do Discogs
tocar campos autorais, o teste quebra e o PR não pode ser mergeado.

## Cron local

```bash
curl -X POST http://localhost:3000/api/cron/sync-daily \
  -H "authorization: Bearer $CRON_SECRET"
```

Em prod, a Vercel chama automaticamente às 07:00 UTC (04:00 America/Sao_Paulo)
conforme `vercel.json`.

## Convidados (002-multi-conta)

O Sulco roda em modo **invite-only** — só emails pré-aprovados conseguem
usar o app. Arquitetura: tabela `invites` no Turso + coluna
`users.allowlisted` + middleware que redireciona não-allowlisted pra
`/convite-fechado`.

**Gestão**: https://sulco.vercel.app/admin/convites (apenas owner).
Passo-a-passo detalhado em [docs/convites.md](./docs/convites.md).

**Owner**: definido pela env `OWNER_EMAIL` na Vercel. Primeiro user cujo
email verified bate com esse valor é promovido (travado por `clerkUserId`).
Apenas o owner acessa `/admin` e `/admin/convites`; demais recebem 404.

## Estrutura

Ver [CLAUDE.md](./CLAUDE.md) para stack, modelo de dados e regras de
negócio, e [specs/](./specs/) para spec, plan, data-model, contracts e
tasks de cada incremento:

- [001-sulco-piloto/](./specs/001-sulco-piloto/) — piloto single-user
- [002-multi-conta/](./specs/002-multi-conta/) — invite-only + allowlist + /admin
- [003-faixas-ricas-montar/](./specs/003-faixas-ricas-montar/) — candidatos ricos no /montar
- [005-acousticbrainz-audio-features/](./specs/005-acousticbrainz-audio-features/) — pré-preenchimento de BPM/tom/energia/moods via MusicBrainz → AcousticBrainz, respeitando Princípio I
- [006-curadoria-aleatoria/](./specs/006-curadoria-aleatoria/) — botão 🎲 sorteia disco unrated direto pro `/disco/[id]`

## Audio features (005)

Enriquecimento automático de faixas via catálogos públicos. Pipeline:

```
records.discogsId → MusicBrainz (1 req/s, UA Sulco/0.1 ( marcus@infoprice.co ))
                  → recordings MBID
                  → AcousticBrainz (/low-level + /high-level)
                  → tracks.{bpm,musicalKey,energy,moods}
```

Três camadas de proteção do Princípio I (campos autorais nunca
sobrescritos):

1. **Backfill one-shot** (`scripts/backfill-audio-features-source.ts`):
   marca toda track com audio features legadas como
   `audio_features_source='manual'` antes do primeiro enrich.
2. **Null-guard SQL**: `UPDATE ... WHERE audio_features_source IS NULL`
   no writer (`src/lib/acousticbrainz/write.ts`).
3. **COALESCE por campo**: valor existente é preservado mesmo em race.

Gatilhos: cron diário existente (`/api/cron/sync-daily`) + trigger
fire-and-forget pós-import/sync Discogs (`src/lib/discogs/apply-update.ts`).

Utilitários:

```bash
# Backfill (OBRIGATÓRIO antes do primeiro deploy em produção)
npx tsx scripts/backfill-audio-features-source.ts

# Enriquecer 1 disco ad-hoc (debug / quickstart)
npx tsx scripts/enrich-record.ts <userId> <recordId>
```

UI: badge "sugestão · acousticbrainz" aparece no `/disco/[id]` ao lado
das tags de bpm/tom/energia/moods quando a track ainda não foi
confirmada pelo DJ. Editar qualquer um dos 4 campos trava o bloco
inteiro (vira `'manual'`).

Observabilidade: seção "Audio features" em `/status` mostra cobertura
por campo (total + sugestão + confirmadas) + última execução.

## Roadmap & backlog

Lista priorizada de incrementos, bugs e ideias vive em
[BACKLOG.md](./BACKLOG.md).
