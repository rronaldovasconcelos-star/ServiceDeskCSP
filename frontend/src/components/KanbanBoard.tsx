import { useDroppable, useDraggable, DndContext } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

interface Ticket {
  id: string;
  title: string;
  category: string;
  urgency: string;
  status: string;
  createdAt: string;
  requester: { name: string };
  assignee: { name: string } | null;
}

interface KanbanBoardProps {
  tickets: Ticket[];
  onStatusChange: (ticketId: string, newStatus: string) => Promise<void>;
}

const COLUMNS = [
  {
    id: 'ABERTO', label: 'Aberto', dot: '#f59e0b',
    header: '#fffbeb', border: '#fde68a',
    darkHeader: '#292524', darkBorder: '#78350f',
  },
  {
    id: 'EM_ANDAMENTO', label: 'Em Andamento', dot: '#3b82f6',
    header: '#eff6ff', border: '#bfdbfe',
    darkHeader: '#1e2d3d', darkBorder: '#1d4ed8',
  },
  {
    id: 'CONCLUIDO', label: 'Concluído', dot: '#10b981',
    header: '#f0fdf4', border: '#a7f3d0',
    darkHeader: '#1a2e23', darkBorder: '#065f46',
  },
  {
    id: 'CANCELADO', label: 'Cancelado', dot: '#9ca3af',
    header: '#f9fafb', border: '#e5e7eb',
    darkHeader: '#1e293b', darkBorder: '#334155',
  },
];

const VALID_TRANSITIONS: Record<string, string[]> = {
  ABERTO:       ['EM_ANDAMENTO', 'CANCELADO'],
  EM_ANDAMENTO: ['CONCLUIDO', 'CANCELADO'],
  CONCLUIDO:    [],
  CANCELADO:    [],
};

const URGENCY_STYLE: Record<string, string> = {
  BAIXA:   'bg-green-100 text-green-700',
  MEDIA:   'bg-yellow-100 text-yellow-700',
  ALTA:    'bg-orange-100 text-orange-700',
  URGENTE: 'bg-red-100 text-red-700',
};

const URGENCY_LABEL: Record<string, string> = {
  BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', URGENTE: 'Urgente',
};

const CATEGORY_STYLE: Record<string, string> = {
  TI:          'bg-blue-100 text-blue-700',
  SUPRIMENTOS: 'bg-purple-100 text-purple-700',
};

function TicketCard({ ticket }: { ticket: Ticket }) {
  const draggable = VALID_TRANSITIONS[ticket.status]?.length > 0;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
    disabled: !draggable,
    data: { status: ticket.status },
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(draggable ? { ...listeners, ...attributes } : {})}
      className={`bg-white dark:bg-slate-700 rounded-xl border border-slate-100 dark:border-slate-600 shadow-sm p-3 select-none transition-shadow ${
        isDragging ? 'shadow-xl opacity-80 rotate-1' : 'hover:shadow-md'
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
    >
      <Link
        to={`/tickets/${ticket.id}`}
        onClick={(e) => isDragging && e.preventDefault()}
        className="block"
      >
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 mb-2">
          {ticket.title}
        </p>
        <div className="flex flex-wrap gap-1 mb-2">
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_STYLE[ticket.category] ?? 'bg-slate-100 text-slate-600'}`}>
            {ticket.category}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${URGENCY_STYLE[ticket.urgency] ?? 'bg-slate-100 text-slate-600'}`}>
            {URGENCY_LABEL[ticket.urgency] ?? ticket.urgency}
          </span>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{ticket.requester.name}</p>
        {ticket.assignee && (
          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">→ {ticket.assignee.name}</p>
        )}
      </Link>
    </div>
  );
}

function KanbanColumn({ col, tickets, isDark }: { col: typeof COLUMNS[number]; tickets: Ticket[]; isDark: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });

  const headerBg = isDark ? col.darkHeader : col.header;
  const headerBorder = isDark ? col.darkBorder : col.border;
  const bodyBg = isDark ? (isOver ? col.darkHeader : '#1e293b') : (isOver ? col.header : '#f8fafc');
  const bodyBorder = isDark ? (isOver ? col.dot : '#334155') : (isOver ? col.dot : '#e2e8f0');

  return (
    <div className="flex flex-col min-w-0 flex-1">
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-t-xl border border-b-0"
        style={{ background: headerBg, borderColor: headerBorder }}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.dot }} />
        <span className="text-sm font-semibold" style={{ color: isDark ? '#e2e8f0' : '#334155' }}>{col.label}</span>
        <span
          className="ml-auto text-xs font-medium px-1.5 py-0.5 rounded-full"
          style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)', color: isDark ? '#94a3b8' : '#64748b' }}
        >
          {tickets.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className="flex-1 flex flex-col gap-2 p-2 rounded-b-xl border min-h-48 transition-colors"
        style={{ background: bodyBg, borderColor: bodyBorder }}
      >
        {tickets.length === 0 && (
          <p className="text-xs text-slate-300 dark:text-slate-600 text-center mt-4">Nenhum chamado</p>
        )}
        {tickets.map((t) => (
          <TicketCard key={t.id} ticket={t} />
        ))}
      </div>
    </div>
  );
}

export default function KanbanBoard({ tickets, onStatusChange }: KanbanBoardProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const grouped = COLUMNS.reduce<Record<string, Ticket[]>>((acc, col) => {
    acc[col.id] = tickets.filter((t) => t.status === col.id);
    return acc;
  }, {});

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const ticketId = active.id as string;
    const fromStatus = (active.data.current as { status: string }).status;
    const toStatus = over.id as string;

    if (fromStatus === toStatus) return;
    if (!VALID_TRANSITIONS[fromStatus]?.includes(toStatus)) return;

    await onStatusChange(ticketId, toStatus);
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {COLUMNS.map((col) => (
          <KanbanColumn key={col.id} col={col} tickets={grouped[col.id] ?? []} isDark={isDark} />
        ))}
      </div>
    </DndContext>
  );
}
