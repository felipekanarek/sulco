# Research: Multi-conta 002 — signup invite-only + isolamento

## Contexto

O piloto 001 já resolve o grosso da multi-tenancy (schema scoped por
`user_id`, queries isoladas, middleware Clerk, webhook cascade). Este
research cobre apenas os gaps do spec 002: allowlist, UX de rejeição,
promoção do owner e migração de `playlists`/`playlist_tracks`.

## R1 — Mecânica da allowlist (pivot 2026-04-23)

**Decision original** (rejeitado): usar Clerk Allowlist nativa.

**Pivot**: descoberto em implementação que **Clerk Allowlist é feature
Pro (~US$25/mês)**, fora do orçamento do piloto. Implementamos
allowlist própria no Sulco.

**Decision final**: tabela `invites` no Turso + coluna
`users.allowlisted` + middleware que redireciona não-allowlisted para
`/convite-fechado`. Detalhes em `contracts/invites.md`.

**Rationale**:

- Zero custo recorrente — encaixa no Free tier da Clerk.
- Clerk signup continua ABERTO: qualquer um cria conta. Sulco filtra
  pós-criação.
- Single source of truth (`invites`) no mesmo banco das demais
  entidades — consistência garantida por SQL, sem sync externo.
- Gestão via `/admin/convites` (UI dentro do Sulco) ou Turso shell
  como fallback.

**Alternatives considered (revisados pós-pivot)**:

- Pagar Clerk Pro: rejeitado pelo custo vs. volume de 2-5 usuários.
- Deletar users não-allowlisted via `clerkClient.users.deleteUser` no
  webhook: UX ruim (user vê conta criada por segundos, depois "user
  not found"). Escolhido deixar conta Clerk existir e filtrar via
  middleware — mais limpo.
- Signup totalmente aberto (opção C da conversa): rejeitado — sem
  controle mínimo, qualquer pessoa com a URL cria conta e consome
  cota de Turso e Discogs.

## R2 — Redirect pós-criação de user não-allowlisted (revisado pós-pivot)

**Decision**: check no middleware global. Para toda request autenticada
em rota protegida, SELECT em `users.allowlisted`; se `false`, redirect
para `/convite-fechado`.

**Rationale**:

- Clerk signup agora é aberto (não tem Pro), então não existe o erro
  `form_identifier_not_allowed` no cliente pra capturar. O ponto de
  filtragem único e confiável é **pós-criação** via middleware.
- Middleware roda em toda request, pegando casos como: user faz signup,
  é criado, tenta acessar `/` → `allowlisted=false` → redirect.
- Rotas públicas (`/sign-in`, `/sign-up`, `/convite-fechado`,
  `/api/webhooks/*`) são exceções explícitas.

**Alternatives considered**:

- Rejeitar/deletar user no webhook: UX ruim, user vê "Account created"
  por segundos antes de perder acesso.
- Flag apenas em `users.allowlisted` sem tabela `invites`: perde
  auditoria (quem convidou? quando?); também complica "adicionar
  convite para email que ainda não criou conta".

## R3 — Promoção a owner (`is_owner` + âncora clerkUserId)

**Decision**: Adicionar coluna booleana `is_owner` em `users` (default
`false`). Lógica de promoção no webhook Clerk `user.created`:

1. Quando chegar evento `user.created`, comparar o email verificado
   do payload com `process.env.OWNER_EMAIL`.
2. Se bater E nenhum `is_owner=true` existir ainda, marcar
   `is_owner=true` nesse user.
3. A comparação idempotente (`WHERE is_owner=false AND NOT EXISTS
   (SELECT 1 FROM users WHERE is_owner=true)`) evita duplicar owner
   em runs repetidos.
4. Todas as verificações de admin (`requireOwner()`) leem o bit
   diretamente, nunca comparam email.

**Rationale**:

- Defesa em profundidade sem custo: mesmo que outro user tente trocar
  seu email na Clerk pra bater com `OWNER_EMAIL`, o bit já está
  travado no primeiro user que assinou com ele.
- Captura no webhook (server-side, assinado via Svix) evita manipulação
  no cliente.
- Caso o owner ainda não exista quando o Sulco sobe (first run), o
  bit será setado automaticamente no signup do owner.

**Alternatives considered**:

- Hardcode `clerkUserId` em env var (`OWNER_CLERK_USER_ID`): requer
  owner criar conta antes de configurar env; fluxo de primeira-vez
  fica estranho. E se owner quiser mudar de conta Clerk depois, tem
  que re-deployar.
- Coluna `role` (`'owner' | 'guest'`) com enum: over-engineering para
  um único role; booleano suficiente no piloto.

## R4 — Migração `playlists` e `playlist_tracks` com `user_id`

**Decision**: `ALTER TABLE ... ADD COLUMN user_id INTEGER NOT NULL
REFERENCES users(id) ON DELETE CASCADE` em ambas.

**Rationale**:

- Tabelas estão **vazias** em prod (rotas `/playlists*` bloqueadas no
  middleware com rewrite 404 desde o piloto — validado no Turso). Sem
  necessidade de backfill.
- Drizzle-kit push aplica a alteração diretamente; SQLite suporta
  ADD COLUMN com constraint sem reescrever a tabela quando ela está
  vazia.
- FK com CASCADE mantém a invariante de "dados do user seguem o user".

**Nota defensiva**: Se por algum motivo houvesse linhas (ex: dev
inadvertidamente inseriu), o push falharia. Documentar em tasks o
comando de verificação prévia: `SELECT COUNT(*) FROM playlists;`.

**Alternatives considered**:

- Deixar a coluna nullable + CHECK constraint + NOT NULL depois: mais
  passos para nenhum benefício em tabelas vazias.
- Criar tabelas novas `playlists_v2` e deprecar as antigas: absurdo
  pro volume (zero rows).

## R5 — Identificação do owner no middleware e na rota `/admin`

**Decision**: Helper `requireOwner()` em `src/lib/auth.ts` que:

1. Chama `requireCurrentUser()` (já existe) para garantir sessão.
2. Faz SELECT em `users` filtrando por `clerkUserId` + `is_owner=true`.
3. Se não bater, lança erro específico capturado pela página `/admin`
   que retorna `notFound()` (produz 404 Next padrão).

**Rationale**:

- Reaproveita abstração existente (`requireCurrentUser`).
- 404 em vez de 403 segue a spec (FR-011 — não expor a existência da
  rota).
- Sem exposição de metadados: a página `/admin` simplesmente não
  renderiza, comportamento idêntico a qualquer rota inexistente.

**Alternatives considered**:

- Middleware bloquear `/admin` diretamente: complica lógica
  centralizada; pagina fica limpa com helper de verificação.
- Redirect para `/`: revelaria existência da rota via logs/metrics.

## R6 — UI `/admin` — estrutura mínima

**Decision**: Server Component único com tabela semântica, sem JS. Uma
query agregada em `src/lib/queries/admin.ts`:

```sql
SELECT
  u.id, u.email, u.discogs_username, u.discogs_credential_status,
  u.created_at, u.is_owner,
  (SELECT COUNT(*) FROM records r WHERE r.user_id = u.id) as records_count,
  (SELECT MAX(started_at) FROM sync_runs s WHERE s.user_id = u.id) as last_sync_at,
  (SELECT outcome FROM sync_runs s WHERE s.user_id = u.id ORDER BY started_at DESC LIMIT 1) as last_sync_outcome
FROM users u
ORDER BY u.created_at ASC;
```

**Rationale**:

- Linhas (~5) triviais de computar em uma query só.
- Server-rendered, sem client state. Reload manual via Ctrl+R ou link
  dentro da página (`/admin?r=1` com `export const dynamic = 'force-dynamic'`).
- Indicadores visuais simples (badge em pt-BR): "OK" verde se último
  sync ok e credencial válida; "Atenção" vermelho se credencial inválida
  ou último sync erro/parcial.

**Alternatives considered**:

- Rota API `/api/admin/users` + componente client com SWR: viola
  constituição (Server-First), sem benefício.
- Query em uma única tabela via Drizzle relations: exige definir
  relations novas; SQL agregado é mais legível.

## R7 — Texto e contato da `/convite-fechado`

**Decision**: Página estática Server Component em pt-BR com:

- Título: "O Sulco está em fase de convite"
- Corpo: explicação de 2-3 linhas + link `mailto:OWNER_EMAIL` para
  solicitar acesso (usa a mesma env, valor público).
- Estilo: mesma identidade editorial do piloto (EB Garamond,
  acento vermelho único).

**Rationale**:

- Zero JS. `mailto:` é universalmente funcional.
- `OWNER_EMAIL` já será env var pelo FR-012 — reaproveita sem
  exposições adicionais.
- Copy curta evita ruído; o visitante só precisa entender o "porquê"
  e ter caminho para pedir acesso.

**Alternatives considered**:

- Form de waitlist (Resend/etc): viola "sem deps novas" e "sem
  infra adicional".
- Texto genérico "Acesso restrito": impessoal, não segue UX editorial.

## R8 — Testes de isolamento

**Decision**: Suite `tests/integration/multi-user-isolation.test.ts`
com fixtures de 2 users (owner + guest) e asserções explícitas:

- Guest A não pode ler records/sets/tracks/sync_runs do guest B
  (mesmo passando IDs válidos em queries).
- Guest comum recebe `notFound()` em `/admin`.
- Deleção do guest A (cascade) não afeta guest B.

**Rationale**:

- O audit confirmou isolamento no piloto, mas as mudanças novas
  (coluna `is_owner`, playlists com `user_id`, helper `requireOwner`)
  precisam de regressão própria.
- Vitest já está configurado; sem deps novas.

**Alternatives considered**:

- Depender só de Playwright e2e: mais lento, e2e não cobre bem as
  queries de DB no detalhe.

## Conclusão

Nenhum `NEEDS CLARIFICATION` emergiu nesta research — todas as
incertezas residuais foram resolvidas pelas decisões acima. O design
respeita constituição (sem API routes novas, sem ORM paralelo, sem
store global cliente, sem shadcn) e não introduz dependências novas.
