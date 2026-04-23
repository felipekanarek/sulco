# Contract — Server Actions

Todas as mutações vivem em `src/lib/actions.ts` como Server Actions
(`'use server'`). Cada ação:

1. Valida input com **Zod**.
2. Obtém `userId` via `getCurrentUser()` (`src/lib/auth.ts`) que lê
   `auth()` da Clerk + resolve/cria linha local em `users`.
3. Executa a mutação com Drizzle, respeitando **Princípio I** (campos autorais
   nunca sobrescritos por sync; sync NÃO invoca estas ações).
4. Chama `revalidatePath` nas rotas afetadas.
5. Retorna um resultado discriminado `{ ok: true, data? }` ou
   `{ ok: false, error: string }` para que o caller renderize erro inline.

Tipagem geral:

```ts
type Result<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };
```

---

## Autenticação e Conta

### `saveDiscogsCredential(input)`

Onboarding + troca de PAT (FR-004, FR-046).

**Input (Zod)**:
```ts
z.object({
  discogsUsername: z.string().min(1).max(100),
  discogsPat: z.string().min(20).max(200),
})
```

**Comportamento**:
1. Chama `GET https://api.discogs.com/oauth/identity` com o PAT para validar.
2. Se 401 → retorna `{ ok: false, error: 'Token inválido no Discogs' }`,
   deixa `discogsCredentialStatus` como estava.
3. Se 200 → cifra PAT com `encryptPAT`, persiste
   `(discogsUsername, discogsTokenEncrypted, discogsCredentialStatus='valid')`.
4. `revalidatePath('/onboarding'); revalidatePath('/conta'); revalidatePath('/')`.

**Revalida**: `/`, `/conta`, `/onboarding`.

---

### `deleteAccount()`

Hard-delete imediato (FR-042/FR-043).

**Input (Zod)**:
```ts
z.object({ confirm: z.literal('APAGAR') })
```

**Comportamento**:
1. Abortar sync em andamento: `UPDATE syncRuns SET outcome='erro',
   errorMessage='Conta deletada' WHERE userId=? AND finishedAt IS NULL`.
2. Transação Drizzle: deleta em cascata records → tracks → setTracks → sets
   → syncRuns → users (cascades cobrem tudo via FK; basta `DELETE FROM users
   WHERE id=?`).
3. Chama `clerkClient.users.deleteUser(clerkUserId)` para revogar.
4. Retorna redirect para `/`.

**Revalida**: `/`.

---

## Coleção (records)

### `updateRecordStatus(recordId, status)`

FR-011/FR-012.

**Input**:
```ts
z.object({
  recordId: z.number().int().positive(),
  status: z.enum(['unrated','active','discarded']),
})
```

**Revalida**: `/`, `/curadoria`, `/disco/[id]`.

---

### `updateRecordAuthorFields(recordId, fields)`

Edita `shelfLocation`, `notes` e flag `curated` manualmente (FR-005, FR-020b).

**Input**:
```ts
z.object({
  recordId: z.number().int().positive(),
  shelfLocation: z.string().max(50).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),  // FR-017d
  curated: z.boolean().optional(),                    // FR-020b
})
```

**Comportamento**: ao receber `curated=true`, também define `curatedAt=now()`;
ao receber `curated=false`, zera `curatedAt=null`.

**Revalida**: `/`, `/disco/[id]`, `/curadoria`.

---

### `archiveRecord(recordId)` (interno — chamado por sync)

NÃO é Server Action exposta à UI. Função em `src/lib/discogs/sync.ts`.
Documentada aqui para clareza do contrato interno:

```ts
archiveRecord(userId: number, recordId: number):
  Promise<{ archived: true }>
```

Setta `archived=true, archivedAt=now()`; NÃO toca campos autorais (Princípio I).

---

## Curadoria de faixas (tracks)

### `updateTrackCuration(trackId, recordId, fields)`

FR-016/FR-017/FR-017a/FR-017b/FR-017c/FR-018/FR-020.

**Input**:
```ts
z.object({
  trackId: z.number().int().positive(),
  recordId: z.number().int().positive(),  // para revalidação
  selected: z.boolean().optional(),
  bpm: z.number().int().min(0).max(250).nullable().optional(),
  musicalKey: z.string().regex(/^(?:[1-9]|1[0-2])[AB]$/).nullable().optional(),
  energy: z.number().int().min(1).max(5).nullable().optional(),
  rating: z.number().int().min(1).max(3).nullable().optional(),  // FR-020c
  moods: z.array(z.string().min(1).max(40)).max(20).optional(),
  contexts: z.array(z.string().min(1).max(40)).max(20).optional(),
  fineGenre: z.string().max(5000).nullable().optional(),  // FR-017d
  references: z.string().max(5000).nullable().optional(), // FR-017d
  comment: z.string().max(5000).nullable().optional(),    // FR-017d
  isBomb: z.boolean().optional(),
})
```

**Comportamento**:
- Normaliza `moods`/`contexts`: trim + lowercase, remove duplicatas.
- Atualiza só os campos fornecidos (partial update).
- FR-020: se `selected=false`, **não** zera os outros campos (preserva no DB).

**Revalida**: `/disco/[id]`, `/sets/[setId]/montar` (qualquer set em montagem),
`/` (se mudança impacta filtro Bomba).

---

### `resolveTrackConflict(trackId, action)`

FR-037a.

**Input**:
```ts
z.object({
  trackId: z.number().int().positive(),
  action: z.enum(['keep','discard']),
})
```

**Comportamento**:
- `keep`: `UPDATE tracks SET conflict=false, conflictDetectedAt=null`.
- `discard`: `DELETE FROM tracks WHERE id=?` (cascade em setTracks).

**Revalida**: `/status`, `/disco/[id]`.

---

## Sets

### `createSet(input)`

FR-022.

**Input**:
```ts
z.object({
  name: z.string().min(1).max(200),
  eventDate: z.string().datetime().nullable().optional(),  // ISO UTC
  location: z.string().max(200).nullable().optional(),
  briefing: z.string().max(5000).nullable().optional(),  // FR-017d
})
```

**Retorno**: `{ ok: true, data: { setId: number } }` para redirect à tela de
montagem.

**Revalida**: `/sets`.

---

### `updateSet(setId, fields)`

FR-027/FR-028 (incluindo ajustar `eventDate` que muda o status derivado).

**Input**:
```ts
z.object({
  setId: z.number().int().positive(),
  name: z.string().min(1).max(200).optional(),
  eventDate: z.string().datetime().nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  briefing: z.string().max(5000).nullable().optional(),  // FR-017d
})
```

**Revalida**: `/sets`, `/sets/[id]`, `/sets/[id]/montar`.

---

### `addTrackToSet(setId, trackId)`

FR-025, FR-029a.

**Input**:
```ts
z.object({
  setId: z.number().int().positive(),
  trackId: z.number().int().positive(),
})
```

**Comportamento**: verifica que o set tem <300 faixas (FR-029a); se já
tem 300, retorna `{ ok:false, error:'Limite de 300 faixas por set atingido' }`.
Caso contrário, `INSERT INTO setTracks(setId, trackId, order)
VALUES(?, ?, nextOrderForSet(setId))`. Ignora se já existir (conflict target).

**Revalida**: `/sets/[setId]`, `/sets/[setId]/montar`.

---

### `removeTrackFromSet(setId, trackId)`

FR-025 + FR-029.

**Input**: idem acima.

**Comportamento**: `DELETE FROM setTracks WHERE setId=? AND trackId=?`. **NEVER
toca `tracks.selected` nem `tracks.isBomb`** (Princípio I + FR-029).

**Revalida**: `/sets/[setId]`, `/sets/[setId]/montar`.

---

### `reorderSetTracks(setId, trackIds)`

FR-026.

**Input**:
```ts
z.object({
  setId: z.number().int().positive(),
  trackIds: z.array(z.number().int().positive()).min(1).max(300),  // FR-029a
})
```

**Comportamento**: transação que zera e recria `order` pelo índice de
`trackIds`. Rejeita se qualquer trackId não pertence ao set.

**Revalida**: `/sets/[setId]`, `/sets/[setId]/montar`.

---

### `saveMontarFilters(setId, filters)`

FR-024a.

**Input**:
```ts
z.object({
  setId: z.number().int().positive(),
  filters: z.object({
    bpm: z.object({ min: z.number().int().min(0).max(250).optional(),
                    max: z.number().int().min(0).max(250).optional() }).optional(),
    musicalKey: z.array(z.string().regex(/^(?:[1-9]|1[0-2])[AB]$/)).optional(),
    energy: z.object({ min: z.number().int().min(1).max(5).optional(),
                       max: z.number().int().min(1).max(5).optional() }).optional(),
    rating: z.object({ min: z.number().int().min(1).max(3).optional(),
                       max: z.number().int().min(1).max(3).optional() }).optional(),  // FR-020c
    moods: z.array(z.string()).optional(),
    contexts: z.array(z.string()).optional(),
    bomba: z.enum(['any','only','none']).optional(),
    text: z.string().max(200).optional(),
  }),
})
```

**Comportamento**: serializa e persiste em `sets.montarFiltersJson`.

**Revalida**: `/sets/[setId]/montar` (a própria tela atualiza candidatos).

---

## Sincronização (ações expostas)

### `triggerManualSync()`

FR-033.

**Input**: nenhum.

**Comportamento**: enfileira job `daily_auto`-equivalente imediatamente (mesma
função reusada), registra novo `syncRuns` com `kind='manual'`. Se já existe
run `outcome='running'` para o usuário, retorna `{ ok:false, error:'Sync já
em andamento' }`.

**Revalida**: `/status`, `/`.

---

### `reimportRecord(recordId)`

FR-034/FR-034a.

**Input**:
```ts
z.object({ recordId: z.number().int().positive() })
```

**Comportamento**:
1. Verifica cooldown: existe `syncRuns` com `kind='reimport_record'`,
   `targetRecordId=recordId`, `finishedAt > now - 60s` e `outcome='ok'`?
   Se sim → retorna `{ ok:false, error:'Aguarde XXs', cooldownRemaining: N }`.
2. Caso contrário, busca metadados Discogs e aplica `applyDiscogsUpdate`
   (só colunas do Discogs).
3. Cria row em `syncRuns` com resultado.

**Revalida**: `/disco/[id]`, `/`.

---

## Observações de segurança

- Toda ação MUST rejeitar silenciosamente (retornar 404-like ou `ok:false`)
  se o `userId` resolvido não for o dono do recurso tocado (verificação via
  `WHERE userId=?`).
- Nenhuma ação expõe o PAT em resposta; o campo `discogsTokenEncrypted`
  nunca é retornado pelas queries da UI (somente pelas funções internas de
  `src/lib/discogs/`).
