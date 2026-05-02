# Research — Otimização do fluxo de montar set

**Phase**: 0
**Status**: complete
**Source**: diagnóstico via instrumentação `[DB]` em prod (sessão 2026-05-02 pós Inc 27) + decisões do mantenedor

## Decisões

### Decisão 1 — `listSelectedVocab` deriva de `getUserFacets` cached

- **Decision**: refatorar [src/lib/queries/montar.ts](../../src/lib/queries/montar.ts) — função `listSelectedVocab(userId, kind)` passa a chamar `getUserFacets(userId)` (Inc 24, cached Inc 26 via `react.cache()`) e retornar `facets.moods` ou `facets.contexts`. Mantém assinatura externa.
- **Rationale**: log em prod mostrou 2 queries `SELECT DISTINCT value FROM tracks INNER JOIN records JOIN json_each(tracks.moods)` em **todo render** do montar — escaneia ~10k tracks por chamada × 2 = ~20k rows lidas/render. `user_facets.moodsJson` e `contextsJson` já têm essa info materializada, atualizadas via delta (Inc 27) + cron drift (Inc 27). Custo da nova versão: 1 SELECT (~3 rows) cached.
- **Trade-off**: drift residual de até 24h em vocabulário materializado (cron corrige). Aceito — DJ adicionar mood novo numa faixa não precisa aparecer instantaneamente no chip picker do montar.
- **Alternatives considered**:
  - Cache via `unstable_cache` Next 15: no Vercel Hobby Lambda fresca = no-op (já provado em Inc 23). Descartado.
  - Index funcional em `tracks(record_id, json_each)`: SQLite não suporta. Descartado.
  - Manter SCAN mas com LIMIT/sample: dados incompletos. Descartado.

### Decisão 2 — Debounce client-side de 500ms em `<MontarFilters>`

- **Decision**: dentro de [src/components/montar-filters.tsx](../../src/components/montar-filters.tsx) (componente client existente), adicionar debounce via `useRef<NodeJS.Timeout | null>` + `useEffect` que chama `persistMontarFilters` 500ms após último toggle. Cleanup faz **flush** (chama persist imediato com estado atual) se houver timer pendente.
- **Rationale**: log mostra cada toggle de filtro disparando 1 POST (UPDATE sets) + 1 GET re-render = ~9 queries. Sequência rápida de 5 toggles = ~45 queries. Debounce coalesce em 1-2 persists por sequência.
- **500ms escolhido**: humano clica chips em ≥150ms entre cliques; 500ms permite agrupar até 3-4 cliques rápidos. Acima de 500ms vira percepção de "lento". Abaixo de 500ms quase nunca dispara coalesce.
- **Flush triggers**:
  1. Timer expira após 500ms sem novo toggle → flush automático.
  2. Componente desmonta (DJ navega pra outra rota) → cleanup do `useEffect` chama flush.
  3. (Opcional) `beforeunload` window — descartado pra simplicidade. Multi-aba com estado divergente é caso edge raro.
- **Implementation pattern**:
  ```ts
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<FiltersState | null>(null);

  function scheduleFlush(filters: FiltersState) {
    pendingRef.current = filters;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (pendingRef.current) {
        startTransition(() => {
          persistMontarFilters(setId, pendingRef.current!).catch(err => console.error(err));
        });
        pendingRef.current = null;
      }
      timerRef.current = null;
    }, 500);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current && pendingRef.current) {
        // Flush imediato
        persistMontarFilters(setId, pendingRef.current).catch(() => {});
      }
    };
  }, [setId]);
  ```
- **Alternatives considered**:
  - Mover persist pra `localStorage`: descartado porque DJ usa multi-device (mobile + desktop) e sincronia via DB faz sentido.
  - `useDeferredValue` / `useTransition` sem debounce: ainda dispara persist a cada toggle.
  - Throttle (100ms): dispara muito frequente, não coalesce o suficiente.
  - Library externa (`use-debounce`): adiciona dependência. `useRef + setTimeout` é trivial.

### Decisão 3 — `aiConfigured` deriva de `user.aiProvider/aiModel` cached (Inc 27 leftover)

- **Decision**: em [src/app/sets/[id]/montar/page.tsx](../../src/app/sets/[id]/montar/page.tsx), substituir chamada `getUserAIConfigStatus(user.id)` (de `@/lib/ai`) por:
  ```ts
  const aiConfigured = user.aiProvider !== null && user.aiModel !== null;
  ```
- **Rationale**: Inc 27 incluiu `aiProvider` e `aiModel` no `CurrentUser` cached (via `react.cache()` Inc 26) e refatorou `/disco/[id]/page.tsx`. Mas `/sets/[id]/montar/page.tsx` ficou pendente — log mostra `select "ai_provider", "ai_model" from "users"` em todo render. 1 query desnecessária.
- **Implementação**: simples substituição do callsite. Eliminar `import { getUserAIConfigStatus } from '@/lib/ai'` se não houver outro caller naquela page.
- **Importante**: NÃO incluir `aiApiKeyEncrypted` no objeto cached (mantido fora desde Inc 27). Funções como `suggestSetTracks` que de fato chamam o provider continuam fazendo SELECT dedicado pra chave. Princípio de menor exposição preservado.
- **Alternatives considered**: nenhuma (decisão trivial, alinhada com Inc 27).

### Decisão 4 — `addTrackToSet` combina `COUNT + MAX(order)` em 1 SELECT

- **Decision**: em [src/lib/actions.ts](../../src/lib/actions.ts), substituir os 2 SELECTs separados (count duplicado + max order) por 1 SELECT combinado:
  ```ts
  const [stats] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      maxOrder: sql<number>`COALESCE(MAX("order"), -1)`,
    })
    .from(setTracks)
    .where(eq(setTracks.setId, parsed.data.setId));
  ```
- **Rationale**: log mostra `SELECT COUNT(*) FROM set_tracks WHERE set_id=?` seguido por `SELECT COALESCE(MAX(order), -1) FROM set_tracks WHERE set_id=?`. Mesma WHERE clause, mesmo escopo — 1 SELECT serve pros 2 valores. Saves 1 query/add × ~20 adds/curadoria = -20 queries/set.
- **Mantém ownership checks separados** (sets + tracks): são security/integridade, princípio I. Não combinar em joins gigantes que podem mascarar erros.
- **Alternatives considered**:
  - Eliminar `COUNT(*)` (verificar duplicado) e confiar apenas em `INSERT ... ON CONFLICT DO NOTHING`: ON CONFLICT lida com duplicado mas perde info clara pra UI ("já estava no set" vs "adicionado"). Descartado — UX clara vale 1 query.
  - Single transaction `db.transaction(...)`: SQLite serializa, vale considerar mas adiciona complexidade. Manter sem por enquanto.

### Decisão 5 — `removeTrackFromSet` e `reorderSetTracks` ficam fora do escopo

- **Decision**: não otimizar `removeTrackFromSet` (já é 1 ownership SELECT + 1 DELETE = 2 queries) nem `reorderSetTracks` nesta feature.
- **Rationale**: ambas já são enxutas (poucas queries) e não foram identificadas como gargalo nos logs. Foco em vocabulário (massivo) + filtros (frequente) + addTrack (frequente).
- **Alternatives considered**: refatorar tudo de uma vez. Aumenta escopo sem ganho proporcional. Manter foco.

### Decisão 6 — UI de filtros atualiza candidatos imediatamente (state client), persist é background

- **Decision**: o `<MontarFilters>` já implementa atualização de URL via `router.replace` ou state client que dispara re-render do RSC com candidatos filtrados. O **debounce afeta APENAS o `persistMontarFilters` Server Action** (que salva preferência). UI continua respondendo imediato.
- **Rationale**: separação de concerns — UX imediata vs salvamento eventualmente consistente. DJ não percebe debounce porque candidatos atualizam ao clicar (state client/URL), só o write em `montar_filters_json` que é debounced.
- **Implementação**: a função `scheduleFlush` é chamada em paralelo com a atualização de state visual. Se DJ navegar pra outra rota antes do timer expirar, flush força persist.

### Decisão 7 — Cobrir múltiplos toggles do mesmo chip via "última vence"

- **Decision**: se DJ alterna o mesmo chip 3× rapidamente (on→off→on em <500ms), o estado pendente final (on) é o que persiste. `pendingRef.current` é sobrescrito a cada toggle.
- **Rationale**: lógica natural de debounce — só o último estado importa. Edge case já coberto pela Decisão 2.
- **Alternatives considered**: queue de toggles pra preservar histórico. Sem valor — feature é preferência atual, não histórico.

## Riscos identificados (e mitigações)

1. **Drift entre `user_facets.moodsJson` e estado real**: vocabulário no chip picker pode estar até 24h desatualizado. Aceito por design; cron noturno (Inc 27) corrige.

2. **Race em `addTrackToSet` entre 2 cliques rápidos**: ambos podem ler `maxOrder=N`, ambos tentam INSERT com `order=N+1`. ON CONFLICT na PK `(set_id, track_id)` previne duplicação. Pode resultar em order com gap (não causa problema visível). Aceito.

3. **Flush on unmount falha**: se DJ navega rapidamente, browser pode cancelar a request antes de chegar no servidor. Aceito — drift de no máximo 1 ciclo de filter (DJ vê preferência um pouco desatualizada na próxima visita).

4. **Bug em useEffect cleanup do debounce**: se cleanup não rodar (raro em React 19), persist nunca dispara. Mitigação: timer expira automaticamente após 500ms mesmo sem cleanup; pior caso = atraso de 500ms.

5. **Compatibilidade do ref pattern com Server Components**: `<MontarFilters>` já é client (`'use client'`); refs e useEffect funcionam normalmente. Sem risco aqui.

## Não-decisões (out of scope)

- Otimização de `/sets` (lista) — não auditado neste diagnóstico, fica para Inc futuro se necessário.
- Otimização de `/sets/[id]` (visualização set + bag física) — vimos 1 query `select records JOIN tracks GROUP BY` no log que parece OK; sem ação por ora.
- Refator de `suggestSetTracks` (Inc 14, IA) — não foi capturado completo no diagnóstico; suspeita de alto custo mas requer captura dedicada. Inc futuro se necessário.
- Otimizar `queryCandidates` LIMIT 1000 (Inc 23 já reduziu) — render do montar carrega 58 rows OK por enquanto.
- Migrar `removeTrackFromSet`/`reorderSetTracks` — fora do escopo desta feature (já são enxutas).
