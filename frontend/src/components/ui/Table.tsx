import type { ReactNode } from 'react';

interface Props {
  /** Cabeçalho: `<tr><th>…</th></tr>` */
  head: ReactNode;
  /** Linhas: `<tr>…</tr>` */
  children: ReactNode;
  /** Mostrado no lugar das linhas quando a lista está vazia. */
  empty?: ReactNode;
  isEmpty?: boolean;
  className?: string;
}

/** Tabela em card branco com cabeçalho discreto. Substitui o wrapper repetido nas listas. */
export default function Table({ head, children, empty, isEmpty, className = '' }: Props) {
  return (
    <div className={`table-wrap ${className}`.trim()}>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>{head}</thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {isEmpty && (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
          {empty ?? 'Nada por aqui ainda.'}
        </div>
      )}
    </div>
  );
}
