# Quickstart — Multi-conta 002

Roteiro de validação da feature. Cada passo deve levar ao fluxo descrito;
discrepâncias indicam regressão.

**Pré-requisitos**:

- Deploy do 002 no ar em https://sulco.vercel.app
- Env `OWNER_EMAIL` configurada na Vercel com o email principal do owner
  (você)
- Clerk Dashboard: allowlist ativa com pelo menos 2 emails (owner + 1
  convidado)
- Schema migrado: `npm run db:push` com `DATABASE_URL` apontando para
  Turso prod

## 1. Owner — primeiro login promove `is_owner`

1. Se ainda não existe linha em `users` para o owner: acesse
   https://sulco.vercel.app/sign-in, faça login com `OWNER_EMAIL`.
2. Webhook Clerk `user.created` chega ao Sulco.
3. Query `SELECT id, email, is_owner FROM users;` no Turso mostra
   `is_owner=1` para o owner.
4. Se a linha já existia (signup antes da coluna ser migrada): primeiro
   acesso a `/admin` ou `user.updated` webhook precisam promover
   via fallback — validar também.

## 2. Owner acessa `/admin`

1. Logado como owner, acesse https://sulco.vercel.app/admin.
2. Renderiza a tabela com pelo menos 1 linha (você).
3. Colunas: Email, Discogs username, Discos importados, Último sync,
   Status.
4. Badge de status aparece conforme o estado real.

## 3. Convite de amigo DJ

1. No dashboard Clerk → Allowlist, adicione `amigo@exemplo.com`.
2. Compartilhe a URL `https://sulco.vercel.app/sign-up` com o amigo.
3. Amigo cria conta com esse email.
4. Webhook cria linha em `users` (`is_owner=0`).
5. Amigo cai em `/onboarding`, preenche PAT próprio.
6. Import inicial começa para a coleção dele.

## 4. Visitante não-convidado vê `/convite-fechado`

1. Abra janela anônima, acesse `https://sulco.vercel.app/sign-up`.
2. Tente criar conta com email que **não** está na allowlist.
3. Redirect automático para `/convite-fechado`.
4. Página em pt-BR exibe título, explicação e botão "Solicitar acesso"
   (mailto para `OWNER_EMAIL`).
5. Nenhum erro técnico da Clerk aparece.

## 5. Convidado não acessa `/admin`

1. Logado como amigo (não owner), acesse `/admin`.
2. Resposta: 404 puro (não redirect, não 403).
3. Aba `Network`: status 404, página not-found renderizada.

## 6. Isolamento total entre duas contas

Com você (owner) + 1 convidado ativos:

1. Ambos têm records próprios. Home `/` do amigo mostra coleção
   dele, home sua mostra sua coleção. Zero overlap.
2. Navegue (como amigo) para `/disco/<id do disco do owner>` via URL
   manipulada → 404.
3. Navegue (como amigo) para `/sets/<id de set do owner>` via URL
   manipulada → 404.
4. Navegue (como amigo) para `/status` → vê apenas seu histórico de
   sync.

## 7. Playlists com `user_id` (dívida do audit)

Playlists NÃO têm UI ativa — validação via shell:

1. `turso db shell sulco-prod "PRAGMA table_info('playlists');"` —
   deve listar coluna `user_id` NOT NULL com FK.
2. `turso db shell sulco-prod "PRAGMA table_info('playlist_tracks');"` —
   idem.
3. Tentar INSERT sem `user_id`:
   ```sql
   INSERT INTO playlists (name) VALUES ('teste');
   ```
   Deve falhar com NOT NULL constraint.
4. Delete em cascade: `DELETE FROM users WHERE id = <qualquer user>;`
   (em DB de teste) — playlists e playlist_tracks desse user somem.

## 8. Deleção de conta (regressão do 001)

1. Convidado acessa `/conta` → "Apagar conta" → digita `APAGAR` →
   confirma.
2. Cascade delete: records, tracks, sets, sync_runs, playlists (novo)
   todos desaparecem para esse user.
3. Clerk revoga sessão; redirect para `/sign-in`.
4. Owner continua intacto — acessando `/admin` não vê mais o convidado.

## 9. Rotas `/playlists*` continuam 404

1. `curl -I https://sulco.vercel.app/playlists` → 404.
2. `curl -I https://sulco.vercel.app/playlists/novo` → 404.
3. Middleware rewrite do 001 segue ativo; mudanças no schema não
   ativaram a rota.

## 10. Fluxo de fim-a-fim do novo convidado

Todo o roteiro do `001` ([quickstart-walkthrough.md](../../docs/quickstart-walkthrough.md))
deve funcionar para o amigo recém-convidado sem alteração:

- Signup → onboarding → listagem → curadoria → montagem de set →
  sync → deleção de conta.

Se qualquer passo do piloto quebrar para o amigo, é regressão. Se
funcionar para o owner mas não para o amigo, é violação de
isolamento.
