/**
 * Helpers de timezone. Convenção do projeto:
 * - Timestamps são ARMAZENADOS em UTC (Drizzle timestamp mode).
 * - Toda comparação com "agora" e toda exibição ao DJ ocorre em America/Sao_Paulo.
 */

export const APP_TZ = 'America/Sao_Paulo';

export type SetStatus = 'draft' | 'scheduled' | 'done';

/**
 * Retorna "agora" como Date (momento único; formatação em SP ocorre no consumidor).
 * Existe como função para facilitar mock em testes.
 */
export function nowInAppTz(): Date {
  return new Date();
}

/**
 * Deriva o status de um Set a partir de `eventDate` (FR-028).
 * - `draft` quando `eventDate` é nulo;
 * - `scheduled` quando `eventDate` > agora;
 * - `done` quando `eventDate` <= agora.
 *
 * A comparação usa instantes em UTC (Date.getTime), mas como o fuso é apenas
 * cosmético para formatação, a avaliação "passado vs futuro" é absoluta.
 */
export function deriveSetStatus(eventDate: Date | null | undefined, now: Date = nowInAppTz()): SetStatus {
  if (!eventDate) return 'draft';
  return eventDate.getTime() > now.getTime() ? 'scheduled' : 'done';
}

const displayFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: APP_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dateOnlyFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: APP_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Formata como `dd/MM/yyyy HH:mm` em America/Sao_Paulo. */
export function formatForDisplay(date: Date): string {
  return displayFormatter.format(date).replace(', ', ' ');
}

/** Formata apenas a data como `dd/MM/yyyy` em America/Sao_Paulo. */
export function formatDateOnly(date: Date): string {
  return dateOnlyFormatter.format(date);
}
