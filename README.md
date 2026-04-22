# Sulco

Curadoria de vinil para DJs. Espelha sua coleção do Discogs e deixa você
selecionar faixas, anotar BPM/tom/mood/contexto, e montar bags de set.

## Requisitos

- Node.js 20+
- npm 10+

## Instalação

```bash
npm install
```

## Banco de dados

```bash
# Criar schema
npm run db:push

# Popular com 30 discos de exemplo
npm run db:seed

# Ou limpar e recriar tudo
npm run db:reset
```

## Desenvolvimento

```bash
npm run dev
```

Abre em http://localhost:3000

## Estrutura

```
src/
  app/
    page.tsx              → / coleção
    disco/[id]/page.tsx   → /disco/:id curadoria
    sets/page.tsx         → /sets lista
    sets/novo/page.tsx    → /sets/novo criar
    sets/[id]/page.tsx    → /sets/:id visualizar
    sets/[id]/montar/     → /sets/:id/montar montar com filtros
  db/
    schema.ts             → schema Drizzle (records, tracks, sets...)
    index.ts              → cliente do banco
    seed.ts               → 30 discos de exemplo
  lib/
    actions.ts            → Server Actions (toggle, update, add/remove)
    utils.ts              → helpers
```

## Próximos passos

- [ ] Integração real com Discogs API (token pessoal + sync incremental)
- [ ] Briefing inteligente com IA (Anthropic API + embeddings)
- [ ] PWA / mobile
- [ ] Localização física de discos por prateleira
