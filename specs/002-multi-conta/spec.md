# Feature Specification: Multi-conta com signup por convite

**Feature Branch**: `002-multi-conta`
**Created**: 2026-04-23
**Status**: Draft
**Input**: Abrir o Sulco para 2–5 DJs convidados, cada um com sua própria
conta, credencial Discogs, curadoria e sets completamente isolados,
mantendo signup restrito a uma allowlist de emails gerenciada pelo owner.

## Clarifications

### Session 2026-04-23

- Q: Como o sistema reconhece quem é o owner? → A: Compara email + exige
  verified email; primeiro user cujo email bate com `OWNER_EMAIL` tem
  seu `clerkUserId` gravado em `users.is_owner=1`, e chamadas
  subsequentes usam o bit (não o email). Defesa contra "trocar email no
  Clerk pra virar admin" sem UI adicional.
- Q: Onde renderizar a mensagem de "convite fechado"? → A: Página
  própria `/convite-fechado` no Sulco, com identidade editorial do
  piloto, em pt-BR, incluindo forma de pedir acesso (link mailto ou
  texto). O middleware/auth detecta rejeições da Clerk Allowlist e
  redireciona para lá.
- Q: Admin view — rota web ou CLI? → A: Rota web `/admin` só acessível
  ao owner (bit `users.is_owner`). Visitantes não-owner recebem 404.
  Sem CLI/script no escopo; Turso shell fica como plano B operacional
  se algo sair do ar.
- Q: Observabilidade mínima — owner precisa ser notificado quando um
  amigo trava? → A: Nada extra. Owner checa `/admin` quando lembrar ou
  quando amigo reclamar. Sem logs estruturados, sem email, sem Sentry
  neste spec — aceita que amigos podem travar silenciosamente. Se o
  volume crescer (>5 users), revisitar.
- Q (pivot 2026-04-23): Clerk Allowlist é feature Pro (~US$25/mês) —
  fora do orçamento pro piloto. → A: Implementar allowlist **própria
  no Sulco**: tabela `invites` no Turso + coluna `users.allowlisted`
  + gestão via `/admin/convites` (UI leve dentro do painel admin).
  Users não-allowlisted são criados na Clerk normalmente, mas o
  webhook `user.created` marca `allowlisted=false` e o middleware os
  redireciona para `/convite-fechado` em toda request. Owner pode
  promover adicionando o email em `invites`. Impacto: +1 entidade
  (`Invite`), +1 coluna (`users.allowlisted`), +1 rota
  (`/admin/convites`), +2 Server Actions (`addInvite`, `removeInvite`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Owner libera convite para amigo DJ (Priority: P1)

O owner do Sulco adiciona o email de um amigo DJ à lista de convidados.
Esse amigo consegue criar conta, fazer onboarding com o próprio PAT
Discogs e usar o app com sua coleção isolada.

**Why this priority**: é o caminho principal sem o qual a feature
inteira não acontece. Sem signup funcionando por convite, nenhum
amigo entra.

**Independent Test**: com o Sulco no ar, o owner adiciona um email
na Clerk Allowlist; o dono desse email acessa a URL, cria conta, faz
onboarding com PAT próprio, e vê a própria coleção sem ver a do owner.
Considerado sucesso quando a coleção importada é diferente da do owner
e o total de discos bate com a coleção Discogs do convidado.

**Acceptance Scenarios**:

1. **Given** o email `amigo@exemplo.com` está na allowlist da Clerk,
   **When** o amigo acessa a URL do Sulco pela primeira vez e clica em
   "Criar conta" usando `amigo@exemplo.com`, **Then** a Clerk permite
   o signup, o webhook cria linha em `users`, e o amigo é redirecionado
   para `/onboarding`.
2. **Given** o amigo está em `/onboarding`, **When** ele insere seu
   username Discogs e PAT próprio e clica em Salvar, **Then** o import
   inicial começa para a coleção dele e a home `/` passa a mostrar os
   discos dele, não os do owner.
3. **Given** dois convidados com contas ativas, **When** o convidado A
   navega pela home, curadoria, sets e status, **Then** nenhum dado
   (discos, sets, status de sync, nomes ou PATs) do convidado B é
   visível.

---

### User Story 2 — Visitante não-convidado vê mensagem clara (Priority: P1)

Uma pessoa que não está na allowlist tenta criar conta. Em vez de ver
erro genérico da Clerk, ela vê uma mensagem explicando que o Sulco
está em fase de convite fechado.

**Why this priority**: governança sem UX cuidada vira frustração.
Qualquer tester vai compartilhar a URL com alguém — essa pessoa precisa
entender por que não consegue entrar sem sentir que o app está quebrado.

**Independent Test**: acessar a URL de signup com um email que não
está na allowlist e verificar que a resposta é uma tela em pt-BR
explicando "Sulco está em fase de convite" com orientação de como
pedir acesso (mesmo que seja "entre em contato com X"), ao invés do
erro default da Clerk.

**Acceptance Scenarios**:

1. **Given** o email `estranho@exemplo.com` NÃO está na allowlist,
   **When** essa pessoa tenta criar conta, **Then** aparece uma
   mensagem em português clara explicando que o acesso é por convite,
   sem expor detalhes técnicos.
2. **Given** um visitante vê a mensagem de convite fechado, **When**
   ele fecha e volta depois com um email autorizado, **Then** consegue
   criar conta normalmente.

---

### User Story 3 — Owner vê quem está usando o Sulco (Priority: P2)

O owner precisa conseguir olhar, de tempos em tempos, quantas contas
existem, quem são e se estão conseguindo usar (coleção importou? Último
sync ok?). Sem isso fica cego sobre os convidados.

**Why this priority**: operar o piloto com 2–5 pessoas sem qualquer
visibilidade é insustentável — o owner precisa saber se alguém travou
no onboarding, se o import deu erro, se um convidado parou de usar.
Mas não é tão crítico quanto o signup em si (US1/US2): o owner pode
consultar o Turso direto enquanto não houver UI.

**Independent Test**: com 3 contas existentes, owner acessa uma tela
(ou interface equivalente documentada) e consegue listar: email,
username Discogs, quantos discos importados, timestamp do último sync,
e se há credencial válida — tudo em pt-BR, em uma única visão.

**Acceptance Scenarios**:

1. **Given** 3 contas existem (owner + 2 convidados), **When** o owner
   acessa a visão de administração, **Then** vê 3 linhas, cada uma com
   email, data de criação, username Discogs, status da credencial,
   contagem de discos importados e timestamp do último sync.
2. **Given** um convidado tem credencial inválida ou import incompleto,
   **When** o owner olha a visão, **Then** essa condição aparece
   destacada (cor, label ou posição) para facilitar ação.
3. **Given** o owner NÃO está logado (ou é logado como um convidado
   comum), **When** tenta acessar a visão de administração, **Then**
   recebe 404 ou redirect para a home — nunca vê dados de outros users.

---

### User Story 4 — Dívida do audit: playlists com userId (Priority: P2)

As tabelas `playlists` e `playlist_tracks` existem no schema mas não
têm `userId`. Enquanto elas estiverem fora do escopo de UI (FR-053a),
não há vazamento, mas qualquer reativação futura vazaria dados entre
contas. Fechar a dívida agora, com banco pequeno, é barato.

**Why this priority**: é a única vulnerabilidade conhecida de
isolamento, identificada pelo audit. Não é P1 porque as rotas
`/playlists*` seguem bloqueadas (middleware rewrite → 404), mas é P2
porque cada semana que passa o custo de migração cresce com o número
de rows.

**Independent Test**: após a mudança, `SELECT * FROM playlists WHERE
user_id IS NULL` retorna zero linhas e a UNIQUE/NOT NULL constraint
impede inserir sem user_id; verificação feita via Turso shell.

**Acceptance Scenarios**:

1. **Given** o schema atualizado, **When** alguém (ou código legado)
   tenta inserir uma playlist sem `user_id`, **Then** o banco rejeita.
2. **Given** duas contas distintas, **When** cada uma insere uma
   playlist com o mesmo nome, **Then** ambas coexistem e cada uma vê
   apenas a sua ao consultar `WHERE user_id = ?`.
3. **Given** uma conta é apagada (ON DELETE CASCADE), **When** o user
   some, **Then** suas playlists e playlist_tracks somem junto sem
   deixar órfãos.

---

### Edge Cases

- **Convidado muda de email**: allowlist guarda `email@X`, convidado
  faz signup com `email@Y` (outro alias Gmail, por exemplo) — não
  entra, vê mensagem de convite fechado. Owner precisa adicionar o
  novo email.
- **Email com case diferente**: allowlist tem `Joao@Gmail.com`,
  convidado tenta com `joao@gmail.com` — deve funcionar (Clerk
  normaliza, mas precisamos validar e documentar).
- **Convidado deleta própria conta via `/conta`**: FR-042/043 já
  cobrem (cascade + Clerk deleteUser). Precisa continuar funcionando
  em multi-user; owner não deve ser afetado.
- **Owner tenta acessar dados de outro user via URL direta**: ex:
  `/disco/123` onde disco 123 pertence ao convidado A — middleware +
  query scoping atual já retornam 404, mas vale testar com as novas
  contas.
- **Convidado removido da allowlist enquanto sessão ativa**: owner
  tira o email do convidado da allowlist, convidado continua logado
  com sessão existente — comportamento aceitável ou precisa revogar
  sessão? Default: manter sessão, convidado permanece até expirar.
- **Tela de admin acessada durante uma deleção em curso**: se o owner
  está vendo a tela quando um user é deletado (por si mesmo), a linha
  desaparece na próxima recarga; não precisa real-time.

## Requirements *(mandatory)*

### Functional Requirements

**Signup por convite:**

- **FR-001**: O sistema DEVE manter uma tabela `invites` (email +
  metadados de auditoria) que representa a allowlist de acesso. Apenas
  users cujo email esteja presente em `invites` (ou que sejam o owner)
  DEVEM ter acesso às rotas protegidas do Sulco.
- **FR-002**: A allowlist DEVE ser gerenciável via rota `/admin/convites`,
  acessível apenas ao owner. Operações mínimas: adicionar email,
  remover email, listar convites atuais com data de criação. Não
  precisa import em massa.
- **FR-003**: Users autenticados cujo email NÃO esteja em `invites`
  (flag `users.allowlisted=false`) DEVEM ser redirecionados para
  `/convite-fechado` em qualquer request, exceto o próprio `/convite-fechado`
  e rotas públicas (`/sign-in`, `/sign-up`, `/api/webhooks/*`). A
  página `/convite-fechado` DEVE renderizar mensagem em pt-BR
  explicando acesso por convite e ofertando link mailto para o owner.
  A página DEVE seguir a identidade editorial do piloto.
- **FR-004**: O processo de convidar alguém DEVE estar documentado
  em `docs/convites.md` — passos de uso da rota `/admin/convites` +
  alternativa via Turso shell em emergência.
- **FR-005**: O webhook Clerk (`/api/webhooks/clerk`) DEVE, no evento
  `user.created`:
  1. Criar linha em `users`.
  2. Verificar se o email (primary + verified) bate com alguma entrada
     em `invites` → setar `users.allowlisted=true`. Caso contrário,
     `users.allowlisted=false`.
  3. Aplicar lógica de promoção a owner (FR-012) em seguida.
  Eventos `user.updated` DEVEM re-avaliar `allowlisted` se o email
  mudar. `user.deleted` DEVE cascatear como no 001.

**Isolamento multi-conta:**

- **FR-006**: Todo dado de usuário (records, tracks, sets, set_tracks,
  sync_runs, playlists, playlist_tracks) DEVE estar escopado por
  `user_id` ou derivado de entidade escopada.
- **FR-007**: Nenhuma query de leitura ou mutação DEVE retornar dados
  de outros usuários, sob nenhuma circunstância, incluindo tentativas
  deliberadas de passar IDs de outros users em URLs ou payloads.
- **FR-008**: As tabelas `playlists` e `playlist_tracks` DEVEM ganhar
  `user_id` com FK para `users(id) ON DELETE CASCADE` e constraint
  NOT NULL.
- **FR-009**: O rate limiter do Discogs DEVE isolar buckets por user —
  a cota de um convidado não afeta a de outro (comportamento atual
  confirmado pelo audit; precisa permanecer válido em carga real).

**Visão de administração:**

- **FR-010**: O sistema DEVE oferecer duas rotas admin acessíveis apenas
  ao owner:
  1. `/admin` — lista de contas com: email, data de criação, username
     Discogs, status da credencial, contagem de discos importados,
     timestamp do último sync, flag `allowlisted`.
  2. `/admin/convites` — gestão da allowlist: input para adicionar
     email, lista de convites existentes, botão para remover convite
     (cada remove dispara também `UPDATE users SET allowlisted=false`
     onde email bate).
- **FR-011**: Apenas o owner DEVE poder acessar essas rotas. Acesso
  por qualquer outro usuário DEVE resultar em 404 (mesmo que o user
  já esteja autenticado e allowlisted).
- **FR-012**: A identificação do owner DEVE combinar email configurado
  via variável de ambiente (`OWNER_EMAIL`) com verificação de email na
  Clerk. Na primeira vez que um user autenticado com email verificado
  bater com `OWNER_EMAIL`, o sistema DEVE gravar seu `clerkUserId` em
  `users.is_owner=true`. As verificações de owner subsequentes DEVEM
  usar essa flag, não comparação de email — isso bloqueia qualquer
  tentativa de outro user trocar o email da conta Clerk para assumir
  privilégio de owner.
- **FR-013**: As visões de admin DEVEM ser implementadas como rotas
  web `/admin` e `/admin/convites`. Ambas DEVEM seguir a identidade
  editorial do Sulco, estar em pt-BR, e retornar 404 para qualquer
  user que não tenha `users.is_owner=true` (nem redirecionar para
  login — 404 puro, para não expor a existência das rotas).

**Operação:**

- **FR-014**: O sistema DEVE continuar operando em Vercel Hobby +
  Turso + Clerk test keys (sem domínio próprio) durante este spec.
- **FR-015**: O piloto multi-conta DEVE ser gratuito para todos os
  convidados — nenhum gate de pagamento.

### Key Entities

- **User**: já existe. Ganha **duas** colunas novas:
  - `is_owner` (boolean, default false) — travado após primeiro match
    de `OWNER_EMAIL` com email verified.
  - `allowlisted` (boolean, default false) — true se o email estiver
    em `invites` OU se `is_owner=true`. Middleware usa essa flag pra
    decidir se permite acesso às rotas protegidas ou redireciona para
    `/convite-fechado`.
- **Invite** (NOVO): allowlist própria do Sulco. Campos: `id`, `email`
  (UNIQUE, case-insensitive na comparação), `created_at`, `added_by_user_id`
  (FK → users opcional para auditoria). Gerenciada pelo owner via
  `/admin/convites`. A tabela `invites` é consultada pelo webhook
  Clerk `user.created` para decidir `users.allowlisted`.
- **Owner**: um user específico identificado por `users.is_owner=true`.
  Tem permissão de acessar `/admin` e `/admin/convites`. Implicitamente
  allowlisted (sem precisar de entrada em `invites`).
- **Playlists + PlaylistTracks** (existentes): ganham `user_id`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 4 amigos adicionados à allowlist conseguem criar conta
  com sucesso e completar o onboarding (100% de sucesso em 4 contas,
  sem intervenção do owner além de adicionar o email).
- **SC-002**: Pelo menos 1 tentativa de signup com email fora da
  allowlist resulta na mensagem de convite fechado (não em erro
  críptico da Clerk).
- **SC-003**: Zero vazamentos de dados entre contas, verificado
  manualmente com 2+ contas com dados distintos em todas as telas
  críticas (home, curadoria, disco/[id], sets, status, conta).
- **SC-004**: Owner consegue, em menos de 30 segundos, descobrir
  quantas contas existem e o status de cada (coleção importada?
  último sync ok?), sem consultar o Turso shell.
- **SC-005**: Reativar hipoteticamente a rota `/playlists` (sem
  ajuste adicional) não expõe playlists de outros users — a
  constraint `user_id NOT NULL` + query scoping torna o vazamento
  impossível.
- **SC-006**: Tempo total de onboarding de um convidado (da receita
  do convite à visualização da própria coleção no Sulco) cabe em 1h
  para 2500 discos — ou seja, o ciclo de import automatic retry do
  piloto continua funcionando para cada conta independentemente.

## Assumptions

- Signup é restrito via **allowlist própria** (tabela `invites` no
  Turso) gerenciada pelo owner via `/admin/convites`. Pivot deliberado
  frente ao fato de Clerk Allowlist ser feature Pro (US$25/mês) —
  registrado em Clarifications 2026-04-23.
- Clerk test instance continua aceitando signup de qualquer email.
  O filtro acontece do lado do Sulco (webhook + middleware).
- Users não-allowlisted criam conta na Clerk normalmente mas nunca
  veem conteúdo do Sulco — são redirecionados para `/convite-fechado`
  em toda request. Não são apagados da Clerk (overhead e UX ruim).
- O middleware DEVE rodar em **toda** request de rota protegida para
  verificar `users.allowlisted`; custo: 1 SELECT indexado por request.
- Convidados serão pessoas de confiança (amigos DJs), então
  comportamento adversarial extremo (tentativa deliberada de quebrar
  RBAC por URL manipulation) é parte do teste mas não requer defesa
  em profundidade além do que já existe.
- Volume de 2–5 users não justifica infra extra: rate limiter
  permanece em memória, encryption key permanece única, sem Redis,
  sem Inngest.
- A tela de admin, se criada, é leitura-apenas no piloto —
  desabilitar/apagar contas fica fora (owner faz isso via dashboard
  Clerk + cascade no webhook).
- Mudanças no schema (`user_id` em playlists) serão aplicadas via
  `drizzle-kit push` no Turso, antes do deploy.
- O piloto (001-sulco-piloto) já implementa isolamento em records,
  tracks, sets, set_tracks e sync_runs — este spec herda esse
  comportamento e foca apenas nos gaps (convite + playlists + admin).

## Dependencies

- **Tabela `invites` nova** + colunas `users.is_owner` e
  `users.allowlisted`: schema migration via `drizzle-kit push`.
- **Schema migration** das tabelas `playlists` e `playlist_tracks`:
  requer janela de manutenção curta (drizzle push + deploy).
- **Variável de ambiente `OWNER_EMAIL`** na Vercel: identifica
  quem é o owner; precisa ser configurada antes do primeiro deploy.

## Out of Scope (backlog registrado)

- Observabilidade ativa (logs estruturados, Sentry, emails de alerta
  ao owner) — aceita silencio; revisitar se volume passar de 5 users.
- Migração de `runInitialImport` para Inngest/Trigger.dev (permanece
  com retomada via polling + `after()` no Vercel Hobby).
- Rate limiter do Discogs em Redis (Upstash) — só necessário se volume
  passar de 10+ usuários ativos simultâneos.
- Per-user encryption keys (uma `MASTER_ENCRYPTION_KEY` segue
  cifrando todos os PATs).
- Stripe, planos pagos, qualquer monetização.
- UI de gestão de convites self-service (dashboard Clerk resolve).
- Ativação das rotas `/playlists*` como feature visível.
- Tela de admin com capacidade de editar/deletar outras contas.
- Notificações por email (convite aprovado, etc.) — depende do Clerk
  mandar automaticamente ou não; fora de escopo deste spec.
- Domínio próprio + promoção do Clerk para production instance (ainda
  com test keys e `*.accounts.dev`).
