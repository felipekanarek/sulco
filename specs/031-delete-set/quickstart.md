# Quickstart — Inc 30 Excluir set

**Feature**: 031-delete-set
**Audience**: Mantenedor (validação manual)

## Pré-requisitos

- Inc 30 deployado em prod.
- Pelo menos 2 sets criados na conta (1 pra apagar + 1 pra confirmar paridade).

---

## Cenário 1 — Excluir set funciona (US1, SC-001/SC-002)

**Passos**:
1. Login como user X.
2. Criar set "Set Teste 30" via `/sets/novo`.
3. Adicionar 2-3 faixas via `/sets/[id]/montar`.
4. Voltar pra `/sets/[id]`.
5. Clicar "Excluir set" no header.
6. Confirmar prompt nativo do navegador.

**Esperado**:
- Prompt mostra: nome do set + aviso de irreversibilidade + nota de preservação de faixas.
- Após OK: redirect pra `/sets`.
- Lista `/sets` NÃO mostra mais "Set Teste 30".
- Tentativa de acessar URL antiga (ex: `sulco.vercel.app/sets/{id-deletado}`) → 404.

---

## Cenário 2 — Faixas/discos preservados (US1, SC-003)

**Passos**:
1. Antes do delete (cenário 1 passo 4), anotar:
   - 1 record_id que está no set.
   - 1 track_id selected nesse record.
   - moods/contexts da track.
2. Fazer delete (cenário 1).
3. Após delete: abrir `/disco/[record_id]`.
4. Verificar:
   - Disco ainda existe.
   - Track ainda está como `selected = true`.
   - Moods/contexts/BPM/key/etc. **inalterados**.

**Esperado**: 100% da curadoria preservada.

---

## Cenário 3 — Cancelar exclusão (US2)

**Passos**:
1. Em `/sets/[id]`, clicar "Excluir set".
2. Clicar Cancel no prompt.

**Esperado**:
- Nada acontece.
- Set permanece em `/sets`.
- URL atual permanece carregada.
- Botão volta a estar enabled.

---

## Cenário 4 — Botão disabled durante execução (US2, FR-011)

**Passos**:
1. Em `/sets/[id]`, clicar "Excluir set".
2. Confirmar prompt.
3. Antes da navegação completar, tentar clicar de novo no botão (provável que já navegou; tente em rede lenta via DevTools → Network → throttling).

**Esperado**: botão mostra "Excluindo…" e está disabled. Nenhuma duplicação.

---

## Cenário 5 — Multi-user isolation (US3, SC-004)

**Setup**: precisa 2 contas (DJ A e DJ B) no mesmo banco.

**Passos**:
1. DJ A cria set "Set A".
2. DJ A copia URL `/sets/{id-A}`.
3. Logout DJ A.
4. Login DJ B.
5. DJ B abre URL `/sets/{id-A}` colando no browser.

**Esperado**:
- Página retorna 404 (RSC `loadSet(B.userId, idA)` retorna null → `notFound()`).
- Botão "Excluir set" não é renderizado (página nem carrega).

---

## Cenário 6 — Performance (SC-005, SC-006)

**Passos**:
1. Em `/sets/[id]`, abrir DevTools → Network.
2. Clicar "Excluir set" + confirmar.
3. Anotar tempo da Server Action (POST).
4. Anotar contador "Rows Read" no Turso ANTES vs DEPOIS.

**Esperado**:
- Server Action completa em ≤500ms.
- Delta de rows lidas no Turso: ≤30 rows (DELETE atomic com cascade).

---

## Cenário 7 — Posicionamento em /montar também (FR-001)

**Passos**:
1. Criar novo set.
2. Ir direto pra `/sets/[id]/montar`.
3. Verificar que botão "Excluir set" está visível no header (próximo a "Editar set" Inc 16).

**Esperado**: paridade UX entre `/sets/[id]` e `/sets/[id]/montar`.

---

## Cenário 8 — Smoke geral (SC-008)

**Passos** (em sequência):
1. `/sets` (listagem) — funciona.
2. `/sets/novo` (criar) — funciona.
3. `/sets/[id]` (visualizar) — funciona.
4. `/sets/[id]/montar` (montar) — funciona.
5. `<EditSetModal>` (editar — Inc 16) — funciona.
6. Delete set (Inc 30 NOVO) — funciona.
7. Mobile (viewport ≤640px): `window.confirm` aparece fullscreen, tap target ≥44px (Princípio V).

**Esperado**: zero regressão.

---

## Encerramento

Cobertura mínima: cenários 1 (delete), 2 (preservação curadoria), 3 (cancel), 5 (multi-user), 8 (smoke).

Reversão se necessário:
```bash
git revert <commit-inc-30>
git push origin main
vercel --prod --yes
```
~3min. Sets físicamente deletados continuam deletados (backup do banco se necessário).
