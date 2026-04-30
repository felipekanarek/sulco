'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from 'react';
import { updateRecordAuthorFields } from '@/lib/actions';
import { MobileDrawer } from './mobile-drawer';

type ShelfPickerProps = {
  recordId: number;
  current: string | null;
  userShelves: string[];
  className?: string;
};

const TRIGGER_CLASS =
  'w-full font-mono text-sm bg-transparent border-0 border-b border-line pb-1 outline-none focus:border-accent text-left flex items-center justify-between min-h-[44px] md:min-h-[36px]';

const ITEM_CLASS_BASE =
  'px-3 py-2 min-h-[44px] md:min-h-[36px] flex items-center font-mono text-[13px] hover:bg-paper-raised cursor-pointer';

export function ShelfPicker({
  recordId,
  current,
  userShelves,
  className,
}: ShelfPickerProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // optimistic: undefined = "use props.current"; null = "limpou"; string = "novo valor"
  const [optimistic, setOptimistic] = useState<string | null | undefined>(
    undefined,
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  // Detecção de viewport mobile via matchMedia. Necessário porque
  // <MobileDrawer> renderiza via portal pra document.body — o
  // `md:hidden` do wrapper não alcança o portal e a lista vazaria
  // em desktop (bug visto pós-deploy 020). Default `false` em SSR.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Reset optimistic quando o RSC re-renderiza com novo prop `current`.
  useEffect(() => {
    setOptimistic(undefined);
  }, [current]);

  // Auto-dismiss do erro em 5s (Decisão 3 do research; mesma UX Inc 19).
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  // Foco no input ao abrir (desktop popover; mobile MobileDrawer já cuida do foco).
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    } else {
      setQuery('');
      setActiveIdx(-1);
    }
  }, [open]);

  const display: string | null = optimistic !== undefined ? optimistic : current;

  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();

  const filtered = useMemo(() => {
    if (!lowerQuery) return userShelves;
    return userShelves.filter((s) => s.toLowerCase().includes(lowerQuery));
  }, [userShelves, lowerQuery]);

  const exactMatch = filtered.some((s) => s === trimmedQuery);
  const showAddItem = trimmedQuery.length > 0 && !exactMatch;
  const isEmpty = userShelves.length === 0 && trimmedQuery.length === 0;

  // total de itens navegáveis: 1 (clear) + filtered + (showAddItem ? 1 : 0)
  const totalItems = 1 + filtered.length + (showAddItem ? 1 : 0);

  function selectShelf(value: string | null) {
    setError(null);
    setOptimistic(value);
    setOpen(false);
    setQuery('');
    setActiveIdx(-1);
    startTransition(async () => {
      try {
        const res = await updateRecordAuthorFields({
          recordId,
          shelfLocation: value,
        });
        if (!res.ok) {
          setOptimistic(undefined);
          setError(res.error || 'Falha ao salvar prateleira.');
        }
      } catch (err) {
        setOptimistic(undefined);
        setError(err instanceof Error ? err.message : 'Erro inesperado.');
      }
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? totalItems - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx === -1 && showAddItem) {
        // Enter sem nav explícita com termo digitado: cria
        selectShelf(trimmedQuery);
      } else if (activeIdx === 0) {
        selectShelf(null);
      } else if (activeIdx > 0 && activeIdx <= filtered.length) {
        selectShelf(filtered[activeIdx - 1]);
      } else if (activeIdx === totalItems - 1 && showAddItem) {
        selectShelf(trimmedQuery);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  // Compõe o id de cada item para `aria-activedescendant`.
  const itemId = (n: number) => `${listboxId}-opt-${n}`;
  const activeDescendant =
    activeIdx >= 0 ? itemId(activeIdx) : undefined;

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={listboxId}
      disabled={isPending}
      className={TRIGGER_CLASS}
    >
      <span className={display ? 'text-ink' : 'text-ink-mute'}>
        {display ?? 'ex: E3-P2'}
      </span>
      <span className="font-mono text-[10px] text-ink-mute" aria-hidden>
        ▾
      </span>
    </button>
  );

  const listPanel = (
    <div className="flex flex-col">
      <div className="px-3 pt-3 pb-2 border-b border-line">
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-activedescendant={activeDescendant}
          aria-autocomplete="list"
          placeholder="Buscar ou digitar nova…"
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 50))}
          onKeyDown={handleKeyDown}
          maxLength={50}
          className="w-full font-mono text-sm bg-transparent border-b border-line pb-1 outline-none focus:border-accent"
        />
      </div>

      <ul
        id={listboxId}
        role="listbox"
        aria-label="Prateleiras"
        className="flex-1 overflow-y-auto max-h-[60vh] md:max-h-[300px]"
      >
        {/* "— Sem prateleira —" sempre primeiro (idx 0) */}
        <li
          id={itemId(0)}
          role="option"
          aria-selected={display === null}
          onClick={() => selectShelf(null)}
          onMouseEnter={() => setActiveIdx(0)}
          className={`${ITEM_CLASS_BASE} text-ink-mute italic ${
            activeIdx === 0 ? 'bg-paper-raised' : ''
          }`}
        >
          — Sem prateleira —
        </li>

        {filtered.map((shelf, i) => {
          const idx = i + 1;
          const selected = display === shelf;
          return (
            <li
              key={shelf}
              id={itemId(idx)}
              role="option"
              aria-selected={selected}
              onClick={() => selectShelf(shelf)}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`${ITEM_CLASS_BASE} ${
                activeIdx === idx ? 'bg-paper-raised' : ''
              } ${selected ? 'text-accent' : 'text-ink'}`}
            >
              {shelf}
            </li>
          );
        })}

        {showAddItem ? (
          <li
            id={itemId(totalItems - 1)}
            role="option"
            aria-selected={false}
            onClick={() => selectShelf(trimmedQuery)}
            onMouseEnter={() => setActiveIdx(totalItems - 1)}
            className={`${ITEM_CLASS_BASE} text-ink-soft border-t border-line-soft ${
              activeIdx === totalItems - 1 ? 'bg-paper-raised' : ''
            }`}
          >
            + Adicionar &lsquo;{trimmedQuery}&rsquo; como nova prateleira
          </li>
        ) : null}

        {isEmpty ? (
          <li
            aria-hidden
            className="px-3 py-3 font-serif italic text-[12px] text-ink-mute"
          >
            Você ainda não tem prateleiras. Digite o nome da primeira.
          </li>
        ) : null}
      </ul>

      {error ? (
        <p
          role="alert"
          className="px-3 py-2 font-mono text-[11px] text-warn border-t border-line"
        >
          {error}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className={className}>
      {isMobile ? (
        // Mobile: bottom sheet via portal
        <>
          {trigger}
          <MobileDrawer
            open={open}
            onClose={() => setOpen(false)}
            side="bottom"
            ariaLabel="Selecionar prateleira"
          >
            {listPanel}
          </MobileDrawer>
        </>
      ) : (
        // Desktop: popover absoluto inline
        <div className="relative">
          {trigger}
          {open ? (
            <>
              {/* backdrop invisível para fechar ao clicar fora */}
              <div
                className="fixed inset-0 z-20"
                onClick={() => setOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-paper border border-line shadow-md max-w-[400px]">
                {listPanel}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
