# Quickstart — Inc 21: Shelf picker

**Feature**: 020-shelf-picker-autoadd
**Audience**: Felipe (validação manual pós-implementação)

Pré-requisitos:
- App rodando (`npm run dev`) ou em prod.
- DB com pelo menos 5 prateleiras distintas em uso pelo user
  logado (`E1-P2`, `E2-P1`, `Z-Singles`, etc.).
- Pelo menos 1 disco SEM prateleira (`shelfLocation IS NULL`)
  e 1 disco COM prateleira pra testar reuso.

---

## Setup do estado

```sql
-- preparar prateleiras (substituir USER_ID)
UPDATE records SET shelf_location = 'E1-P2'
WHERE user_id = <USER_ID>
  AND id IN (SELECT id FROM records WHERE user_id = <USER_ID> LIMIT 1);

UPDATE records SET shelf_location = 'E2-P1'
WHERE user_id = <USER_ID>
  AND id IN (SELECT id FROM records WHERE user_id = <USER_ID> ORDER BY id LIMIT 1 OFFSET 1);

UPDATE records SET shelf_location = 'Z-Singles'
WHERE user_id = <USER_ID>
  AND id IN (SELECT id FROM records WHERE user_id = <USER_ID> ORDER BY id LIMIT 1 OFFSET 2);

-- 1 disco sem prateleira
UPDATE records SET shelf_location = NULL
WHERE user_id = <USER_ID>
  AND id IN (SELECT id FROM records WHERE user_id = <USER_ID> ORDER BY id LIMIT 1 OFFSET 3);
```

---

## Cenário 1 — Reusar prateleira existente (US1, FR-002/FR-006)

**Passos**:
1. Abrir `/disco/<ID_SEM_PRATELEIRA>` em desktop.
2. Localizar campo Prateleira no `<RecordControls>`.
3. Clicar no trigger.
4. Verificar lista: "— Sem prateleira —" no topo + as 3
   prateleiras alfabéticas (`E1-P2`, `E2-P1`, `Z-Singles`).
5. Digitar "e1" no input de busca.
6. Verificar que lista filtra para mostrar apenas `E1-P2`.
7. Clicar em `E1-P2`.

**Esperado**:
- Picker fecha imediatamente.
- Trigger button mostra "E1-P2" (otimistic).
- Após ~500ms (revalidação RSC), prop reflete o novo valor.
- SQL:
  ```sql
  SELECT shelf_location FROM records WHERE id = <ID_SEM_PRATELEIRA>;
  -- esperado: 'E1-P2'
  ```

---

## Cenário 2 — Criar nova prateleira on-the-fly (US2, FR-005/FR-007)

**Passos**:
1. Abrir `/disco/<ID_QUALQUER>` (mesmo disco do cenário 1 ou
   outro).
2. Clicar no trigger do picker.
3. Digitar `E5-P3` (termo que não existe).
4. Verificar que filtered list está vazia, mas item
   "+ Adicionar 'E5-P3' como nova prateleira" aparece como
   última opção da lista.
5. Clicar nesse item.

**Esperado**:
- Picker fecha; trigger mostra `E5-P3`.
- SQL: `shelf_location = 'E5-P3'` para aquele disco.
- Abrir `/disco/<OUTRO_ID>`; clicar no picker; verificar
  que `E5-P3` agora aparece na lista de sugestões (sem
  precisar digitar) — alfabética entre `E2-P1` e `Z-Singles`.

---

## Cenário 3 — Limpar prateleira (US3, FR-003/FR-008)

**Passos**:
1. Abrir disco com prateleira preenchida.
2. Clicar no trigger.
3. Verificar "— Sem prateleira —" como **primeiro** item.
4. Clicar nele.

**Esperado**:
- Picker fecha; trigger mostra placeholder ("ex: E3-P2").
- SQL: `shelf_location IS NULL`.

---

## Cenário 4 — Match exato suprime "+ Adicionar" (FR-005 / US2 #2)

**Passos**:
1. Picker aberto com `E1-P2` na lista.
2. Digitar "E1-P2" exatamente (case-sensitive match).

**Esperado**:
- `E1-P2` aparece na lista filtrada.
- Item "+ Adicionar 'E1-P2'" NÃO aparece (sem oferecer
  duplicação trivial).
- Clicar `E1-P2` salva normalmente.

---

## Cenário 5 — Casing diferente cria nova entrada (Edge Case)

**Passos**:
1. Picker aberto com `E1-P2` na lista.
2. Digitar `e1-p2` (case-sensitive diferente).

**Esperado**:
- Filtragem case-insensitive mostra `E1-P2` na lista (DJ
  vê visualmente que existe variante com case diferente).
- Item "+ Adicionar 'e1-p2' como nova prateleira" também
  aparece (porque match case-sensitive falha).
- DJ tem escolha consciente: clicar na canônica ou criar
  nova variante.
- Comportamento documentado em Edge Cases da spec
  (decisão "preserve casing").

---

## Cenário 6 — Trim de whitespace e termo vazio (FR-007 / US2 #4)

**Passos**:
1. Picker aberto, digitar apenas espaços `"   "`.
2. Verificar lista.
3. Limpar e digitar `"   E1-P2   "`.

**Esperado**:
- Termo só whitespace: "+ Adicionar" NÃO aparece.
- Termo com whitespace ao redor: filtragem ignora espaços
  (caso queira filtrar por substring); se DJ clicar
  "+ Adicionar", o termo persistido é `'E1-P2'` (trim).

---

## Cenário 7 — Limite de 50 caracteres (FR-009)

**Passos**:
1. Picker aberto.
2. Tentar digitar 51 caracteres.

**Esperado**:
- Input bloqueia além de 50 chars (`maxLength={50}`).
- Visualmente claro quando o limite é atingido (input
  para de aceitar caracteres).

---

## Cenário 8 — Lista vazia (Edge Case)

**Setup**: novo user (ou DJ que zerou prateleiras):
```sql
UPDATE records SET shelf_location = NULL WHERE user_id = <USER_ID>;
```

**Passos**:
1. Abrir `/disco/[id]` de qualquer disco.
2. Clicar no trigger.

**Esperado**:
- Lista mostra apenas "— Sem prateleira —" (primeiro item).
- Texto auxiliar abaixo: "Você ainda não tem prateleiras.
  Digite o nome da primeira."
- Ao digitar algum termo, "+ Adicionar 'X'" aparece e o
  texto auxiliar some.

---

## Cenário 9 — Mobile / Princípio V (FR-012 / SC-003)

**Passos**:
1. DevTools device toolbar: 375×667 (iPhone SE).
2. Abrir `/disco/[id]`.
3. Clicar no trigger do picker.
4. Verificar bottom sheet abre via `<MobileDrawer side="bottom">`:
   - Slide-up animation suave.
   - Backdrop ink/40 atrás.
   - Painel ocupa 100% da largura, max-h 80vh.
   - `pb-[env(safe-area-inset-bottom)]` respeita safe area do
     iPhone.
5. Inspecionar tap target dos itens da lista (Computed →
   height) — esperado ≥44 px.
6. Tocar `E1-P2`.
7. Repetir em viewport 390×844 (iPhone 14).

**Esperado**:
- Bottom sheet visível sem scroll horizontal.
- Tap target dos itens ≥44 px.
- Toque salva e fecha o sheet.
- ESC (no Mac com simulador) fecha sem salvar.

---

## Cenário 10 — Acessibilidade / teclado (FR-013)

**Passos**:
1. Desktop. Tab até o trigger button.
2. Pressionar Enter ou Space (esperado: abre picker).
3. Foco vai automaticamente pro input de busca.
4. Pressionar `↓` (seta baixo) repetidas vezes.
5. Pressionar Enter no item ativo.
6. Inspecionar atributos ARIA via DevTools.

**Esperado**:
- `aria-haspopup="listbox"` no trigger.
- `aria-expanded="true"` quando aberto.
- Input tem `role="combobox"` e
  `aria-controls="shelf-picker-listbox"`.
- `aria-activedescendant` aponta pra ID do item ativo
  conforme setas movem.
- ↓ avança; ↑ retrocede; Enter seleciona; Escape fecha.
- Leitor de tela (VoiceOver) anuncia "lista" e itens
  conforme navega.

---

## Cenário 11 — Multi-user isolation (FR-011 / SC-006)

**Setup**: 2 contas (DJ A e DJ B), cada um com prateleiras
distintas.

**Passos**:
1. Logar como DJ A. Abrir `/disco/[id]`. Verificar lista do
   picker mostra apenas prateleiras de DJ A.
2. Logar como DJ B. Mesmo teste — vê apenas prateleiras de B.

**Esperado**:
- Zero vazamento entre contas.
- SQL:
  ```sql
  SELECT user_id, COUNT(DISTINCT shelf_location) FROM records
  WHERE shelf_location IS NOT NULL GROUP BY user_id;
  ```
  Mostra contagem distinta por usuário, e o picker reflete
  apenas a contagem do user logado.

---

## Cenário 12 — Lista grande (Edge Case)

**Setup**: criar ~50 prateleiras únicas (script manual ou
script SQL).

**Passos**:
1. Abrir picker.
2. Verificar lista rola verticalmente.
3. Digitar 2 chars pra filtrar.

**Esperado**:
- Lista cabe em `max-h-[300px]` desktop / `max-h-[60vh]`
  mobile com scroll.
- Filtragem reduz lista pra subset visível instantaneamente.
- Sem regressão de performance perceptível.

---

## Cenário 13 — Race / sync entre discos (SC-004)

**Passos**:
1. Abrir `/disco/A` em uma aba.
2. Adicionar prateleira nova `Z-NEW` via picker.
3. Em outra aba, abrir `/disco/B`.
4. Clicar no picker de B.

**Esperado**:
- `Z-NEW` aparece na lista do disco B (após
  `revalidatePath('/disco/${id}')` na action existente +
  navegação fresh ao disco B).
- Tempo total ≤1s (SC-004).

---

## Cenário 14 — Erro de servidor (rollback otimistic)

**Setup**: parar Turso ou simular falha.

**Passos**:
1. Picker aberto. Clicar item.
2. Server falha.

**Esperado**:
- Trigger button volta visualmente ao valor anterior
  (`optimistic` reset pra `undefined`).
- Mensagem inline aparece próxima ao picker:
  "Falha ao salvar prateleira."
- Após ~5s, mensagem some.

---

## Encerramento

Cobertura mínima: cenários 1, 2, 3 + 9 (mobile) + 10 (a11y)
cobrem o caminho fundador. Cenários 4–8, 11–14 cobrem edge
cases e robustez.

Após validação, marcar feature pronta para commit / merge / deploy.
