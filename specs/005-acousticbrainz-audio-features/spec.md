# Feature Specification: Audio features via AcousticBrainz (BPM/tom/energia/moods)

**Feature Branch**: `005-acousticbrainz-audio-features`
**Created**: 2026-04-24
**Status**: Draft
**Input**: Pré-preencher ghost fields (bpm, musicalKey, energy, moods) nas
faixas a partir de AcousticBrainz, usando a release do Discogs (já
sincronizada) → MusicBrainz (ponte via ISRC) → AcousticBrainz como cadeia
de resolução. Respeita Princípio I da Constituição: só escreve em campo
autoral quando ele está vazio (`null`) no momento da gravação — jamais
sobrescreve curadoria do DJ. Reaproveita infraestrutura de sync existente.
Fornece pista visual de origem na tela de curadoria.

## Clarifications

### Session 2026-04-24

- Q: Como o sistema marca se o valor atual de um campo de audio
  features é sugestão externa ou confirmação do DJ? → A: Flag única
  por faixa `audioFeaturesSource` (null / `acousticbrainz` / `manual`).
  Qualquer edição manual do DJ em qualquer um dos 4 campos (bpm,
  musicalKey, energy, moods) move a flag pra `manual`, travando os
  outros 3 campos contra futuras sugestões. Mais simples e condizente
  com o fluxo de curadoria (quem abre o disco revê o conjunto).
- Q: Quando o enriquecimento é disparado? → A: Dois gatilhos — (1)
  cron diário existente cobre backlog e re-tentativas; (2) disparo
  imediato em background logo após import/sync de disco novo cobre
  o caso "acabei de importar e quero ver sugestão agora". Falha do
  trigger imediato é absorvida pelo cron do dia seguinte.
- Q: Qual política de aceitação e vocabulário para moods externos?
  → A: Aceitar somente moods com probabilidade ≥ 0.7 (alta confiança),
  gravar os termos diretamente como vêm da fonte (sem prefixo, sem
  tradução). Fica na mão do DJ "adotar" editando a faixa (o que vira
  `audioFeaturesSource = manual`) e renomear/remover conforme seu
  vocabulário pt-BR. Aceita-se o risco de convivência temporária
  entre termos em inglês e pt-BR no filtro do /montar.
- Q: Como evitar que dados curados pré-005 sejam rotulados como
  "sugestão" no primeiro enrich run? → A: Backfill one-shot
  obrigatório antes do primeiro enrich em produção. Toda track com
  bpm/tom/energia/moods já preenchidos e `audioFeaturesSource IS
  NULL` recebe `audioFeaturesSource = 'manual'` via SQL idempotente.
  Implementado em tasks.md T004a. Combinado com a cláusula
  `WHERE audio_features_source IS NULL` do UPDATE do enrich, garante
  Princípio I retroativamente.
- Q: Como tratar o caso "DJ limpa um campo sugerido" (FR-013)?
  → A: Detecção por **presença de chave no input**, não por
  `!== undefined`. Se o input da Server Action contém a chave
  (`{ bpm: null }` = limpar BPM deliberadamente), `source` vira
  `manual` e os demais 3 campos do bloco ficam trancados. Distingue
  de `{}` (sem chave = sem intenção de tocar no campo). Reflete em
  T024 (lógica) e T025 cenário 3 (teste).

## User Scenarios & Testing

### User Story 1 — Pré-preenchimento automático de faixas novas (Priority: P1)

O DJ acabou de importar um disco novo pelo fluxo Discogs. Quando abre a
página do disco pra curar, as faixas que têm match em fontes públicas já
aparecem com BPM, tom e energia preenchidos — mas visivelmente marcados
como sugestão externa, não como curadoria confirmada. O DJ pode aceitar
(editando ou não) ou sobrescrever com sua própria avaliação.

**Why this priority**: É o caminho que destrava o valor principal. Sem
isso, o DJ continua digitando BPM faixa por faixa pra 2500 discos.

**Independent Test**: Pode ser validado sozinho importando um disco cujas
faixas tenham ISRC no Discogs e verificando que (a) campos autorais
aparecem pré-preenchidos no `/disco/[id]`, (b) campos têm marca visual
de "sugestão externa", (c) se o DJ já tinha preenchido algum campo
manualmente antes, ele NÃO é alterado.

**Acceptance Scenarios**:

1. **Given** um disco recém-importado com 8 faixas, todas com ISRC no
   Discogs e dados em fonte pública, **When** o DJ abre `/disco/[id]`,
   **Then** todas as 8 faixas mostram BPM/tom/energia pré-preenchidos
   com rótulo discreto indicando origem externa.
2. **Given** um disco em que o DJ já preencheu BPM=120 manualmente na
   faixa 3, **When** a resolução externa retorna BPM=118 pra essa
   faixa, **Then** `tracks.bpm` da faixa 3 continua 120 (sem conflito
   silencioso) e nenhuma marca de "sugestão externa" aparece nela.
3. **Given** um disco sem ISRC em nenhuma faixa, **When** o sistema
   tenta enriquecer, **Then** nenhum campo é preenchido e o disco
   continua curável manualmente sem erro nem aviso intrusivo.
4. **Given** uma faixa que tem ISRC mas não existe na fonte de audio
   features, **When** o sistema tenta enriquecer, **Then** apenas essa
   faixa fica sem pré-preenchimento — outras faixas do mesmo disco
   podem ter sido enriquecidas.

---

### User Story 2 — Identificação visual da origem do dado (Priority: P1)

Quando o DJ está curando, ele precisa distinguir num relance "o que eu
confirmei" de "o que a fonte externa sugeriu". Sem isso, o pré-
preenchimento vira ruído — o DJ hesita a confiar porque não sabe se
aquele BPM é dele mesmo de um disco antigo ou uma sugestão bruta.

**Why this priority**: Sem pista visual de origem, o pré-preenchimento
é pior do que não preencher — introduz dúvida sobre a fidelidade dos
dados antigos do próprio DJ.

**Independent Test**: Pode ser validado visualmente abrindo um disco
que tem mix de campos (alguns preenchidos pela curadoria antiga, outros
vindos da fonte externa) e confirmando que cada grupo tem tratamento
visual distinto.

**Acceptance Scenarios**:

1. **Given** uma faixa com BPM pré-preenchido pela fonte externa,
   **When** o DJ olha o campo na UI de curadoria, **Then** há uma
   indicação visual discreta (rótulo, cor, ícone) mostrando que aquele
   valor é sugestão externa não confirmada.
2. **Given** uma faixa com BPM editado pelo DJ em sessão anterior,
   **When** o DJ olha o campo, **Then** o campo aparece como
   confirmado, sem rótulo de sugestão externa.
3. **Given** uma faixa com BPM originalmente sugerido externamente
   e depois editado pelo DJ (mesmo que pro mesmo valor), **When** o DJ
   abre o disco de novo, **Then** o **bloco inteiro** de audio features
   da faixa (bpm, tom, energia, moods) aparece como confirmado —
   editar um dos 4 campos "adota" os outros 3 e a flag da faixa vira
   `manual`.

---

### User Story 3 — Enriquecimento do acervo existente sem re-importar (Priority: P2)

O DJ já tem 2500 discos catalogados ao longo de meses. Ele não quer
passar disco por disco clicando "enriquecer". Quer que a nova
funcionalidade se aplique ao acervo inteiro em background, quando
possível, sem quebrar o fluxo de trabalho dele.

**Why this priority**: Se só novos discos se beneficiam, o valor fica
minúsculo — o ganho grande é no backlog acumulado.

**Independent Test**: Pode ser validado forçando a rotina em batch num
subconjunto representativo do acervo e medindo (a) quantas faixas
tinham campos autorais vazios antes, (b) quantas passaram a ter
pré-preenchimento, (c) que nenhum campo autoral previamente preenchido
foi tocado.

**Acceptance Scenarios**:

1. **Given** um acervo com 500 discos já sincronizados e nenhum
   enriquecido, **When** a rotina periódica roda uma vez, **Then** todos
   os discos elegíveis (com ISRC e match público) ficam enriquecidos
   sem que o DJ precise tomar ação.
2. **Given** um disco enriquecido há 30 dias e sem alterações na
   Discogs nem na fonte externa, **When** a rotina roda de novo,
   **Then** nenhum campo muda (sem requisições inúteis, sem reescrever
   timestamp).
3. **Given** um disco com algumas faixas enriquecidas e outras não
   (porque parte não tinha match antes), **When** a rotina roda de novo,
   **Then** só as faixas não-enriquecidas são tentadas de novo.

---

### User Story 4 — Observabilidade básica do enriquecimento (Priority: P2)

O DJ quer entender "quantos dos meus 2500 discos foram enriquecidos?
Quantas faixas têm BPM agora? Qual o gap?". Sem isso, ele não sabe
onde gastar energia manual e não confia no sistema.

**Why this priority**: O DJ precisa de uma bússola pra decidir quais
discos curar manualmente primeiro. Sem isso, o benefício do
enriquecimento automático fica invisível.

**Independent Test**: Pode ser validado abrindo uma tela ou seção que
mostre estatísticas de cobertura (total de faixas, quantas têm BPM,
quantas vieram de fonte externa, quantas confirmadas pelo DJ) e
conferindo que os números batem com consultas diretas ao banco.

**Acceptance Scenarios**:

1. **Given** um acervo com 500 discos e 4000 faixas, **When** o DJ
   abre a tela de status, **Then** ele vê contagem total, quantas
   faixas têm BPM, e fração vinda de sugestão externa vs. confirmada.
2. **Given** uma rotina que acabou de rodar, **When** o DJ olha o
   status, **Then** ele vê quando foi a última execução e quantas
   faixas foram alteradas nela.

---

### Edge Cases

- **Disco sem match em MusicBrainz**: busca por `discogs:{id}` pode
  retornar zero resultados ou score baixo (<90). Disco inteiro fica
  sem pré-preenchimento; DJ cura 100% manual como hoje. Sem erro,
  sem notificação.
- **Match de release mas recording sem MBID equivalente**: faixa
  específica pode não ter match por posição (ex. track list difere
  entre edições). Faixa fica sem pré-preenchimento, mesmo que outras
  do mesmo disco tenham funcionado.
- **MBID existe mas sem audio features**: O catálogo público pode ter
  o MBID mas não ter BPM/tom/energia medidos. Faixa segue sem
  pré-preenchimento.
- **Fonte externa temporariamente fora do ar**: Rotina falha
  graciosamente, tenta de novo na próxima execução. Não loga erro por
  faixa — só um erro agregado por execução.
- **DJ deleta o valor pré-preenchido** (limpa o campo BPM que tinha
  sido preenchido pela fonte externa): Edição = intenção. Flag vai
  pra `manual` e os 4 campos de audio features da faixa ficam
  congelados contra futuras sugestões. Valor fica em branco mesmo,
  até DJ preencher novamente.
- **Valor externo muda com o tempo**: Uma vez que uma faixa foi
  enriquecida com sucesso (`audioFeaturesSource = 'acousticbrainz'`),
  ela **não é re-consultada** pela rotina — fica estável mesmo se a
  fonte externa atualizar dados. Na prática é irrelevante
  (AcousticBrainz está congelado desde 2022). DJ pode forçar nova
  consulta apenas indiretamente: se limpar/editar campo (flag vira
  `manual`), a faixa fica trancada contra futuras sugestões —
  recarregar é ação explícita fora do escopo deste incremento.
- **Reedições/remasters com MBID diferente**: sistema resolve a
  partir de `records.discogsId` de cada registro em curadoria.
  Diferentes registros (mesmo que sejam reedições da mesma obra) podem
  ter MBIDs distintos e audio features ligeiramente diferentes —
  cada um segue seu próprio caminho, sem contaminação cruzada.
- **Faixa cujo `selected=false`**: Enriquecimento ocorre normalmente
  — seleção não afeta elegibilidade de sugestão externa.
- **Rate limit da fonte externa**: Sistema respeita limites conhecidos
  e distribui requisições ao longo do tempo. Backlog pode levar
  múltiplas execuções pra completar.
- **Disco arquivado** (`records.archived=true`): Sistema NÃO enriquece
  discos arquivados (já fora da curadoria ativa).
- **Múltiplos usuários com o mesmo disco**: Cada usuário tem registros
  independentes — enriquecimento roda por usuário, mas pode reutilizar
  cache por MBID quando conveniente (detalhe de implementação).
- **Moods em inglês convivem com pt-BR no vocabulário do DJ**:
  Fonte externa retorna termos em inglês (ex. `happy`, `electronic`)
  e eles são gravados direto. Filtros do `/montar` vão exibir tanto
  os termos do DJ (pt-BR) quanto os externos (en) lado a lado. DJ
  "adota" o termo editando a faixa (flag vai pra `manual`), momento
  em que pode renomear/remover conforme preferir. Aceita-se
  convivência temporária como trade-off por simplicidade.

## Requirements

### Functional Requirements

**Resolução e enriquecimento**

- **FR-001**: Sistema MUST usar o identificador canônico do disco já
  sincronizado em `records` (`records.discogsId`) como ponto de partida
  pra resolver faixas em catálogo musical público. Não fará nova
  chamada Discogs só pra este enriquecimento — reaproveita dados já
  persistidos.
- **FR-002**: Sistema MUST resolver cada faixa do disco a um
  identificador canônico (MBID de recording em catálogo público),
  quando possível, via busca por identificador do disco seguida de
  matching por posição (ex. `A1`, `B3`) — não por ISRC.
- **FR-003**: Sistema MUST buscar, por MBID, dados de audio features
  (pelo menos BPM, tom, energia) em fonte pública de acesso livre.
- **FR-004**: Sistema MUST persistir MBID e a origem do dado (p.ex.
  "acousticbrainz") em colunas separadas da faixa, pra permitir
  rastreabilidade e re-tentativa.
- **FR-005**: Sistema MUST registrar o timestamp da última tentativa
  de enriquecimento por faixa, bem-sucedida ou não.

**Princípio I (guarda dos campos autorais)**

- **FR-006**: Sistema MUST gravar valores externos em `tracks.bpm`,
  `tracks.musicalKey`, `tracks.energy` e `tracks.moods` APENAS quando
  (a) o campo estiver `null`/vazio no momento da gravação (null-guard
  por campo) E (b) a faixa tiver `audioFeaturesSource` igual a `null`
  ou igual à fonte externa atual (nunca `manual`).
- **FR-006a**: Sistema MUST manter uma flag única por faixa
  (`audioFeaturesSource`) com valores `null` (nunca enriquecido),
  nome da fonte externa (ex. `acousticbrainz`) ou `manual`. Essa flag
  é a fonte da verdade pra distinguir sugestão de confirmação.
- **FR-006b**: Edição manual do DJ em **qualquer** um dos 4 campos de
  audio features (`bpm`, `musicalKey`, `energy`, `moods`) MUST mover
  a flag pra `manual`, mesmo que o valor editado seja igual ao
  sugerido e mesmo que os outros 3 campos sigam com valor externo.
  A partir desse ponto, nenhum dos 4 campos da faixa aceita nova
  sugestão externa até que a flag seja resetada explicitamente.
- **FR-007**: Sistema MUST verificar o null-guard no momento da escrita,
  não em checagem prévia, pra evitar race condition (DJ editando em
  paralelo).
- **FR-008**: Sistema MUST NUNCA escrever em `tracks.comment`,
  `tracks.references`, `tracks.fineGenre`, `tracks.selected`,
  `tracks.contexts`, `tracks.isBomb` ou `tracks.rating` — esses campos
  são 100% autorais sem equivalente externo defensável.
- **FR-009**: Se fonte externa retornar `moods` múltiplos, sistema
  MUST filtrar e gravar APENAS os moods com probabilidade ≥ 0.7
  (threshold de alta confiança) como array em `tracks.moods`. Termos
  são persistidos exatamente como retornados pela fonte (sem prefixo,
  sem tradução). Sujeito ao null-guard — só grava se o array atual
  da faixa estiver vazio/null. Se nenhum mood passar o threshold,
  `tracks.moods` fica vazio.
- **FR-010**: Sistema MUST registrar auditoria leve (contagem
  agregada, não por faixa) do que foi alterado em cada execução.

**Identificação visual de origem**

- **FR-011**: UI de curadoria (`/disco/[id]`) MUST mostrar distinção
  visual clara no **bloco** dos 4 campos de audio features quando
  `audioFeaturesSource` for o nome de uma fonte externa (sugestão
  não confirmada). Quando for `manual`, o bloco aparece como
  confirmado (sem marca). Quando for `null`, campos vazios aparecem
  como vazios normais.
- **FR-012**: Edição manual de qualquer um dos 4 campos pelo DJ MUST
  mover a flag da faixa pra `manual` (ver FR-006b), tirando
  automaticamente a marca visual de sugestão do bloco inteiro.
- **FR-013**: Limpar um campo sugerido (DJ apaga o valor de um campo
  enquanto `audioFeaturesSource` ainda é externa) MUST mover a flag
  pra `manual` também — edição é edição, não volta ao estado "elegível
  a novo enriquecimento". Se o DJ quiser reativar sugestão, precisa
  de ação explícita fora do escopo deste incremento.

**Execução em batch e periodicidade**

- **FR-014**: Sistema MUST expor rotina em batch que percorre o acervo
  do usuário e tenta enriquecer faixas elegíveis.
- **FR-015**: Rotina MUST pular faixas cuja última tentativa de
  enriquecimento foi bem-sucedida e os dados de origem não mudaram.
- **FR-016**: Rotina MUST pular apenas discos **arquivados**
  (`archived=true`). Discos com `status` = `'unrated'`, `'active'` ou
  `'discarded'` são **todos elegíveis** — o valor principal da feature
  é ajudar na triagem, que acontece justamente sobre discos `unrated`.
  Ordem de processamento: `active` primeiro, `unrated` depois,
  `discarded` por último — assim quando DJ marca um disco como
  `active`, ele tende a ser enriquecido na execução seguinte.
- **FR-017**: Rotina MUST isolar por usuário — acervo de um DJ nunca
  interfere no de outro, mesmo quando compartilham a mesma release.
- **FR-018**: Rotina MUST rodar em dois gatilhos automáticos sem
  exigir ação manual do DJ: (a) cron diário existente (processa
  backlog e re-tenta faixas sem sucesso anterior); (b) disparo
  imediato em background logo após import/sync Discogs que cria ou
  atualiza faixas novas. O gatilho imediato MUST ser fire-and-forget
  (nunca bloqueia a resposta do import) e falhas MUST ser absorvidas
  pelo cron subsequente.
- **FR-018a**: Gatilho imediato MUST processar apenas as faixas
  afetadas pelo import corrente, não o acervo inteiro — pra manter
  latência baixa e não duplicar trabalho do cron.
- **FR-019**: Sistema MUST tolerar falha temporária da fonte externa
  sem corromper estado — próxima execução retoma o backlog.
- **FR-020**: Sistema MUST respeitar limites de uso conhecidos das
  fontes externas, distribuindo requisições ao longo do tempo.

**Observabilidade**

- **FR-021**: Sistema MUST expor ao DJ estatística agregada de
  cobertura: total de faixas vs. quantas têm BPM/tom/energia
  preenchidos, e dentro dessas, quantas são sugestão externa vs.
  confirmadas.
- **FR-022**: Sistema MUST expor timestamp da última execução bem-
  sucedida da rotina para o usuário.

**Multi-tenant e compatibilidade**

- **FR-023**: Sistema MUST rodar por usuário, respeitando isolamento
  existente (cada DJ tem seus registros; nada vaza entre contas).
- **FR-024**: Feature MUST ser implementada sem quebrar o fluxo
  Discogs atual (import, reimport, sync diário) nem as features 001,
  002 e 003 já entregues.

### Key Entities

- **track.externalFeatures**: Conjunto de atributos acoplados à faixa
  para permitir rastrear origem e evitar re-tentativa inútil. Inclui
  MBID, nome da fonte consultada, timestamp da tentativa, sucesso
  (bool), e mapa do que foi efetivamente escrito. Não é uma entidade
  separada — são colunas em `tracks`.
- **enrichmentRun**: Registro agregado de uma execução da rotina
  (início, fim, contagem de faixas inspecionadas, contagem de faixas
  alteradas, erros). Pode ser persistido ou apenas logado — decisão
  de implementação.
- **externalSource**: Nome identificador da fonte (p.ex.
  `acousticbrainz`). Gravado em `tracks.audioFeaturesSource` pra
  futura expansão (se um dia entrar outra fonte, dá pra
  diferenciar/reprocessar).

## Success Criteria

### Measurable Outcomes

- **SC-001**: Pelo menos **50% das faixas elegíveis** (faixas com ISRC
  e MBID resolvível na fonte externa) recebem BPM, tom e energia
  pré-preenchidos após a primeira execução da rotina sobre o acervo.
- **SC-002**: Tempo médio de curadoria por disco **reduz em 40%** em
  relação à linha base (com o DJ cronometrando 10 discos antes e 10
  depois da feature disponível, com a condição de que os discos
  tenham audio features externos disponíveis).
- **SC-003**: **Zero casos** em que um campo autoral previamente
  preenchido pelo DJ é alterado pela rotina de enriquecimento,
  validado por teste automatizado de regressão na escrita e validação
  manual por amostragem após primeira execução em produção.
- **SC-004**: DJ consegue identificar visualmente origem do dado
  (externa vs. confirmada) em menos de **2 segundos** por faixa sem
  precisar abrir dialog, consultar log ou interagir com elementos
  extras.
- **SC-005**: Rotina em background completa o primeiro pass sobre o
  acervo-alvo (~2500 discos) em **no máximo 3 execuções do cron
  diário** (≤ 3 dias a partir do deploy), respeitando rate limits das
  fontes externas. Métrica de saúde intermediária: **≥ 200 discos
  processados por execução** em hardware Vercel padrão.
- **SC-006**: Falha total da fonte externa (indisponibilidade) não
  bloqueia sync diário do Discogs — 100% das outras features
  continuam operando normalmente.
- **SC-007**: Tela de estatísticas carrega em menos de **1 segundo**
  pra acervos de até 3000 discos.
- **SC-008**: Zero vazamento cross-user — rodando a rotina pra um
  usuário, nenhuma faixa de outro usuário MUST sofrer alteração
  (validado por teste de isolamento multi-user).

## Assumptions

- Cadeia canônica de resolução: `records.discogsId` → MusicBrainz
  (busca release por `discogs:{id}` e fetch com recordings) →
  AcousticBrainz (audio features por MBID da recording). Matching de
  faixa entre MB e Sulco feito por posição (`A1`, `B3`…), reusando
  helper existente do incremento 003. Cobertura esperada: ~85% do
  acervo pós-1980 do Felipe tem match em MB; dentro desses, ~70% tem
  dados em AcousticBrainz (dataset congelado em 2022 mas ainda servido
  em modo read-only).
- Fonte primária de audio features neste incremento é AcousticBrainz
  (API pública sem auth). MusicBrainz é ponte de resolução, não fonte
  de audio features. Rate limit MusicBrainz ~1 req/s com
  User-Agent identificado.
- A infraestrutura de cron diário já entregue no incremento 002 está
  ativa e será reaproveitada para disparar a rotina de enriquecimento
  — não há necessidade de novo scheduler.
- O acervo do DJ-alvo tem ~2500 discos e cresce devagar. A rotina
  não precisa ser otimizada pra milhares de usuários simultâneos no
  MVP.
- Privacidade: nenhum dado pessoal do DJ é enviado às fontes externas
  (só ISRC/MBID, que são identificadores públicos de catálogo).
- O padrão estético do Sulco (tipografia séria + tech minimalism) se
  mantém — marca visual de "sugestão externa" usa primitivas já
  existentes, não introduz novo vocabulário visual.
- Campos autorais permanecem em `tracks` (mesma tabela). Não há
  migração pra tabela separada nem para schema novo — reflete a
  decisão de que "ghost fields" é comportamento de escrita, não de
  modelagem.

## Dependencies

- **Discogs sync existente** (incrementos 001 e 002): release com
  ISRCs já está persistida ou acessível via ID do Discogs.
- **MusicBrainz API** (ponte ISRC → MBID): endpoint público, sem
  auth, rate limit 1 req/s para anônimos. Estável desde anos; risco
  de deprecação baixo.
- **AcousticBrainz API** (audio features por MBID): endpoint público
  sem auth, em modo read-only desde 2022 (sem novas submissões, dados
  existentes servidos normalmente). Projeto oficialmente encerrado
  mas infraestrutura mantida pela MetaBrainz.
- **Schema `tracks` atual**: precisa adicionar colunas pra MBID,
  origem, timestamp e (possivelmente) cache de audio features
  brutos pra auditoria. Colunas existentes (`bpm`, `musicalKey`,
  `energy`, `moods`) são reaproveitadas.
- **Cron diário** (`/api/cron/sync-daily`, 002-multi-conta): ponto
  de entrada pra rotina periódica.
- **Constituição Sulco v1.0.0** (Princípio I NON-NEGOTIABLE):
  qualquer desvio da guarda null-only neste incremento é bloqueante.

## Fora de escopo (neste incremento)

- Preview de áudio (30s) ou player inline — movido para incremento
  futuro 5b (combo Deezer + YouTube link-out).
- Match manual quando resolução automática falha (DJ escolhe
  explicitamente "é esse MBID aqui") — fica pra fase posterior.
- Re-enriquecimento quando fonte externa ganha novos dados
  (AcousticBrainz está congelado, então é irrelevante hoje).
- Uso de múltiplas fontes como fallback (GetSongBPM, Tunebat etc.).
  Incremento inicia só com AcousticBrainz.
- Sincronização reversa (DJ edita → sistema envia pra fonte externa).
- Análise acústica local de áudio (processar o MP3 do próprio DJ).
- Mood/context inferidos localmente por ML sobre áudio.
- Sugestão de BPM em listas de candidatos do `/montar` (já usa
  `tracks.bpm`, herda o pré-preenchimento automaticamente sem
  alteração dessa tela).

## Notas de implementação (referência pra /speckit.plan)

Nada aqui é normativo pra esta spec — são apenas pistas pro plano
técnico que virá depois. Incluídas porque surgiram no desenho
conceitual e esquecê-las custaria caro:

- Ponte canônica sugerida: Discogs release (já sincronizada) →
  extrair ISRCs por faixa → MusicBrainz `/isrc/{isrc}` → AcousticBrainz
  `/api/v1/{mbid}/low-level` e `/high-level`.
- Colunas candidatas em `tracks`: `mbid TEXT`,
  `audioFeaturesSource TEXT`, `audioFeaturesSyncedAt INTEGER`,
  `audioFeaturesSuccess INTEGER` (bool).
- Null-guard no SQL: `UPDATE tracks SET bpm = ? WHERE id = ? AND bpm
  IS NULL` (garantia de Princípio I no nível da query).
- Mapeamento de tom: AcousticBrainz fornece em notação de escala
  (C, D#m etc.); converter pra Camelot na escrita OU no render
  (decidir no plan).
- Moods: AcousticBrainz expõe mood tags via high-level; possível
  filtro de confiança mínima pra evitar ruído.
- Observabilidade mínima: adicionar linha ou bloco em `/status`
  (já existe) com contagem agregada.
- Badge visual: reaproveitar convenções do prototype baseline
  (feedback memory: `feedback_ui_prototype_baseline`); não inventar
  vocabulário novo.
- Incremento 5b (preview) **não é pré-requisito** — pode vir antes
  ou depois, não há acoplamento além de ISRC (que já é prérequisito
  deste incremento).
