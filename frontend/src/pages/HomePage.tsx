import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, ChevronRight, AlertCircle, Inbox, Clock, Activity, CheckCircle,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { canAccess } from '../lib/modules';
import { servicesFor } from '../lib/homeServices';
import { formatDateTime, formatRelative } from '../lib/dates';
import { Card, IconTile } from '../components/ui';
import { StatusBadge } from '../components/StatusBadge';
import KanbanBoard from '../components/KanbanBoard';

interface TicketItem {
  id: string;
  title: string;
  category: string;
  urgency: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  requester: { id: string; name: string };
  assignee: { name: string } | null;
}

/** Quantos serviços aparecem antes de "Ver todos". */
const SERVICOS_VISIVEIS = 6;

/** Filtros da fila da equipe (mesmos da antiga tela de Dashboard). */
const FILTER_OPTIONS = [
  { label: 'Todos',        value: '' },
  { label: 'Aberto',       value: 'ABERTO' },
  { label: 'Em andamento', value: 'EM_ANDAMENTO' },
  { label: 'Concluído',    value: 'CONCLUIDO' },
  { label: 'Cancelado',    value: 'CANCELADO' },
];

function primeiroNome(nome: string | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] || 'você';
}

/** Chamado "movimentado" = atualizado mais de 1 min depois de criado. */
function foiMovimentado(t: TicketItem): boolean {
  return new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime() > 60_000;
}

export default function HomePage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  /** Busca única de GET /tickets; só altera estado nos callbacks (assíncrono). */
  const buscar = useCallback(() => {
    return api.get('/tickets')
      .then((res) => { setTickets(Array.isArray(res.data) ? res.data : []); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { void buscar(); }, [buscar]);

  const recarregar = () => {
    setLoading(true);
    setError(false);
    void buscar();
  };

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    setTickets((prev) =>
      prev.map((t) => t.id === ticketId ? { ...t, status: newStatus, updatedAt: new Date().toISOString() } : t)
    );
    try {
      await api.patch(`/tickets/${ticketId}/status`, { status: newStatus });
    } catch {
      const res = await api.get('/tickets');
      setTickets(res.data);
    }
  };

  const servicos = servicesFor(user);
  const temMais = servicos.length > SERVICOS_VISIVEIS;
  const servicosVisiveis = mostrarTodos || !temMais ? servicos : servicos.slice(0, SERVICOS_VISIVEIS);

  const meus = tickets.filter((t) => t.requester?.id === user?.id);
  const contar = (lista: TicketItem[], status: string) => lista.filter((t) => t.status === status).length;

  const recentes = [...meus]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  const veFila = canAccess(user, 'dashboard');
  const filaFiltrada = statusFilter ? tickets.filter((t) => t.status === statusFilter) : tickets;

  return (
    <main className="page-body" style={{ maxWidth: 1120, display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* ── Hero ── */}
      <section className="home-hero">
        <div>
          <h1>Como podemos ajudar, {primeiroNome(user?.name)}?</h1>
          <p>Abra um chamado para TI, manutenção, pedagógico ou administrativo, ou acompanhe os que você já enviou.</p>
        </div>
        <div className="home-hero-actions">
          <Link to="/tickets/new" className="btn btn-primary"><Plus size={16} aria-hidden="true" />Abrir chamado</Link>
          <Link to="/tickets" className="btn btn-secondary">Acompanhar meus chamados</Link>
        </div>
      </section>

      {/* ── Serviços ── */}
      <section aria-labelledby="h-servicos">
        <div className="section-head">
          <h2 id="h-servicos">Serviços</h2>
          {temMais && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setMostrarTodos((v) => !v)}
              aria-expanded={mostrarTodos}
              aria-controls="grid-servicos"
            >
              {mostrarTodos ? 'Mostrar menos' : `Ver todos os serviços (${servicos.length})`}
            </button>
          )}
        </div>
        <div id="grid-servicos" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {servicosVisiveis.map((s) => {
            const Icon = s.icon;
            return (
              <Link key={s.key} to={s.to} className="service-card">
                <IconTile tone={s.primary ? 'electric' : 'soft'}><Icon size={20} aria-hidden="true" /></IconTile>
                <div className="service-card-body">
                  <p className="service-card-title">{s.label}</p>
                  <p className="service-card-desc">{s.description}</p>
                </div>
                <ChevronRight className="service-card-chevron" size={18} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Meus chamados ── */}
      <section aria-labelledby="h-meus">
        <div className="section-head">
          <h2 id="h-meus">Meus chamados</h2>
          {!loading && !error && meus.length > 0 && <Link to="/tickets">Ver todos</Link>}
        </div>

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" aria-busy="true" aria-label="Carregando seus chamados">
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 64 }} />)}
          </div>
        )}

        {!loading && error && (
          <div className="notice notice-danger" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <div className="notice-body">
              Não foi possível carregar seus chamados.
              <div className="notice-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={recarregar}>Tentar novamente</button>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && meus.length === 0 && (
          <Card>
            <div className="empty-state">
              <IconTile className="muted"><Inbox size={22} aria-hidden="true" /></IconTile>
              <p className="empty-state-title">Você ainda não abriu nenhum chamado</p>
              <p>Quando precisar de suporte, abra um chamado e acompanhe por aqui.</p>
              <Link to="/tickets/new" className="btn btn-primary">Abrir chamado</Link>
            </div>
          </Card>
        )}

        {!loading && !error && meus.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link className="stat-chip" to="/tickets?status=ABERTO">
              <IconTile tone="amber"><Clock size={20} aria-hidden="true" /></IconTile>
              <div>
                <div className="stat-chip-value">{contar(meus, 'ABERTO')}</div>
                <div className="stat-chip-label">Abertos</div>
              </div>
            </Link>
            <Link className="stat-chip" to="/tickets?status=EM_ANDAMENTO">
              <IconTile tone="electric"><Activity size={20} aria-hidden="true" /></IconTile>
              <div>
                <div className="stat-chip-value">{contar(meus, 'EM_ANDAMENTO')}</div>
                <div className="stat-chip-label">Em andamento</div>
              </div>
            </Link>
            <Link className="stat-chip" to="/tickets?status=CONCLUIDO">
              <IconTile tone="teal"><CheckCircle size={20} aria-hidden="true" /></IconTile>
              <div>
                <div className="stat-chip-value">{contar(meus, 'CONCLUIDO')}</div>
                <div className="stat-chip-label">Concluídos</div>
              </div>
            </Link>
          </div>
        )}
      </section>

      {/* ── Atividade recente ── */}
      {!loading && !error && meus.length > 0 && (
        <section aria-labelledby="h-recentes">
          <div className="section-head">
            <h2 id="h-recentes">Atividade recente</h2>
            <Link to="/tickets">Ver todos</Link>
          </div>
          <Card style={{ padding: '4px 20px' }}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {recentes.map((t, i) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1"
                  style={{
                    padding: '12px 0',
                    borderBottom: i < recentes.length - 1 ? '1px solid var(--line)' : 'none',
                  }}
                >
                  <Link to={`/tickets/${t.id}`} className="font-medium" style={{ color: 'var(--text)', textDecoration: 'none', flex: '1 1 220px', minWidth: 0, overflowWrap: 'anywhere' }}>
                    {t.title}
                  </Link>
                  <StatusBadge status={t.status} />
                  {foiMovimentado(t) && <span className="pill pill-muted">Movimentado</span>}
                  <span className="muted" style={{ fontSize: 12.5, marginLeft: 'auto' }} title={formatDateTime(t.updatedAt)}>
                    Atualizado {formatRelative(t.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {/* ── Fila da equipe ── */}
      {veFila && (
        <section aria-labelledby="h-fila">
          <div className="section-head">
            <h2 id="h-fila">Fila da equipe</h2>
            <Link to="/dashboard">Ver painel de indicadores</Link>
          </div>

          {loading && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-busy="true" aria-label="Carregando a fila da equipe">
              {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 240 }} />)}
            </div>
          )}

          {!loading && error && (
            <div className="notice notice-danger" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <div className="notice-body">
                Não foi possível carregar a fila da equipe.
                <div className="notice-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={recarregar}>Tentar novamente</button>
                </div>
              </div>
            </div>
          )}

          {!loading && !error && (
            <>
              <div className="kanban-filters" role="group" aria-label="Filtrar por status">
                {FILTER_OPTIONS.map((opt) => {
                  const n = opt.value ? contar(tickets, opt.value) : tickets.length;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`filter-btn${statusFilter === opt.value ? ' active' : ''}`}
                      onClick={() => setStatusFilter(opt.value)}
                      aria-pressed={statusFilter === opt.value}
                    >
                      {opt.label} <span style={{ opacity: 0.75 }}>({n})</span>
                    </button>
                  );
                })}
              </div>
              <KanbanBoard tickets={filaFiltrada} onStatusChange={handleStatusChange} />
            </>
          )}
        </section>
      )}
    </main>
  );
}
