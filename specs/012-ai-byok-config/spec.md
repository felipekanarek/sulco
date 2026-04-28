# Feature Specification: Configuração de IA do DJ (BYOK)

**Feature Branch**: `012-ai-byok-config`
**Created**: 2026-04-27
**Status**: Draft
**Input**: User description: "Inc 14 — Estrutura BYOK (Bring Your Own Key) pra cada DJ trazer sua própria chave de IA e escolher provider/modelo. Pré-requisito de Inc 13 (enriquecer comment) e Inc 1 (briefing com IA). Providers: Gemini, Anthropic, OpenAI, DeepSeek, Qwen. Lista curada de modelos. Ping test fixo. Trocar provider apaga key. Schema delta de 3 colunas em users."

## Clarifications

### Session 2026-04-27

- Q: Qual segredo de criptografia usar pra `ai_api_key_encrypted`? → A: Reusar `MASTER_ENCRYPTION_KEY` existente (mesmo segredo do PAT do Discogs). 1 segredo só pra gerenciar.
- Q: Como salvar a config (com vs sem teste prévio)? → A: "Testar" é o único caminho — ping bem-sucedido persiste imediatamente. Sem botão "Salvar sem testar". Garante que toda config no DB é válida.
- Q: Timeout do ping test antes de cair em erro? → A: 10 segundos. Margem confortável sobre os 5s do SC normal; após, mensagem "Provider não respondeu — tente novamente".
- Q: Como UIs dependentes (Inc 13/1) decidem visibilidade do botão sem config? → A: Server-render decide (RSC lê config). Botão renderiza desabilitado quando sem config. Sem flash, zero JS pra estado vazio. Alinha com Server-First (Princípio II).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Configurar provider de IA pela primeira vez (Priority: P1)

DJ chega em `/conta`, encontra a seção "Inteligência Artificial" e
quer começar a usar recursos de IA do Sulco (que ainda chegarão via
Inc 13/1). Hoje não há nenhuma config; ele escolhe um provider, cola
a chave de API que já tem, escolhe o modelo, testa, e fica habilitado
pra usar IA dali em diante.

**Why this priority**: É o caso fundador da feature. Sem essa parte,
nada da estrutura BYOK existe — o DJ não tem como ativar IA no Sulco.

**Independent Test**: a partir de conta sem nenhuma config de IA,
selecionar provider, colar key, escolher modelo, clicar "Testar
conexão" e ver "✓ Configuração salva e verificada". Confirmar via
DB que `users.ai_provider`, `ai_model` e `ai_api_key_encrypted` (não
em texto puro) estão preenchidos.

**Acceptance Scenarios**:

1. **Given** DJ sem config (`ai_provider IS NULL`), **When** acessa
   `/conta` e abre a seção "Inteligência Artificial", **Then** vê
   dropdown de provider, mensagem "Sem configuração ativa", e os
   demais inputs (key, modelo) ficam ocultos ou desabilitados até
   um provider ser escolhido.
2. **Given** DJ escolheu provider e colou key válida no input,
   **When** clica em "Testar conexão", **Then** o sistema chama o
   provider com o ping prompt e em ≤5s exibe "✓ Configuração salva
   e verificada"; a key é persistida criptografada no DB.
3. **Given** DJ colou key inválida ou inválida para o modelo
   selecionado, **When** clica em "Testar conexão", **Then** vê
   mensagem de erro contextual (ex: "Chave inválida" ou "Modelo não
   disponível pra esta chave") e a config NÃO é persistida no DB.

---

### User Story 2 — Trocar de provider (Priority: P1)

DJ configurou Gemini e quer migrar pra Claude (talvez por preferência
de qualidade, custo, ou crédito acabou). Mudar o provider no dropdown
deve ser explícito sobre o efeito: a key anterior é apagada e ele
precisa colar a key nova do novo provider. Sem dead state.

**Why this priority**: É o segundo caso de uso esperado e tem
implicação destrutiva (apaga key). Usuário precisa entender o
comportamento antes de clicar.

**Independent Test**: a partir de conta com Gemini configurado,
trocar dropdown pra Anthropic, ver aviso de que a key Gemini será
apagada, confirmar, colar key Claude, testar, salvar.

**Acceptance Scenarios**:

1. **Given** DJ tem Gemini configurado e funcional, **When** muda o
   dropdown de provider pra "Anthropic", **Then** o sistema avisa
   explicitamente que a chave Gemini será removida e exige
   confirmação antes de proceder.
2. **Given** DJ confirmou a troca, **When** vê o input de key vazio
   e o dropdown de modelo populado com modelos do novo provider,
   **Then** preenche key Anthropic, escolhe modelo, testa e salva
   normalmente (mesmo fluxo da US1).
3. **Given** DJ cancelou a troca no diálogo de confirmação, **When**
   o estado da UI é restaurado, **Then** a config Gemini permanece
   intacta no DB e na tela.

---

### User Story 3 — Remover configuração (Priority: P2)

DJ decide parar de usar IA do Sulco (mudou de ideia, key vazou, etc.).
Quer um botão claro pra apagar tudo: provider, modelo e key. Após
remoção, o estado volta ao "primeiro uso" da US1.

**Why this priority**: Importante pra higiene de credenciais (DJ
deve poder retirar a key se vazou). Mas é menos crítico que US1/US2
porque não bloqueia uso normal.

**Independent Test**: a partir de conta com config ativa, clicar
"Remover configuração", confirmar, ver tela voltar ao estado vazio
da US1. Confirmar via DB que `ai_provider`, `ai_model` e
`ai_api_key_encrypted` voltaram a `NULL`.

**Acceptance Scenarios**:

1. **Given** DJ tem config ativa, **When** clica em "Remover
   configuração" e confirma o diálogo, **Then** as 3 colunas voltam
   a `NULL` no DB, a tela mostra estado vazio (US1) e quaisquer
   funcionalidades dependentes de IA voltam a ficar desabilitadas.
2. **Given** DJ cancela o diálogo de confirmação, **When** o estado
   da UI é restaurado, **Then** a config permanece intacta.

---

### User Story 4 — Provider configurado mas indisponível (Priority: P3)

DJ tem config ativa, mas a chave foi revogada externamente (rotação,
exclusão da conta no provider). O Sulco não sabe disso até a próxima
chamada real (Inc 13/1) falhar. Quando falha, o DJ deveria ser
direcionado de volta a `/conta` pra reconfigurar.

**Why this priority**: Caso de borda real, mas raro. Sem tratamento,
o DJ vê erro genérico e fica confuso. Não bloqueia a entrega da
feature, mas é polish que evita ticket de suporte futuro.

**Independent Test**: forçar `ai_api_key_encrypted` no DB pra valor
inválido (simulando key revogada), tentar usar IA via Inc 13 (quando
existir) ou via botão "Testar" em `/conta`, ver mensagem que sugere
reconfiguração.

**Acceptance Scenarios**:

1. **Given** DJ tem config persistida mas a chave foi revogada no
   provider, **When** clica em "Testar conexão" em `/conta`,
   **Then** vê mensagem "Chave inválida ou revogada — reconfigure"
   e a UI permite editar key sem precisar trocar provider.

---

### Edge Cases

- **Múltiplos cliques no botão "Testar"**: prevenir double-call
  (botão `disabled` enquanto pendente).
- **Key vazia**: botão "Testar" `disabled` até key ter pelo menos N
  caracteres (sugestão N=10, mesma heurística de PAT do Discogs).
- **Provider escolhido mas modelo não selecionado**: dropdown de
  modelo tem default (primeiro item da lista do provider) — DJ não
  precisa escolher explicitamente, mas pode trocar.
- **DJ cola key com espaços antes/depois**: trim no client antes de
  enviar.
- **Mostrar/ocultar key**: input começa mascarado (`type="password"`)
  com toggle de "olho" pra revelar (mesma UX padrão de campo de
  senha).
- **Multi-user**: cada DJ tem sua própria config; uma conta NÃO vê
  ou usa a key de outra. Isolation já garantido por `userId` em
  `users`.
- **Conta nova sem config**: tela mostra estado vazio, sem warning
  agressivo. Apenas hint sutil de que IA está opcional.
- **Cota/free tier do provider esgotada**: mensagem genérica de erro
  durante "Testar" ou uso real ("Provider retornou erro: X"). Não
  tratar quotas explicitamente — provider já fala isso.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema MUST suportar 5 providers de IA: Gemini,
  Anthropic, OpenAI, DeepSeek, Qwen. Cada provider tem uma lista
  curada de modelos disponíveis.
- **FR-002**: Sistema MUST armazenar para cada usuário, no máximo
  uma combinação ativa de (provider, modelo, chave).
- **FR-003**: Sistema MUST armazenar a chave de API criptografada
  em repouso (mesmo padrão que credenciais existentes do Discogs).
  Chave em texto puro NUNCA é persistida no DB.
- **FR-004**: A chave de API NÃO MUST ser exibida em texto puro na
  UI após salva. Inputs de key começam mascarados; ao reabrir a
  tela com config existente, sistema mostra "✓ Configurada" em vez
  do valor.
- **FR-005**: Antes de persistir uma combinação (provider, modelo,
  key), o sistema MUST validar via uma chamada de teste ao provider
  ("ping") e só persistir se retornar sucesso. NÃO existe ação de
  salvar sem testar — o botão "Testar conexão" é o único caminho de
  persistência. Toda config no DB é, por construção, válida no
  momento do salvamento.
- **FR-006**: Falhas no ping test MUST exibir mensagem contextual
  ao DJ (chave inválida, modelo não disponível, falha de rede,
  rate limit) sem persistir nada. Timeout do ping é 10 segundos —
  após esse, mensagem "Provider não respondeu — tente novamente".
- **FR-007**: Trocar de provider MUST exigir confirmação explícita
  do DJ e, ao confirmar, apagar key e modelo do provider anterior
  antes de exigir nova combinação.
- **FR-008**: Remover configuração MUST limpar provider, modelo e
  chave (tudo volta a estado nulo) com confirmação explícita.
- **FR-009**: Funcionalidades dependentes (Inc 13 — comment via IA;
  Inc 1 — briefing) MUST ler a config persistida do user corrente
  via helper centralizado em Server Components (não em client) e
  respeitar o estado "sem config" para renderizar botões já
  desabilitados desde o servidor — sem flash de estado, sem JS
  necessário pra exibir tooltip de "Configure em /conta".
- **FR-010**: A interface de adapters MUST oferecer uma API comum
  (ex: `enrichTrackComment(prompt)`) para que features consumidoras
  não dependam de detalhes de cada provider.
- **FR-011**: Multi-user isolation MUST ser garantido — config de
  um DJ não vaza para outro.
- **FR-012**: Sem chave configurada, qualquer Server Action que
  tente usar IA MUST retornar erro tratado ("Configure sua chave em
  /conta") em vez de crashar.

### Key Entities

- **User AI Config** (anexa em `users`): provider escolhido (enum),
  modelo escolhido (string), chave criptografada. Todos opcionais
  (nulos = sem config). Default novo user = todos nulos.
- **Provider catalog** (estático, não persistido): lista de
  providers suportados e seus modelos disponíveis. Mantido em código.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: DJ completa configuração inicial (escolher provider →
  colar key → escolher modelo → testar → ver "✓ verificada") em
  ≤30 segundos quando já tem a key em mãos.
- **SC-002**: Ping test responde em ≤5 segundos para qualquer
  provider suportado em condições normais de rede.
- **SC-003**: Zero exposição de key em texto puro: nem em formulário
  reaberto, nem em logs de servidor, nem em respostas da action de
  leitura. (Verificável via inspeção manual de UI/logs/responses.)
- **SC-004**: Trocar de provider não deixa state intermediário
  inconsistente — após confirmar troca, ou tem config nova válida
  (US2 completa) ou tem state vazio (US1 inicial). Nunca um state
  parcial persistido.
- **SC-005**: Remover configuração resulta em 3 colunas nulas
  imediatamente após confirmação; UIs dependentes ficam desabilitadas
  no próximo render.
- **SC-006**: Configuração de DJ A não é visível, modificável ou
  utilizável por DJ B (multi-user isolation, verificável via teste
  manual com 2 contas).

## Assumptions

- A criptografia da chave reusa o mecanismo já existente no projeto
  (mesmo `MASTER_ENCRYPTION_KEY` que cifra o PAT do Discogs — sem
  nova env var, sem nova lib).
- Validação tem 2 etapas: client (key não vazia, formato básico) e
  server (chamada real ao provider). Erros são propagados ao UI.
- A lista curada de modelos por provider é versionada com o código
  (não vem de API externa). Modelos novos exigem deploy.
- Idioma da UI: português (consistente com o resto do Sulco).
- Esta feature **não inclui** as funcionalidades dependentes
  (enriquecer comment via IA, briefing com IA). Apenas a infra de
  config + adapter pattern + helper de leitura. Os botões
  consumidores virão em Inc 13 e Inc 1 separadamente.
- Cada DJ é responsável por monitorar seu próprio uso/custo no
  dashboard do provider escolhido. O Sulco NÃO mostra contadores
  de tokens, custo estimado ou alertas de quota — está fora de
  escopo.
- Trocar de modelo dentro do mesmo provider NÃO exige reentrar key
  (ex: Gemini Flash → Gemini Pro mantém a chave; só mudar modelo
  e clicar "Testar" valida que a key tem permissão pro modelo novo).
- Schema delta é aditivo (3 colunas nullable em `users`); não exige
  migração de dados existentes.
- Em prod, schema é aplicado direto via Turso CLI (mesmo procedimento
  do Inc 010) antes do push.
