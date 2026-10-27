import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { apiErrorMessage, downloadFile, fetchFileBlobUrl, formatBytes, type FileRecord } from '../lib/files';

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px',
  color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center',
};

/**
 * Visualiza PDF (iframe) ou imagem (img) dentro do portal, sem baixar.
 * O conteúdo vem como blob autenticado (Bearer), por isso não usa a URL da API direto.
 */
export default function FilePreviewModal({ file, onClose }: { file: FileRecord; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  useEffect(() => {
    let ativo = true;
    let blobUrl: string | null = null;
    fetchFileBlobUrl(file.id, file.mimeType)
      .then((u) => { blobUrl = u; if (ativo) setUrl(u); else URL.revokeObjectURL(u); })
      .catch((e: unknown) => { if (ativo) setErro(apiErrorMessage(e, 'Não foi possível carregar o arquivo.')); });
    return () => { ativo = false; if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [file.id, file.mimeType]);

  const ehImagem = file.mimeType.toLowerCase().startsWith('image/');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)' }} />
      <div style={{ position: 'relative', width: 'min(1100px, 96vw)', height: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.originalName}>{file.originalName}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{file.owner.name} · {formatBytes(file.sizeBytes)}</div>
          </div>
          <button onClick={() => downloadFile(file.id, file.originalName)} style={iconBtnStyle} title="Baixar" aria-label="Baixar"><Download size={18} /></button>
          <button onClick={onClose} style={iconBtnStyle} title="Fechar" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0, background: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {erro ? (
            <p style={{ fontSize: '13px', color: '#ef4444', padding: '16px' }}>{erro}</p>
          ) : !url ? (
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '16px' }}>Carregando arquivo...</p>
          ) : ehImagem ? (
            <img src={url} alt={file.originalName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          ) : (
            <iframe src={url} title={file.originalName} style={{ width: '100%', height: '100%', border: 0 }} />
          )}
        </div>
      </div>
    </div>
  );
}
