# Data Model: Faixas ricas na tela "Montar set" (003)

## Escopo

**Zero mudança de schema.** Nenhuma tabela, coluna, FK ou índice é
criado. Todos os campos expostos já estão em `src/db/schema.ts`
desde o piloto 001.

## Campos expostos

### tracks (existente, sem mudança de schema)

Campos já persistidos que passam a aparecer na tela de montagem:

| Campo         | Tipo                | Aparece em | Fonte |
|---------------|---------------------|------------|-------|
| rating        | integer 1-3 \| null | compact    | 001   |
| moods         | text[] (json)       | compact    | 001   |
| contexts      | text[] (json)       | compact    | 001   |
| fineGenre     | text \| null        | compact    | 001   |
| comment       | text \| null        | compact (trunc) + expandido (full) | 001 |
| isBomb        | boolean             | compact    | 001   |
| references    | text \| null        | expandido  | 001   |

### records (existente, sem mudança de schema)

Campos do disco-pai da faixa:

| Campo         | Tipo                | Aparece em | Fonte |
|---------------|---------------------|------------|-------|
| shelfLocation | text \| null        | expandido  | 001   |
| notes         | text \| null        | expandido  | 001   |

## Tipo de aplicação alterado

### Candidate (em `src/lib/queries/montar.ts`)

**Antes** (estado atual):

```typescript
export type Candidate = {
  id: number;
  position: string;
  title: string;
  duration: string | null;
  bpm: number | null;
  musicalKey: string | null;
  energy: number | null;
  rating: number | null;
  moods: string[];
  contexts: string[];
  fineGenre: string | null;
  comment: string | null;
  isBomb: boolean;
  recordId: number;
  artist: string;
  recordTitle: string;
  coverUrl: string | null;
  shelfLocation: string | null;
};
```

**Depois** (003):

```typescript
export type Candidate = {
  // ...todos os campos anteriores...
  references: string | null;  // NOVO
  recordNotes: string | null; // NOVO (notes do record pai)
};
```

**Invariantes**:
- Nenhum campo autoral é escrito aqui (query é read-only).
- `recordNotes` é explícito pra não confundir com possível `tracks.notes`
  (que não existe no schema).

## Estado de UI (novo, não persistido)

### CandidateCardState (local ao component)

Estado client-only, vive em `useState` do componente:

```typescript
type CandidateCardState = {
  expanded: boolean; // default false
};
```

**Invariantes**:
- `expanded` é por-candidato, não global.
- Não persiste em localStorage, cookie, URL, nem DB.
- Reset ao recarregar (F5) ou navegar out/in da rota.
- Não é propagado ao servidor — zero RSC revalidation de expand.

## Query affected

`queryCandidates(userId, setId, filters)` em `src/lib/queries/montar.ts`:

- SELECT expandido em 2 colunas: `tracks.references`, `records.notes`.
- Join já existente com `records` via `tracks.recordId = records.id`.
- Zero mudança nos filtros aplicados.

## Diagrama de relações (recap, sem mudança)

```text
users
  └─ records
      ├─ notes (EXPONDO AGORA)
      ├─ shelfLocation (já expunha)
      └─ tracks
          ├─ rating, moods, contexts (já expunha)
          ├─ fineGenre, comment (já expunha)
          ├─ isBomb (já expunha)
          └─ references (EXPONDO AGORA)
```

## Validação

Sem mudança de schema, sem migração. Validação pós-implementação:

1. `queryCandidates` retorna `references` e `recordNotes` em linhas onde
   os campos estão preenchidos no DB.
2. Filtragem da query continua funcionando (BPM, Camelot, rating range,
   moods AND, contexts AND, bomba, texto).
3. Teste integration cobre: seed de 2 users, um com track populando
   `references` + `notes`, verificar que aparece apenas pro user certo
   (invariante de isolamento preservada).
