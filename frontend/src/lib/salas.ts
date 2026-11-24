import api from './api';

export interface Sala {
  id: string;
  nome: string;
}

export interface Reserva {
  id: string;
  salaId: string;
  usuarioNome: string;
  inicio: string;
  fim: string;
  finalidade: string;
  status: 'CONFIRMADA' | 'CANCELADA';
  canceladaEm: string | null;
  canceladaPorNome: string | null;
  createdAt: string;
  /** Preenchido nas ocorrências de uma reserva recorrente; null na reserva avulsa. */
  serieId: string | null;
  minha: boolean;
}

/** Data da série que não foi reservada, com o motivo (ocupada ou horário já passado). */
export interface DataPulada {
  dia: string;
  motivo: string;
}

export interface SerieCriada {
  serieId: string;
  criadas: Reserva[];
  puladas: DataPulada[];
}

/** Dias da semana na ordem do formulário; `valor` segue o padrão 0 = domingo … 6 = sábado. */
export const DIAS_DA_SEMANA = [
  { valor: 1, rotulo: 'Seg' },
  { valor: 2, rotulo: 'Ter' },
  { valor: 3, rotulo: 'Qua' },
  { valor: 4, rotulo: 'Qui' },
  { valor: 5, rotulo: 'Sex' },
  { valor: 6, rotulo: 'Sáb' },
  { valor: 0, rotulo: 'Dom' },
] as const;

export async function listarSalas(): Promise<Sala[]> {
  return (await api.get<Sala[]>('/salas')).data;
}

/** Reservas confirmadas do dia (`aaaa-mm-dd`), de todas as salas. */
export async function agendaDoDia(data: string): Promise<Reserva[]> {
  return (await api.get<Reserva[]>('/salas/reservas', { params: { data } })).data;
}

/** Reservas confirmadas de todo mundo que ainda não terminaram, em ordem de início. */
export async function proximasReservas(): Promise<Reserva[]> {
  return (await api.get<Reserva[]>('/salas/reservas/proximas')).data;
}

export async function minhasReservas(): Promise<Reserva[]> {
  return (await api.get<Reserva[]>('/salas/reservas/minhas')).data;
}

export async function reservarSala(dados: { salaId: string; inicio: string; fim: string; finalidade: string }): Promise<Reserva> {
  return (await api.post<Reserva>('/salas/reservas', dados)).data;
}

export async function alterarReserva(id: string, dados: { salaId: string; inicio: string; fim: string; finalidade: string }): Promise<Reserva> {
  return (await api.put<Reserva>(`/salas/reservas/${id}`, dados)).data;
}

export async function cancelarReserva(id: string): Promise<Reserva> {
  return (await api.post<Reserva>(`/salas/reservas/${id}/cancelar`)).data;
}

/**
 * Reserva recorrente (só ADMIN): mesmo horário nos dias da semana escolhidos, de
 * `dataInicio` a `dataFim` (`aaaa-mm-dd`, horas `HH:mm` de Brasília). Datas ocupadas
 * voltam em `puladas`; se nenhuma data ficar livre, a API responde 409 com a lista.
 */
export async function reservarSerie(dados: {
  salaId: string; dataInicio: string; dataFim: string; diasSemana: number[]; horaInicio: string; horaFim: string; finalidade: string;
}): Promise<SerieCriada> {
  return (await api.post<SerieCriada>('/salas/reservas/recorrente', dados)).data;
}

/** Apaga a reserva de vez (só ADMIN). Não fica histórico. */
export async function excluirReserva(id: string): Promise<void> {
  await api.delete(`/salas/reservas/${id}`);
}

/** Apaga de vez todas as reservas de uma série (só ADMIN). */
export async function excluirSerie(serieId: string): Promise<number> {
  return (await api.delete<{ apagadas: number }>(`/salas/series/${serieId}`)).data.apagadas;
}

/** Datas puladas que a API devolve junto do erro 409 da série. */
export function puladasDoErro(e: unknown): DataPulada[] {
  const p = (e as { response?: { data?: { puladas?: unknown } } })?.response?.data?.puladas;
  return Array.isArray(p) ? p as DataPulada[] : [];
}

/** Dia da semana (0 = domingo … 6 = sábado) de uma data `aaaa-mm-dd`. */
export function diaDaSemana(data: string): number {
  return new Date(`${data}T12:00:00`).getDay();
}

/** Hoje no relógio do navegador, como `aaaa-mm-dd` (valor de <input type="date">). */
export function hojeLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Separa um instante ISO em `aaaa-mm-dd` e `HH:mm` locais (valores dos campos do formulário). */
export function dataEHora(iso: string): { data: string; hora: string } {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return { data: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, hora: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

/** Junta data e hora dos campos do formulário num instante ISO (fuso do navegador). */
export function instante(data: string, hora: string): string | null {
  const d = new Date(`${data}T${hora}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

/** "10:00 às 11:00" */
export function faixaHoraria(r: { inicio: string; fim: string }): string {
  return `${fmtHora.format(new Date(r.inicio))} às ${fmtHora.format(new Date(r.fim))}`;
}

/** "seg., 10/03/2031" */
export function diaPorExtenso(iso: string): string {
  return fmtDia.format(new Date(iso));
}
