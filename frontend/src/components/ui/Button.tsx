import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'onNavy';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'sm';
  icon?: ReactNode;
  children?: ReactNode;
}

const classe: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  onNavy: 'btn-on-navy',
};

/** Botão-pílula do portal. primary = azul-elétrico; secondary = verde-água. */
export default function Button({ variant = 'primary', size = 'md', icon, children, className = '', type = 'button', ...rest }: Props) {
  return (
    <button type={type} className={`btn ${classe[variant]}${size === 'sm' ? ' btn-sm' : ''} ${className}`.trim()} {...rest}>
      {icon}
      {children}
    </button>
  );
}
