/**
 * Formatação de datas em pt-BR para as telas.
 */

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

function dataCurta(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

/**
 * "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias"; acima de 7 dias, `dd/mm/aaaa`.
 */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = now.getTime() - d.getTime();
  if (diff < MIN) return 'agora';
  if (diff < HORA) return `há ${Math.floor(diff / MIN)} min`;
  if (diff < DIA) return `há ${Math.floor(diff / HORA)} h`;
  const dias = Math.floor(diff / DIA);
  if (dias === 1) return 'ontem';
  if (dias <= 7) return `há ${dias} dias`;
  return dataCurta(d);
}

/** `dd/mm/aaaa HH:mm` em pt-BR. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d).replace(',', '');
}
