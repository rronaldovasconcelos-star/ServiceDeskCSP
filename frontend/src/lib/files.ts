import api from './api';

/** Formata bytes em unidade legível (KB, MB, GB). */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Baixa o arquivo como blob (necessário porque a auth usa Bearer token em
 * sessionStorage — um <a href> direto não enviaria a credencial). O interceptor
 * do axios injeta o header; o object URL temporário salva com o nome original.
 */
export async function downloadFile(id: string, name: string): Promise<void> {
  const res = await api.get(`/files/${id}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Baixa vários arquivos de uma vez como um único .zip (gerado no backend, com a
 * árvore acadêmica espelhada internamente). Mesmo padrão de blob do downloadFile.
 */
export async function downloadZip(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const res = await api.post('/files/download-zip', { ids }, { responseType: 'blob' });
  const stamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `arquivos-csp-${stamp}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface FileRecord {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  folder: string | null;
  anoLetivo: string | null;
  segmento: string | null;
  serie: string | null;
  etapa: string | null;
  disciplina: string | null;
  tipoMaterial: string | null;
  uploadedAt: string;
  lastEditedAt: string | null;
  lastEditedByName: string | null;
  ownerId: string;
  owner: { id: string; name: string; email: string };
}

// ─── Edição on-line (Google Docs/Planilhas/Apresentações no Drive) ──────────────

export type EditorKind = 'docs' | 'sheets' | 'slides';

/** Mime → produto Google (mesma tabela do backend). null = não editável on-line. */
export function editorKindFor(mime: string): EditorKind | null {
  const m = (mime ?? '').toLowerCase();
  if (m === 'application/msword' || m.includes('wordprocessingml')) return 'docs';
  if (m === 'application/vnd.ms-excel' || m.includes('spreadsheetml')) return 'sheets';
  if (m === 'application/vnd.ms-powerpoint' || m.includes('presentationml')) return 'slides';
  return null;
}

export function editorLabel(kind: EditorKind): string {
  return kind === 'docs' ? 'Google Documentos' : kind === 'sheets' ? 'Google Planilhas' : 'Google Apresentações';
}

/**
 * Formato antigo do Office (.doc/.xls/.ppt): o Google não edita no lugar, CONVERTE
 * para .docx/.xlsx/.pptx e perde WordArt, caixas de texto e cabeçalhos. Avisar antes.
 */
export function isLegacyOffice(mime: string): boolean {
  const m = (mime ?? '').toLowerCase();
  return m === 'application/msword' || m === 'application/vnd.ms-excel' || m === 'application/vnd.ms-powerpoint';
}

/** Aviso antes de mandar um .doc/.xls/.ppt para o Google, que converte e desconfigura. */
export function avisoConversaoGoogle(nome: string): string {
  const ext = nome.includes('.') ? nome.slice(nome.lastIndexOf('.')).toLowerCase() : '';
  const novo = ext === '.doc' ? '.docx' : ext === '.xls' ? '.xlsx' : ext === '.ppt' ? '.pptx' : 'formato novo';
  return `"${nome}" está no formato antigo do Office (${ext || 'antigo'}). ` +
    `O Google vai convertê-lo para ${novo} e pode perder formatação: WordArt, caixas de texto, cabeçalhos e imagens posicionadas.\n\n` +
    `Para manter o visual, use o botão "Abrir no Word" (edita e salva direto no portal).\n\n` +
    `Abrir no Google mesmo assim?`;
}

// ─── Office instalado (Word/Excel/PowerPoint) pelo WebDAV do portal ─────────────

export type OfficeApp = 'word' | 'excel' | 'powerpoint';

/** Mime → programa do Office (mesma tabela do backend). null = não é documento Office. */
export function officeAppFor(mime: string): OfficeApp | null {
  const k = editorKindFor(mime);
  return k === 'docs' ? 'word' : k === 'sheets' ? 'excel' : k === 'slides' ? 'powerpoint' : null;
}

export function officeLabel(app: OfficeApp): string {
  return app === 'word' ? 'Word' : app === 'excel' ? 'Excel' : 'PowerPoint';
}

/** Emite o link ms-word:ofe|u|... que abre o arquivo no Office instalado, salvando direto no portal. */
export async function openOfficeSession(id: string): Promise<{ url: string; app: OfficeApp }> {
  const res = await api.post(`/files/${id}/edit-local`);
  return res.data as { url: string; app: OfficeApp };
}

/** PDF e imagens abrem num visualizador dentro do portal. */
export function isPreviewable(mime: string): boolean {
  const m = (mime ?? '').toLowerCase();
  return m === 'application/pdf' || m.startsWith('image/');
}

export interface FileCapabilities { editInDrive: boolean; editInOffice: boolean }
export const SEM_CAPACIDADES: FileCapabilities = { editInDrive: false, editInOffice: false };

export async function fetchCapabilities(): Promise<FileCapabilities> {
  const res = await api.get('/files/capabilities');
  const d = res.data as Partial<FileCapabilities>;
  return { editInDrive: !!d.editInDrive, editInOffice: !!d.editInOffice };
}

/** Libera a edição para o usuário logado e devolve o link do editor do Google. */
export async function openEditSession(id: string): Promise<{ url: string; editor: EditorKind; converts: boolean }> {
  const res = await api.post(`/files/${id}/edit-session`);
  return res.data as { url: string; editor: EditorKind; converts: boolean };
}

/** Confere no Drive se o arquivo mudou; devolve o registro atualizado. */
export async function syncFile(id: string): Promise<{ changed: boolean; file: FileRecord }> {
  const res = await api.post(`/files/${id}/sync`);
  return res.data as { changed: boolean; file: FileRecord };
}

/**
 * Baixa o arquivo e devolve um object URL para visualização (iframe/img).
 * O tipo é forçado no Blob: sem ele o iframe de PDF não renderiza em alguns navegadores.
 * Quem chama deve revogar a URL com URL.revokeObjectURL.
 */
export async function fetchFileBlobUrl(id: string, mime: string): Promise<string> {
  const res = await api.get(`/files/${id}/download`, { responseType: 'blob' });
  return URL.createObjectURL(new Blob([res.data], { type: mime }));
}

// Arquivos abertos para edição nesta sessão da página: ao voltar o foco, sincroniza.
const abertosParaEdicao = new Set<string>();
export function markOpenedForEdit(id: string): void { abertosParaEdicao.add(id); }
export function openedForEdit(): string[] { return [...abertosParaEdicao]; }

/**
 * Substitui o conteúdo de um arquivo já existente (ADMIN/GESTOR). Mantém a
 * classificação e a posição na lista; só troca o conteúdo no storage. O backend
 * registra a alteração no log. Retorna o registro atualizado.
 */
export async function replaceFile(id: string, file: File): Promise<FileRecord> {
  const form = new FormData();
  form.append('file', file);
  const res = await api.post(`/files/${id}/replace`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data as FileRecord;
}

export interface FileChangeLogRecord {
  id: string;
  fileId: string | null;
  fileName: string;
  action: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  oldSize: number | null;
  newSize: number | null;
  oldMime: string | null;
  newMime: string | null;
  createdAt: string;
}

/** Busca o log de alterações de arquivos (ADMIN/GESTOR). */
export async function fetchFileLogs(params?: { fileId?: string; limit?: number }): Promise<FileChangeLogRecord[]> {
  const res = await api.get('/files/logs', { params });
  return res.data as FileChangeLogRecord[];
}

/** Texto da ação do log, em português. */
export function actionLabel(l: FileChangeLogRecord): string {
  if (l.action === 'EDIT') return 'Aberto para edição no Google por';
  if (l.action === 'MODIFIED') return 'Modificado no Google Drive por';
  if (l.action === 'EDIT_OFFICE') return 'Aberto no Word/Excel/PowerPoint por';
  if (l.action === 'SAVED_OFFICE') return 'Salvo pelo Word/Excel/PowerPoint por';
  return 'Substituído por';
}

/** Mensagem de erro vinda da API (campo `error`), ou o texto padrão. */
export function apiErrorMessage(e: unknown, padrao: string): string {
  const msg = (e as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === 'string' && msg ? msg : padrao;
}
