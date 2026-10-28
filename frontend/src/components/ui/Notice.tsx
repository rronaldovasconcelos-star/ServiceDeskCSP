import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type Kind = 'success' | 'warning' | 'danger' | 'info';

interface Props {
  kind: Kind;
  title?: ReactNode;
  children: ReactNode;
  /** Botões ou links abaixo do texto. */
  actions?: ReactNode;
  /** Se informado, mostra o botão de fechar. */
  onClose?: () => void;
  /** Padrão: `alert` para danger, `status` para os demais. */
  role?: 'alert' | 'status';
  className?: string;
}

const icone: Record<Kind, ReactNode> = {
  success: <CheckCircle2 size={18} aria-hidden="true" />,
  warning: <AlertTriangle size={18} aria-hidden="true" />,
  danger: <AlertCircle size={18} aria-hidden="true" />,
  info: <Info size={18} aria-hidden="true" />,
};

/** Aviso em faixa suave com ícone por tipo. Nunca só cor: sempre ícone e texto. */
export default function Notice({ kind, title, children, actions, onClose, role, className = '' }: Props) {
  return (
    <div className={`notice notice-${kind} ${className}`.trim()} role={role ?? (kind === 'danger' ? 'alert' : 'status')}>
      {icone[kind]}
      <div className="notice-body">
        {title && <p className="notice-title">{title}</p>}
        {children}
        {actions && <div className="notice-actions">{actions}</div>}
      </div>
      {onClose && (
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Fechar aviso">
          <X size={16} />
        </button>
      )}
    </div>
  );
}
