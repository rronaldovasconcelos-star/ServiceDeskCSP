import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowRightLeft, MessageSquare, UserCheck } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, UrgencyBadge } from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';
import { Button, Card, EmptyState, Field, Notice } from '../components/ui';
import { formatDateTime, formatRelative } from '../lib/dates';

const categoryLabel: Record<string, string> = {
  TI: 'TI',
  MANUTENCAO: 'Manutenção',
  PEDAGOGICO: 'Pedagógico',
  ADMINISTRATIVO: 'Administrativo',
  OUTROS: 'Outros',
};

const urgencyLabel: Record<string, string> = {
  BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', URGENTE: 'Urgente',
};

interface HistoryEntry {
  id: string;
  type: string;
  message: string;
  fromStatus?: string;
  toStatus?: string;
  createdAt: string;
  author: { id: string; name: string };
}

interface Ticket {
  id: string;
  title: string;
  description: string;
  category: string;
  urgency: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  requester: { id: string; name: string; email: string };
  assignee?: { id: string; name: string } | null;
  history: HistoryEntry[];
}

interface UserOption { id: string; name: string; }

const TRANSITIONS: Record<string, string[]> = {
  ABERTO: ['EM_ANDAMENTO', 'CANCELADO'],
  AGUARDANDO_APROVACAO: ['APROVADO', 'REJEITADO'],
  APROVADO: ['EM_ANDAMENTO', 'CANCELADO'],
  EM_ANDAMENTO: ['CONCLUIDO', 'CANCELADO'],
  CONCLUIDO: [],
  CANCELADO: [],
  REJEITADO: [],
};

const statusLabel: Record<string, string> = {
  APROVADO: 'Aprovar', REJEITADO: 'Rejeitar', EM_ANDAMENTO: 'Iniciar atendimento',
  CONCLUIDO: 'Concluir', CANCELADO: 'Cancelar',
};

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const statusButtonVariant: Record<string, Variant> = {
  APROVADO: 'primary',
  REJEITADO: 'danger',
  EM_ANDAMENTO: 'primary',
  CONCLUIDO: 'primary',
  CANCELADO: 'secondary',
};

type Tom = '' | 'info' | 'success' | 'warning' | 'danger';
const tomPorStatus: Record<string, Tom> = {
  EM_ANDAMENTO: 'info',
  CONCLUIDO: 'success',
  APROVADO: 'success',
  ABERTO: 'warning',
  CANCELADO: 'danger',
  REJEITADO: 'danger',
};

/** Ícone e tom do marcador da linha do tempo, pelo tipo da interação. */
function marcador(entry: HistoryEntry): { tom: Tom; icone: ReactNode } {
  if (entry.type === 'STATUS_CHANGE') {
    return { tom: tomPorStatus[entry.toStatus ?? ''] ?? '', icone: <ArrowRightLeft size={15} aria-hidden="true" /> };
  }
  if (entry.type === 'ASSIGNMENT') {
    return { tom: 'info', icone: <UserCheck size={15} aria-hidden="true" /> };
  }
  return { tom: '', icone: <MessageSquare size={15} aria-hidden="true" /> };
}

const mensagemDeErro = (err: unknown, padrao: string) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? padrao;

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const justCreated = Boolean((location.state as { justCreated?: boolean } | null)?.justCreated);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [acaoErro, setAcaoErro] = useState('');
  const [comentarioErro, setComentarioErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mudandoStatus, setMudandoStatus] = useState<string | null>(null);

  const isPrivileged = user?.role === 'ADMIN' || user?.role === 'GESTOR';
  const canApprove = isPrivileged;
  const isAdmin = user?.role === 'ADMIN';

  const load = () => {
    api.get(`/tickets/${id}`).then((r) => setTicket(r.data)).catch(() => setTicket(null));
  };

  useEffect(() => {
    api.get(`/tickets/${id}`)
      .then((r) => setTicket(r.data))
      .catch(() => setTicket(null))
      .finally(() => setLoading(false));
    // O diretório de usuários só é liberado ao ADMIN no backend (/users/directory
    // e PATCH /assign); o GESTOR recebia 403 aqui.
    if (isAdmin) {
      api.get('/users/directory').then((r) => setUsers(r.data)).catch(() => setUsers([]));
    }
  }, [id, isAdmin]);

  const changeStatus = async (status: string) => {
    setAcaoErro('');
    setMudandoStatus(status);
    try {
      await api.patch(`/tickets/${id}/status`, { status });
      load();
    } catch (err) {
      setAcaoErro(mensagemDeErro(err, 'Não foi possível mudar o status do chamado.'));
    } finally {
      setMudandoStatus(null);
    }
  };

  const assignTicket = async (assigneeId: string | null) => {
    setAcaoErro('');
    try {
      await api.patch(`/tickets/${id}/assign`, { assigneeId });
      load();
    } catch (err) {
      setAcaoErro(mensagemDeErro(err, 'Não foi possível atribuir o responsável.'));
    }
  };

  const addComment = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setComentarioErro('');
    setEnviando(true);
    try {
      await api.post(`/tickets/${id}/comments`, { message: comment });
      setComment('');
      load();
    } catch (err) {
      setComentarioErro(mensagemDeErro(err, 'Não foi possível enviar a resposta.'));
    } finally {
      setEnviando(false);
    }
  };

  const deleteTicket = async () => {
    if (!window.confirm('Excluir este chamado permanentemente? Esta ação não pode ser desfeita.')) return;
    setAcaoErro('');
    try {
      await api.delete(`/tickets/${id}`);
      navigate('/tickets');
    } catch (err) {
      setAcaoErro(mensagemDeErro(err, 'Não foi possível excluir o chamado.'));
    }
  };

  const fecharAvisoCriado = () => navigate(location.pathname, { replace: true, state: null });

  if (loading) {
    return (
      <>
        <PageHeader backTo="/tickets" backLabel="Chamados" title="Carregando chamado…" />
        <main className="page-body stack" aria-busy="true">
          <div className="skeleton h-[72px]" />
          <div className="skeleton h-[160px]" />
          <div className="skeleton h-[120px]" />
        </main>
      </>
    );
  }

  if (!ticket) {
    return (
      <>
        <PageHeader backTo="/tickets" backLabel="Chamados" title="Chamado" />
        <main className="page-body">
          <div className="card">
            <EmptyState
              title="Chamado não encontrado"
              action={<Link className="btn btn-secondary" to="/tickets">Voltar aos chamados</Link>}
            >
              Ele pode ter sido excluído ou você não tem acesso.
            </EmptyState>
          </div>
        </main>
      </>
    );
  }

  const nextStatuses = TRANSITIONS[ticket.status] ?? [];
  const isApprovalStep = ticket.status === 'AGUARDANDO_APROVACAO';
  const categoria = categoryLabel[ticket.category] ?? ticket.category;

  return (
    <>
      <PageHeader
        backTo="/tickets"
        backLabel="Chamados"
        title={ticket.title}
        meta={(
          <>
            <StatusBadge status={ticket.status} />
            <UrgencyBadge urgency={ticket.urgency} />
            <code className="ticket-id" title={ticket.id}>#{ticket.id.slice(-6).toUpperCase()}</code>
            <span className="muted">{categoria}</span>
          </>
        )}
        description={`Aberto por ${ticket.requester.name} em ${formatDateTime(ticket.createdAt)}`}
      />

      <main className="page-body">
        {justCreated && (
          <Notice kind="success" role="status" title="Chamado aberto" onClose={fecharAvisoCriado} className="mb-5">
            Próximo passo: a equipe recebe e muda o status para "Em andamento"; acompanhe e responda aqui no histórico.
          </Notice>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Principal */}
          <div className="stack min-w-0">
            <Card title="Descrição">
              <p className="whitespace-pre-wrap break-words">{ticket.description}</p>
            </Card>

            <Card title="Histórico">
              {ticket.history.length === 0 ? (
                <p className="muted">Ainda não há interações.</p>
              ) : (
                <ol className="timeline">
                  {ticket.history.map((entry) => {
                    const { tom, icone } = marcador(entry);
                    const equipe = entry.author.id !== ticket.requester.id;
                    return (
                      <li key={entry.id} className="timeline-item">
                        <span className={`timeline-dot ${tom}`.trim()}>{icone}</span>
                        <div className="timeline-body">
                          <div className="timeline-head">
                            <span className="timeline-author">{entry.author.name}</span>
                            {equipe && <span className="pill pill-muted">Equipe</span>}
                            <span className="timeline-time" title={formatDateTime(entry.createdAt)}>
                              {formatRelative(entry.createdAt)}
                            </span>
                          </div>
                          <p className="timeline-text">{entry.message}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              <form onSubmit={addComment} className="mt-5 pt-5 border-t border-[var(--line)] stack">
                {comentarioErro && <Notice kind="danger">{comentarioErro}</Notice>}
                <Field label="Responder">
                  {(ctl) => (
                    <textarea
                      {...ctl}
                      className="field"
                      rows={3}
                      value={comment}
                      placeholder="Escreva uma resposta ou um comentário…"
                      onChange={(e) => setComment(e.target.value)}
                    />
                  )}
                </Field>
                <div className="form-actions">
                  <Button type="submit" loading={enviando} disabled={!comment.trim()}>Enviar resposta</Button>
                </div>
              </form>
            </Card>
          </div>

          {/* Lateral */}
          <aside className="stack min-w-0">
            <Card title="Detalhes">
              <dl className="dl">
                <dt>Status</dt>
                <dd><StatusBadge status={ticket.status} /></dd>
                <dt>Urgência</dt>
                <dd>{urgencyLabel[ticket.urgency] ?? ticket.urgency}</dd>
                <dt>Categoria</dt>
                <dd>{categoria}</dd>
                <dt>Solicitante</dt>
                <dd>{ticket.requester.name}</dd>
                <dt>Responsável</dt>
                <dd>{ticket.assignee?.name ?? <span className="muted">Não atribuído</span>}</dd>
                <dt>Aberto em</dt>
                <dd>{formatDateTime(ticket.createdAt)}</dd>
                <dt>Atualizado em</dt>
                <dd>{formatDateTime(ticket.updatedAt)}</dd>
                {ticket.resolvedAt && (
                  <>
                    <dt>Concluído em</dt>
                    <dd>{formatDateTime(ticket.resolvedAt)}</dd>
                  </>
                )}
              </dl>
            </Card>

            {/* Aviso ao solicitante */}
            {isApprovalStep && !canApprove && (
              <Notice kind="warning">
                Seu chamado está aguardando aprovação de um gestor ou administrador.
              </Notice>
            )}

            {isPrivileged && (
              <Card title="Ações">
                <div className="stack">
                  {acaoErro && <Notice kind="danger">{acaoErro}</Notice>}

                  {/* Aprovação pendente (ADMIN/GESTOR) */}
                  {isApprovalStep && canApprove && (
                    <Notice
                      kind="warning"
                      title="Aguardando sua aprovação"
                      actions={(
                        <>
                          <Button size="sm" onClick={() => changeStatus('APROVADO')} loading={mudandoStatus === 'APROVADO'} disabled={mudandoStatus !== null}>Aprovar</Button>
                          <Button size="sm" variant="danger" onClick={() => changeStatus('REJEITADO')} loading={mudandoStatus === 'REJEITADO'} disabled={mudandoStatus !== null}>Rejeitar</Button>
                        </>
                      )}
                    >
                      Este chamado de compra está aguardando sua aprovação.
                    </Notice>
                  )}

                  {!isApprovalStep && nextStatuses.length > 0 && (
                    <div className="stack">
                      {nextStatuses.map((s) => (
                        <Button
                          key={s}
                          variant={statusButtonVariant[s] ?? 'primary'}
                          onClick={() => changeStatus(s)}
                          loading={mudandoStatus === s}
                          disabled={mudandoStatus !== null}
                        >
                          {statusLabel[s] ?? s}
                        </Button>
                      ))}
                    </div>
                  )}

                  {!isApprovalStep && nextStatuses.length === 0 && !isAdmin && (
                    <p className="muted">Este chamado está encerrado; não há ações disponíveis.</p>
                  )}

                  {isAdmin && (
                    <Field label="Responsável" hint="Quem da equipe cuida deste chamado.">
                      {(ctl) => (
                        <select
                          {...ctl}
                          className="field"
                          value={ticket.assignee?.id ?? ''}
                          onChange={(e) => assignTicket(e.target.value || null)}
                        >
                          <option value="">Sem responsável</option>
                          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      )}
                    </Field>
                  )}
                </div>
              </Card>
            )}

            {isAdmin && (
              <Card title="Zona de risco">
                <p className="muted text-sm-2 mb-3">Excluir apaga o chamado e todo o histórico. Não dá para desfazer.</p>
                <Button variant="danger" onClick={deleteTicket}>Excluir chamado</Button>
              </Card>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}
