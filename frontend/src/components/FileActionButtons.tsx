import { useEffect, useRef, useState } from 'react';
import { Download, Eye, FilePenLine, PenLine, Replace, Trash2 } from 'lucide-react';
import {
  apiErrorMessage, avisoConversaoGoogle, downloadFile, editorKindFor, editorLabel, isLegacyOffice, isPreviewable, markOpenedForEdit,
  officeAppFor, officeLabel, openEditSession, openOfficeSession, type FileRecord,
} from '../lib/files';

interface Props {
  f: FileRecord;
  canDelete: boolean;
  onDelete: (f: FileRecord) => void;
  canReplace?: boolean;
  onReplace?: (f: FileRecord) => void;
  /** dono ou ADMIN/GESTOR, e o storage permite edição on-line (Google Drive). */
  canEditOnline: boolean;
  /** dono ou ADMIN/GESTOR: abre no Word/Excel/PowerPoint instalado, salvando direto no portal. */
  canEditOffice?: boolean;
  onPreview: (f: FileRecord) => void;
  size?: number;
}

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px',
  color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center',
};

/**
 * Ações de uma linha de arquivo: Abrir (PDF/imagem) · Abrir no Word/Excel/PowerPoint
 * (docx/doc/xlsx/pptx…) · Editar no Google · Baixar · Substituir · Excluir.
 * Usado na tabela, nos cards e na árvore.
 */
export default function FileActionButtons({ f, canDelete, onDelete, canReplace, onReplace, canEditOnline, canEditOffice, onPreview, size = 16 }: Props) {
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const editor = editorKindFor(f.mimeType);
  const office = officeAppFor(f.mimeType);

  function mostrar(set: (s: string) => void, msg: string, ms: number) {
    set(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setErro(''); setAviso(''); }, ms);
  }

  async function editar() {
    if (busy) return;
    // Formato antigo: o Google converte e desconfigura. Pergunta ANTES de abrir a aba.
    if (isLegacyOffice(f.mimeType) && !window.confirm(avisoConversaoGoogle(f.originalName))) return;
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
      mostrar(setErro, apiErrorMessage(e, 'Não foi possível abrir o editor. Tente novamente.'), 6000);
    } finally {
      setBusy(false);
    }
  }

  async function abrirNoOffice() {
    if (busy) return;
    setBusy(true);
    try {
      const { url, app } = await openOfficeSession(f.id);
      markOpenedForEdit(f.id);
      // Esquema ms-word:/ms-excel:/ms-powerpoint: o navegador pergunta "Abrir o Word?"
      // e a página continua onde está. Sem o Office instalado, nada acontece — daí o aviso.
      window.location.assign(url);
      mostrar(setAviso, `Abrindo no ${officeLabel(app)}… Se nada acontecer, o ${officeLabel(app)} não está instalado neste computador. Salve no ${officeLabel(app)} e o portal atualiza sozinho.`, 9000);
    } catch (e: unknown) {
      mostrar(setErro, apiErrorMessage(e, 'Não foi possível abrir no Office. Tente novamente.'), 6000);
    } finally {
      setBusy(false);
    }
  }

  const tituloEditar = editor ? (busy ? 'Abrindo...' : `Editar no ${editorLabel(editor)}`) : '';
  const tituloOffice = office ? (busy ? 'Abrindo...' : `Abrir no ${officeLabel(office)} (salva direto no portal)`) : '';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
      {erro && (
        <span role="alert" aria-live="polite" style={{ fontSize: '12px', color: '#ef4444', marginRight: '6px', whiteSpace: 'normal', maxWidth: '260px', textAlign: 'left' }}>
          {erro}
        </span>
      )}
      {aviso && !erro && (
        <span role="status" aria-live="polite" style={{ fontSize: '12px', color: 'var(--text-secondary)', marginRight: '6px', whiteSpace: 'normal', maxWidth: '260px', textAlign: 'left' }}>
          {aviso}
        </span>
      )}
      {isPreviewable(f.mimeType) && (
        <button onClick={() => onPreview(f)} style={iconBtnStyle} title="Abrir" aria-label="Abrir"><Eye size={size} /></button>
      )}
      {canEditOffice && office && (
        <button
          onClick={abrirNoOffice}
          disabled={busy}
          style={{ ...iconBtnStyle, color: 'var(--accent)', opacity: busy ? 0.5 : 1, cursor: busy ? 'default' : 'pointer' }}
          title={tituloOffice}
          aria-label={tituloOffice}
        >
          <FilePenLine size={size} />
        </button>
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
