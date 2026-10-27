import type { ReactNode } from 'react';

interface Props {
  /** Nome da tela, em branco. */
  title: string;
  /** Uma linha curta em azul-claro: contexto ou número do dia. */
  subtitle?: ReactNode;
  /** Botões de ação principal (pílulas). */
  actions?: ReactNode;
}

/**
 * Faixa azul-marinho no topo de cada página, com a forma elétrica no canto —
 * a assinatura visual do portal. Tudo que vem abaixo dela fica neutro.
 */
export default function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <header className="page-hero">
      <img src="/blob.svg" alt="" className="page-hero-blob" />
      <div className="page-hero-inner">
        <div>
          <h1 className="page-hero-title">{title}</h1>
          {subtitle && <p className="page-hero-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-hero-actions">{actions}</div>}
      </div>
    </header>
  );
}
