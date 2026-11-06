import api from './api';

export type EstadoAutorizacao = 'NAO_BAIXOU' | 'BAIXOU' | 'AGUARDANDO' | 'VALIDADO' | 'RECUSADO';

export interface EnvioAssinado {
  id: string;
  documentoId: string;
  usuarioId: string | null;
  usuarioNome: string;
  usuarioEmail: string;
  arquivoNome: string;
  sizeBytes: number;
  /** Data escrita dentro do PDF pela assinatura (informativa, não é prova). */
  dataDeclaradaPdf: string | null;
  status: 'AGUARDANDO' | 'VALIDADO' | 'RECUSADO';
  conferidoPorNome: string | null;
  conferidoEm: string | null;
  motivoRecusa: string | null;
  createdAt: string;
}

export interface DocumentoAutorizacao {
  id: string;
  titulo: string;
  descricao: string | null;
  arquivoNome: string;
  encerrado: boolean;
  createdAt: string;
}

export interface MinhaAutorizacao extends DocumentoAutorizacao {
  baixouEm: string | null;
  envio: EnvioAssinado | null;
  estado: EstadoAutorizacao;
}

export interface DocumentoGestao extends DocumentoAutorizacao {
  publicadoPorNome: string;
  aguardando: number;
  validados: number;
}

export interface ColaboradorPainel {
  usuarioId: string;
  nome: string;
  email: string;
  baixouEm: string | null;
  envio: EnvioAssinado | null;
  estado: EstadoAutorizacao;
}

export interface EventoAutorizacao {
  id: string;
  tipo: 'BAIXOU_MODELO' | 'ENVIOU_ASSINADO' | 'BAIXOU_ASSINADO' | 'VALIDOU' | 'RECUSOU';
  envioId: string | null;
  atorId: string | null;
  atorNome: string;
  createdAt: string;
}

export interface PainelAutorizacao {
  documento: DocumentoAutorizacao & { publicadoPorNome: string };
  colaboradores: ColaboradorPainel[];
  eventos: EventoAutorizacao[];
}

export const PDF_MAX_MB = 15;
/** Assinador do gov.br (assinatura eletrônica avançada, gratuita). */
export const URL_ASSINADOR = 'https://assinador.iti.br/';
/** Validador oficial de assinaturas (ITI). */
export const URL_VALIDADOR = 'https://validar.iti.gov.br/';

export const ESTADO_LABEL: Record<EstadoAutorizacao, string> = {
  NAO_BAIXOU: 'Não baixou',
  BAIXOU: 'Baixou, falta enviar',
  AGUARDANDO: 'Aguardando conferência',
  VALIDADO: 'Validado',
  RECUSADO: 'Recusado',
};

export const ESTADO_PILL: Record<EstadoAutorizacao, string> = {
  NAO_BAIXOU: 'pill-muted',
  BAIXOU: 'pill-amber',
  AGUARDANDO: 'pill-electric',
  VALIDADO: 'pill-teal',
  RECUSADO: 'pill-coral',
};

export const EVENTO_LABEL: Record<EventoAutorizacao['tipo'], string> = {
  BAIXOU_MODELO: 'baixou o modelo',
  ENVIOU_ASSINADO: 'enviou o arquivo assinado',
  BAIXOU_ASSINADO: 'abriu o arquivo assinado para conferir',
  VALIDOU: 'validou a assinatura',
  RECUSOU: 'recusou o arquivo',
};

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };

/** Baixa um PDF de rota autenticada (o token vai no header, então não dá para usar link direto). */
async function baixarPdf(rota: string, nome: string): Promise<void> {
  const res = await api.get(rota, { responseType: 'blob' });
  const url = window.URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// ─── Colaborador ───────────────────────────────────────────────────────────

export async function listarMinhas(): Promise<MinhaAutorizacao[]> {
  return (await api.get<MinhaAutorizacao[]>('/autorizacoes/minhas')).data;
}

export function baixarModelo(doc: DocumentoAutorizacao): Promise<void> {
  return baixarPdf(`/autorizacoes/${doc.id}/modelo`, doc.arquivoNome);
}

export async function enviarAssinado(docId: string, arquivo: File): Promise<EnvioAssinado> {
  const form = new FormData();
  form.append('arquivo', arquivo);
  return (await api.post<EnvioAssinado>(`/autorizacoes/${docId}/envio`, form, MULTIPART)).data;
}

export function baixarAssinado(envio: EnvioAssinado): Promise<void> {
  return baixarPdf(`/autorizacoes/envios/${envio.id}/arquivo`, envio.arquivoNome);
}

// ─── Gestão ────────────────────────────────────────────────────────────────

export async function listarGestao(): Promise<DocumentoGestao[]> {
  return (await api.get<DocumentoGestao[]>('/autorizacoes/gestao')).data;
}

export async function publicarModelo(titulo: string, descricao: string, arquivo: File): Promise<DocumentoGestao> {
  const form = new FormData();
  form.append('titulo', titulo);
  if (descricao.trim()) form.append('descricao', descricao);
  form.append('arquivo', arquivo);
  return (await api.post<DocumentoGestao>('/autorizacoes/gestao', form, MULTIPART)).data;
}

export async function carregarPainel(docId: string): Promise<PainelAutorizacao> {
  return (await api.get<PainelAutorizacao>(`/autorizacoes/gestao/${docId}`)).data;
}

export async function definirEncerrado(docId: string, encerrado: boolean): Promise<void> {
  await api.post(`/autorizacoes/gestao/${docId}/encerrar`, { encerrado });
}

export async function validarEnvio(envioId: string): Promise<void> {
  await api.post(`/autorizacoes/gestao/envios/${envioId}/validar`);
}

export async function recusarEnvio(envioId: string, motivo: string): Promise<void> {
  await api.post(`/autorizacoes/gestao/envios/${envioId}/recusar`, { motivo });
}
