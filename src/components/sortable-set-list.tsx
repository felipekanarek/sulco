'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { removeTrackFromSet, reorderSetTracks } from '@/lib/actions';
import { BombaInline } from './bomba-badge';

const RATING_GLYPH: Record<number, string> = { 1: '+', 2: '++', 3: '+++' };

export type SortableItem = {
  trackId: number;
  position: string;
  title: string;
  rating: number | null;
  artist: string;
  recordId: number;
  isBomb: boolean;
};

/**
 * Lista ordenável de faixas do set (FR-026). Usa @dnd-kit:
 *  - PointerSensor: mouse/touch drag
 *  - KeyboardSensor: setas ↑/↓ movem item focado (fallback a11y, FR-049)
 *
 * Update otimista local + persistência async; rollback em erro.
 * NÃO usa `startTransition` nem revalidatePath nas rotas atuais porque isso
 * causa re-render do Router durante o commit da lista (anti-pattern).
 */
export function SortableSetList({
  setId,
  tracks: initial,
}: {
  setId: number;
  tracks: SortableItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<SortableItem[]>(initial);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sincroniza com prop quando o set muda no servidor (revalidatePath
  // dispara re-render com lista atualizada; sem isto, useState(initial)
  // só pegaria a lista do primeiro render).
  // Compara por "fingerprint" (trackIds concatenados) para evitar loop
  // quando o array é uma nova referência mas o conteúdo é o mesmo.
  // Sincronização overwrite total: state local é descartado em favor
  // da verdade do servidor sempre que o servidor responder algo novo.
  const initialKey = initial.map((t) => t.trackId).join(',');
  const [lastServerKey, setLastServerKey] = useState(initialKey);
  if (initialKey !== lastServerKey) {
    setLastServerKey(initialKey);
    setItems(initial);
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((t) => String(t.trackId) === String(active.id));
    const newIndex = items.findIndex((t) => String(t.trackId) === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const prev = items;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    setError(null);
    setIsPending(true);

    try {
      const res = await reorderSetTracks({
        setId,
        trackIds: next.map((t) => t.trackId),
      });
      if (!res.ok) {
        setError(res.error);
        setItems(prev);
      }
    } catch (err) {
      console.error('[sortable] reorder falhou', err);
      setError('Não foi possível reordenar. Tente novamente.');
      setItems(prev);
    } finally {
      setIsPending(false);
    }
  }

  async function handleRemove(trackId: number) {
    const prev = items;
    setItems((list) => list.filter((t) => t.trackId !== trackId));
    setError(null);
    setIsPending(true);
    try {
      const res = await removeTrackFromSet({ setId, trackId });
      if (!res.ok) {
        setError(res.error);
        setItems(prev);
        return;
      }
      // Faz o RSC tree re-buscar — garante que a faixa removida volte
      // à lista de candidatos à esquerda (que é RSC).
      router.refresh();
    } catch (err) {
      console.error('[sortable] remove falhou', err);
      setError('Não foi possível remover. Tente novamente.');
      setItems(prev);
    } finally {
      setIsPending(false);
    }
  }

  if (items.length === 0) {
    return (
      <p className="font-serif italic text-ink-mute text-[14px] py-8 text-center">
        Adicione faixas dos candidatos ao lado →
      </p>
    );
  }

  return (
    <>
      {error ? (
        <p className="text-xs text-warn mb-2" role="alert">
          {error}
        </p>
      ) : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={items.map((t) => String(t.trackId))}
          strategy={verticalListSortingStrategy}
        >
          <ul
            role="listbox"
            aria-label="Faixas do set — arraste ou use setas para reordenar"
            className="max-h-[500px] overflow-y-auto"
          >
            {items.map((item, idx) => (
              <SortableRow
                key={item.trackId}
                item={item}
                index={idx}
                total={items.length}
                disabled={isPending}
                onRemove={() => handleRemove(item.trackId)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </>
  );
}

function SortableRow({
  item,
  index,
  total,
  disabled,
  onRemove,
}: {
  item: SortableItem;
  index: number;
  total: number;
  disabled: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(item.trackId),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      role="option"
      aria-selected={false}
      aria-posinset={index + 1}
      aria-setsize={total}
      className="grid grid-cols-[20px_36px_40px_1fr_auto] gap-3 py-3 border-b border-line-soft items-center"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Arrastar faixa ${item.title}. Use setas para reordenar.`}
        className="font-mono text-[12px] text-ink-mute hover:text-ink cursor-grab active:cursor-grabbing select-none touch-none"
        title="Arrastar ou setas ↑/↓"
      >
        ⋮⋮
      </button>
      <span className="font-mono text-[13px] text-accent font-medium">{item.position}</span>
      {item.rating ? (
        <span
          title={
            item.rating === 3
              ? 'muito boa para tocar'
              : item.rating === 2
                ? 'boa'
                : 'boa, mas nem tanto'
          }
          className="font-mono font-semibold text-accent text-center tracking-tight text-[13px]"
        >
          {RATING_GLYPH[item.rating]}
        </span>
      ) : (
        <span className="font-mono text-[11px] text-ink-mute text-center">—</span>
      )}
      <div className="min-w-0">
        <p className="font-serif italic text-[15px] leading-tight truncate">
          {item.title}
          {item.isBomb ? <span className="ml-1.5"><BombaInline /></span> : null}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-mute truncate">
          {item.artist}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remover do set"
        className="text-ink-mute hover:text-accent disabled:opacity-40"
      >
        ×
      </button>
    </li>
  );
}
