const statusColors: Record<string, string> = {
  ABERTO: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  AGUARDANDO_APROVACAO: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  APROVADO: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  REJEITADO: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  EM_ANDAMENTO: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  CONCLUIDO: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  CANCELADO: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

const urgencyColors: Record<string, string> = {
  BAIXA: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  MEDIA: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  ALTA: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  URGENTE: 'bg-red-100 text-red-700 font-semibold dark:bg-red-900/40 dark:text-red-300',
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
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${statusColors[status] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>
      {statusLabels[status] ?? status}
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${urgencyColors[urgency] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>
      {urgencyLabels[urgency] ?? urgency}
    </span>
  );
}

const supplyStatusColors: Record<string, string> = {
  PENDENTE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  APROVADO: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  COMPRADO: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  ENTREGUE: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  CANCELADO: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
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
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${supplyStatusColors[status] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>
      {supplyStatusLabels[status] ?? status}
    </span>
  );
}
