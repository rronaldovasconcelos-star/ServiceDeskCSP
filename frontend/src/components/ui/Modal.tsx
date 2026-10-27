import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Botões do rodapé (pílulas). */
  footer?: ReactNode;
  maxWidth?: number;
}

/** Modal único do portal: fecha com Esc e clicando fora; trava o scroll do fundo. */
export default function Modal({ open, title, onClose, children, footer, maxWidth }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = anterior;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-panel"
        style={maxWidth ? { maxWidth } : undefined}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fechar" style={{ padding: '6px' }}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
