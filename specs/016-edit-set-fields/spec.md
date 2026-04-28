# Feature Specification: Editar briefing e dados do set após criação

**Feature Branch**: `016-edit-set-fields`
**Created**: 2026-04-28
**Status**: Draft
**Input**: User description: "Inc 15 — DJ deve poder editar name/eventDate/location/briefing do set após criação. Hoje campos são imutáveis na UI. Especialmente útil pra refinar briefing durante montagem do set (alimenta sugestões IA do Inc 14)."

## Clarifications

### Session 2026-04-28

- Q: Form de edição: modal ou inline? → A: Modal/dialog com overlay. Padrão Sulco (mesmo estilo do `<DeleteAccountModal>` existente). ESC ou clicar fora fecha. 4 campos no modal, botões Salvar/Cancelar no rodapé.

## Summary

Server Action `updateSet` **JÁ existe** em `src/lib/actions.ts:945`
com partial update completo (Zod com todos campos opcionais,
ownership check, `normalizeDate`, revalidatePath nas 3 rotas).
Esta feature entrega APENAS a **UI faltante** — botão "Editar" +
form/modal — pra acionar a action existente.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Editar briefing durante montagem do set (Priority: P1)

DJ está em `/sets/[id]/montar` montando um set. Percebe que o
briefing inicial está incompleto (faltou tipo "rave de quinta-feira,
público veterano de techno") e quer refinar pra que as sugestões da
IA fiquem mais precisas. Clica no botão "✏️ Editar set" no header,
edita o briefing num form/modal, salva. Página recarrega com novo
briefing visível. Ao clicar "✨ Sugerir com IA" depois, o prompt
usa o briefing atualizado.

**Why this priority**: É a motivação principal da feature.
Briefing → sugestões IA é fluxo iterativo. Sem editar briefing, DJ
fica preso ao texto inicial.

**Independent Test**: abrir set existente, clicar editar, mudar
briefing, salvar. Confirmar via SQL que `sets.briefing` foi
atualizado e que próxima geração de IA usa o novo texto.

**Acceptance Scenarios**:

1. **Given** DJ está em `/sets/[id]/montar` de set com briefing
   "X", **When** clica "Editar set" e altera briefing pra "Y",
   **Then** após salvar, a página recarrega exibindo "Y" no
   bloco de briefing visível, e SQL confirma `sets.briefing = 'Y'`.
2. **Given** DJ tem IA configurada (Inc 14) e acabou de editar
   briefing, **When** clica "✨ Sugerir com IA", **Then** o prompt
   enviado contém o briefing atualizado (não o antigo).

---

### User Story 2 — Editar nome, data ou local (Priority: P2)

DJ precisa renomear um set ("Festa do Roberto" → "Aniversário 30
Roberto"), mudar data (evento adiado), ou corrigir local. Mesmo
form abre com os 4 campos; DJ pode editar qualquer combinação ou
apenas um.

**Why this priority**: Casos menos frequentes que briefing mas
genuínos. Como a UI já é o mesmo form, custo zero pra cobrir.

**Independent Test**: editar só o `name` (deixar resto inalterado),
salvar. Confirmar via SQL que `sets.name` mudou e outros campos
permanecem iguais. Repetir pra `eventDate` e `location`.

**Acceptance Scenarios**:

1. **Given** set com name "X", **When** DJ edita pra "Y" e salva,
   **Then** `sets.name = 'Y'` no DB e a listagem em `/sets` reflete
   o novo nome.
2. **Given** set com `eventDate` em data D1, **When** DJ muda pra
   D2 (no fuso `America/Sao_Paulo`), **Then** persiste em UTC
   at-rest e a UI exibe D2 no fuso local.
3. **Given** set com `location` "X" ou null, **When** DJ apaga o
   campo (deixa vazio), **Then** persiste como null.

---

### User Story 3 — Cancelar edição preserva valores (Priority: P3)

DJ abriu o form pra editar, mexeu em alguns campos, mas mudou de
ideia. Clica "Cancelar". Form fecha, valores no DB permanecem
inalterados, página continua mostrando os valores originais.

**Why this priority**: Higiene UX. Espera-se de qualquer form de
edição. Sem isso, DJ teria que recarregar a página pra desfazer.

**Independent Test**: abrir form, alterar campo, clicar cancelar.
SQL confirma valores originais intactos.

---

### Edge Cases

- **Form submetido sem mudanças**: action é chamada com todos os
  campos iguais ao DB. `updateSet` faz update no-op (Drizzle
  `.set` aceita). Não causa erro. OK.
- **Briefing vazio depois de ter conteúdo**: salva como `null`
  (lógica do `updateSet` existente: `briefing?.trim() || null`).
- **Name vazio**: rejeitado pelo Zod (`min(1)`). Form precisa
  validar client-side antes de submit pra UX limpa.
- **eventDate apagada (campo limpo)**: persiste como `null`
  (eventDate sempre foi opcional no schema).
- **DJ não-dono do set tenta editar via URL forjada**: `updateSet`
  já valida ownership via `WHERE userId = user.id`. Action retorna
  "Set não encontrado.".
- **Concurrent edits** (DJ abre form em 2 abas): última save
  vence. Não tratamos optimistic locking — overkill pro piloto.
- **Mobile**: form deve caber em viewport ≤640px sem scroll
  horizontal (Inc 009).
- **Briefing >5000 chars**: rejeitado pelo Zod. UI deve mostrar
  contador.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema MUST oferecer botão "Editar set" visível em
  `/sets/[id]/montar` (header da página, próximo ao título do set).
- **FR-002**: Clicar o botão MUST abrir form de edição em **modal/
  dialog com overlay** (mesmo estilo do `<DeleteAccountModal>`
  existente) com 4 campos pré-preenchidos com os valores atuais:
  name, eventDate, location, briefing. Modal MUST suportar
  fechamento via tecla ESC e clique fora do dialog.
- **FR-003**: Form MUST permitir editar qualquer combinação dos 4
  campos (não exige editar todos).
- **FR-004**: Validação client-side: name obrigatório (≥1 char,
  ≤200 chars); briefing ≤5000 chars; eventDate aceita formato de
  input datetime-local nativo. Submit desabilitado quando inválido.
- **FR-005**: Após salvar com sucesso, form MUST fechar e a página
  MUST refletir os valores novos sem necessidade de reload manual.
- **FR-006**: Botão "Cancelar" MUST fechar o form sem persistir
  alterações.
- **FR-007**: Edição MUST ser ação exclusiva do user dono do set
  (multi-user isolation via ownership check existente).
- **FR-008**: Após salvar `briefing`, próxima invocação de
  "✨ Sugerir com IA" (Inc 14) MUST usar o novo briefing — sem
  cache.

### Key Entities

Sem novas entidades. Reusa `sets` (briefing, name, eventDate,
location) e a Server Action `updateSet` (JÁ existente em
`src/lib/actions.ts`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: DJ completa edição do briefing em ≤30 segundos
  (abrir set → clicar editar → mudar texto → salvar).
- **SC-002**: Após salvar, página exibe os valores novos em ≤1
  segundo (sem refresh manual).
- **SC-003**: Editar briefing impacta imediatamente o
  comportamento da IA — próxima sugestão usa o texto novo.
- **SC-004**: Multi-user isolation verificável: DJ A não
  consegue editar set do DJ B (action já protege).
- **SC-005**: Mobile: form usável em viewport 375px sem scroll
  horizontal.

## Assumptions

- Server Action `updateSet` em `src/lib/actions.ts:945` já está
  100% funcional (entregue como parte do Inc 003 ou anterior).
  Esta feature consome a action existente sem mudanças.
- Form pode ser modal ou inline — decisão de UX fica para o plan.
- Cancelar = fechar form sem submit. Não há "desfazer" pós-save
  (DJ pode editar de novo se quiser reverter).
- Sem dirty-check / "Você tem alterações não-salvas" warning —
  overkill pro piloto.
- Sem schema delta. Reusa schema de `sets` atual.
