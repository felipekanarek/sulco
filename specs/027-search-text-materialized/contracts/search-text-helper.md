# Contract — `computeRecordSearchText` helper + hooks

**Phase**: 1
**Tipo**: contrato de função interna (não API HTTP)
**Localização**: [src/lib/text.ts](../../src/lib/text.ts) (helper) + [src/lib/discogs/apply-update.ts](../../src/lib/discogs/apply-update.ts) e [src/lib/discogs/import.ts](../../src/lib/discogs/import.ts) (callsites)

## Contexto

Inc 32 introduz uma coluna materializada `records.search_text` que armazena versão pre-normalizada de campos textuais do Discogs. Este contrato define como a coluna é computada e em quais pontos é atualizada.

## `computeRecordSearchText(artist, title, label)`

**Assinatura**:
```ts
export function computeRecordSearchText(
  artist: string,
  title: string,
  label: string | null,
): string
```

**Comportamento**:
- Concatena `artist + ' ' + title + ' ' + (label ?? '')` (espaço separador entre cada campo).
- Aplica `normalizeText()` (Inc 18) sobre o resultado: `lowercase + NFD + replace(/\p{M}/gu, '')`.
- Retorna string normalizada.

**Determinístico**: mesma input → mesma output. Pode rodar múltiplas vezes sem divergir.

**Exemplo**:
```ts
computeRecordSearchText("João Gilberto", "Chega de Saudade", "Odeon")
// → "joao gilberto chega de saudade odeon"

computeRecordSearchText("Açúcar Amargo", "Vol. 1", null)
// → "acucar amargo vol. 1 "  // espaço extra no fim por causa do label vazio (irrelevante pro LIKE)
```

**Custo**: O(n) sobre tamanho da string. Trivial.

## Callsites obrigatórios

### 1. `applyDiscogsUpdate` — sync incremental

**Localização**: [src/lib/discogs/apply-update.ts](../../src/lib/discogs/apply-update.ts)

Esta função é chamada pelo sync incremental quando: (a) novo release detectado e fetch detalhado retorna metadata, (b) release existente com metadata atualizada.

**Mudança requerida**: ao montar payload de UPDATE/INSERT em `records`, computar `search_text` e incluir no payload.

**Pattern**:
```ts
import { computeRecordSearchText } from '@/lib/text';

const payload = {
  // ...campos Discogs existentes
  artist: incoming.artist,
  title: incoming.title,
  label: incoming.label,
  // ...
  search_text: computeRecordSearchText(incoming.artist, incoming.title, incoming.label),
};

await db.insert(records).values(payload).onConflictDoUpdate({...});
// ou await db.update(records).set(payload).where(...);
```

### 2. `runInitialImport` — import inicial

**Localização**: [src/lib/discogs/import.ts](../../src/lib/discogs/import.ts)

Esta função é chamada UMA vez por user (primeira sincronização da coleção Discogs). Itera todos os releases do user e insere em `records`.

**Mudança requerida**: ao montar payload de INSERT, computar `search_text`.

**Pattern**: idêntico ao callsite 1.

**Nota**: import inicial pode usar caminho de batch (insert múltiplos via `applyDiscogsUpdate`); se sim, refatorar a função batched suficiente — não precisa duplicar.

## Ordem de execução pós-deploy

1. **Migration prod**: `turso db shell sulco-prod` aplica `ALTER TABLE` + `CREATE INDEX`.
2. **Backfill prod**: `scripts/_backfill-search-text.mjs` com env de prod popula `search_text` pra todos records existentes.
3. **Code deploy**: merge branch + push → Vercel deploya código novo.

**Por que essa ordem**: se code deploy vier antes do backfill, queries `LIKE search_text` casam contra `''` em todos os records antigos → busca retorna 0 (regressão funcional grave).

Se for necessário interromper deploy entre 2 e 3 (improvável), records continuam com `search_text=''` mas hooks pós-deploy começam a popular novos records. Backfill captura os antigos.

## Validação

Pós-backfill, verificar via SQL:

```sql
SELECT COUNT(*) AS empty_count FROM records WHERE search_text = '';
```

Esperado: `0` (ou apenas casos edge conhecidos — ex: record com artist+title vazios é improvável).

## Estabilidade

- A assinatura `computeRecordSearchText(artist, title, label)` é considerada **estável** durante a vida da coluna.
- Mudança no algoritmo de normalização (`normalizeText`) requer re-backfill manual + spec separada.
- Refator interno (ex: incluir `country` em search_text) requer re-backfill + spec.
- Helper não é exportado para client components (ambos arquivos têm `'server-only'` ou são chamados em Server Actions/RSC).

## Como testar

Validação manual via [quickstart.md](../quickstart.md):
- Cenário 1: load `/?q=joao` retorna ≤ 50 rows lidas (paginação SQL).
- Cenário 2: search por "açúcar" encontra "Açúcar Amargo" (cobertura preservada).
- Cenário 3: search por "JOAO" encontra "João" (case-insensitive preservado).
- Cenário 4: pós-backfill, `SELECT COUNT(*) WHERE search_text=''` retorna 0.
- Cenário 5: sync adiciona record novo → `search_text` populado automaticamente.
