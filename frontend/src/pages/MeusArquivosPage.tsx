import { useEffect, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import api from '../lib/api';
import FileUploader from '../components/FileUploader';
import { formatBytes, downloadFile, type FileRecord } from '../lib/files';

const selectStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '6px 12px',
  fontSize: '13px',
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  outline: 'none',
};

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
};

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '4px',
  color: 'var(--text-secondary)',
  display: 'inline-flex',
  alignItems: 'center',
};

/** Tipo curto a partir do mimetype para exibição. */
function shortType(mime: string): string {
  if (mime === 'application/pdf') return 'PDF';
  if (mime.includes('word')) return 'Word';
  if (mime.includes('sheet') || mime.includes('excel')) return 'Excel';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'PPT';
  if (mime.startsWith('video/')) return 'Vídeo';
  if (mime.startsWith('image/')) return 'Imagem';
  if (mime.includes('zip')) return 'ZIP';
  return mime.split('/')[1]?.toUpperCase() ?? 'Arquivo';
}

export default function MeusArquivosPage() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState('');

  function load() {
    setLoading(true);
    const params: Record<string, string> = {};
    if (q) params.q = q;
    if (folder) params.folder = folder;
    api.get('/files', { params })
      .then((r) => setFiles(r.data))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0); // pequeno debounce na busca
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, folder]);

  // Categorias presentes nos arquivos (para o filtro)
  const folders = Array.from(
    new Set(files.map((f) => f.folder).filter((x): x is string => !!x)),
  ).sort();

  async function handleDelete(f: FileRecord) {
    if (!confirm(`Excluir "${f.originalName}"? Esta ação não pode ser desfeita.`)) return;
    await api.delete(`/files/${f.id}`);
    load();
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>
        Meus Arquivos
      </h2>

      <FileUploader onUploaded={load} />

      {/* Filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome..."
          style={{ ...selectStyle, minWidth: '200px' }}
        />
        <select value={folder} onChange={(e) => setFolder(e.target.value)} style={selectStyle}>
          <option value="">Todas as categorias</option>
          {folders.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Carregando...</p>
      ) : files.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Nenhum arquivo encontrado.</p>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden md:block" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-card-hover)', borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Nome</th>
                  <th style={thStyle}>Categoria</th>
                  <th style={thStyle}>Tipo</th>
                  <th style={thStyle}>Tamanho</th>
                  <th style={thStyle}>Data</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f, i) => (
                  <tr key={f.id} className="table-row" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontWeight: 500 }}>{f.originalName}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{f.folder ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{shortType(f.mimeType)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{formatBytes(f.sizeBytes)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{new Date(f.uploadedAt).toLocaleDateString('pt-BR')}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => downloadFile(f.id, f.originalName)} style={iconBtnStyle} title="Baixar" aria-label="Baixar"><Download size={16} /></button>
                      <button onClick={() => handleDelete(f)} style={{ ...iconBtnStyle, color: '#ef4444' }} title="Excluir" aria-label="Excluir"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {files.map((f) => (
              <div key={f.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px', wordBreak: 'break-word' }}>{f.originalName}</span>
                  <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                    <button onClick={() => downloadFile(f.id, f.originalName)} style={iconBtnStyle} title="Baixar" aria-label="Baixar"><Download size={16} /></button>
                    <button onClick={() => handleDelete(f)} style={{ ...iconBtnStyle, color: '#ef4444' }} title="Excluir" aria-label="Excluir"><Trash2 size={16} /></button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {f.folder && <span style={{ background: 'var(--bg-card-hover)', padding: '2px 8px', borderRadius: '20px' }}>{f.folder}</span>}
                  <span style={{ background: 'var(--bg-card-hover)', padding: '2px 8px', borderRadius: '20px' }}>{shortType(f.mimeType)}</span>
                  <span style={{ background: 'var(--bg-card-hover)', padding: '2px 8px', borderRadius: '20px' }}>{formatBytes(f.sizeBytes)}</span>
                  <span style={{ marginLeft: 'auto' }}>{new Date(f.uploadedAt).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
