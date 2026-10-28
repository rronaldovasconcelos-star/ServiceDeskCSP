/**
 * Pílulas de status, urgência e pedido de suprimento. As cores vêm das classes
 * `.pill-*` do index.css (variáveis do tema), nunca de hex aqui.
 */
type Tom = 'electric' | 'teal' | 'amber' | 'coral' | 'violet' | 'muted';

const statusTom: Record<string, Tom> = {
  ABERTO: 'amber',
  AGUARDANDO_APROVACAO: 'amber',
  APROVADO: 'teal',
  REJEITADO: 'coral',
  EM_ANDAMENTO: 'electric',
  CONCLUIDO: 'teal',
  CANCELADO: 'muted',
};

const urgencyTom: Record<string, Tom> = {
  BAIXA: 'muted',
  MEDIA: 'electric',
  ALTA: 'amber',
  URGENTE: 'coral',
};

const statusLabels: Record<string, string> = {
  ABERTO: 'Aberto',
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  APROVADO: 'Aprovado',
  REJEITADO: 'Rejeitado',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
};

const urgencyLabels: Record<string, string> = {
  BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', URGENTE: 'Urgente',
};

/** Pílula de estado: `dot` acrescenta um ponto colorido antes do texto; `bold` usa `.pill-strong`. */
function Pill({ tom, bold, dot, children }: { tom: Tom; bold?: boolean; dot?: boolean; children: string }) {
  return (
    <span className={`pill pill-${tom}${bold ? ' pill-strong' : ''}`}>
      {dot && <span className="pill-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Pill tom={statusTom[status] ?? 'muted'} dot>{statusLabels[status] ?? status}</Pill>;
}

export function UrgencyBadge({ urgency }: { urgency: string }) {
  return <Pill tom={urgencyTom[urgency] ?? 'muted'} bold={urgency === 'URGENTE'}>{urgencyLabels[urgency] ?? urgency}</Pill>;
}

const supplyTom: Record<string, Tom> = {
  PENDENTE: 'amber',
  APROVADO: 'electric',
  COMPRADO: 'violet',
  ENTREGUE: 'teal',
  CANCELADO: 'coral',
};

const supplyStatusLabels: Record<string, string> = {
  PENDENTE: 'Pendente', APROVADO: 'Aprovado', COMPRADO: 'Comprado',
  ENTREGUE: 'Entregue', CANCELADO: 'Cancelado',
};

export function SupplyStatusBadge({ status }: { status: string }) {
  return <Pill tom={supplyTom[status] ?? 'muted'} dot>{supplyStatusLabels[status] ?? status}</Pill>;
}
