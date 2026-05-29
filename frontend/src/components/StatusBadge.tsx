const statusColors: Record<string, string> = {
  ABERTO: 'bg-blue-100 text-blue-800',
  EM_ANDAMENTO: 'bg-yellow-100 text-yellow-800',
  CONCLUIDO: 'bg-green-100 text-green-800',
  CANCELADO: 'bg-red-100 text-red-800',
};

const urgencyColors: Record<string, string> = {
  BAIXA: 'bg-slate-100 text-slate-600',
  MEDIA: 'bg-blue-100 text-blue-700',
  ALTA: 'bg-orange-100 text-orange-700',
  URGENTE: 'bg-red-100 text-red-700 font-semibold',
};

const statusLabels: Record<string, string> = {
  ABERTO: 'Aberto',
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
};

const urgencyLabels: Record<string, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${statusColors[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {statusLabels[status] ?? status}
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${urgencyColors[urgency] ?? 'bg-gray-100 text-gray-600'}`}>
      {urgencyLabels[urgency] ?? urgency}
    </span>
  );
}

const supplyStatusColors: Record<string, string> = {
  PENDENTE: 'bg-yellow-100 text-yellow-800',
  APROVADO: 'bg-blue-100 text-blue-800',
  COMPRADO: 'bg-purple-100 text-purple-800',
  ENTREGUE: 'bg-green-100 text-green-800',
  CANCELADO: 'bg-red-100 text-red-800',
};

const supplyStatusLabels: Record<string, string> = {
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado',
  COMPRADO: 'Comprado',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
};

export function SupplyStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${supplyStatusColors[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {supplyStatusLabels[status] ?? status}
    </span>
  );
}
