# Research — Inc 30 / 031: Excluir set

**Phase**: 0
**Status**: low-risk feature. Decisões pré-acordadas pelo mantenedor.

## Decisão 1 — Hard delete vs. soft archive

**Decisão**: hard delete físico (`DELETE FROM sets WHERE id = ? AND user_id = ?`).

**Rationale**:
- Sets são metadata curatorial criada pelo DJ. Não há sync externo (Discogs) que exija proteção contra delete acidental.
- Princípio IV (Preservar) aplica-se a curadoria de tracks/records (acervo musical) — sets são apenas containers de organização.
- Soft-archive (coluna `archived` em sets) adicionaria filtro `WHERE archived = false` em todas as queries de listagem — overhead desnecessário pra operação rara.
- Recuperação fica via backup do banco (manual). Escala atual: 1-2 sets de teste por user.

**Alternativas consideradas**:
- **Soft-archive**: rejeitado por overhead em queries + DJ espera comportamento "apagar de vez".
- **Trash bin com TTL** (auto-delete após 30 dias): rejeitado por complexidade. Sem demanda real.

## Decisão 2 — `window.confirm` vs. modal custom

**Decisão**: `window.confirm` nativo do navegador.

**Rationale**:
- Fullscreen nativo em iOS/Android — Princípio V atendido sem CSS adicional.
- Texto da mensagem cobre os 3 pontos críticos: nome do set, preservação das faixas, irreversibilidade.
- Modal custom adicionaria 1 client component novo (~80 linhas) sem ganho funcional pra esta feature simples.
- Backlog tem item futuro "Modal de confirmação custom" pra unificar todos os `window.confirm` da app — fora de escopo do Inc 30.

**Alternativas consideradas**:
- **`<DeleteSetModal>` similar a `<EditSetModal>` (Inc 16)**: viável mas overkill. Modal custom é melhor quando há campos de input. Aqui é só sim/não.
- **Confirmação via "digite o nome do set pra confirmar"**: rejeitado — UX excessivamente custosa pra uma operação que o DJ provavelmente vai fazer rara mas conscientemente.

## Decisão 3 — Posicionamento do botão (`/sets/[id]` E `/sets/[id]/montar`)

**Decisão**: botão presente em AMBAS as rotas, no header próximo ao botão "Editar set" / `<EditSetModal>`.

**Rationale**:
- DJ pode estar em ambos os contextos (visualizando set OU montando set) e querer apagar.
- Paridade de UX entre as duas rotas evita "onde fica esse botão?".
- Mesma instância de `<DeleteSetButton>` em ambos — DRY.
- Custo: ~1 linha extra de import + `<DeleteSetButton ... />` em cada rota.

**Alternativas consideradas**:
- **Apenas em `/sets/[id]` (visualização)**: rejeitado — DJ que entrou direto em `/sets/[id]/montar` precisa voltar pra `/sets/[id]` pra apagar. UX ruim.
- **Apenas em `/sets/[id]/montar`**: rejeitado por motivo simétrico.

## Decisão 4 — Cascade FK existing

**Decisão**: confiar no `set_tracks.setId` `ON DELETE CASCADE` que já existe no schema (linha 215).

**Rationale**:
- Sem schema delta. Sem migration prod.
- DELETE em `sets` automaticamente limpa `set_tracks` correspondentes — atomicamente pelo SQLite.
- Tracks (`tracks`) NÃO são tocadas — o cascade só remove a relação N:N.

**Verificação**: `grep "onDelete" src/db/schema.ts | grep set_tracks` confirma.

## Decisão 5 — Server Action retorno + navegação

**Decisão**:
- Server Action retorna `{ ok: true } | { ok: false, error: string }` (mesmo shape de `createSet`/`updateSet` em actions.ts).
- Client component faz `router.push('/sets')` em sucesso, dentro do `useTransition` callback.
- `revalidatePath('/sets')` no Server Action garante que a lista re-fetcha sem cache stale.

**Rationale**:
- Pattern espelha `<EditSetModal>` Inc 16 (mesmo formato `ActionResult`).
- Navegação client-side via `router.push` é mais rápida que redirect server-side (que perde scroll position etc.).
- `revalidatePath` no server cobre o caso onde DJ navega de volta manualmente sem `router.push`.

## Decisão 6 — Ownership check

**Decisão**: `requireCurrentUser()` no início + `WHERE sets.userId = user.id` no DELETE.

**Rationale**:
- `requireCurrentUser` redireciona pra login se sessão inválida (mesmo padrão de outras Server Actions).
- WHERE clause garante que delete cross-user retorna 0 rows affected (set não existe ou não é do user).
- Resposta uniforme: "Set não encontrado" cobre ambos os casos (proteção contra info leak — atacante não distingue "não existe" de "existe mas não é seu").

## Decisão 7 — Comportamento pós-delete em outras abas

**Decisão**: aceito que abas com URL do set deletado fiquem stale. Ao tentar action no set deletado, falha gracefully.

**Rationale**:
- Real-time sync entre abas exige pub/sub (Pusher/SSE) — fora de escopo Sulco.
- `loadSet` retorna null → `notFound()` automático no próximo refresh.
- Server Actions em set deletado retornam erro normal — UX aceitável (rara).

## Resumo de decisões

| # | Decisão | Trade-off principal |
|---|---|---|
| 1 | Hard delete | Recuperação só via backup |
| 2 | `window.confirm` | Sem flexibilidade visual; pratico |
| 3 | Botão em ambas rotas | DRY via componente compartilhado |
| 4 | Cascade FK existing | Sem schema delta |
| 5 | router.push pós-sucesso | Navegação rápida client-side |
| 6 | Ownership via requireCurrentUser + WHERE userId | Resposta uniforme contra info leak |
| 7 | Sem real-time sync entre abas | Aceitável (rara) |
