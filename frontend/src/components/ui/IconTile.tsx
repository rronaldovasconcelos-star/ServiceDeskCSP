import type { ReactNode } from 'react';

type Tone = 'electric' | 'teal' | 'amber' | 'coral' | 'violet' | 'soft' | 'navy' | 'muted';

interface Props {
  tone?: Tone;
  size?: number;
  children: ReactNode;
  className?: string;
}

/**
 * Quadrado arredondado com ícone, fundo suave e tinta do estado.
 * `electric` e `soft` são o padrão (azul suave); `navy` é sólido escuro
 * com ícone branco; `muted` é cinza, para estados vazios.
 */
export default function IconTile({ tone = 'electric', size = 40, children, className = '' }: Props) {
  const extra = tone === 'electric' || tone === 'soft' ? '' : ` ${tone}`;
  return (
    <span
      className={`icon-tile${extra} ${className}`.trim()}
      style={size !== 40 ? { width: size, height: size } : undefined}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}
