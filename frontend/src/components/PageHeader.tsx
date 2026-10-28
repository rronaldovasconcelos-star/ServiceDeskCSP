import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface Props {
  /** Nome da tela. */
  title: string;
  /** Uma linha curta de contexto abaixo do título (contagem, período, instância…). */
  description?: ReactNode;
  /** @deprecated use `description`. Mantido para as páginas que ainda não migraram. */
  subtitle?: ReactNode;
  /** Botões de ação da página (ficam à direita; quebram linha no celular). */
  actions?: ReactNode;
  /** Badges e metadados logo abaixo do título (status, id, categoria…). */
  meta?: ReactNode;
  /** Rota do link "Voltar" acima do título. */
  backTo?: string;
  /** Texto do link "Voltar" (padrão: "Voltar"). */
  backLabel?: string;
}

/**
 * Cabeçalho de página plano, no padrão Jira Service Management / Zendesk:
 * link de volta opcional, título em navy, metadados, descrição e ações à direita.
 * Nada de faixa colorida nem forma decorativa — o destaque vem do conteúdo.
 */
export default function PageHeader({ title, description, subtitle, actions, meta, backTo, backLabel }: Props) {
  const desc = description ?? subtitle;
  return (
    <header className="page-head">
      <div className="page-head-inner">
        <div className="page-head-main">
          {backTo && (
            <Link to={backTo} className="page-back">
              <ArrowLeft size={15} aria-hidden="true" />
              {backLabel ?? 'Voltar'}
            </Link>
          )}
          <h1 className="page-head-title">{title}</h1>
          {meta && <div className="page-head-meta">{meta}</div>}
          {desc && <p className="page-head-desc">{desc}</p>}
        </div>
        {actions && <div className="page-head-actions">{actions}</div>}
      </div>
    </header>
  );
}
