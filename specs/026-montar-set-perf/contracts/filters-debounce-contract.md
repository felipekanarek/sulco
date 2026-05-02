# Contract — Filters Debounce + Flush

**Phase**: 1
**Tipo**: contrato de comportamento de UI client (não API HTTP)
**Localização**: [src/components/montar-filters.tsx](../../src/components/montar-filters.tsx)

## Contexto

Hoje cada toggle de chip de filtro em `<MontarFilters>` chama imediatamente a Server Action `persistMontarFilters(setId, filters)`. Sequência rápida de 5 toggles = 5 POSTs (~45 queries totais com re-render).

Esta feature introduz **debounce** entre o evento de toggle e a chamada de `persistMontarFilters`, mantendo a UX imediata de atualização de candidatos (que continua via state client / URL params).

## Comportamento contratado

### 1. Toggle isolado (intervalo > 500ms desde último toggle)

```
t=0     toggle "rock" ON
t=500   timer expira → persistMontarFilters(setId, { genres: ['rock'], ... })
```

1 persist disparado, 500ms após o toggle.

### 2. Sequência rápida (toggles em <500ms cada)

```
t=0     toggle "rock" ON         → schedule timer T1 (expira em t=500)
t=200   toggle "samba" ON        → cancel T1, schedule T2 (expira em t=700)
t=400   toggle "ambient" ON      → cancel T2, schedule T3 (expira em t=900)
t=900   T3 expira → persistMontarFilters(setId, { genres: ['rock','samba','ambient'], ... })
```

1 persist disparado, com estado final consolidado.

### 3. Múltiplos toggles do mesmo chip ("última vence")

```
t=0     toggle "rock" ON         → schedule T1
t=200   toggle "rock" OFF        → cancel T1, schedule T2 (estado pendente: { genres: [] })
t=400   toggle "rock" ON         → cancel T2, schedule T3 (estado pendente: { genres: ['rock'] })
t=900   T3 expira → persistMontarFilters(setId, { genres: ['rock'], ... })
```

Estado final ('on') é persistido; estados intermediários descartados.

### 4. Flush on unmount (DJ navega antes do timer expirar)

```
t=0     toggle "rock" ON         → schedule T1
t=300   DJ clica em link "Sets"  → componente desmonta
        useEffect cleanup detecta timer pendente → flush imediato:
        persistMontarFilters(setId, { genres: ['rock'], ... })
        timer cancelado
```

Persist disparado imediatamente no unmount; preferência não é perdida.

### 5. UI continua imediata

Toggle visual atualiza instantaneamente (state client / URL params triggers RSC re-render com candidatos filtrados). O **debounce afeta APENAS o salvamento de preferência em `montar_filters_json`** — não a percepção de DJ ao alterar filtros.

## Pseudocódigo de implementação

```ts
'use client';
import { useRef, useEffect, useTransition } from 'react';
import { persistMontarFilters } from '@/lib/actions';

const DEBOUNCE_MS = 500;

export function MontarFilters({ setId, initial, ... }: Props) {
  const [state, setState] = useState<FiltersState>(initial);
  const [, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<FiltersState | null>(null);

  function scheduleFlush(filters: FiltersState) {
    pendingRef.current = filters;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const toFlush = pendingRef.current;
      if (toFlush) {
        startTransition(() => {
          persistMontarFilters(setId, toFlush).catch(err =>
            console.error('[debounce] persistMontarFilters falhou:', err),
          );
        });
        pendingRef.current = null;
      }
      timerRef.current = null;
    }, DEBOUNCE_MS);
  }

  // Trigger schedule sempre que filtros mudam
  function handleToggle(key: keyof FiltersState, value: unknown) {
    const next = { ...state, [key]: value };
    setState(next);
    // Atualiza URL pra disparar re-render do RSC com candidatos filtrados
    router.replace(`?${stringifyFilters(next)}`, { scroll: false });
    // Agenda flush do persist
    scheduleFlush(next);
  }

  // Cleanup on unmount: flush imediato se houver timer pendente
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        const toFlush = pendingRef.current;
        if (toFlush) {
          // Fire-and-forget; pode ser interrompido se browser fechar antes
          persistMontarFilters(setId, toFlush).catch(() => {});
        }
      }
    };
  }, [setId]);

  return (
    <div>
      {/* chips renderizam state.genres, state.styles, etc. */}
      {/* onClick chama handleToggle */}
    </div>
  );
}
```

## Garantias

- **Atomicidade**: cada chamada de `persistMontarFilters` recebe um snapshot completo de filtros (não delta). Server Action faz UPDATE atomic.
- **Ordem**: callback do `setTimeout` em JavaScript é serializado no event loop — não há risco de 2 persists concorrentes da mesma instância.
- **Multi-aba**: cada aba tem sua instância. Last-write-wins. Aceito.
- **Network failure**: catch silencioso (já era o comportamento antes); DJ não vê erro porque preferência não é dado crítico.

## Casos de erro

| Cenário | Comportamento |
|---|---|
| `persistMontarFilters` retorna erro | Log no console, sem alerta UI; estado client preserva mudança |
| `persistMontarFilters` timeout | Catch silencioso; próximo toggle reagenda |
| Browser fecha antes do flush | Persist perdido; aceito (DJ vê preferência antiga na próxima visita) |
| `setId` muda durante lifecycle (improvável — DJ navega) | Cleanup força flush do `setId` antigo; novo `setId` começa fresh |

## Estabilidade do contrato

- Comportamento de debounce 500ms + flush on unmount é considerado **estável** durante esta feature.
- Mudanças futuras (ex: ajuste do delay, throttle, merge de toggles) exigem atualização concomitante deste documento.
- Refs pattern não vaza (cleanup garante).

## Como testar

Validação manual via [quickstart.md](../quickstart.md):
- Cenário 2: toggle 5 chips em sequência rápida → verificar nos logs `[DB]` que houve ≤ 2 POSTs.
- Cenário 3: toggle 1 chip e aguardar 1s → verificar 1 POST disparado.
- Cenário 4: toggle 1 chip e navegar imediatamente para `/sets` → verificar 1 POST disparado (flush on unmount).
- Cenário 5: re-carregar `/sets/[id]/montar` após sequência → verificar que filtros persistidos refletem estado final.
