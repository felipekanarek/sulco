# Feature Specification: Denormalização user_facets

**Feature Branch**: `023-user-facets-denormalization`
**Created**: 2026-05-01
**Status**: Draft
**Input**: User description: "Inc 24 — materializar agregações pesadas de filtros e contadores numa tabela `user_facets` (1 row por user). Reads de filtros viram 1 SELECT em vez de scans completos. Atualizar via helper `recomputeFacets(userId)` chamado em writes que afetam dados."

## Clarifications

### Session 2026-05-01

- Q: Recompute síncrono ou em background via `after()`? → A: **Síncrono**. Server Actions de write esperam o recompute terminar antes de retornar `{ ok: true }`. Frescor garantido na próxima leitura — sem race entre write e leitura concorrente. Custo: ~250-550ms por write (write principal + recompute). Aceito porque escala atual cabe e simplicidade > performance marginal.

## Summary

Pacote 022 reduziu parte do consumo Turso (paginação + prefetch=false +
cache no-op + ImportPoller removido), mas a home `/` e a rota
`/sets/[id]/montar` continuam executando **5+ queries de agregação a
cada load** que escaneiam toda a coleção do user:

| Query | Volume aproximado por load |
|-------|---------------------------:|
| `listUserGenres` (json_each scan em ~2500 records × ~5 genres) | ~12k reads |
| `listUserStyles` (idem) | ~12k reads |
| `listUserVocabulary('moods'/'contexts')` (json_each em ~10k tracks) | ~5-10k reads cada |
| `listUserShelves` (DISTINCT em records) | ~2.5k reads |
| `collectionCounts` (count agregado) | ~2.5k reads |
| `countSelectedTracks` (JOIN tracks) | ~10k reads |
| `getImportProgress` count records | ~2.5k reads |

**Total**: ~40-50k reads por load. Replicado em CADA visita
(cache no Vercel Hobby não persiste). Em uso intenso, estoura
500M reads/mês rapidamente.

Esta feature **materializa todas essas agregações** numa tabela
`user_facets` (1 row por user). As queries acima viram **1 SELECT
da row** = ~1 read total. Atualização via helper centralizado
`recomputeFacets(userId)` chamado no fim de Server Actions que
afetam os dados-fonte (status, curadoria, sync, etc).

**Princípio articulado pelo DJ**: "isso deveria ser o padrão para
não ler tudo toda vez que tiver que carregar filtros, nem na home
nem em /sets/[id]/montar". Esta feature implementa esse princípio
estruturalmente.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — DJ navega pela coleção sem estourar cota Turso (Priority: P1)

DJ usa o Sulco normalmente — abre `/`, navega entre páginas da
coleção, abre filtros, monta sets, busca faixas. Após esta
feature, cada load consome volume drasticamente menor de reads no
DB, mantendo o app dentro da cota gratuita do Turso mesmo em uso
iterativo de desenvolvimento.

**Why this priority**: emergência operacional contínua. Pacote 022
reduziu pela metade mas ainda insustentável. Sem isso, app fica
indisponível ou exige upgrade pago.

**Independent Test**: anotar volume de row reads no dashboard
Turso antes do deploy. Executar bateria típica (abrir home, abrir
filtros, montar set, etc.). Esperado: redução >90% vs baseline
pré-Inc 24.

**Acceptance Scenarios**:

1. **Given** DJ acessa a home `/` pela primeira vez no dia,
   **When** o RSC completa o render, **Then** as queries de filtros
   e contadores agregados consomem ≤10 reads totais (vs ~40-50k
   antes).
2. **Given** DJ visita `/sets/[id]/montar`, **When** o painel de
   filtros (moods, contexts, fineGenre) é renderizado, **Then** o
   vocabulário é servido a partir da row `user_facets` (1 read).
3. **Given** DJ visita uma rota qualquer com `<SyncBadge>` no
   header, **When** o badge calcula visibilidade, **Then** o
   contador de records é servido pela row `user_facets` (sem
   recalcular).

---

### User Story 2 — DJ edita status / curadoria e os filtros refletem o estado atualizado (Priority: P1)

DJ ativa/descarta um disco, ajusta moods de uma faixa, ou
adiciona prateleira nova. Após o write, a próxima visita à home /
montar deve mostrar contadores e listas de filtros refletindo a
mudança — sem ficar mostrando dado stale.

**Why this priority**: feature seria inútil se contadores
ficassem desatualizados. Confiança do DJ no estado mostrado é
não-negociável.

**Independent Test**: DJ ativa 1 disco unrated → próxima visita
à `/` mostra `recordsActive` incrementado em 1 e `recordsUnrated`
decrementado em 1. Idêntico para vocabulário (DJ adiciona mood
novo a uma faixa → próxima visita ao /montar lista o novo mood
nas sugestões).

**Acceptance Scenarios**:

1. **Given** DJ executa qualquer Server Action de write que
   afeta facets (status, curadoria, sync, archive, prateleira),
   **When** a action retorna sucesso, **Then** os contadores e
   listas materializadas refletem o novo estado na próxima leitura
   (≤500ms).
2. **Given** sync do Discogs adiciona ou remove records, **When**
   sync completa, **Then** facets são recomputados antes do RSC
   próximo carregar a home.
3. **Given** DJ adiciona uma prateleira nova ("E5-P3") via
   Inc 21 picker, **When** salva, **Then** a próxima abertura do
   picker em qualquer disco lista "E5-P3" como sugestão (vinda
   da row facets).

---

### User Story 3 — Multi-user isolation preservado (Priority: P1)

DJ A e DJ B compartilham a infraestrutura. Cada um deve ver
apenas seus próprios filtros e contadores. Recompute de A não
toca dados de B.

**Why this priority**: Princípio I (Soberania dos Dados do DJ).
Vazamento entre users seria violação séria.

**Independent Test**: DJ A com 30 prateleiras + DJ B com 5
prateleiras. Cada um abrir picker → vê apenas as próprias.
Helper `recomputeFacets(userA.id)` não atualiza row de B.

**Acceptance Scenarios**:

1. **Given** DJ A tem `user_facets` com X gêneros distintos e
   DJ B tem Y, **When** DJ A faz qualquer write, **Then** apenas
   a row de A é atualizada; B fica intacto.
2. **Given** DJ A acessa home, **When** o RSC lê facets,
   **Then** retorna apenas dados de A — sem fallback que misture
   facets entre users.

---

### Edge Cases

- **Row de facets ausente** (user novo, antes do primeiro
  recompute): leitura deve retornar valores default (listas
  vazias, contadores 0). Sem null/erro pra UI.
- **Recompute durante carregamento concorrente**: leitura RSC
  pode pegar facets ANTES do recompute do write em paralelo.
  Aceitável — próxima leitura pega valores novos.
- **Fonte da verdade preservada**: facets é cache derivado.
  Records e tracks continuam single source. Recompute regenera
  facets a qualquer momento sem perda de dados autorais.
- **Bug de invalidação esquecida**: se Server Action de write
  esqueçe de chamar `recomputeFacets`, facets ficam stale até
  próxima action que chame OU intervenção manual (cron noturno
  fallback opcional).
- **Multi-user** (Princípio I): row é por `userId`. Recompute
  de A nunca toca B.
- **Sync importa muitos records de uma vez**: recompute roda no
  fim do sync, não a cada record inserido (eficiência).
- **Backfill em prod**: ao deployar, users existentes precisam
  ter sua row `user_facets` populada antes da próxima leitura;
  caso contrário, queries retornam contadores 0 e listas
  vazias. Backfill explícito antes de deploy do código novo.
- **Recompute falha (DB indisponível)**: write principal já
  ocorreu (action retornou ok); recompute em catch silencioso
  loga o erro mas não rollback. Próximo write tenta de novo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sistema MUST manter uma representação materializada
  por user contendo (a) listas distintas com contadores de gêneros
  e estilos, (b) listas distintas de moods, contexts e prateleiras,
  (c) contadores agregados de records (total, ativos, unrated,
  descartados) e tracks selecionadas.
- **FR-002**: Cada load do RSC que precisa de qualquer um desses
  dados MUST consumi-los em **uma única leitura** (a row do user),
  sem scans full-table.
- **FR-003**: Server Actions de write que afetam dados-fonte
  (status do disco, curadoria de faixa, prateleira, archive,
  sync inicial/incremental) MUST disparar recompute da
  representação **de forma síncrona** ao final (Clarification Q1)
  — a action aguarda o recompute terminar antes de retornar
  sucesso, garantindo frescor imediato na próxima leitura.
- **FR-004**: Multi-user isolation MUST ser garantido — recompute
  de DJ A nunca toca dados materializados de DJ B.
- **FR-005**: Quando a representação ainda não existe para um user
  (caso de user novo ou pré-backfill), leituras MUST retornar
  defaults seguros (listas vazias, contadores 0) — sem erro,
  sem null inesperado.
- **FR-006**: Helper de recompute MUST ser idempotente: chamadas
  repetidas sobre o mesmo user produzem o mesmo resultado.
- **FR-007**: Recompute MUST executar em ≤500ms na escala atual
  (~2500 records, ~10k tracks por user).
- **FR-008**: Falha do recompute em uma Server Action MUST NÃO
  revertir o write principal — o write já ocorreu; recompute é
  best-effort com log de erro.
- **FR-009**: Backfill inicial MUST popular a representação para
  todos os users existentes ANTES de o código novo (que depende
  da representação) entrar em produção.
- **FR-010**: Assinaturas externas das funções consumidoras
  (`listUserGenres`, `listUserStyles`, `listUserVocabulary`,
  `listUserShelves`, `collectionCounts`, `countSelectedTracks`)
  MUST permanecer iguais — callers não mudam.

### Key Entities

**User Facets** (entidade nova):
- 1 row por user (PK = userId, FK CASCADE).
- Listas como JSON: gêneros e estilos `[{value, count}]`;
  moods/contexts/shelves `string[]` ordenado.
- Contadores: `recordsTotal`, `recordsActive`, `recordsUnrated`,
  `recordsDiscarded`, `tracksSelectedTotal`.
- `updatedAt` timestamp.
- Derivada de: `records`, `tracks` (zona AUTHOR e SYS).

Reusa entidades existentes:
- **Record** (filtros não mudam — apenas como dados-fonte).
- **Track** (idem).
- **User** (FK).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Volume de row reads em um load típico da home `/`
  cai de ~50k para ≤1k. Verificável via dashboard Turso
  (delta antes/depois).
- **SC-002**: Volume em um load típico de `/sets/[id]/montar` cai
  proporcionalmente (vocabulary moods/contexts deixa de scanear
  tracks).
- **SC-003**: Em uso típico de dev iterativo (50-100 loads/dia),
  consumo total ≤200k reads/dia, sustentável dentro do free tier
  sem upgrade.
- **SC-004**: Após qualquer Server Action de write coberta,
  contadores e listas refletem o novo estado em ≤500ms.
- **SC-005**: Recompute roda em ≤500ms na escala atual; writes
  totais (write principal + recompute síncrono) ficam em ≤700ms,
  imperceptível ao DJ no fluxo de UI.
- **SC-006**: Multi-user isolation verificável por SQL — DJ A
  e DJ B mantêm rows independentes.
- **SC-007**: Sem regressão funcional na UI: contadores no footer
  da home, filtros multi-facet, picker de prateleiras (Inc 21),
  vocabulário moods/contexts em montar — tudo continua mostrando
  os mesmos dados que antes (dados corretos, sem stale).
- **SC-008**: Aplicação da migration em prod (criação da tabela
  + backfill) sem downtime — `CREATE TABLE IF NOT EXISTS` é
  idempotente, backfill é INSERT/UPDATE atômico por user.

## Assumptions

- Recompute completo é viável na escala atual (~2500 records,
  ~10k tracks). Roda em <500ms. Acima de ~50k records/user
  (cenário hipotético futuro), revisitar abordagem incremental
  (delta-update por write em vez de recompute completo).
- Helper de recompute fica fora de qualquer Server Action de
  leitura — apenas writes invocam.
- Server Actions de write **NÃO cobertas** mas que poderiam
  afetar facets (improvável, mas potencial): documentar como
  débito técnico se descobrir; cron noturno opcional como fallback.
- Cron de fallback **não implementado nesta feature** — mantém
  escopo enxuto. Pode ser Inc futuro se observar drift na prática.
- Migration aplicada via Turso shell (mesmo padrão de Inc
  010/012/013/022 — `db:push` interactive falha em non-TTY).
- Tabela usa JSON columns pra listas porque o motor de DB
  (SQLite/Turso) suporta JSON nativo e cabe bem na granularidade
  de "1 row por user com várias listas".
- Princípio I respeitado: facets é zona SYS (derivado, não
  AUTHOR). Recompute lê campos AUTHOR mas nunca os modifica.
- Princípio III: schema delta de 1 tabela. Schema continua
  single source.
- Princípio V: ganho cross-device — todas as rotas autenticadas
  ficam mais leves; UI não muda.
- Pacote 022 fica fechado como está (paginação + prefetch=false
  + ImportPoller removido + cache no-op). Esta feature é Inc 24
  separado.
- Sem alterações de UI nem comportamento observável ao DJ além
  da velocidade percebida e da economia de cota.
