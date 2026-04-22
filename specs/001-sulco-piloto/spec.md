# Feature Specification: Sulco — Piloto do Produto Completo

**Feature Branch**: `001-sulco-piloto`
**Created**: 2026-04-22
**Status**: Draft
**Input**: User description: "Piloto de implementação do produto inteiro — coleção, curadoria
sequencial de discos e faixas (com flag Bomba), sets com bag física e montagem por filtros,
sincronização completa com Discogs e autenticação. Fora de escopo: PWA/mobile, IA de
briefing, playlists."

## Clarifications

### Session 2026-04-22

- Q: Mecanismo de execução do sync automático diário → A: Scheduler server-side (cron/Vercel Cron), independente de sessão
- Q: Armazenamento da credencial Discogs do DJ → A: DJ cola Personal Access Token no onboarding; token cifrado at-rest no banco, por usuário
- Q: Visibilidade de falhas do sync em background → A: Painel in-app "Status de sincronização" com histórico (última execução, OK/erro, conflitos) + badge no header quando há pendências
- Q: Backup/export dos dados autorais do DJ → A: Sem export no piloto; confiar no backup de infraestrutura do banco (Turso/arquivo SQLite)
- Q: Provedor de autenticação concreto → A: Clerk (email + social login; "sign out all sessions" nativo para FR-002)
- Q: Deleção de conta e direito ao esquecimento → A: Hard-delete imediato em cascata (records, tracks, sets, setTracks, syncRuns) disparado por webhook "user.deleted" da Clerk e por botão "Apagar conta" na UI
- Q: Comportamento quando o Personal Access Token do Discogs fica inválido → A: Detectar HTTP 401, marcar usuário como "credencial inválida", pausar sync automático futuro, exibir banner persistente pedindo novo token; sync retoma quando DJ atualiza
- Q: Unicidade de discos por usuário (duplicatas no Discogs) → A: UNIQUE `(userId, discogsId)`; duplicatas na coleção Discogs são mescladas em 1 registro no Sulco; `shelfLocation`/`notes` cobrem múltiplas cópias físicas
- Q: Idioma e localização da UI → A: pt-BR hard-coded em todo o produto (strings, formatos de data); sem i18n no piloto
- Q: Patamar mínimo de acessibilidade → A: WCAG 2.1 AA em contraste de cores (texto e UI), foco visível obrigatório em todo controle interativo, semântica ARIA nos toggles/botões principais; sem compromisso com leitores de tela no piloto
- Q: Vocabulário de `moods` e `contexts` → A: Híbrido — lista curada de sementes no seed (10 moods, 8 contextos) + DJ pode criar novos em tempo real; autocomplete baseado nos existentes do usuário
- Q: Notação do `musicalKey` → A: Camelot exclusivo (`1A`–`12A` menores; `1B`–`12B` maiores); validação por regex; picker visual com wheel
- Q: Fluxo de resolução de conflitos de faixa → A: Na lista de conflitos, cada faixa tem "Manter no Sulco" (remove marca de conflito) e "Descartar" (deleta faixa + relações em setTracks); nenhuma resolução automática
- Q: Reordenação de faixas no set → A: Drag-and-drop como mecanismo primário + fallback por teclado (setas ↑/↓ movem o item focado) para atender acessibilidade
- Q: Persistência do estado da tela de montagem → A: Filtros persistem por set no banco (`sets.montarFiltersJson`); reabrir `/sets/[id]/montar` restaura o último estado aplicado
- Q: Semântica de filtro em campos multivalorados (moods, contexts, genres) → A: AND (todos os termos selecionados devem estar presentes) como padrão fixo; sem toggle AND/OR no piloto
- Q: Transições de status de um Set → A: Status totalmente derivado de `eventDate` — `draft` quando `eventDate` é nulo, `scheduled` quando `eventDate` está no futuro, `done` quando no passado; status não é editável manualmente
- Q: Proteção contra spam no botão "Reimportar este disco" → A: Cooldown de 60s por disco — botão desabilita após reimport bem-sucedido exibindo contagem regressiva/mensagem "Aguarde 60s"
- Q: Fuso horário e formato do `eventDate` → A: Armazenado em UTC (ISO 8601); exibido e comparado contra `now` em `America/Sao_Paulo`; input via datetime-local do navegador (converte para UTC ao salvar)
- Q: Faixa de valores válida para `bpm` → A: Inteiro de 0 a 250 (opcional)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Entrar no produto e ver a coleção autenticada (Priority: P1)

O DJ acessa o Sulco pela primeira vez, faz login, conecta a coleção do Discogs (username) e
espera o import inicial completar. Ao final, ele vê sua coleção renderizada como uma
listagem navegável com filtros por status, gênero e localização na estante.

**Why this priority**: É a porta de entrada. Sem autenticação, sem import e sem listagem, o
DJ não vê nenhum dado próprio, e todas as demais jornadas ficam bloqueadas. É o esqueleto do
piloto.

**Independent Test**: Pode ser validado criando uma conta, inserindo um username do Discogs
válido, aguardando o import, e verificando que (a) os discos aparecem na listagem com capa e
metadados, (b) os filtros funcionam, (c) um logout/login preserva o estado.

**Acceptance Scenarios**:

1. **Given** um novo visitante, **When** ele clica em "Entrar" e se autentica, **Then** o
   sistema cria a conta, pede o username do Discogs, e inicia o onboarding.
2. **Given** o DJ forneceu um username válido do Discogs, **When** o sistema inicia o import
   inicial, **Then** exibe progresso em tempo real (`X de Y discos`), não bloqueia a UI, e
   respeita o limite de 60 req/min autenticado.
3. **Given** o import concluiu, **When** o DJ abre a home `/`, **Then** a listagem mostra
   todos os discos importados com capa, artista, título, ano, selo, gêneros e
   `shelfLocation` (se preenchido).
4. **Given** a listagem está aberta, **When** o DJ aplica filtro por status (`unrated`,
   `active`, `discarded`, `all`), gênero, ou texto livre em artista/título, **Then** a
   listagem atualiza refletindo o filtro.
5. **Given** o DJ está autenticado, **When** ele faz logout e login novamente, **Then** a
   coleção e todos os dados autorais aparecem preservados.

---

### User Story 2 - Triar a coleção em massa e curar faixas (Priority: P2)

O DJ quer passar pelos 2500 discos decidindo `active` ou `discarded` rapidamente via
`/curadoria` (modo triagem sequencial), e depois entrar faixa a faixa em cada disco `active`
para marcar quais entram no repertório. Para cada faixa selecionada, preenche BPM, tom,
energia, moods, contextos, gênero fino, referências, comentário e — opcionalmente — a flag
Bomba 💣.

**Why this priority**: Sem curadoria, a montagem de set não tem universo para filtrar. É o
diferencial do produto (o Discogs resolve "o que eu tenho"; o Sulco resolve "o que eu levo").

**Independent Test**: Abrir `/curadoria` com filtro `unrated`, passar por 5 discos via
teclado decidindo `active`/`discarded`, entrar no detalhe de um `active`, marcar 3 faixas
como `selected`, preencher todos os campos de uma delas (inclusive Bomba), e verificar que a
persistência reflete na listagem da coleção e nos candidatos de montagem de set.

**Acceptance Scenarios**:

1. **Given** há discos com `status = unrated`, **When** o DJ acessa `/curadoria` com filtro
   padrão, **Then** o primeiro disco do filtro é exibido com capa, metadados e tracklist,
   além de um contador `X de Y`.
2. **Given** um disco está em exibição, **When** o DJ marca `active` ou `discarded` (via
   botão ou atalhos `A`/`D`), **Then** a mudança persiste e o sistema avança
   automaticamente para o próximo disco do filtro.
3. **Given** o DJ está no modo triagem, **When** ele pressiona seta direita sem avaliar,
   **Then** avança sem alterar o status; seta esquerda volta para o anterior preservando o
   que já foi salvo.
4. **Given** o DJ está na página `/disco/[id]` de um disco `active`, **When** ele marca uma
   faixa como `selected`, **Then** os campos autorais de curadoria ficam visíveis para
   edição (BPM, tom, energia 1–5, moods, contextos, gênero fino, referências, comentário,
   Bomba).
5. **Given** uma faixa `selected`, **When** o DJ ativa o toggle Bomba 💣, **Then** a flag é
   persistida como `true` e o emoji 💣 passa a aparecer ao lado de posição/título da faixa
   em qualquer listagem onde ela apareça (página do disco, candidatos em montagem de set,
   bag de set).
6. **Given** uma faixa tem dados de curadoria preenchidos, **When** o DJ desmarca
   `selected`, **Then** os dados permanecem no banco (não são apagados) mas ficam ocultos
   na UI até `selected` ser reativado.
7. **Given** o DJ terminou o filtro de triagem, **When** avalia o último disco, **Then**
   uma tela de conclusão mostra o total triado na sessão e link para voltar à coleção.

---

### User Story 3 - Criar um set a partir de um briefing e montar a bag (Priority: P3)

O DJ foi contratado para um evento. Cria um set com nome, data, local e briefing (texto
livre descrevendo o evento). A partir da tela de montagem, filtra faixas `selected` de
discos `active` por energia, mood, contexto, BPM, tom e Bomba, seleciona as que quer levar, e
o sistema gera automaticamente a bag física (lista de discos únicos com localização na
estante para facilitar pegar da coleção).

**Why this priority**: É o output final do produto. Tudo que vem antes (import, triagem,
curadoria) alimenta este momento. É o que o DJ usa na véspera do evento.

**Independent Test**: Criar um set com briefing, abrir a tela de montagem, aplicar filtros
(ex: energia ≥4 e contexto "pico"), adicionar 10 faixas distintas vindas de pelo menos 3
discos, visualizar a tela do set e confirmar que a bag física lista os 3 discos únicos com
suas `shelfLocation`.

**Acceptance Scenarios**:

1. **Given** o DJ está autenticado, **When** acessa `/sets/novo` e preenche nome,
   (opcionalmente) data do evento, local e briefing, **Then** o set é criado e o DJ é
   redirecionado para a tela de montagem. O status exibido é `draft` se `eventDate`
   ficou vazio, ou `scheduled` se uma data futura foi preenchida.
2. **Given** a tela de montagem está aberta, **When** o DJ aplica filtros combinados (BPM,
   tom, energia, mood, contexto, Bomba, texto livre), **Then** a lista de faixas-candidatas
   atualiza mostrando apenas faixas com `selected = true` pertencentes a discos com `status
   = active` que satisfazem os filtros.
3. **Given** faixas-candidatas estão visíveis, **When** o DJ adiciona uma faixa ao set,
   **Then** ela some dos candidatos (já está no set) e aparece na lista do set na ordem em
   que foi adicionada.
4. **Given** o set tem ≥1 faixa, **When** o DJ abre `/sets/[id]`, **Then** vê a lista
   ordenada de faixas, a bag física derivada automaticamente (discos únicos com
   `shelfLocation`), e o briefing.
5. **Given** o set tem faixas com Bomba, **When** a UI renderiza a lista do set e a bag,
   **Then** o emoji 💣 aparece ao lado das faixas `isBomb = true`.
6. **Given** o DJ ajusta a ordem das faixas no set, **When** salva, **Then** a nova ordem
   persiste e a tela do set reflete.
7. **Given** o evento aconteceu (ou seja, `eventDate` ficou no passado), **When** o DJ
   abre `/sets` ou `/sets/[id]`, **Then** o set aparece com status derivado `done`
   automaticamente; as faixas, briefing e bag continuam acessíveis para referência
   futura sem ação manual do DJ.

---

### User Story 4 - Manter coleção sincronizada com Discogs sem perder curadoria (Priority: P4)

Após o import inicial, a coleção do DJ continua evoluindo no Discogs (novos discos, discos
removidos, metadados corrigidos). O Sulco sincroniza diariamente comparando a primeira
página de `date_added` e oferece um botão de sincronização manual e reimport por disco,
sempre preservando campos autorais (status, shelfLocation, notes, todos os campos de
curadoria de faixas, incluindo Bomba).

**Why this priority**: Garante que a curadoria acumulada ao longo do tempo continue
refletindo a coleção real. Sem sync confiável, a lista fica datada e o DJ perde confiança.
Vem depois das P1–P3 porque o piloto pode operar temporariamente só com o import inicial se
o sync tiver bug.

**Independent Test**: Adicionar um novo disco no Discogs, clicar "Sincronizar agora" no
Sulco, e verificar que o novo disco aparece com `status = unrated`. Remover outro disco do
Discogs, sincronizar, e verificar que o disco no Sulco foi **arquivado com aviso ao usuário,
não deletado**. Editar um campo autoral (ex: `notes`) e disparar sync: o campo MUST
permanecer intacto.

**Acceptance Scenarios**:

1. **Given** o DJ adicionou novos discos no Discogs desde o último sync, **When** o sync
   diário automático roda (ou o DJ clica "Sincronizar agora"), **Then** apenas os novos
   discos são importados com `status = unrated` e os existentes não são tocados em seus
   campos autorais.
2. **Given** um disco foi removido do Discogs, **When** o sync detecta a remoção, **Then**
   o sistema arquiva o registro, sinaliza o DJ com um aviso persistente, e NÃO deleta dados
   curatoriais associados.
3. **Given** um disco teve metadados corrigidos no Discogs (ex: ano, label), **When** o DJ
   clica "Reimportar este disco", **Then** apenas campos do Discogs são atualizados; campos
   autorais (`status`, `shelfLocation`, `notes`, curadoria de faixas, Bomba) permanecem
   intactos.
4. **Given** o Discogs removeu uma faixa de um release que existe no Sulco, **When** o sync
   ou reimport detecta, **Then** a faixa é marcada como conflito (exibida com aviso), não
   deletada.
5. **Given** o import inicial está em andamento, **When** o DJ navega pela UI, **Then** ele
   pode usar as partes já importadas (a listagem cresce em tempo real); operações de
   curadoria nesses discos já importados são permitidas e não são perdidas pelo job em
   background.
6. **Given** o sync bate no rate limit do Discogs, **When** o sistema detecta (HTTP 429 ou
   contador interno), **Then** o job pausa, registra e retoma respeitando o limite, sem
   perder progresso.

---

### Edge Cases

- **Username do Discogs inválido ou coleção vazia**: onboarding exibe erro claro e permite
  corrigir; conta não fica travada em estado intermediário.
- **Import inicial interrompido** (browser fechado, conexão caiu): ao voltar, o sistema
  retoma do último disco importado, não reinicia do zero.
- **Disco sem tracklist no Discogs**: o disco é importado mesmo assim; curadoria detalhada
  fica bloqueada com aviso "tracklist indisponível, reimportar" até o DJ decidir.
- **Filtro vazio em `/curadoria`**: exibir estado vazio com opção de trocar filtro.
- **Falha de persistência em mutação** (disco, faixa, set): não avançar de disco, não
  remover da UI, mostrar erro inline.
- **Navegação além dos limites em `/curadoria`**: seta esquerda no primeiro disco não
  faz nada; seta direita no último leva à tela de conclusão.
- **Disco modificado por sync durante curadoria ativa**: campos do Discogs podem ser
  atualizados silenciosamente; campos autorais NEVER sobrescritos (Princípio I da
  Constitution). Conflitos semânticos (faixa removida do Discogs que estava `selected`) são
  sinalizados, nunca descartados.
- **Set sem faixas**: bag física mostra estado vazio; set pode existir sem faixas
  (aparece com status derivado conforme `eventDate`).
- **Faixa removida pelo DJ do set**: não afeta o estado `selected` original da faixa nem sua
  flag Bomba; apenas a retira da lista do set.
- **Duas sessões simultâneas do mesmo usuário**: assume-se que o DJ usa um dispositivo por
  vez; não há locking otimista — o "último a salvar vence" no nível de mutação individual.
- **Release duplicado na coleção Discogs**: quando o DJ tem >1 cópia do mesmo release,
  o import/sync faz upsert idempotente por `(userId, discogsId)`; apenas 1 registro é
  criado no Sulco. Nenhum aviso é exibido; a diferenciação física fica a cargo do DJ
  via `shelfLocation`/`notes`.
- **Logout durante sync em background**: sync associado ao usuário pausa; ao logar de novo,
  retoma de onde parou.
- **Deleção de conta durante sync em background**: ao receber webhook `user.deleted` da
  Clerk (ou confirmação do botão "Apagar conta"), qualquer job de sync em andamento para
  aquele usuário MUST ser abortado antes do hard-delete em cascata; não há retenção
  nem grace period.

## Requirements *(mandatory)*

### Functional Requirements

#### Autenticação e Conta

- **FR-001**: Sistema MUST exigir autenticação para acessar qualquer rota que não seja
  landing/login; sessão persiste entre reloads.
- **FR-002**: Sistema MUST permitir criação de conta e login via Clerk (email + social
  login); logout MUST encerrar a sessão em todos os dispositivos do usuário atual
  (usar capacidade "sign out all sessions" da Clerk).
- **FR-003**: Sistema MUST associar toda a coleção, curadoria e sets a um único usuário
  autenticado; nenhum usuário vê dados de outro.
- **FR-004**: Sistema MUST permitir ao usuário informar/atualizar seu username do Discogs
  e seu Personal Access Token do Discogs na própria conta; o token MUST ser cifrado
  at-rest no banco e NEVER exibido em texto claro após salvo (apenas máscara/"substituir").
- **FR-042**: Sistema MUST oferecer ação "Apagar conta" na área de conta do DJ e MUST
  também reagir ao webhook `user.deleted` da Clerk; qualquer um dos gatilhos MUST
  executar hard-delete em cascata de todos os dados associados ao usuário (records,
  tracks, sets, setTracks, syncRuns) de forma imediata e irreversível, sem retenção.
- **FR-043**: A ação "Apagar conta" na UI MUST exigir confirmação explícita (ex:
  digitar "APAGAR" ou o email) antes de executar, e MUST também revogar a conta na
  Clerk ao final do fluxo.
- **FR-044**: Ao detectar resposta HTTP 401 do Discogs em qualquer chamada (import,
  sync, reimport), sistema MUST marcar o usuário com o estado `discogsCredentialStatus
  = invalid`, registrar o evento em `syncRuns` com `outcome = erro`, e pausar todas
  as execuções automáticas de sync para aquele usuário até que um novo token seja
  salvo.
- **FR-045**: Enquanto `discogsCredentialStatus = invalid`, a UI MUST exibir um banner
  persistente global com mensagem clara ("Seu token do Discogs expirou ou foi
  revogado") e link direto para a tela de atualização do token em FR-004.
- **FR-046**: Ao salvar um novo token válido (validado por uma chamada de teste
  bem-sucedida ao Discogs), sistema MUST zerar `discogsCredentialStatus` para `valid`,
  remover o banner, e retomar o agendamento do sync automático no próximo ciclo.

#### Acessibilidade

- **FR-047**: Toda combinação texto/fundo e componentes de UI (botões, toggles,
  bordas de foco, badges como 💣) MUST atender contraste WCAG 2.1 AA (≥4.5:1 para
  texto normal, ≥3:1 para texto grande/UI), incluindo os tokens CSS definidos em
  `globals.css`.
- **FR-048**: Todo controle interativo (link, botão, toggle, input, atalho de teclado
  em `/curadoria`) MUST expor um estilo de foco visível (não usar `outline: none`
  sem substituto).
- **FR-049**: Toggles de `status` do disco, `selected` da faixa, `isBomb`, e filtros
  MUST usar semântica ARIA apropriada (`role`, `aria-pressed`/`aria-checked`,
  `aria-label` quando o rótulo for só ícone/emoji).

#### Coleção e Listagem

- **FR-005**: Sistema MUST expor a rota `/` exibindo todos os discos do usuário com capa,
  artista, título, ano, selo, gêneros, status e `shelfLocation` quando disponível.
- **FR-006**: Sistema MUST permitir filtrar a listagem por: status (`unrated`, `active`,
  `discarded`, `all`), gênero, texto livre (artista/título), e presença de faixas com
  Bomba. Quando o DJ seleciona múltiplos gêneros, a semântica é AND (o disco só
  aparece se tiver TODOS os gêneros selecionados), consistente com FR-024.
- **FR-007**: Sistema MUST oferecer link "Curadoria →" em cada item da listagem que leva a
  `/curadoria` pré-selecionando aquele disco.

#### Curadoria Sequencial (`/curadoria`)

- **FR-008**: Sistema MUST expor a rota `/curadoria` que exibe um disco por vez com capa,
  metadados do Discogs e tracklist completo.
- **FR-009**: Sistema MUST permitir filtrar a navegação em `/curadoria` por status
  (`unrated | active | discarded | all`), com `unrated` como default.
- **FR-010**: Sistema MUST exibir contador de progresso `X de Y` relativo ao filtro ativo.
- **FR-011**: Usuário MUST poder alterar o `status` do disco atual entre `active` e
  `discarded` via controle explícito.
- **FR-012**: Sistema MUST persistir toda mudança de status imediatamente e avançar
  automaticamente para o próximo disco do filtro após persistência bem-sucedida.
- **FR-013**: Sistema MUST suportar navegação por teclado com, no mínimo: seta direita
  (próximo/skip), seta esquerda (anterior), `A` (marcar active), `D` (marcar discarded), e
  espaço (alternar `selected` da faixa focada quando em modo detalhe).
- **FR-014**: Sistema MUST exibir estado vazio com opção de trocar filtro quando o filtro
  ativo não tiver discos.
- **FR-015**: Sistema MUST exibir tela de conclusão ao avaliar o último disco do filtro.

#### Curadoria de Faixas (`/disco/[id]`)

- **FR-016**: Sistema MUST permitir marcar/desmarcar cada faixa como `selected` na página
  de detalhe do disco.
- **FR-017**: Quando uma faixa está `selected = true`, sistema MUST permitir editar:
  `bpm`, `musicalKey`, `energy` (1–5), `moods[]`, `contexts[]`, `fineGenre`,
  `references`, `comment`.
- **FR-017a**: Para `moods` e `contexts`, sistema MUST oferecer input tipo
  chip-picker com autocomplete sobre o conjunto de termos já usados pelo DJ
  (persistidos por uso prévio) somado às sementes pré-populadas do seed; o DJ MUST
  poder criar um novo termo digitando-o e confirmando (ex: Enter), sem passar por
  tela separada de gerenciamento. Termos são case-insensitive e normalizados
  (trim + lowercase) antes de comparar/persistir.
- **FR-017b**: Para `musicalKey`, sistema MUST usar exclusivamente a notação Camelot:
  `1A`–`12A` (tons menores) e `1B`–`12B` (tons maiores), validados por regex
  (`^(?:[1-9]|1[0-2])[AB]$`). O input MUST oferecer um picker visual (wheel Camelot)
  além do campo texto; entradas em notação tradicional MUST ser rejeitadas com
  mensagem orientando o DJ a usar o picker.
- **FR-017c**: Para `bpm`, sistema MUST aceitar apenas inteiros no intervalo
  fechado `[0, 250]`. O campo é opcional (pode ficar nulo). Valores fora do
  intervalo MUST ser rejeitados na validação da Server Action com mensagem clara
  ("BPM deve ser um inteiro entre 0 e 250"). O filtro de range em FR-024 opera
  sobre o mesmo intervalo.
- **FR-018**: Sistema MUST suportar flag `isBomb` booleana por faixa, independente de
  `energy`, ativada/desativada por toggle explícito.
- **FR-019**: Sistema MUST exibir o emoji 💣 ao lado de posição/título da faixa em toda
  listagem da aplicação sempre que `isBomb = true` (página do disco, candidatos de
  montagem, lista do set, bag).
- **FR-020**: Sistema MUST preservar valores dos campos autorais da faixa quando `selected`
  for desmarcado (dados permanecem no banco, UI esconde).

#### Sets

- **FR-021**: Sistema MUST expor rota `/sets` listando todos os sets do usuário com nome,
  data do evento, local e status derivado (`draft | scheduled | done`, calculado a
  partir de `eventDate` conforme FR-028).
- **FR-022**: Sistema MUST permitir criar um novo set via `/sets/novo` com nome, data do
  evento (opcional na criação; pode ser preenchida depois), local e briefing (texto
  livre).
- **FR-023**: Sistema MUST expor rota `/sets/[id]/montar` que lista faixas-candidatas
  derivadas de: `tracks` com `selected = true` pertencentes a `records` com `status =
  active`.
- **FR-024**: Sistema MUST permitir filtrar candidatos combinando: BPM (range), tom
  (musicalKey), energia (1–5), moods, contextos, Bomba (on/off), e texto livre
  (artista/título/faixa). Para campos multivalorados (moods, contextos, genres),
  a semântica MUST ser AND: uma faixa só aparece se possuir TODOS os termos
  selecionados pelo DJ. Campos escalares (BPM range, energia, tom, Bomba) continuam
  sendo combinados com os demais via AND (interseção geral dos filtros ativos).
- **FR-024a**: Sistema MUST persistir o estado atual dos filtros da tela
  `/sets/[id]/montar` em um campo JSON `montarFiltersJson` na entidade `sets`; ao
  reabrir a tela do mesmo set (mesmo dispositivo ou outro), o estado MUST ser
  restaurado. Salvamento é automático (sem botão explícito) após cada mudança de
  filtro, respeitando debounce razoável.
- **FR-025**: Sistema MUST permitir adicionar e remover faixas do set; ao adicionar, a
  faixa sai dos candidatos e entra na lista do set com a ordem do momento de inserção.
- **FR-026**: Sistema MUST permitir reordenar as faixas do set via drag-and-drop como
  mecanismo primário, com fallback por teclado (setas ↑/↓ movem o item atualmente
  focado uma posição por vez); a ordem resultante MUST ser persistida. A semântica
  ARIA (`role="listbox"`/`role="option"` ou equivalente) MUST ser aplicada para
  atender FR-049.
- **FR-027**: Sistema MUST expor rota `/sets/[id]` exibindo: lista ordenada de faixas com
  indicador 💣 quando aplicável, briefing, e bag física derivada (discos únicos com
  `shelfLocation`).
- **FR-028**: O status do set MUST ser derivado automaticamente de `eventDate`, não
  editado manualmente: `draft` quando `eventDate` é nulo/vazio; `scheduled` quando
  `eventDate` é uma data/hora no futuro; `done` quando `eventDate` está no passado.
  `eventDate` MUST ser armazenado em UTC (ISO 8601), mas TODA comparação com "agora"
  e TODA exibição ao DJ MUST ocorrer no fuso `America/Sao_Paulo`. O input de
  `eventDate` na UI usa `<input type="datetime-local">` (que o navegador
  interpreta no timezone do cliente) e o servidor converte para UTC ao persistir.
  O DJ altera o status exclusivamente ajustando ou limpando `eventDate`. A UI MUST
  exibir o status calculado em FR-021 e FR-027.
- **FR-029**: Remover uma faixa de um set NEVER MUST alterar `selected` ou `isBomb` da
  faixa original.

#### Sincronização com Discogs

- **FR-030**: Sistema MUST executar import inicial em background após o onboarding, sem
  bloquear a UI, atualizando a listagem em tempo real conforme discos entram.
- **FR-031**: Sistema MUST respeitar o rate limit autenticado do Discogs (60 req/min);
  ao atingir limite, MUST pausar, registrar e retomar sem perder progresso.
- **FR-032**: Sistema MUST executar sync automático diário via scheduler server-side
  (cron), rodando independentemente de haver sessão ativa do DJ no momento, comparando
  apenas a primeira página por `date_added desc` para detectar novos discos e remoções.
- **FR-033**: Sistema MUST oferecer botão "Sincronizar agora" na UI para disparar sync
  manual.
- **FR-034**: Sistema MUST oferecer botão "Reimportar este disco" na página `/disco/[id]`
  para atualizar metadados Discogs de um disco individual.
- **FR-034a**: Após um reimport bem-sucedido de um disco, o botão "Reimportar este
  disco" daquele disco específico MUST permanecer desabilitado por 60 segundos,
  exibindo uma mensagem/contagem regressiva ("Aguarde XXs"); transcorrido o
  cooldown, o botão volta a ficar ativo. O cooldown é por `(userId, recordId)` e
  NÃO afeta reimports de outros discos nem o sync automático.
- **FR-035**: Sync e reimport MUST atualizar apenas campos originários do Discogs
  (`discogsId`, `artist`, `title`, `year`, `label`, `country`, `format`, `genres`,
  `styles`, `coverUrl`, e `position`/`title`/`duration` de faixas) e NEVER sobrescrever
  campos autorais (Princípio I da Constitution).
- **FR-036**: Quando um disco sai da coleção Discogs, sistema MUST arquivar o registro,
  sinalizar o usuário com aviso persistente, e NEVER deletar.
- **FR-037**: Quando uma faixa é removida do release no Discogs, sistema MUST marcá-la como
  conflito, preservando todos os campos autorais e a flag Bomba.
- **FR-037a**: Para cada faixa em conflito listada no painel de status (FR-040),
  sistema MUST oferecer duas ações explícitas: (a) "Manter no Sulco" — remove a marca
  de conflito e a faixa permanece local com todos os campos autorais intactos mesmo
  sem existir no Discogs; (b) "Descartar" — deleta a faixa e todas as suas relações
  em `setTracks`, após confirmação do DJ. Sistema NEVER resolve conflitos
  automaticamente (sem TTL, sem purge em lote sem ação).
- **FR-037b**: Se uma faixa previamente descartada via "Descartar" reaparece em um
  sync futuro (Discogs voltou a listá-la), sistema MUST reimportá-la como faixa nova
  (dados autorais zerados, `selected = false`); o estado autoral anterior NÃO é
  restaurado automaticamente. Se uma faixa previamente em "Manter no Sulco" reaparece,
  sistema MUST reconciliar (unir registros) preservando os campos autorais.
- **FR-038**: Sistema MUST permitir que operações de curadoria em discos já importados
  coexistam com o import inicial em andamento sem perda de mutações.
- **FR-039**: Sistema MUST registrar cada execução de sync (automático, manual ou
  reimport) como uma entrada com: timestamp de início/fim, resultado
  (`ok | erro | rate_limited | parcial`), contagem de novos/removidos/conflitos, e
  mensagem de erro quando aplicável.
- **FR-040**: Sistema MUST expor um painel in-app "Status de sincronização" acessível
  pelo header que exibe a última execução, histórico recente, e a lista de conflitos
  pendentes (discos arquivados por remoção no Discogs e faixas em conflito).
- **FR-041**: Sistema MUST exibir um badge/indicador no header global sempre que houver
  (a) a última execução automática falhada sem reexecução bem-sucedida posterior, ou
  (b) conflitos pendentes não reconhecidos pelo DJ; o badge desaparece quando o DJ
  visualiza o painel ou reconhece os itens.

### Key Entities

- **Usuário**: Conta autenticada (via Clerk) associada a 1 username do Discogs e ao
  conjunto completo de dados (coleção, sets). Atributos: `id`, `clerkUserId` (FK lógica
  para o usuário na Clerk), `email`, `discogsUsername`, `discogsTokenEncrypted`
  (Personal Access Token cifrado at-rest, nunca retornado em texto claro pela UI),
  `discogsCredentialStatus` (`valid | invalid`; marcado `invalid` após HTTP 401 do
  Discogs; retorna a `valid` quando novo token passa em chamada de teste).
- **Disco (`records`)**: Um LP na coleção do DJ. Campos do Discogs:
  `discogsId`, `artist`, `title`, `year`, `label`, `country`, `format`, `genres[]`,
  `styles[]`, `coverUrl`. Campos autorais soberanos: `status` (`unrated | active |
  discarded`), `shelfLocation`, `notes`. Possui N faixas. **Unicidade**: UNIQUE
  `(userId, discogsId)` — se a coleção Discogs do DJ contiver múltiplas cópias do mesmo
  release, o Sulco guarda apenas 1 registro; múltiplas cópias físicas são descritas
  pelo DJ em `shelfLocation`/`notes`.
- **Faixa (`tracks`)**: Uma track dentro de um disco. Campos do Discogs: `position`,
  `title`, `duration`. Campos autorais soberanos: `selected`, `bpm` (inteiro `[0,250]`
  opcional), `musicalKey` (notação Camelot `^(?:[1-9]|1[0-2])[AB]$`), `energy`
  (1–5), `moods[]` (vocabulário híbrido aberto), `contexts[]` (vocabulário híbrido
  aberto), `fineGenre`, `references`, `comment`, **`isBomb` (novo, booleano
  independente de `energy`)**.
- **Set**: Coletânea ordenada de faixas preparada para um evento. Atributos: `id`, `name`,
  `eventDate` (pode ser nulo), `location`, `briefing`,
  `montarFiltersJson` (estado dos filtros da tela de montagem, persistido por set).
  Relação N:N com faixas via `setTracks` (com `order`). **Status é derivado** de
  `eventDate`: `draft` (nulo), `scheduled` (futuro), `done` (passado); não é uma
  coluna persistida nem editável diretamente.
- **Bag física** (derivada, não entidade persistida): Lista de discos únicos cujas faixas
  pertencem a um set, exibindo `shelfLocation` de cada um.
- **Conflito de sync** (estado marcado em `records`/`tracks`): Sinalização de que um item
  foi removido ou alterado no Discogs de forma incompatível com o estado local autorado
  pelo DJ; preservado para decisão manual. Em `tracks`, o conflito é resolvido pelo DJ
  via "Manter no Sulco" (mantém local) ou "Descartar" (deleta + relações em setTracks);
  em `records`, disco arquivado fica visível sob aviso persistente (FR-036).
- **Execução de sync (`syncRuns`)**: Registro de cada job de sync/reimport executado.
  Atributos: `id`, `userId`, `kind` (`initial_import | daily_auto | manual | reimport_record`),
  `startedAt`, `finishedAt`, `outcome` (`ok | erro | rate_limited | parcial`),
  `newCount`, `removedCount`, `conflictCount`, `errorMessage`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um DJ consegue completar o onboarding (criar conta, informar username
  Discogs, iniciar import) em menos de 2 minutos após abrir a landing.
- **SC-002**: Import inicial de 2500 discos conclui em até 45 minutos de duração total,
  com a listagem ficando navegável em tempo real durante o processo.
- **SC-003**: Triar 100 discos em `/curadoria` (decidir `active` ou `discarded`) leva menos
  de 30 minutos usando apenas o modo rápido e atalhos de teclado.
- **SC-004**: Alterar status de um disco em `/curadoria` e avançar para o próximo leva
  menos de 1 segundo percebido pelo usuário em condições normais.
- **SC-005**: Pelo menos 90% dos discos promovidos a `active` durante uma sessão terminam
  com ao menos uma faixa `selected` (indicador de uso real do produto, não abandono).
- **SC-006**: Montar um set com 20 faixas a partir de um briefing (criar set, filtrar
  candidatos, selecionar, reordenar) leva menos de 10 minutos.
- **SC-007**: Uma faixa marcada com Bomba 💣 é visualmente identificada em 100% das
  listagens onde aparece (página do disco, candidatos, set, bag).
- **SC-008**: Zero casos de sobrescrita acidental de campos autorais por sync do Discogs,
  verificável por teste de integração que simula sync sobre curadoria existente.
- **SC-009**: Sync automático diário completa em menos de 1 minuto em condições normais
  (coleção estável, ≤ 5 novos discos/dia).
- **SC-010**: 100% dos discos removidos no Discogs aparecem arquivados (não deletados) no
  Sulco após o próximo sync, com aviso persistente ao usuário.

## Assumptions

- **Escopo do piloto**: DJ individual usando um dispositivo por vez; sem colaboração
  multiusuário nem locking otimista. "Último a salvar vence" em mutações individuais.
- **Fora do escopo**: PWA/mobile, IA de briefing para sugestão de faixas, e Playlists
  (blocos reutilizáveis) — estes ficam fora deste piloto.
- **Autenticação**: Clerk como provedor de identidade (email + social login). Usuários
  e sessões vivem na Clerk; o Sulco guarda apenas `clerkUserId` para ligar aos dados
  próprios. Free tier da Clerk (até 10k MAU) cobre o piloto indefinidamente. Caso o
  produto escale para SaaS com custo relevante, migração para NextAuth/Auth.js é
  viável (export de usuários Clerk + import em NextAuth) e fica fora deste piloto.
- **Discogs**: API pública do Discogs com Personal Access Token por usuário (colado no
  onboarding, cifrado at-rest no banco); rate limit autenticado de 60 req/min; endpoints
  `GET /users/{username}/collection/folders/0/releases` e `GET /releases/{id}`. OAuth
  não é usado neste piloto.
- **Import inicial**: Usuário tolera aguardar ~45 min para coleções grandes; o job é
  incremental e resumível.
- **Sync diário**: Scheduler server-side (cron) dispara o job uma vez por dia
  independentemente da presença do DJ na app; o job compara apenas a primeira página
  por `date_added desc`; remoções profundas (páginas interiores) dependem de sync
  manual completo.
- **Bomba**: Binária (on/off), sem gradação; representada por 💣 em toda UI; independente
  de `energy`.
- **Desktop-first**: UI otimizada para desktop durante a fase de triagem; layout
  responsivo básico, mas sem tratamento específico para mobile (fora do piloto).
- **Tipografia e estética**: Seguem a direção editorial atual descrita no CLAUDE.md
  (EB Garamond + JetBrains Mono + paleta de tokens + acento vermelho com moderação);
  esta direção é evolutiva e pode ser ajustada sem bloquear features.
- **Conflitos semânticos (faixa removida do Discogs que estava `selected`)**: resolvidos
  por sinalização visual ao DJ, que decide caso a caso; o sistema nunca descarta dados
  autorais automaticamente.
- **Navegação por teclado**: Atalhos fixos (setas, A, D, espaço); não remapeáveis neste
  piloto.
- **Seed local**: Durante desenvolvimento, o seed com 30 discos de exemplo é suficiente
  para validar triagem, curadoria e montagem de sets antes do import real. O seed
  também MUST pré-popular um vocabulário inicial de 10 moods sugeridos e 8 contextos
  sugeridos (em pt-BR) que aparecem como autocomplete desde a primeira curadoria.
- **Backup e export**: O piloto NÃO fornece export/import de dados autorais. A
  recuperabilidade da curadoria depende exclusivamente do backup de infraestrutura do
  banco (snapshot do arquivo SQLite em dev; backup nativo do Turso/libsql em prod).
  Caso o DJ demande export no futuro, fica fora deste piloto.
- **Idioma e localização**: UI é pt-BR hard-coded (strings, rótulos, mensagens de
  erro, formato de data `dd/MM/yyyy`, idioma dos emails da Clerk em pt-BR quando
  disponível). Sem camada de i18n/dicionário no piloto; adicionar outro idioma no
  futuro é refactor localizado na camada de UI.
- **Fuso horário**: Timestamps (inclusive `eventDate`) armazenados em UTC; TODA
  exibição e TODA comparação com "agora" ocorrem em `America/Sao_Paulo`. Se no
  futuro o DJ tocar em outro fuso, ajuste é de configuração, não de schema.
