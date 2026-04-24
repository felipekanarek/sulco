# Convites — operação invite-only (FR-001..FR-005)

> **Pivot 2026-04-23**: Clerk Allowlist é feature Pro (US$25/mês),
> fora do orçamento do piloto. O Sulco implementa allowlist **própria**
> via tabela `invites` + rota `/admin/convites`.

O Sulco, enquanto em piloto, só permite acesso a emails pré-aprovados.
Usuários podem criar conta no Clerk normalmente, mas só conseguem ver
conteúdo se o owner autorizar o email.

## 1. Como funciona

- Qualquer pessoa pode criar conta via Clerk (signup aberto).
- Ao criar a conta, o webhook do Sulco verifica se o email está na
  tabela `invites`. Se estiver → `users.allowlisted=true`.
- Em cada request a uma rota protegida, o middleware verifica
  `allowlisted`. Se `false` → redirect para `/convite-fechado`.
- O owner controla a tabela `invites` via rota `/admin/convites` (só
  ele enxerga; qualquer outro user recebe 404).

## 2. Convidar um amigo DJ

1. Logado como owner: acesse **https://sulco.vercel.app/admin/convites**
2. No campo de email, cole o email do amigo (ex: `amigo@exemplo.com`)
3. Clique em **Adicionar**
4. Compartilhe a URL **https://sulco.vercel.app** com o amigo
5. Amigo cria conta via Clerk usando esse email
6. Webhook verifica `invites`, marca `allowlisted=true`
7. Amigo cai em `/onboarding` automaticamente
8. Amigo informa username Discogs + PAT próprio
9. Import inicial começa

> Se o amigo já tiver criado conta ANTES de ser convidado (email ainda
> não estava em `invites`), o próprio ato de adicionar o email
> promove ele instantaneamente — a Server Action `addInvite` também
> atualiza `users.allowlisted=true` para users existentes.

## 3. Remover acesso de alguém (revogação leve)

1. `/admin/convites`
2. Localize o email na lista
3. Clique em **Remover**
4. Server Action remove de `invites` e marca
   `users.allowlisted=false` (exceto se for owner)
5. Na próxima request do amigo, middleware manda ele para
   `/convite-fechado`

> A **conta Clerk** do amigo continua existindo. Ele pode entrar em
> `/sign-in` mas só vai ver `/convite-fechado`. Se quiser apagar a
> conta inteira (e os dados dele no Sulco), veja §4.

## 4. Apagar a conta inteira

1. Dashboard Clerk → **Users** → selecione o user → **Delete user**
2. Webhook Clerk dispara `user.deleted` → cascade delete de todos os
   dados do user no Sulco (records, tracks, sets, sync_runs,
   playlists)
3. Remover o email da lista de `/admin/convites` (se não quiser
   reabilitar depois)

> **⚠️ Irreversível**: cascade delete remove coleção importada e
> curadoria.

## 5. Fallback via Turso shell (emergência)

Se `/admin/convites` estiver inacessível (bug, deploy quebrado):

```bash
# Listar convites
turso db shell sulco-prod "SELECT * FROM invites ORDER BY created_at;"

# Adicionar convite manual
turso db shell sulco-prod "
  INSERT INTO invites (email, added_by_user_id)
  VALUES ('amigo@exemplo.com', 1);
  UPDATE users SET allowlisted = 1 WHERE LOWER(email) = 'amigo@exemplo.com';
"

# Remover
turso db shell sulco-prod "
  DELETE FROM invites WHERE LOWER(email) = 'amigo@exemplo.com';
  UPDATE users SET allowlisted = 0
    WHERE LOWER(email) = 'amigo@exemplo.com' AND is_owner = 0;
"
```

## 6. Descobrir quem está usando o Sulco

- **https://sulco.vercel.app/admin** (rota só acessível ao owner)
- Tabela mostra: email, Discogs username, discos importados, último
  sync, status da credencial e flag allowlisted

Consulta direta via Turso:

```bash
turso db shell sulco-prod "
  SELECT email, discogs_username, is_owner, allowlisted, created_at
  FROM users ORDER BY created_at;
"
```

## 7. Perguntas frequentes

**Email com maiúscula/minúscula diferente?**
O Sulco compara com `LOWER()` — `Joao@Gmail.com` e `joao@gmail.com`
batem. Cadastre no formato que preferir.

**Posso usar wildcard `*@dominio.com`?**
Não. A tabela `invites` só aceita emails exatos no piloto. Se virar
necessidade, tema pro próximo incremento.

**Quantos convites posso emitir?**
Sem limite hard. O teto operacional é Turso Hobby + Vercel Hobby +
Clerk Free — confortável pra ~50 usuários antes de forçar review.

**O amigo precisa ter uma conta antes de eu adicionar ele?**
Não. Você pode adicionar qualquer email. Quando ele criar conta
depois, o webhook automaticamente marca `allowlisted=true`.

**E se eu me remover do `/admin/convites`?**
Owner NUNCA perde `allowlisted=true` via `removeInvite` (a Server
Action tem um `AND is_owner=false` no UPDATE). Você pode
acidentalmente deletar sua entrada em `invites` — não se desaloca.
