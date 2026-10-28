import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface Props {
  /** Ícone do lucide; padrão `Inbox`. */
  icon?: ReactNode;
  title: ReactNode;
  /** Texto de apoio (uma ou duas frases). */
  children?: ReactNode;
  /** Ação principal, normalmente um `<Button>`. */
  action?: ReactNode;
}

/** Estado vazio centralizado: ícone em tile cinza, título, texto e ação opcional. */
export default function EmptyState({ icon, title, children, action }: Props) {
  return (
    <div className="empty-state">
      <div className="icon-tile muted" aria-hidden="true">
        {icon ?? <Inbox size={22} />}
      </div>
      <p className="empty-state-title">{title}</p>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
