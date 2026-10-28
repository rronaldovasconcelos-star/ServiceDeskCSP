import { Children, type ReactNode } from 'react';
import EmptyState from './EmptyState';

interface Props {
  /** Cabeçalho: `<tr><th>…</th></tr>` */
  head: ReactNode;
  /** Linhas: `<tr>…</tr>` */
  children?: ReactNode;
  /** Mostrado no lugar das linhas quando a lista está vazia (string vira `EmptyState`). */
  empty?: ReactNode;
  isEmpty?: boolean;
  /** Carregando: mostra linhas-esqueleto em vez do conteúdo. */
  loading?: boolean;
  /** Quantidade de linhas-esqueleto (padrão 5). */
  rows?: number;
  /** Quantidade de colunas do esqueleto (padrão: tamanho de `head` se for array, senão 4). */
  cols?: number;
  className?: string;
}

/** Conta as células do cabeçalho quando `head` é um array de `<th>`. */
function contarColunas(head: ReactNode, cols?: number): number {
  if (cols) return cols;
  if (Array.isArray(head)) return Children.count(head) || 4;
  return 4;
}

/**
 * Tabela em card branco com cabeçalho discreto. O `.table-wrap` tem
 * `overflow: hidden` (cantos arredondados); a rolagem horizontal no celular
 * fica no `<div>` interno.
 */
export default function Table({ head, children, empty, isEmpty, loading, rows = 5, cols, className = '' }: Props) {
  const nCols = contarColunas(head, cols);

  return (
    <div className={`table-wrap ${className}`.trim()} aria-busy={loading || undefined} aria-live={loading ? 'polite' : undefined}>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>{head}</thead>
          <tbody>
            {loading
              ? Array.from({ length: rows }, (_, i) => (
                  <tr key={i}>
                    {Array.from({ length: nCols }, (_, j) => (
                      <td key={j}><div className="skeleton skeleton-row" /></td>
                    ))}
                  </tr>
                ))
              : children}
          </tbody>
        </table>
      </div>
      {!loading && isEmpty && (
        typeof empty === 'string' || empty === undefined
          ? <EmptyState title={empty ?? 'Nada por aqui ainda.'} />
          : empty
      )}
    </div>
  );
}
