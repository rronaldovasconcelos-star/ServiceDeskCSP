import { useEffect, useRef, useState } from 'react';
import { Download, Eye, PenLine, Replace, Trash2 } from 'lucide-react';
import {
  apiErrorMessage, downloadFile, editorKindFor, editorLabel, isPreviewable, markOpenedForEdit, openEditSession, type FileRecord,
} from '../lib/files';

interface Props {
  f: FileRecord;
  canDelete: boolean;
  onDelete: (f: FileRecord) => void;
  canReplace?: boolean;
  onReplace?: (f: FileRecord) => void;
  /** dono ou ADMIN/GESTOR, e o storage permite edição on-line (Google Drive). */
  canEditOnline: boolean;
  onPreview: (f: FileRecord) => void;
  size?: number;
}

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px',
  color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center',
};

/**
 * Ações de uma linha de arquivo: Abrir (PDF/imagem) · Editar no Google (docx/xlsx/pptx)
 * · Baixar · Substituir · Excluir. Usado na tabela, nos cards e na árvore.
 */
export default function FileActionButtons({ f, canDelete, onDelete, canReplace, onReplace, canEditOnline, onPreview, size = 16 }: Props) {
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const editor = editorKindFor(f.mimeType);

  function mostrarErro(msg: string) {
    setErro(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setErro(''), 6000);
  }

  async function editar() {
    if (busy) return;
    // A aba precisa ser aberta de forma síncrona no clique, senão o bloqueador
    // de pop-up barra; o endereço entra depois que o backend responde.
    const win = window.open('', '_blank');
    setBusy(true);
    try {
      const { url } = await openEditSession(f.id);
      if (win) win.location.href = url; else window.open(url, '_blank');
      markOpenedForEdit(f.id);
    } catch (e: unknown) {
      win?.close();
      mostrarErro(apiErrorMessage(e, 'Não foi possível abrir o editor. Tente novamente.'));
    } finally {
      setBusy(false);
    }
  }

  const tituloEditar = editor ? (busy ? 'Abrindo...' : `Editar no ${editorLabel(editor)}`) : '';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
      {erro && (
        <span role="alert" aria-live="polite" style={{ fontSize: '12px', color: '#ef4444', marginRight: '6px', whiteSpace: 'normal', maxWidth: '260px', textAlign: 'left' }}>
          {erro}
        </span>
      )}
      {isPreviewable(f.mimeType) && (
        <button onClick={() => onPreview(f)} style={iconBtnStyle} title="Abrir" aria-label="Abrir"><Eye size={size} /></button>
      )}
      {canEditOnline && editor && (
        <button
          onClick={editar}
          disabled={busy}
          style={{ ...iconBtnStyle, color: 'var(--accent)', opacity: busy ? 0.5 : 1, cursor: busy ? 'default' : 'pointer' }}
          title={tituloEditar}
          aria-label={tituloEditar}
        >
          <PenLine size={size} />
        </button>
      )}
      <button onClick={() => downloadFile(f.id, f.originalName)} style={iconBtnStyle} title="Baixar" aria-label="Baixar"><Download size={size} /></button>
      {canReplace && onReplace && (
        <button onClick={() => onReplace(f)} style={iconBtnStyle} title="Substituir arquivo" aria-label="Substituir"><Replace size={size} /></button>
      )}
      {canDelete && (
        <button onClick={() => onDelete(f)} style={{ ...iconBtnStyle, color: '#ef4444' }} title="Excluir" aria-label="Excluir"><Trash2 size={size} /></button>
      )}
    </span>
  );
}
