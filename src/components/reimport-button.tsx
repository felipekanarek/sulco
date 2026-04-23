'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { reimportRecord } from '@/lib/actions';

/**
 * Botão "Reimportar este disco" (FR-034, FR-034a).
 * - Click dispara `reimportRecord` Server Action.
 * - Se retornar erro com "Aguarde Xs" (cooldown server-side),
 *   extrai os segundos da mensagem e desabilita o botão por esse período
 *   localmente, com texto "Aguarde ~Xs" estático (sem countdown animado;
 *   FR-034a Option B).
 * - Em sucesso, chama `router.refresh()` para a página atualizar metadados.
 */
export function ReimportButton({
  recordId,
  variant = 'default',
}: {
  recordId: number;
  variant?: 'default' | 'compact' | 'placeholder';
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<'ok' | 'warn' | null>(null);

  // Tick pra re-enable quando cooldown expira (sem countdown visível, apenas
  // liberação do botão ao fim).
  useEffect(() => {
    if (cooldownUntil === null) return;
    const delta = cooldownUntil - Date.now();
    if (delta <= 0) {
      setCooldownUntil(null);
      return;
    }
    const id = setTimeout(() => setCooldownUntil(null), delta + 100);
    return () => clearTimeout(id);
  }, [cooldownUntil]);

  const inCooldown = cooldownUntil !== null && cooldownUntil > Date.now();
  const disabled = isPending || inCooldown;

  async function onClick() {
    if (disabled) return;
    setIsPending(true);
    setMessage(null);
    setMessageKind(null);
    try {
      const res = await reimportRecord({ recordId });
      if (res.ok) {
        // Inicia cooldown local de 60s (FR-034a) e mostra msg de sucesso
        setCooldownUntil(Date.now() + 60_000);
        setMessage('Metadados atualizados.');
        setMessageKind('ok');
        router.refresh();
        return;
      }
      // Erro. Se for rate_limited com X segundos, extrai e aplica cooldown.
      const match = res.error.match(/Aguarde\s*(\d+)\s*s/i);
      if (match) {
        const secs = Number(match[1]);
        if (Number.isFinite(secs) && secs > 0) {
          setCooldownUntil(Date.now() + secs * 1000);
        }
      }
      setMessage(res.error);
      setMessageKind('warn');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro inesperado.');
      setMessageKind('warn');
    } finally {
      setIsPending(false);
    }
  }

  const label = isPending
    ? 'Reimportando...'
    : inCooldown
      ? 'Aguarde ~60s'
      : 'Reimportar este disco';

  // Variantes visuais
  const base =
    'font-mono text-[11px] uppercase tracking-[0.12em] rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variantCls =
    variant === 'default'
      ? `${base} px-4 py-2 border border-ink text-ink hover:bg-ink hover:text-paper`
      : variant === 'compact'
        ? `${base} px-3 py-1.5 border border-line text-ink-soft hover:border-ink hover:text-ink`
        : // placeholder: botão com contraste alto sobre overlay cinza
          `${base} px-3 py-1.5 border border-accent text-accent hover:bg-accent hover:text-paper bg-paper/90`;

  return (
    <div className="inline-flex flex-col items-stretch gap-1">
      <button type="button" onClick={onClick} disabled={disabled} className={variantCls}>
        {label}
      </button>
      {message ? (
        <p
          role={messageKind === 'warn' ? 'alert' : 'status'}
          className={`label-tech ${messageKind === 'warn' ? 'text-warn' : 'text-ok'}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
