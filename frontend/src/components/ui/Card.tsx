import type { HTMLAttributes, ReactNode } from 'react';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  /** Sombra só onde o card é o foco (tabela principal). */
  raised?: boolean;
  children: ReactNode;
}

export default function Card({ title, raised, children, className = '', ...rest }: Props) {
  return (
    <div className={`card${raised ? ' card-raised' : ''} ${className}`.trim()} {...rest}>
      {title && <h2 className="card-title">{title}</h2>}
      {children}
    </div>
  );
}
