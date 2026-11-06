import api from './api';

export interface Beneficio {
  id: string;
  nome: string;
  descricao: string;
  link: string | null;
  ativo: boolean;
  ordem: number;
  temLogo: boolean;
  criadoPorNome: string;
  createdAt: string;
  updatedAt: string;
}

export interface BeneficioForm {
  nome: string;
  descricao: string;
  link: string;
  ordem: string;
  logo: File | null;
  removerLogo: boolean;
}

export const LOGO_MAX_MB = 1;
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp';

export async function listarBeneficios(): Promise<Beneficio[]> {
  return (await api.get<Beneficio[]>('/beneficios')).data;
}

/**
 * Baixa o logo (rota autenticada) e devolve um object URL para o <img>.
 * `versao` muda quando o benefício é editado, para não reaproveitar o logo antigo.
 * Quem chama deve revogar a URL com URL.revokeObjectURL.
 */
export async function fetchLogoUrl(id: string, versao: string): Promise<string> {
  const res = await api.get(`/beneficios/${id}/logo`, { responseType: 'blob', params: { v: versao } });
  return URL.createObjectURL(res.data as Blob);
}

function montarForm(f: BeneficioForm): FormData {
  const form = new FormData();
  form.append('nome', f.nome);
  form.append('descricao', f.descricao);
  form.append('link', f.link);
  form.append('ordem', f.ordem || '0');
  if (f.logo) form.append('logo', f.logo);
  else if (f.removerLogo) form.append('removerLogo', 'true');
  return form;
}

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };

export async function criarBeneficio(f: BeneficioForm): Promise<Beneficio> {
  return (await api.post<Beneficio>('/beneficios', montarForm(f), MULTIPART)).data;
}

export async function editarBeneficio(id: string, f: BeneficioForm): Promise<Beneficio> {
  return (await api.put<Beneficio>(`/beneficios/${id}`, montarForm(f), MULTIPART)).data;
}

export async function definirAtivo(id: string, ativo: boolean): Promise<Beneficio> {
  const form = new FormData();
  form.append('ativo', String(ativo));
  return (await api.put<Beneficio>(`/beneficios/${id}`, form, MULTIPART)).data;
}

export async function excluirBeneficio(id: string): Promise<void> {
  await api.delete(`/beneficios/${id}`);
}

/** Mensagem da API: o erro direto, ou o primeiro detalhe de validação, ou o texto padrão. */
export function mensagemDeErro(e: unknown, padrao: string): string {
  const data = (e as { response?: { data?: { error?: unknown; details?: Record<string, string[] | undefined> } } })?.response?.data;
  const detalhe = data?.details ? Object.values(data.details).flat().find((m) => typeof m === 'string' && m) : undefined;
  if (detalhe) return detalhe;
  return typeof data?.error === 'string' && data.error ? data.error : padrao;
}
