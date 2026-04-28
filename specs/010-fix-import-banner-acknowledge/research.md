# Research — Fix Bug 13 (Banner de import com acknowledge)

## Decisão 1: granularidade do acknowledge — single-timestamp em `users`

**Decisão**: adicionar coluna `users.import_acknowledged_at` (timestamp
nullable). Comparação para visibilidade: banner aparece em estado terminal
sse `lastAck === null` OR `lastAck < runStartedAt`. Acknowledge atualiza
a coluna para `now()`.

**Rationale**:
- Spec FR-007 deixa explícito: nova execução com `startedAt` posterior ao
  ack reseta visibilidade. Single-timestamp + comparação cobre isso sem
  estado extra.
- Sem precisar de tabela de junção `user_acknowledges_run` ou similar —
  histórico de acknowledges por run individual seria over-engineering.
  Spec confirma "binário e único por usuário" (Assumption).
- Pattern já existente no projeto: `records.archivedAcknowledgedAt`
  (também single-timestamp para o reconhecimento de archives). Mantém
  coerência do dataset.
- Sobrevive a reload e re-login (FR-009) porque é coluna persistida em
  `users` (já tem ciclo de vida estável atrelado ao Clerk).

**Alternativas consideradas**:
- **Acknowledge por-run** (`syncRuns.acknowledgedAt`): mais granular,
  mas adiciona coluna em tabela quente sem ganho — a spec só liga pro
  "último visto", não pro histórico.
- **localStorage / cookie**: viola FR-009 (não sobrevive a re-login em
  outro device/browser).
- **Sem schema delta, lendo só `outcome`**: impossível distinguir
  "terminal já visto" de "terminal não visto" sem persistência.

## Decisão 2: derivação `running` x `runStartedAt`

**Decisão**: `getImportProgress` continua devolvendo o estado derivado
atual (campo `running`, `outcome`, `x`, `y`, `errorMessage`) e adiciona:
- `runStartedAt: Date | null` — `startedAt` do último syncRun (o mesmo
  row que já é lido em `latest[0]`). Null quando não existe syncRun.
- `lastAck: Date | null` — `users.importAcknowledgedAt` do user corrente.

A decisão "renderizar?" é responsabilidade do componente client, baseada
nos 3 campos: `running`, `runStartedAt`, `lastAck`.

**Rationale**:
- Mantém `getImportProgress` enxuto (já está com lógica complexa de
  zumbis e retomada). Decisão de visibilidade fica no componente onde
  é usada — separação de concerns.
- O caller (`/page.tsx`) já chama `getImportProgress` em paralelo no
  `Promise.all`; adicionar 2 campos no retorno é zero cost.
- Polling de 3s em running continua intacto; quando outcome vira
  terminal, próximo poll devolve `running=false` + `runStartedAt`
  populado, e o componente revela o botão "× fechar".

**Alternativas consideradas**:
- **Decidir visibilidade no servidor** (campo `shouldRender: boolean`):
  acopla visibilidade ao retorno e dificulta migrar regra (ex: futuro
  banner que só some quando explicitamente fechado). Pior coesão.
- **Hook `useImportVisibility`**: overkill — 3 condições simples num
  único `if`/`return null` já bastam.

## Decisão 3: botão "× fechar" — UX e acessibilidade

**Decisão**: botão posicionado no canto superior direito do card,
sempre visível em estado terminal, com `aria-label="Fechar banner de
import"`. Reusa tokens existentes (`text-ink-mute hover:text-ink`).
Tamanho mínimo 44×44px (alinhado ao princípio de tap targets do 009).
Click chama Server Action via `useTransition` para feedback imediato e
não bloquear UI.

**Rationale**:
- Tap target 44px é o padrão do 009 (responsividade mobile-first) — não
  reduz só por ser desktop.
- `useTransition` é o pattern Next.js 15 para Server Actions chamadas
  fora de form (ver code base existente em `archived-banner` e similares).
- `revalidatePath('/')` no fim da action faz o card sumir naturalmente
  na próxima renderização do RSC, mas como o componente é client e
  monta o estado via prop `initial`, o cliente também precisa atualizar
  localmente (set state vazio + esconder via flag ou simplesmente
  esperar `router.refresh`).

**Decisão de implementação cliente**: após a action voltar com sucesso,
chamar `router.refresh()` (já importado no componente). O server reumonta
com `lastAck >= runStartedAt`, decide não renderizar, e o card desaparece.
Não duplica estado client.

**Alternativas consideradas**:
- **Estado local "dismissed"** + omitir render no client: gera
  divergência client/server até próximo poll. Pior UX (banner pisca de
  volta).
- **Modal de confirmação** ("tem certeza?"): excessivo — o ato de
  fechar já é reversível pela próxima execução de import.

## Decisão 4: zona do timestamp (UTC at-rest)

**Decisão**: armazenar como `integer('import_acknowledged_at', { mode:
'timestamp' })`. Drizzle traduz para Unix epoch; comparação numérica
direta com `syncRuns.startedAt` (mesmo tipo).

**Rationale**:
- Padrão do projeto (Architecture Decision em CLAUDE.md: "UTC at-rest,
  America/Sao_Paulo na UI"). Acknowledge não é exibido na UI, só
  comparado — irrelevante converter.
- Comparação `lastAck >= runStartedAt` é entre `Date | null` em TS após
  Drizzle hidratar. Trivial.

## Decisão 5: revalidação de paths

**Decisão**: `acknowledgeImportProgress` chama `revalidatePath('/')`
apenas. O banner só renderiza na home; outras rotas não consomem este
estado.

**Rationale**:
- O `import-poller` global (que roda em outras rotas) chama
  `getImportProgress` mas ignora retorno (apenas dispara o lado-efeito
  da action de retomada). Não exibe banner em si.
- Evita revalidação supérflua em `/disco/*`, `/sets/*` etc.
