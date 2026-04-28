---
description: "Task list — Inc 14 (Configuração de IA do DJ — BYOK)"
---

# Tasks: Configuração de IA do DJ (BYOK)

**Input**: Design documents from `/specs/012-ai-byok-config/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Tests**: Sem suíte automatizada. Validação via cenários manuais
do `quickstart.md` (8 cenários cobrindo os 5 providers) +
`npm run build`.

**Organization**: Tasks agrupadas por user story (US1 = config inicial,
US2 = trocar provider, US3 = remover, US4 = key revogada).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: pode rodar em paralelo
- **[US1/US2/US3/US4]**: maps to user stories da spec

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Confirmar branch ativa: `git branch --show-current` deve
  retornar `012-ai-byok-config`. Se não, abortar.

- [X] T002 Instalar 3 SDKs novos:
  `npm install @google/generative-ai @anthropic-ai/sdk openai`.
  Verificar `package.json` ganha 3 deps + `package-lock.json`
  atualizado. Build deve continuar passando.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schema delta + estrutura do `src/lib/ai/` + criptografia
genérica. Todos os 4 user stories dependem destes pontos.

**⚠️ CRITICAL**: nenhum US pode começar antes do checkpoint.

- [X] T003 Adicionar 3 colunas em `users` no schema Drizzle em
  [src/db/schema.ts](../../src/db/schema.ts):
  - `aiProvider: text('ai_provider', { enum: ['gemini', 'anthropic', 'openai', 'deepseek', 'qwen'] })`
  - `aiModel: text('ai_model')`
  - `aiApiKeyEncrypted: text('ai_api_key_encrypted')`
  Posicionar logo após `importAcknowledgedAt` (zona SYS agrupada).
  Todas nullable, sem index.

- [X] T004 Aplicar schema no DB local via sqlite3:
  ```bash
  sqlite3 sulco.db "ALTER TABLE users ADD COLUMN ai_provider TEXT;"
  sqlite3 sulco.db "ALTER TABLE users ADD COLUMN ai_model TEXT;"
  sqlite3 sulco.db "ALTER TABLE users ADD COLUMN ai_api_key_encrypted TEXT;"
  ```
  Verificar via `PRAGMA table_info(users)` que as 3 colunas são `INTEGER`/`TEXT` nullable. (Workaround do `db:push` interativo, mesmo padrão Inc 010.)

- [X] T005 Adicionar aliases `encryptSecret`/`decryptSecret` em
  [src/lib/crypto.ts](../../src/lib/crypto.ts):
  ```ts
  export const encryptSecret = encryptPAT;
  export const decryptSecret = decryptPAT;
  ```
  Comentário JSDoc explicando que são aliases pra uso semanticamente
  correto em adapters de IA. Manter `encryptPAT`/`decryptPAT` (zero
  break).

- [X] T006 Criar [src/lib/ai/types.ts](../../src/lib/ai/types.ts) com:
  - `Provider` (union `'gemini' | 'anthropic' | 'openai' | 'deepseek' | 'qwen'`)
  - `AIConfig`, `AIConfigStatus` (conforme [data-model.md](./data-model.md))
  - `AdapterError`, `AdapterErrorKind`, `AIAdapter` (conforme
    [contracts/ai-adapter.md](./contracts/ai-adapter.md))

- [X] T007 Criar [src/lib/ai/models.ts](../../src/lib/ai/models.ts)
  com `MODELS_BY_PROVIDER` e `MODELS_REVIEWED_AT` (decisão 3 do
  [research.md](./research.md)). Comentário no topo: "Revisar
  trimestralmente. Modelo deprecado pelo provider exige PR de
  remoção."

- [X] T008 Criar [src/lib/ai/providers/gemini.ts](../../src/lib/ai/providers/gemini.ts)
  implementando `AIAdapter`:
  - `ping({ apiKey, model })`: cria `GoogleGenerativeAI(apiKey)`,
    `getGenerativeModel({ model })`, `generateContent("Reply with 'ok'.")`.
    Em sucesso `{ ok: true }`; em catch, `mapGeminiError(err)`.
  - `enrichTrackComment({ apiKey, model, prompt })`: idem mas com
    `prompt` real e `max_tokens` mais alto. Retorna `{ ok: true, text }`.
  - Helper privado `mapGeminiError(err)` mapeia para `AdapterErrorKind`
    (conforme [contracts/ai-adapter.md](./contracts/ai-adapter.md)).

- [X] T009 Criar [src/lib/ai/providers/anthropic.ts](../../src/lib/ai/providers/anthropic.ts)
  análogo a T008, usando `@anthropic-ai/sdk`. Erros mapeados via
  `Anthropic.AuthenticationError` / `NotFoundError` / `RateLimitError`.

- [X] T010 Criar [src/lib/ai/providers/openai-compat.ts](../../src/lib/ai/providers/openai-compat.ts)
  como **factory** que recebe `provider` e devolve `AIAdapter`:
  - `BASE_URLS = { openai: undefined, deepseek: 'https://api.deepseek.com/v1', qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' }`
  - `function buildClient(provider, apiKey)` constrói `OpenAI({ apiKey, baseURL? })`.
  - `function openaiCompatAdapter(provider): AIAdapter` retorna objeto
    com `ping` e `enrichTrackComment` ligados ao client correto.
  - Mapeamento de erros via `OpenAI.AuthenticationError` / `NotFoundError` / `RateLimitError`.

- [X] T011 Criar [src/lib/ai/index.ts](../../src/lib/ai/index.ts) com:
  - `'server-only'` no topo
  - `getAdapter(provider): AIAdapter` (dispatcher conforme
    [contracts/ai-adapter.md](./contracts/ai-adapter.md))
  - `getUserAIConfig(userId): Promise<AIConfig | null>` (lê 3
    colunas, decifra `ai_api_key_encrypted` via `decryptSecret`)
  - `getUserAIConfigStatus(userId): Promise<AIConfigStatus>` (lê só
    provider e model — NÃO decifra key)
  - `enrichTrackComment(userId, prompt)` (público, dispatch via
    `getAdapter` da config do user) — função existe mas Inc 13 que
    usa.

**Checkpoint**: schema aplicado, types/models/3 adapters/dispatcher
funcionais. User stories podem começar.

---

## Phase 3: User Story 1 — Configuração inicial (Priority: P1) 🎯 MVP

**Goal**: DJ sem config completa fluxo: provider → key → modelo → testar → "✓ verificada".

**Independent Test**: cenário 1 do [quickstart.md](./quickstart.md).

- [X] T012 [US1] Criar Server Action `testAndSaveAIConfig` em
  [src/lib/actions.ts](../../src/lib/actions.ts), conforme
  [contracts/server-actions.md](./contracts/server-actions.md):
  - Importar `getAdapter`, `MODELS_BY_PROVIDER`, `encryptSecret`.
  - Schema Zod do input.
  - `requireCurrentUser` → user.
  - Validar `model ∈ MODELS_BY_PROVIDER[provider]`.
  - `Promise.race([adapter.ping(...), timeout(10_000)])`.
  - Em sucesso: update das 3 colunas com `aiApiKeyEncrypted = encryptSecret(apiKey)`.
  - `revalidatePath('/conta')`. Return `{ ok: true }`.
  - Em erro/timeout: propaga mensagem contextual em pt-BR.

- [X] T013 [US1] Atualizar [src/app/conta/page.tsx](../../src/app/conta/page.tsx)
  pra adicionar seção "Inteligência Artificial":
  - Server Component lê `getUserAIConfigStatus(user.id)`.
  - Renderiza `<AIConfigForm initialStatus={status} />` (componente
    client criado em T014).
  - Layout: usa tokens existentes (`eyebrow`, `font-serif`,
    `border-line`).

- [X] T014 [US1] Criar [src/components/ai-config-form.tsx](../../src/components/ai-config-form.tsx)
  client component:
  - `'use client'`, importa `useState`, `useTransition`, `useRouter`.
  - Props: `{ initialStatus: AIConfigStatus }`.
  - Estado local: provider selecionado, key (mascarada), model,
    `{ status: 'idle' | 'testing' | 'success' | 'error', errorMsg? }`.
  - Quando `initialStatus.configured`, mostrar mensagem "✓ Configurada"
    + os campos preenchidos (key como "***" placeholder, modo edição
    requer apagar e digitar de novo).
  - Quando NOT configurado, dropdown de provider começa vazio; após
    seleção, dropdown de modelo aparece com `MODELS_BY_PROVIDER`
    importado de `@/lib/ai/models`.
  - Botão "Testar conexão" `disabled` enquanto key < 10 chars OU
    pending.
  - `handleTest`: `startTransition(async () => { await testAndSaveAIConfig(...) })` →
    sucesso `setStatus('success')` + `router.refresh()`; falha
    `setStatus('error', errorMsg)`.
  - Toggle de "olho" pra revelar/esconder key (`type="password"` ↔ `type="text"`).
  - Tap targets ≥ 44×44 px (alinha com 009).

**Checkpoint**: US1 entregue. Cenário 1 do quickstart passa.

---

## Phase 4: User Story 2 — Trocar de provider (Priority: P1)

**Goal**: DJ troca provider via dropdown, vê confirmação de apagar key, confirma, configura novo.

**Independent Test**: cenário 3 do quickstart.

- [X] T015 [US2] Em [src/components/ai-config-form.tsx](../../src/components/ai-config-form.tsx),
  detectar mudança de provider via `onChange` do dropdown:
  - Manter `currentProvider` (proveniente de `initialStatus`) como
    referência separada do `selectedProvider` (estado controlado do
    dropdown) — necessário pra rollback após cancel.
  - Se já há config persistida (`initialStatus.configured`) E o
    provider novo é diferente do atual: abrir diálogo nativo
    `window.confirm("Trocar de provider apaga a chave do provider atual. Continuar?")`.
  - Se confirmar: chamar `removeAIConfig` (T016), depois `router.refresh()`,
    UI volta pro estado vazio com o provider novo pré-selecionado
    (estado local pós-refresh). DJ digita key e testa normalmente.
  - Se cancelar: `setSelectedProvider(currentProvider)` — restaura o
    `<select>` ao valor anterior; nenhuma chamada de Server Action.

- [X] T016 [US2] Criar Server Action `removeAIConfig` em
  [src/lib/actions.ts](../../src/lib/actions.ts):
  - `requireCurrentUser`.
  - `db.update(users).set({ aiProvider: null, aiModel: null, aiApiKeyEncrypted: null })`.
  - `revalidatePath('/conta')`. Return `{ ok: true }`.

**Checkpoint**: US2 entregue. Cenário 3 do quickstart passa.

---

## Phase 5: User Story 3 — Remover configuração (Priority: P2)

**Goal**: botão explícito "Remover configuração" com confirmação.

**Independent Test**: cenário 5 do quickstart.

- [X] T017 [US3] Em [src/components/ai-config-form.tsx](../../src/components/ai-config-form.tsx),
  adicionar botão "Remover configuração" visível apenas quando
  `initialStatus.configured`:
  - `window.confirm("Remover sua configuração de IA? Funcionalidades dependentes ficarão desabilitadas.")`.
  - Em confirmação: `await removeAIConfig()` + `router.refresh()`.
  - Estilo: secundário (sem accent), abaixo do botão primário.

**Checkpoint**: US3 entregue.

---

## Phase 6: User Story 4 — Key revogada (Priority: P3)

**Goal**: ao testar com key revogada, mostrar mensagem que sugere
reconfigurar.

**Independent Test**: cenário 2 do quickstart (key inválida).

**Note**: comportamento já garantido por T008/T009/T010 (mapeiam
`invalid_key` → "Chave inválida ou revogada — reconfigure."). Esta
fase é validação visual.

- [X] T018 [US4] Confirmar via cenário 2 do quickstart que ao
  testar com key inválida, a mensagem de erro contém "reconfigure"
  ou equivalente. Se a string não estiver clara o suficiente,
  ajustar mapeamento em T008-T010 e revalidar.

**Checkpoint**: US4 entregue.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T019 Rodar `npm run build` no root e confirmar zero erros
  novos de TypeScript / lint. Atenção a:
  - `import 'server-only'` em `src/lib/ai/index.ts` previne bundle
    no client.
  - Tipos do Drizzle refletem 3 colunas novas (`User['aiProvider']`,
    etc).

- [X] T020 [P] Executar cenários 1, 2, 3 do quickstart manualmente
  (config inicial, key inválida, troca de provider). 3 cenários P1
  cobrem MVP.

- [X] T021 [P] Executar cenários 4-8 do quickstart (modelo dentro
  do mesmo provider, remover, multi-user, 5 providers, timeout).

- [X] T022 [P] Verificar via DevTools Application > Cookies/Local
  Storage e Network tab que a chave NUNCA aparece em texto puro no
  cliente. Confirmar via "View Source" do `/conta` que server-render
  decide visibilidade (Q4 — sem flash).

- [X] T022b Smoke real do `enrichTrackComment` (mitiga finding C1 do
  speckit.analyze): a função existe em `src/lib/ai/index.ts` mas não
  é exercitada por nenhuma UI desta feature (consumidores são Inc 13
  e Inc 1). Para detectar bugs de adapter em geração real (não só
  ping), criar `scripts/_smoke-ai.mjs` que:
  - Lê `userId` (arg ou hardcoded) e chama
    `enrichTrackComment(userId, "Descreva em 1 frase: 'Águas de Março' do Tom Jobim, MPB.")`.
  - Imprime `result.text` no stdout.
  - Não escreve nada no DB.
  Rodar 1× pra cada provider configurável que o DJ tenha key (mínimo
  1 — pode ser Gemini Flash via free tier). Se algum provider
  retornar erro estrutural (não relacionado à chave/quota), corrigir
  o adapter correspondente antes do deploy. Script é descartável —
  pode ficar em `scripts/` ou ser deletado após uso.

- [X] T023 Atualizar [BACKLOG.md](../../BACKLOG.md):
  - Mover **Incremento 14** de `## Roadmap > 🟢 Próximos` para
    `## Releases`:
    `- **012** — Configuração de IA do DJ (BYOK) · 2026-04-28 · specs/012-ai-byok-config/ · 5 providers (Gemini, Anthropic, OpenAI, DeepSeek, Qwen) suportados via adapter pattern; schema delta de 3 colunas em users (aiProvider/aiModel/aiApiKeyEncrypted); criptografia reusa MASTER_ENCRYPTION_KEY via encryptSecret/decryptSecret aliases; testar é único caminho de salvar; timeout 10s; Princípio I respeitado (ai_* é zona SYS)`
  - Atualizar campo `**Última atualização**`.

- [X] T024 Commit final via `/speckit-git-commit` com mensagem
  `feat(012): config BYOK de IA (Gemini/Anthropic/OpenAI/DeepSeek/Qwen)`.

- [X] T025 Deploy: aplicar schema delta em prod via Turso CLI ANTES
  do push:
  ```bash
  turso db shell sulco-prod "ALTER TABLE users ADD COLUMN ai_provider TEXT;"
  turso db shell sulco-prod "ALTER TABLE users ADD COLUMN ai_model TEXT;"
  turso db shell sulco-prod "ALTER TABLE users ADD COLUMN ai_api_key_encrypted TEXT;"
  ```
  Depois: `git checkout main && git merge --no-ff 012-ai-byok-config && git push origin main`. Vercel auto-deploya.

---

## Dependencies & Execution Order

**Linear chain (do MVP)**:
T001 → T002 → T003 → T004 → T005 → T006 → T007 → (T008/T009/T010 paralelos)
→ T011 → T012 → T013 → T014 → (T015/T016 sequenciais) → T017 → T018
→ T019 → (T020/T021/T022 paralelos) → T022b → T023 → T024 → T025

**Critical bottleneck**: schema (T003-T004) → types/models (T006-T007)
→ adapters (T008-T010) → dispatcher (T011) → action (T012) → UI
(T013-T014). Cada step puxa o próximo.

**Parallel windows**:
- **T008/T009/T010**: 3 adapters em arquivos separados, sem
  dependência cruzada (cada um depende só de T006 + T007).
- **T020/T021/T022**: validação manual em diferentes superfícies.

---

## Implementation Strategy

### MVP

T001-T014 entregam US1: configuração inicial funcional para os 5
providers. Inclui o adapter pattern completo + tela em `/conta`. Já
deploy-able, ainda sem opções de troca (US2) ou remoção (US3) — DJ
pode reconfigurar manualmente via DB se precisar.

### Sequência sugerida (~1.5 dia total)

1. **Setup + Foundational** (~3-4h): T001-T011.
2. **US1** (~3-4h): T012-T014.
3. **US2 + US3 + US4** (~2h): T015-T018.
4. **Polish + deploy** (~1h): T019-T025.

---

## Format Validation

- [x] Todas tasks começam com `- [ ]`
- [x] IDs sequenciais T001-T025 + T022b inserido pós-analyze
- [x] `[P]` em paralelizáveis (T008/T009/T010, T020/T021/T022)
- [x] `[US1]`/`[US2]`/`[US3]`/`[US4]` em tasks de user story (T012-T018)
- [x] Sem labels em Setup/Foundational/Polish
- [x] Caminhos de arquivo nas tasks de código
