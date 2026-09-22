import api from './api';

export interface HoleriteResumo {
  id: string;
  competencia: string; // "2026-08"
  totalVencimentos: number; // centavos
  totalDescontos: number;
  liquido: number;
  dataGeracao: string | null;
  createdAt: string;
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** "2026-08" → "Agosto/2026" */
export function formatarCompetencia(c: string): string {
  const [ano, mes] = c.split('-');
  const nome = MESES[Number(mes) - 1];
  return nome ? `${nome}/${ano}` : c;
}

/** 545830 → "R$ 5.458,30" */
export function formatarCentavos(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return (v / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Baixa o PDF autenticado (o token vai no header, por isso não dá para usar um link direto). */
export async function baixarHoleritePdf(id: string, nomeSugerido: string): Promise<void> {
  const res = await api.get(`/holerites/${id}/pdf`, { responseType: 'blob' });
  const disposition: string = res.headers['content-disposition'] ?? '';
  const m = disposition.match(/filename="([^"]+)"/);
  const nome = m ? m[1] : nomeSugerido;
  const url = window.URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
