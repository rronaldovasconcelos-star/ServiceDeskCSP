import { useEffect, useState } from 'react';
import { CalendarCheck, CalendarX, DoorOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import { Button, Card, EmptyState, Field, Notice, Table } from '../components/ui';
import { mensagemDeErro } from '../lib/beneficios';
import {
  listarSalas, agendaDoDia, minhasReservas, reservarSala, cancelarReserva,
  hojeLocal, instante, faixaHoraria, diaPorExtenso, type Reserva, type Sala,
} from '../lib/salas';

export default function AgendamentoSalasPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [salas, setSalas] = useState<Sala[]>([]);
  const [data, setData] = useState(hojeLocal);
  const [agenda, setAgenda] = useState<Reserva[] | null>(null);
  const [minhas, setMinhas] = useState<Reserva[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  /** Muda a cada reserva/cancelamento para recarregar agenda e "minhas reservas". */
  const [versao, setVersao] = useState(0);
  /** Relógio usado para saber o que já terminou; atualizado a cada recarga. */
  const [agora, setAgora] = useState(() => Date.now());

  const [salaId, setSalaId] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFim, setHoraFim] = useState('');
  const [finalidade, setFinalidade] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    listarSalas()
      .then((r) => { setSalas(r); setSalaId((atual) => atual || r[0]?.id || ''); })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    let vivo = true;
    agendaDoDia(data)
      .then((r) => { if (vivo) { setAgenda(r); setLoadError(false); } })
      .catch(() => { if (vivo) setLoadError(true); });
    return () => { vivo = false; };
  }, [data, versao]);

  useEffect(() => {
    let vivo = true;
    minhasReservas()
      .then((r) => { if (vivo) { setMinhas(r); setAgora(Date.now()); } })
      .catch(() => { if (vivo) setLoadError(true); });
    return () => { vivo = false; };
  }, [versao]);

  const mudarData = (nova: string) => {
    if (!nova) return;
    setAgenda(null);
    setData(nova);
  };
  const recarregar = () => { setLoadError(false); setVersao((v) => v + 1); };
  const nomeDaSala = (id: string) => salas.find((s) => s.id === id)?.nome ?? 'Sala';

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setFormError('');
    setConfirmacao('');
    const inicio = instante(data, horaInicio);
    const fim = instante(data, horaFim);
    if (!inicio || !fim) { setFormError('Informe a data e os dois horários.'); return; }
    if (fim <= inicio) { setFormError('O horário de término precisa ser depois do início.'); return; }
    setSaving(true);
    try {
      const r = await reservarSala({ salaId, inicio, fim, finalidade });
      setConfirmacao(`Reserva confirmada: ${nomeDaSala(r.salaId)}, ${diaPorExtenso(r.inicio)}, das ${faixaHoraria(r)}.`);
      setHoraInicio('');
      setHoraFim('');
      setFinalidade('');
      setVersao((v) => v + 1);
    } catch (err) {
      setFormError(mensagemDeErro(err, 'Não foi possível reservar a sala.'));
    } finally {
      setSaving(false);
    }
  };

  const cancelar = async (r: Reserva) => {
    if (!window.confirm(`Cancelar a reserva de ${nomeDaSala(r.salaId)} em ${diaPorExtenso(r.inicio)}, das ${faixaHoraria(r)}?`)) return;
    setBusyId(r.id);
    setPageError('');
    setConfirmacao('');
    try {
      await cancelarReserva(r.id);
      setVersao((v) => v + 1);
    } catch (err) {
      setPageError(mensagemDeErro(err, 'Não foi possível cancelar a reserva.'));
    } finally {
      setBusyId(null);
    }
  };

  const podeCancelar = (r: Reserva) => r.status === 'CONFIRMADA' && new Date(r.fim).getTime() > agora && (r.minha || isAdmin);
  const botaoCancelar = (r: Reserva) => podeCancelar(r) && (
    <Button variant="ghost" size="sm" icon={<CalendarX size={14} />} onClick={() => cancelar(r)} loading={busyId === r.id}>
      Cancelar<span className="sr-only"> reserva de {nomeDaSala(r.salaId)} das {faixaHoraria(r)}</span>
    </Button>
  );

  const statusPill = (r: Reserva) => {
    const cancelada = r.status === 'CANCELADA';
    const passada = !cancelada && new Date(r.fim).getTime() <= agora;
    return (
      <span className={`pill ${cancelada ? 'pill-coral' : passada ? 'pill-muted' : 'pill-teal'}`}>
        <span className="pill-dot" aria-hidden="true" />
        {cancelada ? 'Cancelada' : passada ? 'Encerrada' : 'Confirmada'}
      </span>
    );
  };

  const cabecalhoMinhas = (
    <tr>
      <th>Sala</th>
      <th>Dia</th>
      <th>Horário</th>
      <th>Finalidade</th>
      <th>Situação</th>
      <th><span className="sr-only">Ações</span></th>
    </tr>
  );

  return (
    <>
      <PageHeader
        title="Agendamento de salas"
        description="Reserve a Sala Maker, o Laboratório de Ciências, a Biblioteca ou a Sala de Reuniões"
      />

      <main className="page-body stack">
        {loadError && (
          <Notice kind="danger" actions={<Button size="sm" variant="secondary" onClick={recarregar}>Tentar novamente</Button>}>
            Não foi possível carregar o agendamento.
          </Notice>
        )}
        {pageError && <Notice kind="danger" onClose={() => setPageError('')}>{pageError}</Notice>}

        <Card title="Nova reserva">
          <form onSubmit={handleSubmit} className="stack">
            {formError && <Notice kind="danger">{formError}</Notice>}
            {confirmacao && <Notice kind="success" onClose={() => setConfirmacao('')}>{confirmacao}</Notice>}
            <div className="form-grid-2">
              <Field label="Sala" required>
                {(ctl) => (
                  <select {...ctl} value={salaId} onChange={(e) => setSalaId(e.target.value)} required className="field">
                    {salas.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Dia" required hint="A agenda abaixo mostra as reservas deste dia.">
                {(ctl) => (
                  <input {...ctl} type="date" value={data} min={hojeLocal()} onChange={(e) => mudarData(e.target.value)} required className="field" />
                )}
              </Field>
              <Field label="Início" required>
                {(ctl) => (
                  <input {...ctl} type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} required className="field" />
                )}
              </Field>
              <Field label="Término" required>
                {(ctl) => (
                  <input {...ctl} type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} required className="field" />
                )}
              </Field>
            </div>
            <Field label="Finalidade" required hint="Turma, atividade ou reunião.">
              {(ctl) => (
                <input {...ctl} value={finalidade} onChange={(e) => setFinalidade(e.target.value)} required minLength={3} maxLength={200} placeholder="Ex.: 5º ano B, aula de robótica" className="field" />
              )}
            </Field>
            <div className="form-actions">
              <Button type="submit" variant="primary" icon={<CalendarCheck size={16} />} loading={saving} disabled={!salaId}>
                {saving ? 'Reservando...' : 'Reservar'}
              </Button>
            </div>
          </form>
        </Card>

        <section className="stack" aria-labelledby="agenda-titulo">
          <div className="section-head">
            <h2 id="agenda-titulo" className="card-title">Agenda de {diaPorExtenso(`${data}T12:00:00`)}</h2>
          </div>
          {agenda === null ? (
            <div className="grid-auto" aria-busy="true">
              <div className="skeleton h-[140px]" />
              <div className="skeleton h-[140px]" />
              <div className="skeleton h-[140px]" />
              <div className="skeleton h-[140px]" />
            </div>
          ) : (
            <div className="grid-auto">
              {salas.map((s) => {
                const doDia = agenda.filter((r) => r.salaId === s.id);
                return (
                  <article key={s.id} className="card stack">
                    <h3 className="card-title">{s.nome}</h3>
                    {doDia.length === 0 ? (
                      <p className="muted text-sm-2">Livre o dia todo.</p>
                    ) : (
                      <ul className="stack">
                        {doDia.map((r) => (
                          <li key={r.id} className="stack gap-1">
                            <p className="font-semibold tabular-nums">{faixaHoraria(r)}</p>
                            <p className="text-sm-2 break-words">{r.finalidade}</p>
                            <p className="muted text-sm-2">{r.minha ? 'Reservado por você' : `Reservado por ${r.usuarioNome}`}</p>
                            <div>{botaoCancelar(r)}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="stack" aria-labelledby="minhas-titulo">
          <div className="section-head">
            <h2 id="minhas-titulo" className="card-title">Minhas reservas</h2>
          </div>
          {minhas === null ? (
            <Table head={cabecalhoMinhas} loading rows={3} cols={6} />
          ) : minhas.length === 0 ? (
            <div className="card">
              <EmptyState icon={<DoorOpen size={22} />} title="Você ainda não reservou nenhuma sala">
                Use o formulário acima para fazer a primeira reserva.
              </EmptyState>
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <Table head={cabecalhoMinhas}>
                  {minhas.map((r) => (
                    <tr key={r.id}>
                      <td className="font-medium">{nomeDaSala(r.salaId)}</td>
                      <td className="whitespace-nowrap">{diaPorExtenso(r.inicio)}</td>
                      <td className="whitespace-nowrap tabular-nums">{faixaHoraria(r)}</td>
                      <td className="muted">{r.finalidade}</td>
                      <td>{statusPill(r)}</td>
                      <td className="text-right">{botaoCancelar(r)}</td>
                    </tr>
                  ))}
                </Table>
              </div>
              <div className="md:hidden stack">
                {minhas.map((r) => (
                  <div key={r.id} className="ticket-card">
                    <p className="ticket-card-title">{nomeDaSala(r.salaId)}</p>
                    <div className="ticket-card-meta">
                      {statusPill(r)}
                      <span className="pill pill-muted">{diaPorExtenso(r.inicio)}</span>
                      <span className="pill pill-muted">{faixaHoraria(r)}</span>
                    </div>
                    <p className="ticket-card-sub mb-2">{r.finalidade}</p>
                    {botaoCancelar(r)}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </>
  );
}
