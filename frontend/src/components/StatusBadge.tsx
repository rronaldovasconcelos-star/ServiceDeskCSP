type BadgeStyle = { background: string; color: string; fontWeight?: number };

const statusStyles: Record<string, BadgeStyle> = {
  ABERTO:                { background: 'rgba(59,130,246,0.12)',  color: '#3b82f6' },
  AGUARDANDO_APROVACAO:  { background: 'rgba(249,115,22,0.12)',  color: '#f97316' },
  APROVADO:              { background: 'rgba(20,184,166,0.12)',  color: '#0d9488' },
  REJEITADO:             { background: 'rgba(239,68,68,0.12)',   color: '#ef4444' },
  EM_ANDAMENTO:          { background: 'rgba(234,179,8,0.12)',   color: '#d97706' },
  CONCLUIDO:             { background: 'rgba(34,197,94,0.12)',   color: '#16a34a' },
  CANCELADO:             { background: 'rgba(100,116,139,0.12)', color: '#64748b' },
};

const urgencyStyles: Record<string, BadgeStyle> = {
  BAIXA:   { background: 'rgba(100,116,139,0.12)', color: '#64748b' },
  MEDIA:   { background: 'rgba(59,130,246,0.12)',  color: '#2563eb' },
  ALTA:    { background: 'rgba(249,115,22,0.12)',  color: '#ea580c' },
  URGENTE: { background: 'rgba(239,68,68,0.12)',   color: '#ef4444', fontWeight: 600 },
};

const statusLabels: Record<string, string> = {
  ABERTO: 'Aberto',
  AGUARDANDO_APROVACAO: 'Aguardando Aprovação',
  APROVADO: 'Aprovado',
  REJEITADO: 'Rejeitado',
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
};

const urgencyLabels: Record<string, string> = {
  BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', URGENTE: 'Urgente',
};

const fallback: BadgeStyle = { background: 'rgba(100,116,139,0.12)', color: '#64748b' };

export function StatusBadge({ status }: { status: string }) {
  const s = statusStyles[status] ?? fallback;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: s.fontWeight ?? 500, background: s.background, color: s.color, whiteSpace: 'nowrap' }}>
      {statusLabels[status] ?? status}
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: string }) {
  const s = urgencyStyles[urgency] ?? fallback;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: s.fontWeight ?? 500, background: s.background, color: s.color, whiteSpace: 'nowrap' }}>
      {urgencyLabels[urgency] ?? urgency}
    </span>
  );
}

const supplyStatusStyles: Record<string, BadgeStyle> = {
  PENDENTE:  { background: 'rgba(234,179,8,0.12)',   color: '#d97706' },
  APROVADO:  { background: 'rgba(59,130,246,0.12)',  color: '#2563eb' },
  COMPRADO:  { background: 'rgba(168,85,247,0.12)',  color: '#7c3aed' },
  ENTREGUE:  { background: 'rgba(34,197,94,0.12)',   color: '#16a34a' },
  CANCELADO: { background: 'rgba(239,68,68,0.12)',   color: '#ef4444' },
};

const supplyStatusLabels: Record<string, string> = {
  PENDENTE: 'Pendente', APROVADO: 'Aprovado', COMPRADO: 'Comprado',
  ENTREGUE: 'Entregue', CANCELADO: 'Cancelado',
};

export function SupplyStatusBadge({ status }: { status: string }) {
  const s = supplyStatusStyles[status] ?? fallback;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 500, background: s.background, color: s.color, whiteSpace: 'nowrap' }}>
      {supplyStatusLabels[status] ?? status}
    </span>
  );
}
