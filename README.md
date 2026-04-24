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

## Próximos passos

- [ ] Homologação ponta-a-ponta do sync Discogs (Phase 6) em condições reais
- [ ] Notificações por email (envio automático ao convidar) — ver CLAUDE.md
- [ ] Briefing inteligente com IA (Anthropic SDK + prompt caching)
- [ ] PWA / mobile (`next-pwa`, swipe em /curadoria)
- [ ] Playlists (blocos reutilizáveis) — schema pronto, UI fora do piloto
