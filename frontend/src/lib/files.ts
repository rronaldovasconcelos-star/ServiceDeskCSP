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
  ownerId: string;
  owner: { id: string; name: string; email: string };
}

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
