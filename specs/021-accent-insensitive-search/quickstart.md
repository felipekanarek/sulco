# Quickstart — Inc 18: Busca insensitive a acentos

**Feature**: 021-accent-insensitive-search
**Audience**: Felipe (validação manual pós-implementação)

Pré-requisitos:
- App rodando (`npm run dev`) ou em prod.
- DB do user com pelo menos 3 discos cujos campos textuais
  contenham acentos. Sugestões: `João Gilberto`, `Sérgio Mendes`,
  `Caetano Veloso`, ou qualquer disco brasileiro existente.

---

## Setup do estado

Confirmar pelo SQL que existem registros com acento:

```sql
SELECT id, artist, title FROM records
WHERE user_id = <USER_ID>
  AND archived = 0
  AND (
    artist GLOB '*[À-ÿ]*'
    OR title GLOB '*[À-ÿ]*'
  )
LIMIT 10;
```

Se não houver, criar artificialmente para teste:

```sql
-- Atualizar 1 disco existente pra ter acento (rollback depois)
UPDATE records SET artist = 'João Gilberto'
WHERE user_id = <USER_ID> AND id = <ID_QUALQUER>;
```

---

## Cenário 1 — Busca sem acento acha registro com acento (US1, FR-001)

**Passos**:
1. Abrir `/` em desktop.
2. Localizar campo de busca (input `q`).
3. Digitar `joao` (sem acento).

**Esperado**:
- Lista mostra disco com artista `João Gilberto`.
- Demais discos sem `João` no artista/título/label não aparecem.

**Variantes a testar**:
- Digitar `JOAO` (caps): mesmo resultado.
- Digitar `João` (com acento): mesmo resultado (paridade
  bidirecional — FR-003).
- Digitar `joão`: mesmo resultado.
- Digitar `acucar`: acha disco com `Açúcar` no título.
- Digitar `sergio`: acha disco com `Sérgio` no artista.
- Digitar `cafe`: acha qualquer disco com `café` (cobertura
  universal — FR-005).

---

## Cenário 2 — Busca sem acento em /sets/[id]/montar (US2, FR-002)

**Setup**: ter pelo menos 1 set existente com candidatos
elegíveis (records active + tracks selected).

**Passos**:
1. Abrir `/sets/[id]/montar`.
2. Localizar campo de busca textual no painel de filtros.
3. Digitar `aguas`.

**Esperado**:
- Faixas com título `Águas de Março` (ou similar com acento)
  aparecem como candidatas.
- Faixas com artista `Antônio` aparecem ao digitar `antonio`.
- Faixas com `fineGenre` contendo acento (ex: `música popular
  brasileira`) aparecem ao digitar `musica popular`.

---

## Cenário 3 — Busca com acento ainda funciona (FR-003 / SC-004)

**Passos**:
1. Em `/`, digitar `João Gilberto` (com acento).

**Esperado**:
- Mesmo conjunto de resultados que digitar `joao gilberto`
  (sem acento). Paridade bidirecional comprovada.

---

## Cenário 4 — Random respeita busca normalize-aware (Inc 11 / Inc 18 cross)

**Setup**: filtro `unrated` ativo + 2+ discos unrated cujos
artistas têm acento.

**Passos**:
1. Em `/`, digitar `joao` no campo de busca.
2. Clicar botão 🎲 (Random).

**Esperado**:
- Random escolhe entre os discos `João Gilberto` (que casaram
  com `joao` normalize-aware), nunca um disco sem `João`.
- Sem digitar texto: random escolhe entre todos os unrated do
  user (comportamento Inc 11 preservado).

---

## Cenário 5 — Mobile / Princípio V (SC-003)

**Passos**:
1. DevTools device toolbar: 375×667 (iPhone SE).
2. Abrir `/` no viewport mobile.
3. Tocar campo de busca, digitar `joao` usando teclado virtual
   simulado.

**Esperado**:
- Resultados aparecem normalmente — `João Gilberto` na lista.
- Latência percebida ≤500ms entre toque submit e UI atualizar.
- Sem regressão visual da grid (Inc 19 já validado).

---

## Cenário 6 — Termo com pontuação (Edge Case)

**Setup**: disco com título `Stones,` ou `&Co.` (pontuação no
nome).

**Passos**:
1. Em `/`, digitar `Stones,`.

**Esperado**:
- Acha discos com `Stones,` exatamente — pontuação preservada
  na comparação (não removida pelo normalize).

---

## Cenário 7 — Termo só whitespace (FR-007)

**Passos**:
1. Em `/`, limpar busca completamente.
2. Digitar 3 espaços.

**Esperado**:
- Lista mostra TODOS os discos do user (com filtros não-text
  ativos). Filter de text não é aplicado.
- Comportamento atual preservado, sem regressão.

---

## Cenário 8 — Multi-user isolation (FR-008 / SC-005)

**Setup**: DJ A tem `João Gilberto`; DJ B tem `Joao Pessoa`
(sem acento).

**Passos**:
1. Logar como DJ A. Buscar `joao`.
2. Verificar resultados.
3. Logar como DJ B. Buscar `joao`.

**Esperado**:
- DJ A vê só `João Gilberto`. DJ B vê só `Joao Pessoa`. Zero
  vazamento.

---

## Cenário 9 — Performance (SC-002)

**Setup**: DB de produção do Felipe com ~2500 records / ~10k
tracks.

**Passos**:
1. Abrir `/` com filtro vazio.
2. Digitar `joao` no campo de busca.
3. Cronometrar tempo até UI atualizar (use Network tab do
   DevTools — RSC re-renderiza).

**Esperado**:
- Resposta ≤500ms (SC-002).
- Repetir em `/sets/[id]/montar`: mesmo limite.

---

## Cenário 10 — Filtros tag continuam funcionando (Decisão 8 / FR-006)

**Passos**:
1. Em `/`, selecionar 1 gênero ou estilo via filtro multi-select
   (chip).
2. Verificar lista filtra corretamente.
3. Combinar com busca textual `joao`.

**Esperado**:
- Filtro de chip continua igualdade exata (vocabulário canônico).
- Combinado com text: AND entre filtros — disco precisa ter o
  gênero E casar text normalize-aware.

---

## Encerramento

Cobertura mínima: cenários 1 + 2 + 3 + 5 (mobile) cobrem o caso
fundador + bidirecionalidade + mobile. Cenários 4, 6-10 cobrem
edge cases e robustez.

Após validação, marcar feature pronta pra commit / merge / deploy.
