import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
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

const FOCAVEIS =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Lista os elementos focáveis dentro do painel, na ordem do DOM. */
function focaveis(painel: HTMLElement): HTMLElement[] {
  return Array.from(painel.querySelectorAll<HTMLElement>(FOCAVEIS));
}

/**
 * Modal único do portal: fecha com Esc e clicando fora; trava o scroll do fundo;
 * prende o foco dentro do painel (Tab/Shift+Tab) e devolve o foco ao abrir/fechar.
 * Marque um controle com `data-autofocus` para ele receber o foco inicial.
 */
export default function Modal({ open, title, onClose, children, footer, maxWidth }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const anteriorRef = useRef<HTMLElement | null>(null);

  // Esc + trava de scroll.
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

  // Foco inicial e devolução do foco ao fechar/desmontar.
  useEffect(() => {
    if (!open) return;
    anteriorRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const painel = panelRef.current;
    if (painel) {
      const auto = painel.querySelector<HTMLElement>('[data-autofocus]');
      const alvo = auto ?? focaveis(painel)[0] ?? painel;
      alvo.focus();
    }
    return () => {
      const voltar = anteriorRef.current;
      if (voltar && document.contains(voltar)) voltar.focus();
    };
  }, [open]);

  /** Mantém o Tab circulando entre o primeiro e o último focável do painel. */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const lista = focaveis(panelRef.current);
    if (lista.length === 0) { e.preventDefault(); return; }
    const primeiro = lista[0];
    const ultimo = lista[lista.length - 1];
    const ativo = document.activeElement;
    if (e.shiftKey && (ativo === primeiro || ativo === panelRef.current)) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && ativo === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={panelRef}
        className="modal-panel"
        style={maxWidth ? { maxWidth } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="modal-head">
          <h2 id={titleId} className="modal-title">{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
