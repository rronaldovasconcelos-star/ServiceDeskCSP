import { useState } from 'react';
import { useDroppable, useDraggable, DndContext } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

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
  { id: 'ABERTO',       label: 'Aberto',       color: 'var(--amber)',            pill: 'pill-amber' },
  { id: 'EM_ANDAMENTO', label: 'Em Andamento', color: 'var(--electric)',         pill: 'pill-electric' },
  { id: 'CONCLUIDO',    label: 'Concluído',    color: 'var(--teal)',             pill: 'pill-teal' },
  { id: 'CANCELADO',    label: 'Cancelado',    color: 'var(--status-cancelado)', pill: 'pill-muted' },
];

/* Colunas de histórico (não-ativas): mostram só os N mais recentes
   e expandem sob demanda via "ver mais". */
const COLLAPSIBLE_COLUMNS = new Set(['CONCLUIDO', 'CANCELADO']);
const COLLAPSED_LIMIT = 5;

const VALID_TRANSITIONS: Record<string, string[]> = {
  ABERTO:       ['EM_ANDAMENTO', 'CANCELADO'],
  EM_ANDAMENTO: ['CONCLUIDO', 'CANCELADO'],
  CONCLUIDO:    [],
  CANCELADO:    [],
};

/* ── Cor da borda esquerda por prioridade ── */
const URGENCY_BORDER: Record<string, string> = {
  URGENTE: 'var(--coral)',
  ALTA:    'var(--coral)',
  MEDIA:   'var(--amber)',
  BAIXA:   'var(--teal)',
};

/* ── Pills de urgência (classes `.pill-*` do index.css) ── */
const URGENCY_PILL: Record<string, string> = {
  URGENTE: 'pill-coral',
  ALTA:    'pill-coral',
  MEDIA:   'pill-amber',
  BAIXA:   'pill-teal',
};
const URGENCY_LABEL: Record<string, string> = {
  BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', URGENTE: 'Urgente',
};

/* ── Pills de categoria ── */
const CATEGORY_PILL: Record<string, string> = {
  TI:          'pill-electric',
  SUPRIMENTOS: 'pill-violet',
};
const DEFAULT_PILL = 'pill-muted';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* ── Card individual ── */
function TicketCard({ ticket }: { ticket: Ticket }) {
  const draggable = VALID_TRANSITIONS[ticket.status]?.length > 0;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
    disabled: !draggable,
    data: { status: ticket.status },
  });

  const cardStyle = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
    : {};

  const urgencyPill  = URGENCY_PILL[ticket.urgency]  ?? DEFAULT_PILL;
  const categoryPill = CATEGORY_PILL[ticket.category] ?? DEFAULT_PILL;
  const leftBorder    = URGENCY_BORDER[ticket.urgency] ?? 'var(--border)';

  return (
    <div
      ref={setNodeRef}
      style={{ ...cardStyle, borderLeft: `3px solid ${leftBorder}` }}
      {...(draggable ? { ...listeners, ...attributes } : {})}
      className={[
        'kanban-card',
        draggable ? 'draggable' : '',
        isDragging ? 'dragging' : '',
      ].filter(Boolean).join(' ')}
      title={`Aberto em: ${formatDate(ticket.createdAt)}`}
    >
      <Link
        to={`/tickets/${ticket.id}`}
        onClick={(e) => isDragging && e.preventDefault()}
        style={{ display: 'block', textDecoration: 'none' }}
        aria-label={`Ver chamado: ${ticket.title}`}
      >
        <p
          style={{
            color: 'var(--text-primary)',
            fontSize: '13px',
            fontWeight: 600,
            lineHeight: 1.4,
            margin: '0 0 8px',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {ticket.title}
        </p>

        {/* Pills: categoria + urgência */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          <span className={`pill ${categoryPill}`}>
            {ticket.category}
          </span>
          <span className={`pill ${urgencyPill}`}>
            {URGENCY_LABEL[ticket.urgency] ?? ticket.urgency}
          </span>
        </div>

        {/* Solicitante + Atribuído */}
        <p style={{ color: 'var(--text-secondary)', fontSize: '11px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ticket.requester.name}
        </p>
        {ticket.assignee && (
          <p style={{ color: 'var(--electric)', fontSize: '11px', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            → {ticket.assignee.name}
          </p>
        )}
      </Link>
    </div>
  );
}

/* ── Coluna Kanban ── */
function KanbanColumn({ col, tickets }: { col: typeof COLUMNS[number]; tickets: Ticket[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const [expanded, setExpanded] = useState(false);

  const collapsible = COLLAPSIBLE_COLUMNS.has(col.id);
  const hasOverflow = collapsible && tickets.length > COLLAPSED_LIMIT;
  const isCollapsed = hasOverflow && !expanded;
  const visibleTickets = isCollapsed ? tickets.slice(0, COLLAPSED_LIMIT) : tickets;
  const hiddenCount = tickets.length - COLLAPSED_LIMIT;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
      {/* Header da coluna — clicável quando há itens ocultos */}
      <div
        className="kanban-col-header"
        style={{ borderTop: `3px solid ${col.color}`, cursor: hasOverflow ? 'pointer' : 'default' }}
        aria-label={`Coluna ${col.label}: ${tickets.length} chamado(s)`}
        onClick={hasOverflow ? () => setExpanded((v) => !v) : undefined}
        role={hasOverflow ? 'button' : undefined}
        tabIndex={hasOverflow ? 0 : undefined}
        onKeyDown={hasOverflow ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v); } } : undefined}
        title={hasOverflow ? (expanded ? 'Recolher' : `Mostrar mais ${hiddenCount}`) : undefined}
      >
        <span
          style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0, display: 'inline-block' }}
          aria-hidden="true"
        />
        <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, flex: 1 }}>
          {col.label}
        </span>

        {/* Chip "+N ocultos" no topo — admin vê sem rolar */}
        {hasOverflow && !expanded && (
          <span className="pill pill-amber" style={{ fontWeight: 700, padding: '1px 7px' }}>
            +{hiddenCount}
          </span>
        )}

        <span className={`pill ${col.pill}`} style={{ fontWeight: 600, padding: '1px 7px' }}>
          {tickets.length}
        </span>

        {/* Seta indicadora de expandir/recolher */}
        {hasOverflow && (
          <ChevronDown
            size={15}
            style={{
              color: 'var(--text-secondary)',
              flexShrink: 0,
              transition: 'transform 0.2s',
              transform: expanded ? 'rotate(180deg)' : 'none',
            }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Corpo da coluna — droppable */}
      <div
        ref={setNodeRef}
        className={`kanban-col-body${isOver ? ' over' : ''}`}
      >
        {tickets.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px', textAlign: 'center', marginTop: 16, opacity: 0.5 }}>
            Nenhum chamado
          </p>
        )}
        {visibleTickets.map((t) => (
          <TicketCard key={t.id} ticket={t} />
        ))}

        {/* Botão ver mais / ver menos para colunas de histórico */}
        {collapsible && tickets.length > COLLAPSED_LIMIT && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="kanban-show-more"
          >
            {expanded ? 'Ver menos' : `Ver mais (+${hiddenCount})`}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Board principal ── */
export default function KanbanBoard({ tickets, onStatusChange }: KanbanBoardProps) {
  const grouped = COLUMNS.reduce<Record<string, Ticket[]>>((acc, col) => {
    acc[col.id] = tickets.filter((t) => t.status === col.id);
    return acc;
  }, {});

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const ticketId   = active.id as string;
    const fromStatus = (active.data.current as { status: string }).status;
    const toStatus   = over.id as string;

    if (fromStatus === toStatus) return;
    if (!VALID_TRANSITIONS[fromStatus]?.includes(toStatus)) return;

    await onStatusChange(ticketId, toStatus);
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
        role="region"
        aria-label="Quadro de chamados"
      >
        {COLUMNS.map((col) => (
          <KanbanColumn key={col.id} col={col} tickets={grouped[col.id] ?? []} />
        ))}
      </div>
    </DndContext>
  );
}
