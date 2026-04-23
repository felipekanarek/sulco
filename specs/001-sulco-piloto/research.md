# Phase 0 — Research

Resumo das decisões técnicas que dão suporte ao plano. Todos os itens marcados
como `NEEDS CLARIFICATION` nas 5 sessões de `/speckit-clarify` foram resolvidos
no spec; este documento consolida as decisões de **engenharia** (não de produto)
necessárias para executar o plano.

---

## 1. Cron server-side para sync diário

**Decision**: Usar **Vercel Cron Jobs** declarados em `vercel.json`, invocando
`POST /api/cron/sync-daily` uma vez por dia às 04:00 `America/Sao_Paulo`
(= 07:00 UTC). O endpoint verifica um header `x-vercel-cron` + segredo em
`CRON_SECRET` para rejeitar invocações não autorizadas.

```json
{ "crons": [ { "path": "/api/cron/sync-daily", "schedule": "0 7 * * *" } ] }
```

**Rationale**: Q1/sessão 1 fixou "scheduler server-side". Vercel Cron é
gratuito, nativo do Next.js 15, não exige infraestrutura extra. Hora
escolhida (04:00 local) evita horário de uso do DJ.

**Alternatives considered**:
- `node-cron` dentro do processo Next.js — não sobrevive a serverless/reboot.
- GitHub Actions cron — depende de repositório privado e chave exposta.
- Cloudflare Workers Cron — forçaria sair da Vercel sem ganho.

---

## 2. Drag-and-drop acessível para reordenação de faixas

**Decision**: **`@dnd-kit/core` + `@dnd-kit/sortable`**. Oferece sensors de
mouse, toque e **teclado embutido** (setas ↑/↓ movem o item focado); gera
ARIA `role="listbox"`/`role="option"` e `aria-describedby` para anunciar a
mudança.

**Rationale**: FR-026 exige DnD primário + fallback por teclado. FR-049 exige
ARIA em controles. dnd-kit entrega os dois sem bibliotecas extras e é
amplamente usado no ecossistema React 19.

**Alternatives considered**:
- `react-dnd` — API HTML5 nativa, sem fallback keyboard acessível de fábrica.
- `framer-motion` reorder — sem suporte a teclado out-of-the-box.
- Implementação manual — alto custo e risco de a11y.

---

## 3. Cifrar Personal Access Token at-rest

**Decision**: **AES-256-GCM** usando `node:crypto`, com chave mestre em
`MASTER_ENCRYPTION_KEY` (32 bytes base64, rotacionável por ambiente). Cada
token é armazenado como `<version>:<iv>:<authTag>:<ciphertext>` em base64,
onde `version` permite rotação futura sem migration destrutiva.

Helpers em `src/lib/crypto.ts`:

```ts
encryptPAT(plaintext: string): string
decryptPAT(stored: string): string
```

**Rationale**: GCM é autenticado (detecta adulteração). Chave única em env var
isola segredos da base. Versão do envelope permite rotacionar depois sem
reescrita de dados.

**Alternatives considered**:
- Clerk `privateMetadata` — mistura segredos com Clerk (vendor lock-in) e
  introduz latência de rede em cada leitura.
- AWS KMS / Vault — sobra para piloto single-user.
- `argon2`/`bcrypt` — hash, não cifra; PAT precisa ser recuperável.

---

## 4. Clerk webhooks e verificação HMAC

**Decision**: Endpoint `POST /api/webhooks/clerk` que:
1. Verifica a assinatura via `svix` (Clerk usa Svix por baixo) com
   `CLERK_WEBHOOK_SECRET`.
2. Trata eventos `user.created` (provisiona linha em `users`) e `user.deleted`
   (executa hard-delete em cascata de FR-042).
3. Responde HTTP 200 mesmo em eventos desconhecidos para evitar retries.

**Rationale**: svix é a lib oficial recomendada pela Clerk; usá-la evita
reimplementar HMAC. Hard-delete atômico via transação Drizzle.

**Alternatives considered**:
- Polling da API da Clerk — latência maior, custo de requisições.
- Verificação HMAC manual — correto mas redundante.

---

## 5. Rate limit do Discogs: detecção + backoff + retomada

**Decision**: Cliente único em `src/lib/discogs/client.ts` com:
- Token bucket in-memory de 60 req/min (shared entre sync/import/reimport do
  mesmo processo).
- Retry em HTTP 429 usando `Retry-After` com jitter; se ausente, backoff
  exponencial (1s, 2s, 4s, max 60s).
- Jobs de import/sync são incrementais: cada página processada grava
  progresso em `syncRuns` antes de pedir a próxima, permitindo retomada a
  partir da última página bem-sucedida.

**Rationale**: FR-031 exige pausar/retomar sem perder progresso. Bucket + 429
handling + checkpoint por página cobrem os casos reais (pico instantâneo,
quota diária, instância reiniciando).

**Alternatives considered**:
- `p-retry`/`p-limit` — libs pequenas mas cada uma resolve só metade; compor
  aumenta superfície de erro.
- Escalar vertical (mais workers) — Discogs limita POR TOKEN, não por IP.

---

## 6. Derivação do status do set e comparações de timezone

**Decision**: Helper em `src/lib/tz.ts`:

```ts
const APP_TZ = 'America/Sao_Paulo';
function nowInAppTz(): Date
function isPast(date: Date | null): boolean  // usa Intl em APP_TZ
function deriveSetStatus(eventDate: Date | null):
  'draft' | 'scheduled' | 'done'
function formatForDisplay(date: Date): string  // dd/MM/yyyy HH:mm
```

Toda comparação de `eventDate` usa `deriveSetStatus`, nunca comparação direta
em UTC ou local do servidor. Armazenamento continua em UTC (coluna `timestamp`
do Drizzle = unixepoch).

**Rationale**: Q4/sessão 4 fixou UTC at-rest + SP na comparação/exibição. Um
único helper evita inconsistência entre listagem, rota `/sets/[id]` e testes.

**Alternatives considered**:
- `date-fns-tz`/`dayjs` — úteis mas `Intl.DateTimeFormat` cobre o que
  precisamos sem dependência extra.

---

## 7. Vocabulário híbrido (moods/contexts) com autocomplete

**Decision**: Termos são **strings dentro de `tracks.moods[]` e
`tracks.contexts[]`** (arrays JSON), não uma tabela separada. Autocomplete lê
DISTINCT agregado:

```sql
SELECT DISTINCT value FROM tracks, json_each(moods)
 WHERE tracks.user_id = :userId
 ORDER BY value
```

Seed popula 10 moods + 8 contextos em português no primeiro disco semente
(ou em `users.id` único quando conta nova criada) — simplesmente injetando
esses termos num disco do seed funciona em dev; em prod, o seed é um no-op
(DJ começa vazio e vê sementes sugeridas no autocomplete via lista
`DEFAULT_MOOD_SEEDS`/`DEFAULT_CONTEXT_SEEDS` embutida em código).

**Rationale**: Tabela separada acrescentaria joins e uma UI de "gerenciar
vocabulário" que Q1/sessão 3 Opção A dispensa. Normalização (trim + lowercase)
ocorre no momento do salvamento na Server Action.

**Alternatives considered**:
- Tabela `tags` + pivot N:N — overkill; torna filtro AND mais caro.
- FTS5 — só se houver demanda de busca difusa.

---

## 8. Derivar bag física sob demanda

**Decision**: Bag é calculada em tempo de leitura via query com JOIN único:

```sql
SELECT DISTINCT r.id, r.artist, r.title, r.shelf_location, r.cover_url
  FROM records r
  JOIN tracks t ON t.record_id = r.id
  JOIN set_tracks st ON st.track_id = t.id
 WHERE st.set_id = :setId AND r.user_id = :userId
 ORDER BY r.shelf_location NULLS LAST, r.artist
```

**Rationale**: Volume por set é baixo (≤ ~50 faixas), query derivada é trivial,
evita sincronizar tabela espelho.

**Alternatives considered**:
- Materializar `setRecords` — duplicaria estado e criaria oportunidade de
  drift com setTracks.

---

## 9. Testes: Vitest para unit/integração, Playwright para e2e

**Decision**:
- **Vitest** para funções puras (`deriveSetStatus`, `encryptPAT`, filtros
  AND, cliente Discogs mockado).
- **Testes de integração** (Vitest + `@libsql/client` em memória) para
  verificar SC-008 (sync não sobrescreve campos autorais).
- **Playwright** para fluxos: onboarding feliz, triagem de 5 discos via
  teclado, montagem de set e checagem da bag.

**Rationale**: Vitest é o padrão atual do ecossistema Next.js/React 19;
Playwright cobre a camada que unit tests não alcançam (keyboard focus, ARIA,
persistência de filtros entre recargas). Cobertura mínima é os 10 SCs;
não buscamos 100% LOC.

**Alternatives considered**:
- Jest — descontinuado na stack Next; Vitest é mais rápido e tem TS nativo.
- Cypress — mais pesado que Playwright; Playwright tem acessibilidade de
  testes de teclado mais madura.

---

## 10. Onboarding — ordem de passos

**Decision** (desambiguação inferida de US1): fluxo linear sem voltas:

1. Usuário anônimo chega em `/` → redirect `/sign-in`.
2. Clerk recebe email/social sign-up; webhook `user.created` provisiona linha
   em `users` com `discogsUsername = null`, `discogsTokenEncrypted = null`.
3. Next.js middleware redireciona usuários sem `discogsUsername` ou
   `discogsTokenEncrypted` preenchidos para `/onboarding`.
4. `/onboarding` apresenta formulário com username + PAT + instruções de como
   gerar o PAT no Discogs (link externo).
5. Ao salvar, sistema faz uma chamada `GET /oauth/identity` do Discogs para
   validar; sucesso → dispara job `initial-import` em background e
   redireciona para `/`.

**Rationale**: Coerente com FR-001..FR-004 e com as outras clarificações.
Validação da chamada de teste satisfaz FR-046.

**Alternatives considered**: Passos combinados numa tela só (overwhelm);
Discogs-primeiro antes do Clerk (cria risco de conta órfã).
