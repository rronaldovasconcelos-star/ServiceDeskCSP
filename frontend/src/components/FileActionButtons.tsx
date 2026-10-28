import { useEffect, useRef, useState } from 'react';
import { Download, Eye, FilePenLine, Replace, Trash2 } from 'lucide-react';
import {
  apiErrorMessage, downloadFile, isPreviewable, markOpenedForEdit,
  officeAppFor, officeLabel, openOfficeSession, type FileRecord,
} from '../lib/files';

interface Props {
  f: FileRecord;
  canDelete: boolean;
  onDelete: (f: FileRecord) => void;
  canReplace?: boolean;
  onReplace?: (f: FileRecord) => void;
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
 * (docx/doc/xlsx/pptx…) · Baixar · Substituir · Excluir. Usado na tabela, nos cards e na árvore.
 * O "Editar no Google" saiu em 27/10/2026 (decisão do Ronaldo: o Google converte e
 * desconfigura os modelos da escola); o backend continua servindo a rota.
 */
export default function FileActionButtons({ f, canDelete, onDelete, canReplace, onReplace, canEditOffice, onPreview, size = 16 }: Props) {
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const office = officeAppFor(f.mimeType);

  function mostrar(set: (s: string) => void, msg: string, ms: number) {
    set(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setErro(''); setAviso(''); }, ms);
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

  const tituloOffice = office ? (busy ? 'Abrindo...' : `Abrir no ${officeLabel(office)} (salva direto no portal)`) : '';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
      {erro && (
        <span role="alert" aria-live="polite" style={{ fontSize: '12px', color: 'var(--coral)', marginRight: '6px', whiteSpace: 'normal', maxWidth: '260px', textAlign: 'left' }}>
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
          style={{ ...iconBtnStyle, color: 'var(--electric)', opacity: busy ? 0.5 : 1, cursor: busy ? 'default' : 'pointer' }}
          title={tituloOffice}
          aria-label={tituloOffice}
        >
          <FilePenLine size={size} />
        </button>
      )}
      <button onClick={() => downloadFile(f.id, f.originalName)} style={iconBtnStyle} title="Baixar" aria-label="Baixar"><Download size={size} /></button>
      {canReplace && onReplace && (
        <button onClick={() => onReplace(f)} style={iconBtnStyle} title="Substituir arquivo" aria-label="Substituir"><Replace size={size} /></button>
      )}
      {canDelete && (
        <button onClick={() => onDelete(f)} style={{ ...iconBtnStyle, color: 'var(--coral)' }} title="Excluir" aria-label="Excluir"><Trash2 size={size} /></button>
      )}
    </span>
  );
}
