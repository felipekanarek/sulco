# Quickstart — Validar Inc 10 manualmente

Pré-requisitos:
- `npm run dev` em `localhost:3000`
- Conta logada com acervo populado (idealmente ≥2 estilos diferentes
  e ≥1 disco `unrated` por estilo)

## Cenário 1 — Filtro de estilo único (P1, US1)

1. Identificar um estilo que tenha ≥1 disco `unrated`:
   ```sql
   SELECT styles FROM records
     WHERE user_id=<ID> AND archived=0 AND status='unrated'
     LIMIT 5;
   ```
2. Acessar `/?style=<Estilo>` (ex: `/?style=Samba`).
3. Confirmar lista filtrada na home.
4. Clicar 🎲. **Esperado**: redirect para `/disco/[id]` cujo
   `records.styles` JSON contém "Samba".
5. Voltar e clicar 🎲 mais 5 vezes. **Esperado**: todos os 5 destinos
   têm "Samba" em `styles` (zero falso-positivo).

## Cenário 2 — Múltiplos filtros AND (P1, US2)

1. Acessar `/?style=MPB&q=caetano` (ou combinação que tenha matches).
2. Clicar 🎲. **Esperado**: destino satisfaz **ambos** os filtros:
   - `records.styles` contém "MPB"
   - `records.artist`/`title`/`label` contém "caetano" (case-insensitive)

## Cenário 3 — Filtro com bomba (P1, US2)

1. Acessar `/?bomba=only`.
2. Clicar 🎲. **Esperado**: redirect para disco que tem ≥1
   `tracks.is_bomb=true`. Confirmar via SQL:
   ```sql
   SELECT COUNT(*) FROM tracks WHERE record_id=<ID> AND is_bomb=1;
   -- > 0
   ```

## Cenário 4 — Empty state contextual (P2, US3)

1. Aplicar filtro estreito que comprovadamente zera unrated. Por
   exemplo, encontrar um estilo onde TODOS já estão avaliados:
   ```sql
   SELECT styles FROM records
     WHERE user_id=<ID> AND archived=0 AND status IN ('active','discarded')
     GROUP BY styles
     ORDER BY COUNT(*) DESC LIMIT 5;
   ```
2. Confirmar zero unrated naquele estilo:
   ```sql
   SELECT COUNT(*) FROM records
     WHERE user_id=<ID> AND archived=0 AND status='unrated'
       AND EXISTS (SELECT 1 FROM json_each(styles) WHERE value='<Estilo>');
   -- = 0
   ```
3. Acessar `/?style=<EstiloEscolhido>` e clicar 🎲.
4. **Esperado**: mensagem "Nenhum disco unrated com esses filtros."
   (NÃO a mensagem original "todos já foram avaliados").
5. Remover o filtro (`/`) e clicar 🎲 sem filtros.
6. **Esperado**: se ainda existe ≥1 unrated no acervo, redirect
   normal. Se 0 unrated globais, mensagem original "Não há discos
   pra triar — todos já foram avaliados.".

## Cenário 5 — Sem filtros (regressão, FR-007)

1. Acessar `/` sem nenhum query string.
2. Clicar 🎲 5 vezes. **Esperado**: cada destino é unrated, mas
   estilos/gêneros podem variar livremente (sorteio efetivamente
   aleatório global).

## Cenário 6 — Status filter ignorado (FR-002)

1. Acessar `/?status=active&style=Samba`.
2. Clicar 🎲. **Esperado**: cai num disco com `status='unrated'` e
   "Samba" em styles (status da URL ignorado, style respeitado).

## Smoke checks finais

- `npm run build` passa sem erros novos
- Tempo de resposta do clique ≤500ms (DevTools Network) em acervo de
  2500+ discos (SC-004)
- Console do browser sem warnings novos
