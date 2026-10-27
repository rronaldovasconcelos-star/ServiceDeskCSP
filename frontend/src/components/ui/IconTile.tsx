import type { ReactNode } from 'react';

type Tone = 'electric' | 'teal' | 'amber' | 'coral' | 'violet' | 'soft';

interface Props {
  tone?: Tone;
  size?: number;
  children: ReactNode;
  className?: string;
}

/** Quadrado arredondado com ícone branco, como os selling points do Telehap. */
export default function IconTile({ tone = 'electric', size = 40, children, className = '' }: Props) {
  return (
    <span
      className={`icon-tile${tone === 'electric' ? '' : ` ${tone}`} ${className}`.trim()}
      style={size !== 40 ? { width: size, height: size } : undefined}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}
