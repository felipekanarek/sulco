# Research — Inc 15 (Editar briefing/set após criação)

## Decisão 1: fechar modal automaticamente ao salvar

**Decisão**: ao receber `{ ok: true }` do `updateSet`, fechar
modal automaticamente (`setOpen(false)`) e chamar `router.refresh()`
pra atualizar valores na página.

**Rationale**:
- Pattern padrão de "save and close" — DJ não precisa fechar
  manualmente após confirmar sucesso.
- `router.refresh()` re-fetch o RSC `/sets/[id]/montar/page.tsx`
  que carrega `set` novamente (briefing, name, etc).
- Erro inline mantém modal aberto pra DJ corrigir.

**Alternativas consideradas**:
- **Toast de sucesso + manter modal aberto**: redundante.
  Rejeitado.
- **Recarregar página inteira**: overkill, `router.refresh()` é
  específico ao Next.js e mais leve.

## Decisão 2: posição do botão "Editar set"

**Decisão**: botão no header de `/sets/[id]/montar/page.tsx`,
posicionado próximo ao título do set (provavelmente à direita
ou abaixo, dependendo do layout atual). Reusa estilo de botão
secundário existente (border + label-tech tipográfico).

**Rationale**:
- Header é onde o DJ enxerga name/eventDate/location atuais —
  semanticamente próximo ao botão de edição.
- Padrão de "edit pencil" próximo ao recurso editado é familiar.

**Alternativas considerardas**:
- **Botão flutuante FAB**: foge do design editorial do Sulco.
- **Inline ao lado do briefing**: confunde quando há vários campos
  editáveis (não só briefing).

## Decisão 3: conversão eventDate UTC ↔ datetime-local

**Decisão**: o input HTML `<input type="datetime-local">` aceita
formato `YYYY-MM-DDTHH:mm` em hora local. Conversão:
- **Pra preencher**: `eventDate` (UTC) → string local format
  via `eventDate.toISOString().slice(0, 16)` (gera UTC ISO mas
  o navegador interpreta como local — assumindo `America/Sao_Paulo`
  por convenção do projeto).
- **Pra enviar**: input value (string local) → `Date` via
  `new Date(value)` (browser parseia como local). Server
  `normalizeDate` (em `lib/actions.ts:898+`) já trata.

Para evitar confusão de fuso, vou padronizar: o input mostra a
data como armazenada em UTC, e Browser Native interpreta de
acordo com o fuso do user. `normalizeDate` na action garante
que entra corretamente no DB.

**Rationale**:
- `<input type="datetime-local">` é nativo, acessível, mobile-
  friendly. Sem libs.
- Convenção do projeto é UTC at-rest + local na UI; `normalizeDate`
  já existe e funciona.

**Alternativas consideradas**:
- **react-datepicker / similar**: viola constituição (sem libs
  de UI nessa fase).

## Decisão 4: auto-focus no primeiro campo ao abrir

**Decisão**: input "Nome" recebe `autoFocus`. Pattern do
`<DeleteAccountModal>` existente.

**Rationale**:
- DJ não precisa clicar duas vezes (abre modal → clica no campo).
- Acessibilidade: keyboard users navegam de cara.

## Decisão 5: fechamento via ESC + clique fora do dialog

**Decisão**: handler `onKeyDown` no overlay capturando ESC chama
`setOpen(false)`. Clique no overlay (mas não no dialog) também
fecha. Stop propagation no dialog evita fechar ao clicar dentro.

**Rationale**:
- Padrão UX universal de modal.
- HTML nativo `<dialog>` element teria isso de graça, mas o
  pattern do `<DeleteAccountModal>` usa `<div>` custom — manter
  consistência.

**Alternativas considerardas**:
- **Migrar pra `<dialog>` HTML nativo**: mudança de pattern
  arquitetural fora do escopo desta feature. Pode ser fix futuro
  unificando ambos os modals.

## Decisão 6: validação client-side

**Decisão**: client-side desabilita botão "Salvar" quando:
- `name.trim()` está vazio
- `name.length > 200`
- `briefing.length > 5000`

Se DJ editou e quer reverter, pode clicar Cancelar (que apenas
fecha sem persistir, descartando edits no estado local).

Server-side (`updateSet`) tem validação Zod redundante — defesa
em profundidade.

**Rationale**:
- Botão disabled é mais claro que mostrar erro inline pra
  validações triviais.
- Server-side valida de novo (Zod já está no `updateSet`),
  cobrindo caso de race ou client comprometido.

## Decisão 7: reset do form ao reabrir

**Decisão**: estado do form local é resetado para os valores
ATUAIS do set toda vez que `open` muda de `false` → `true`.
Implementação: `useEffect` que dispara quando `open` muda.

```ts
useEffect(() => {
  if (open) {
    setName(set.name);
    setEventDate(formatForInput(set.eventDate));
    setLocation(set.location ?? '');
    setBriefing(set.briefing ?? '');
  }
}, [open, set]);
```

**Rationale**:
- DJ que abre → edita → cancela espera que reabrir mostre os
  valores atuais (não os edits descartados).
- `useEffect` reseta sempre que abre, mesmo se DJ atualizou em
  outra aba (improvável mas correto).

**Alternativas consideradas**:
- **Persist state local entre opens**: mostra edits "fantasmas"
  do cancelamento anterior. Confuso.
- **Reset apenas on save**: deixa state stale se cancelar.
