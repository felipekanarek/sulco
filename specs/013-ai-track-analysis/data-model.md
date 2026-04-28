# Data Model — Inc 13

## Schema delta

### `tracks` table — 1 coluna nova

```ts
// src/db/schema.ts (dentro de sqliteTable('tracks', { ... }))

aiAnalysis: text('ai_analysis'),
```

Posicionar logo após `comment` (zona AUTHOR agrupada). **Nullable**.
Default null = "sem análise gerada".

### Migração

**Local** (dev):
```bash
sqlite3 sulco.db "ALTER TABLE tracks ADD COLUMN ai_analysis TEXT;"
```

**Prod** (Turso): equivalente via `turso db shell sulco-prod` antes
do push.

Sem index — leitura é sempre por `track.id` (já indexado pela PK)
ou via JOIN com `records` (composite index existente).

## Invariantes

- **Multi-user isolation**: `ai_analysis` pertence a `tracks.id`,
  que pertence a `records.id`, que pertence a `users.id`. Toda
  ação que escreve ou lê valida ownership via JOIN.
- **Conteúdo opaco do servidor**: o servidor NÃO inspeciona/parsa
  `ai_analysis` — é texto livre. Apenas persiste, lê e renderiza.
- **NULL == "sem análise"**: jamais usar string vazia. Edição
  manual que zera o texto vira `NULL` (Decisão 6 do research).

## Entidade derivada

### `TrackData` (em `<TrackCurationRow>`) — extensão

```ts
export type TrackData = {
  // ... campos existentes ...
  comment: string | null;
  aiAnalysis: string | null; // NOVO
  // ... resto ...
};
```

Atualizar query em [src/app/disco/[id]/page.tsx](../../src/app/disco/[id]/page.tsx)
pra incluir `aiAnalysis: tracks.aiAnalysis` no select que monta o
array de tracks.

## Side-effects das mutations

### `analyzeTrackWithAI(trackId)`
- Lê: track + record (via JOIN, pra ownership + montar prompt).
- Escreve: `tracks.ai_analysis` com texto retornado pelo provider.
- Revalida: `/disco/[id]` (id derivado do track).
- Invoca: `enrichTrackComment(userId, prompt)` do Inc 14.

### `updateTrackAiAnalysis(trackId, text)`
- Lê: track (via ownership check).
- Escreve: `tracks.ai_analysis` com `text` (ou `null` se string vazia).
- Revalida: `/disco/[id]`.

### Auditoria
Sem tabela de auditoria. Análises são re-geráveis e edições manuais
são responsabilidade do DJ.
