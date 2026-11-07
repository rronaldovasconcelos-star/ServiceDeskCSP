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
  minha: boolean;
}

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
