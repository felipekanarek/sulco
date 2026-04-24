# Contract: /admin page

## Rota

`GET /admin` — Server Component, dinâmico (`force-dynamic` para sempre
refletir estado atual do DB).

## Autorização

1. `requireCurrentUser()` — se não autenticado, middleware já redireciona
   para `/sign-in` (comportamento existente do 001).
2. `requireOwner()` — helper novo em `src/lib/auth.ts`:
   - SELECT `is_owner` do user atual pelo `clerkUserId`.
   - Se `is_owner !== true` → chama `notFound()` do `next/navigation`
     (produz 404 padrão).
   - Se `is_owner === true` → retorna o user; prossegue.

**Contract**: qualquer visitante não-owner (guest autenticado, não
autenticado, sem conta) recebe 404. Nunca 403. Nunca redirect.

## Query

Em `src/lib/queries/admin.ts`, função `listAllUsers(): Promise<AdminRow[]>`.

```typescript
type AdminRow = {
  id: number;
  email: string;
  isOwner: boolean;
  createdAt: Date;
  discogsUsername: string | null;
  discogsCredentialStatus: 'valid' | 'invalid';
  recordsCount: number;
  lastSyncAt: Date | null;
  lastSyncOutcome: 'running' | 'ok' | 'erro' | 'rate_limited' | 'parcial' | null;
};
```

Query (ver research.md §R6). Deve retornar todos os users ordenados
por `createdAt ASC`, com agregações de records e sync.

## Renderização

Estrutura mínima em pt-BR:

```tsx
<main>
  <h1>Painel de contas</h1>
  <p className="eyebrow">{rows.length} contas ativas</p>

  <table>
    <thead>
      <tr>
        <th>Email</th>
        <th>Discogs</th>
        <th>Discos</th>
        <th>Último sync</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      {rows.map(r => <AdminRow key={r.id} row={r} />)}
    </tbody>
  </table>
</main>
```

**Indicadores visuais** (no componente `<AdminRow>`):

- Badge verde "OK" quando `discogsCredentialStatus === 'valid'` E
  `lastSyncOutcome` ∈ {`ok`, `running`, `null`}.
- Badge vermelho "Atenção" quando:
  - `discogsCredentialStatus === 'invalid'`, OU
  - `lastSyncOutcome` ∈ {`erro`, `rate_limited`, `parcial`}, OU
  - `recordsCount === 0` E user tem >24h de idade (onboarding travado).

## Acessibilidade

- Tabela semântica com `<th scope="col">`.
- Badges com `aria-label` explicando o estado (ex: "Atenção:
  credencial inválida").
- Contraste mantido nos tokens do design (`--warn` vs `--ok`).

## Performance

- 1 query SQL (agregada). P95 target: <500ms com 5 users.
- Sem JS client — server-rendered inteiro.

## Não faz

- Não permite editar nada. Não permite deletar conta. Não permite
  reenviar convite. Para qualquer ação, o owner usa o dashboard Clerk
  ou o Turso shell.
