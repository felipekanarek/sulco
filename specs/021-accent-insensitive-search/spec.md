# Feature Specification: Busca insensitive a acentos

**Feature Branch**: `021-accent-insensitive-search`
**Created**: 2026-04-30
**Status**: Draft
**Input**: User description: "Inc 18 — busca textual em `/` e `/sets/[id]/montar` deve achar resultados independente de acentos. Digitar 'joao' acha 'João Gilberto'; 'sergio' acha 'Sérgio Mendes'; 'acucar' acha 'Açúcar'."

## Summary

Hoje a busca textual em `/` (home/coleção) e em `/sets/[id]/montar`
(listagem de candidatos pra set) é case-insensitive mas **sensível a
acentos**. Digitar `joao` no campo de busca não encontra `João
Gilberto`; `sergio` não acha `Sérgio Mendes`; `acucar` não acha
`Açúcar`.

Esta é fricção real e diária pra o DJ:

- Nomes próprios em pt-BR têm acentos com altíssima frequência
  (Caetano, João, Mônica, Lúcio Battisti, Antônio, Vinícius,
  Sérgio).
- Teclados mobile e laptops na maioria dos OS exigem chord ou
  long-press pra digitar acento — fluxo de busca rápida fica
  quebrado.
- Felipe relatou hoje (2026-04-29) que tropeça constantemente
  procurando discos da própria coleção.

Esta feature normaliza ambos os lados da comparação (termo
digitado + valor armazenado) removendo diacríticos antes de
comparar. Resultado: `joao` acha `João`, `JOAO`, `JoAo`; `acucar`
acha `Açúcar`. Comparação continua case-insensitive.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Buscar artista com acento na home (Priority: P1)

DJ está em `/` querendo localizar discos do João Gilberto. Digita
`joao` no campo de busca (sem acento, no celular). Antes:
0 resultados ou resultados parciais que ele não esperava. Depois:
todos os discos com `João` no artista aparecem normalmente —
exatamente como se ele tivesse digitado `João`.

**Why this priority**: caso fundador. A coleção do Felipe tem
muitos brasileiros com acento e o teclado mobile dificulta digitação.
Sem isso, busca rápida não funciona em nomes próprios — usado
diariamente.

**Independent Test**: a partir de DB com pelo menos 1 disco cujo
artista é `João Gilberto`, abrir `/`, digitar `joao` no campo de
busca. O disco aparece no resultado. Repetir com `JOAO` (caps),
mesmo resultado. Repetir com `João` (com acento), mesmo resultado.

**Acceptance Scenarios**:

1. **Given** disco com artista `João Gilberto` no DB, **When** DJ
   digita `joao` no campo de busca em `/`, **Then** o disco
   aparece nos resultados.
2. **Given** disco com título `Açúcar` no DB, **When** DJ digita
   `acucar`, **Then** o disco aparece nos resultados.
3. **Given** disco com label `Brasília Records`, **When** DJ
   digita `brasilia`, **Then** o disco aparece.
4. **Given** termo de busca contendo acento (`joão`), **When** DJ
   submete, **Then** continua encontrando o mesmo conjunto de
   resultados que o termo sem acento (paridade bidirecional —
   normaliza ambos os lados).

---

### User Story 2 — Buscar faixa com acento em /sets/[id]/montar (Priority: P1)

DJ está em `/sets/[id]/montar` montando set. Quer localizar
faixa "Águas de Março". Digita `aguas` no campo de busca de
candidatos. A faixa aparece como candidato.

**Why this priority**: mesmo caso fundador da US1, em outra rota.
Usado em sessão real de montagem; sem busca por acento, DJ não
acha faixa que ele lembra mas não digitou com acento.

**Independent Test**: a partir de track com título `Águas de
Março` (ou similar) elegível como candidato, abrir
`/sets/[id]/montar` (set existente sem essa faixa). Digitar
`aguas` no campo de busca. A faixa aparece como candidato.

**Acceptance Scenarios**:

1. **Given** track `Águas de Março` selected + record active,
   **When** DJ digita `aguas` na busca, **Then** a faixa aparece
   nos candidatos.
2. **Given** track com fine-genre `Música popular brasileira`,
   **When** DJ digita `musica popular`, **Then** a faixa aparece.
3. **Given** track de artista `Antônio Carlos Jobim`, **When** DJ
   digita `antonio carlos`, **Then** a faixa aparece.

---

### Edge Cases

- **Termo com acento + DB sem acento**: paridade bidirecional —
  digitar `João` acha tanto `João Gilberto` quanto, hipotético,
  `Joao Gilberto` (caso de cadastro inconsistente). Ambos os
  lados são normalizados antes da comparação.
- **Termo com cedilha**: digitar `coracao` acha `Coração`;
  digitar `Coração` acha `coracao` se algum disco tiver assim
  cadastrado.
- **Diacríticos não-pt-BR**: a normalização cobre **qualquer**
  diacrítico Unicode (não apenas acentos pt-BR). Digitar `naive`
  acha `naïve`; `cafe` acha `café`. Cobertura "universal" via
  normalize NFD + strip de combining marks.
- **Letras sem diacrítico permanecem inalteradas**: `Beatles`
  continua bate como `Beatles` (não há transformação além do
  strip).
- **Maiúsculas/minúsculas**: comparação continua case-insensitive
  (já era hoje). Combinado: `JOAO` acha `João`, `joão` acha `JOAO`.
- **Termo vazio ou só whitespace**: filtro não é aplicado (igual
  comportamento atual).
- **Pontuação no termo**: pontuação (`.`, `-`, `,`, etc) não é
  modificada — `Stones,` busca como `Stones,`. Caso DJ queira
  tolerância de pontuação, abre Inc futuro.
- **Performance**: a normalização não regride percepção de
  velocidade da busca em ambas as rotas. Tempo de resposta
  permanece comparável ao atual (≤500ms na escala atual de
  ~2500 discos / ~10k tracks).
- **Mobile (Princípio V)**: o ganho desta feature é mais
  impactante em mobile (teclado sem acento natural). Quickstart
  inclui cenário mobile.
- **Filtros de tag (mood, context, gênero, estilo)**: também são
  textuais e podem ter casos com acento (`dançante`,
  `melancólico`). Esta feature aplica normalização a esses
  filtros multi-select sempre que envolvem comparação textual com
  input do usuário.
- **Multi-user isolation**: nenhuma mudança — query continua
  filtrando `WHERE userId = ?` (já existente).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A busca textual em `/` (campo `q` / `text`) MUST
  ser insensitive a diacríticos: digitar `joao` acha `João` e
  vice-versa.
- **FR-002**: A busca textual em `/sets/[id]/montar` (campo
  `text` da listagem de candidatos) MUST ser insensitive a
  diacríticos com a mesma regra de FR-001.
- **FR-003**: A normalização MUST ser bidirecional — termo
  digitado E valor no DB são normalizados antes da comparação.
- **FR-004**: A busca MUST permanecer case-insensitive
  (comportamento atual preservado).
- **FR-005**: A normalização MUST cobrir diacríticos universais
  (não apenas pt-BR). Termos como `naive` ↔ `naïve`,
  `cafe` ↔ `café`, `garcon` ↔ `garçon` MUST funcionar.
- **FR-006**: Filtros de tag textuais (mood, context, fineGenre)
  na rota `/sets/[id]/montar`, e gênero/estilo na rota `/`,
  quando envolvem comparação textual com input do usuário, MUST
  aplicar a mesma normalização.
- **FR-007**: Termo de busca vazio ou só whitespace MUST manter
  comportamento atual (filtro não aplicado, sem regressão).
- **FR-008**: A busca MUST continuar respeitando isolamento
  multi-user — apenas registros do user atual aparecem nos
  resultados.

### Key Entities

Sem novas entidades. Reutiliza:
- **Record** (campos textuais já existentes: `artist`, `title`,
  `label`, `genres`, `styles`).
- **Track** (campos textuais: `title`, `fineGenre`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos casos onde o termo digitado pelo DJ
  difere apenas por acento/diacrítico de um valor existente no DB,
  a busca retorna o registro. Verificável via cenários do
  quickstart.
- **SC-002**: Tempo de resposta da busca permanece ≤500ms em
  ambas as rotas (`/` e `/sets/[id]/montar`) na escala atual
  (~2500 discos / ~10k tracks). Sem regressão perceptível vs
  comportamento atual.
- **SC-003**: Mobile (≤640px): DJ usando teclado virtual
  consegue digitar termos sem acento (`joao`, `sergio`,
  `acucar`) e encontrar os discos correspondentes — fricção de
  digitação reduzida a zero.
- **SC-004**: Termos com acento digitados intencionalmente
  (caso DJ esteja em desktop com layout pt-BR) continuam
  encontrando os mesmos resultados que termos sem acento —
  paridade bidirecional verificável.
- **SC-005**: Multi-user isolation preservado — DJ A buscando
  termo que coincide com disco de DJ B NÃO retorna o registro
  de B.

## Assumptions

- A escala atual (1 user com 2500 discos, ~10k tracks) permite
  abordagem de **filtragem em memória após query SQL**. SQL
  amplo + filtro JS final preserva simplicidade e dispensa
  schema delta.
- Caso a coleção cresça muito (5+ users com 10k+ discos cada) e
  performance virar gargalo, abre-se Inc futuro para mover
  normalização pra coluna física (`searchBlob`) com backfill
  one-shot. Hoje, custo > benefício.
- Tags de vocabulário (moods, contexts) tipicamente são
  cadastradas sem acento por convenção (`dancante`,
  `melancolico`). Mas a feature normaliza assim mesmo —
  redundante quando termos são puros ASCII; sem custo extra;
  cobre casos onde DJ cadastrou com acento.
- Pontuação no termo de busca (vírgula, ponto, hífen) NÃO é
  removida — preserva busca exata com pontuação se DJ quiser.
- Princípio I respeitado: feature é leitura — nenhuma escrita
  em campo AUTHOR ou em qualquer lugar.
- Princípio II respeitado: queries permanecem RSC; helper de
  normalização é função pura sem side-effect.
- Princípio III respeitado na opção JS-side recomendada — zero
  schema delta.
- Princípio V (Mobile-Native): impacto é maior em mobile;
  quickstart inclui cenário mobile.
- Sem novas Server Actions — feature é puramente refator de
  query.
