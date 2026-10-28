import { useEffect, useId, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { apiErrorMessage, downloadFile, fetchFileBlobUrl, formatBytes, type FileRecord } from '../lib/files';
import { Button } from './ui';

/**
 * Visualiza PDF (iframe) ou imagem (img) dentro do portal, sem baixar.
 * O conteúdo vem como blob autenticado (Bearer), por isso não usa a URL da API direto.
 * Painel próprio (90vh) sobre o `.modal-backdrop` do sistema: o `Modal` genérico
 * limita a largura a 520px e não serve para visualizar documento.
 */
export default function FilePreviewModal({ file, onClose }: { file: FileRecord; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const tituloId = useId();
  const fecharRef = useRef<HTMLButtonElement>(null);
  const anteriorRef = useRef<HTMLElement | null>(null);

  // Esc fecha, trava o scroll do fundo, foco inicial no "Fechar" e devolução do foco ao sair.
  useEffect(() => {
    anteriorRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    fecharRef.current?.focus();
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
      const voltar = anteriorRef.current;
      if (voltar && document.contains(voltar)) voltar.focus();
    };
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
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[90vh] w-[min(1100px,96vw)] flex-col overflow-hidden rounded-(--radius-lg) border border-(--line) bg-(--surface) shadow-(--shadow-lg)"
      >
        <div className="flex items-center gap-2.5 border-b border-(--line) px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id={tituloId} className="truncate text-sm font-semibold text-(--text)" title={file.originalName}>{file.originalName}</h2>
            <p className="text-xs text-(--text-2)">{file.owner.name} · {formatBytes(file.sizeBytes)}</p>
          </div>
          <Button variant="ghost" size="sm" iconOnly aria-label="Baixar" title="Baixar" onClick={() => downloadFile(file.id, file.originalName)} icon={<Download size={18} />} />
          {/* Botão nativo (não o `Button`) porque precisa de ref para o foco inicial. */}
          <button ref={fecharRef} type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Fechar" title="Fechar" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-(--navy)">
          {erro ? (
            <p role="alert" className="p-4 text-[13px] text-(--danger)">{erro}</p>
          ) : !url ? (
            <p role="status" className="p-4 text-[13px] text-(--on-navy-muted)">Carregando arquivo...</p>
          ) : ehImagem ? (
            <img src={url} alt={file.originalName} className="max-h-full max-w-full object-contain" />
          ) : (
            <iframe src={url} title={file.originalName} className="h-full w-full border-0" />
          )}
        </div>
      </div>
    </div>
  );
}
