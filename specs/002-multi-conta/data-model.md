# Data Model: Multi-conta 002

## Escopo

Este incremento faz três alterações estruturais:

1. `users` ganha **duas** colunas: `is_owner` e `allowlisted`.
2. `playlists` e `playlist_tracks` ganham `user_id` (FK → users,
   NOT NULL, ON DELETE CASCADE).
3. **NOVA** tabela `invites` para controlar a allowlist do Sulco
   (pivot 2026-04-23: Clerk Allowlist é Pro, implementamos própria).

Tudo o mais (`records`, `tracks`, `sets`, `set_tracks`, `sync_runs`)
permanece como no 001.

## Entidades alteradas

### users

| Campo                          | Tipo        | Constraint                 | Origem           | Notas |
|--------------------------------|-------------|----------------------------|------------------|-------|
| id                             | integer     | PK, autoincrement          | 001              | |
| clerk_user_id                  | text        | UNIQUE NOT NULL            | 001              | |
| email                          | text        | NOT NULL                   | 001              | |
| discogs_username               | text        | NULL                       | 001              | |
| discogs_token_encrypted        | text        | NULL                       | 001              | |
| discogs_credential_status      | text        | NOT NULL DEFAULT 'valid'   | 001              | |
| created_at                     | integer (ts)| DEFAULT unixepoch()        | 001              | |
| updated_at                     | integer (ts)| DEFAULT unixepoch()        | 001              | |
| **is_owner**                   | **integer (bool)** | **NOT NULL DEFAULT 0** | **002**          | **NOVO** — bit de owner |
| **allowlisted**                | **integer (bool)** | **NOT NULL DEFAULT 0** | **002**          | **NOVO** — true se email está em `invites` ou `is_owner=true` |

**Invariantes:**

- **I1**: Apenas um usuário pode ter `is_owner=true` por instância
  do Sulco. Garantido por lógica de promoção (não por constraint SQL
  — SQLite não tem partial unique index fácil em boolean; a lógica no
  webhook Clerk garante idempotência).
- **I2**: O owner é promovido **uma única vez**, no primeiro
  `user.created` cujo email verificado bate com `OWNER_EMAIL`. Após
  isso, tentativas subsequentes não promovem ninguém.
- **I3**: Owner não é desprovido automaticamente em nenhum evento —
  nem por troca de email na Clerk, nem por remoção da allowlist. Remover
  owner exige ação manual (UPDATE via Turso shell).
- **I4**: Toda linha com `is_owner=true` DEVE também ter `allowlisted=true`.
  Lógica da Server Action de promoção garante isso.
- **I5**: `users.allowlisted` é mantido em sync com `invites`:
  - Webhook `user.created`: lê `invites` para decidir initial value.
  - Server Action `addInvite(email)`: além de INSERT em `invites`,
    faz `UPDATE users SET allowlisted=true WHERE email=?`.
  - Server Action `removeInvite(email)`: DELETE em `invites` +
    `UPDATE users SET allowlisted=false WHERE email=? AND is_owner=false`
    (owner nunca perde allowlisted).

**State transitions** para `is_owner`:

- `false` → `true`: apenas via lógica do webhook `user.created` ou
  `user.updated` (fallback para casos onde o email só ficou verified
  após signup), condicional a `email_verified=true` + `email === OWNER_EMAIL`
  + nenhum owner existente.
- `true` → `false`: manual. Fora do escopo deste spec.

### invites (NOVO)

| Campo              | Tipo        | Constraint                 | Notas |
|--------------------|-------------|----------------------------|-------|
| id                 | integer     | PK, autoincrement          | |
| email              | text        | UNIQUE NOT NULL            | Case-insensitive na comparação (LOWER() index/compare) |
| created_at         | integer (ts)| NOT NULL DEFAULT unixepoch() | |
| added_by_user_id   | integer     | NULL, FK → users(id) ON DELETE SET NULL | Auditoria: quem adicionou (normalmente owner) |

**Invariantes:**

- **INV1**: `email` é UNIQUE — não existem duplicatas.
- **INV2**: `email` é normalizado em LOWER case antes de INSERT e
  antes de toda comparação (Clerk normaliza também, mas redundância
  defensiva).
- **INV3**: Delete do `added_by_user_id` (owner) põe NULL — mantém
  os convites vivos mesmo se owner for re-promovido ou trocado.

**State transitions**:

- `(vazio)` → `existe`: via Server Action `addInvite(email)` na
  rota `/admin/convites`. Efeito lateral: `UPDATE users SET
  allowlisted=true WHERE LOWER(email)=LOWER(?)`.
- `existe` → `(vazio)`: via Server Action `removeInvite(email)`.
  Efeito lateral: `UPDATE users SET allowlisted=false WHERE
  LOWER(email)=LOWER(?) AND is_owner=false`.

**Escopo**: `invites` é global por instância (não scoped por user).
Tudo é gerido pelo owner.

### playlists

| Campo         | Tipo        | Constraint                 | Notas |
|---------------|-------------|----------------------------|-------|
| id            | integer     | PK, autoincrement          | |
| name          | text        | NOT NULL                   | |
| created_at    | integer (ts)| DEFAULT unixepoch()        | |
| updated_at    | integer (ts)| DEFAULT unixepoch()        | |
| **user_id**   | **integer** | **NOT NULL FK → users(id) ON DELETE CASCADE** | **NOVO** |

**Invariantes:**

- **P1**: Toda playlist pertence exatamente a um user.
- **P2**: Delete do user → delete das playlists (cascade).
- **P3**: Nomes podem repetir entre users diferentes (não há UNIQUE
  em `name` — playlists são meramente rótulos pessoais).

### playlist_tracks

| Campo        | Tipo        | Constraint                 | Notas |
|--------------|-------------|----------------------------|-------|
| id           | integer     | PK, autoincrement          | |
| playlist_id  | integer     | NOT NULL FK → playlists(id) ON DELETE CASCADE | |
| track_id     | integer     | NOT NULL FK → tracks(id) ON DELETE CASCADE | |
| order        | integer     | NOT NULL                   | |
| **user_id**  | **integer** | **NOT NULL FK → users(id) ON DELETE CASCADE** | **NOVO** |

**Invariantes:**

- **PT1**: `playlist_tracks.user_id` DEVE ser igual a
  `playlists.user_id` onde `playlists.id = playlist_tracks.playlist_id`
  e igual a `tracks → records.user_id`. Aplicado por lógica de
  aplicação (Server Actions) — SQLite não suporta CHECK via JOIN.
- **PT2**: Delete de playlist → delete de playlist_tracks (cascade
  existente + novo cascade via user_id redundante mas inofensivo).

**Nota de migração**: a coluna `user_id` em `playlist_tracks` é
redundante com `playlist_id → playlists.user_id`, mas permite queries
scoped sem JOIN e reforça a invariante por constraint direta.

## Entidades NÃO alteradas

Permanecem idênticas ao 001:

- `records` (já tem `user_id`)
- `tracks` (user scoping via `record.user_id`)
- `sets` (já tem `user_id`)
- `set_tracks` (via `sets.user_id`)
- `sync_runs` (já tem `user_id`)

## Diagrama — isolamento atualizado

```text
invites (global)
  ├─ email                    (UNIQUE)
  └─ added_by_user_id         (SET NULL em delete)

users
  ├─ is_owner       (NOVO)
  ├─ allowlisted    (NOVO, derivado de invites)
  ├─ records                (cascade)
  │   └─ tracks             (cascade via record)
  │       └─ set_tracks     (cascade via track)
  │       └─ playlist_tracks(cascade via track + via user_id NOVO)
  ├─ sets                   (cascade)
  │   └─ set_tracks         (cascade)
  ├─ sync_runs              (cascade)
  ├─ playlists              (cascade NOVO)
  └─ playlist_tracks        (cascade NOVO — direto)
```

Após a migração, `ON DELETE CASCADE` no `users` remove **tudo** que
pertence a esse user em uma única transação. A tabela `invites` é
global — não é cascade-deletada quando um user é removido (apenas o
campo `added_by_user_id` vira NULL via SET NULL).

## Validação

SQL de verificação pós-migração:

```sql
-- Schema esperado
PRAGMA table_info('users');          -- inclui is_owner
PRAGMA table_info('playlists');      -- inclui user_id
PRAGMA table_info('playlist_tracks');-- inclui user_id

-- Integridade em runtime (contagem em tabelas vazias no piloto)
SELECT COUNT(*) FROM playlists WHERE user_id IS NULL;
-- esperado: 0 (NOT NULL impede)

-- Owner único
SELECT COUNT(*) FROM users WHERE is_owner = 1;
-- esperado: 0 ou 1 (antes/depois do primeiro signup do owner)
```
