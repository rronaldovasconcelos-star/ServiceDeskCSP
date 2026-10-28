import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  /** @deprecated use 'secondary' */
  | 'onNavy';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'sm';
  icon?: ReactNode;
  children?: ReactNode;
  /**
   * Botão quadrado só com ícone (classe `btn-icon`).
   * Exige `aria-label`, porque não há texto visível.
   */
  iconOnly?: boolean;
  /** Em andamento: desabilita, marca `aria-busy` e mostra o spinner antes do texto. */
  loading?: boolean;
}

const classe: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  onNavy: 'btn-secondary',
};

/** Botão do portal. primary = azul de ação; secondary = contorno; ghost = texto; danger = vermelho. */
export default function Button({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  className = '',
  type = 'button',
  iconOnly,
  loading,
  disabled,
  ...rest
}: Props) {
  const classes = [
    'btn',
    classe[variant],
    size === 'sm' ? 'btn-sm' : '',
    iconOnly ? 'btn-icon' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}
