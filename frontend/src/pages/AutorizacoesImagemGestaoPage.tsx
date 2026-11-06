import { useEffect, useState } from 'react';
import { Check, Download, ExternalLink, FileSignature, Plus, X } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { Button, Card, EmptyState, Field, Modal, Notice, Table } from '../components/ui';
import { formatDateTime } from '../lib/dates';
import { mensagemDeErro } from '../lib/beneficios';
import {
  listarGestao, publicarModelo, carregarPainel, definirEncerrado, validarEnvio, recusarEnvio, baixarAssinado, baixarModelo,
  ESTADO_LABEL, ESTADO_PILL, EVENTO_LABEL, PDF_MAX_MB, URL_VALIDADOR,
  type ColaboradorPainel, type DocumentoGestao, type EnvioAssinado, type PainelAutorizacao,
} from '../lib/autorizacoes';

const data = (iso: string | null | undefined) => (iso ? formatDateTime(iso) : '—');

export default function AutorizacoesImagemGestaoPage() {
  const [docs, setDocs] = useState<DocumentoGestao[] | null>(null);
  const [docId, setDocId] = useState('');
  const [painel, setPainel] = useState<PainelAutorizacao | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [versao, setVersao] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [pageError, setPageError] = useState('');

  // Publicar modelo
  const [showForm, setShowForm] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Recusar envio
  const [recusando, setRecusando] = useState<{ envio: EnvioAssinado; nome: string } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [motivoError, setMotivoError] = useState('');

  useEffect(() => {
    let vivo = true;
    listarGestao()
      .then((r) => {
        if (!vivo) return;
        setDocs(r);
        setLoadError(false);
        setDocId((atual) => (atual && r.some((d) => d.id === atual) ? atual : r[0]?.id ?? ''));
      })
      .catch(() => { if (vivo) setLoadError(true); });
    return () => { vivo = false; };
  }, [versao]);

  useEffect(() => {
    if (!docId) return;
    let vivo = true;
    carregarPainel(docId)
      .then((p) => { if (vivo) setPainel(p); })
      .catch(() => { if (vivo) setLoadError(true); });
    return () => { vivo = false; };
  }, [docId, versao]);

  const recarregar = () => { setLoadError(false); setVersao((v) => v + 1); };
  const escolherDoc = (id: string) => { setPainel(null); setDocId(id); };
  const painelAtual = painel && painel.documento.id === docId ? painel : null;

  const abrirForm = () => { setTitulo(''); setDescricao(''); setArquivo(null); setFormError(''); setShowForm(true); };
  const escolherArquivo = (file: File | null) => {
    if (file && file.size > PDF_MAX_MB * 1024 * 1024) {
      setFormError(`O arquivo tem mais de ${PDF_MAX_MB} MB.`);
      setArquivo(null);
      return;
    }
    setFormError('');
    setArquivo(file);
  };
  const publicar = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!arquivo) { setFormError('Escolha o modelo em PDF.'); return; }
    setSaving(true);
    setFormError('');
    try {
      const novo = await publicarModelo(titulo, descricao, arquivo);
      setShowForm(false);
      setPainel(null);
      setDocId(novo.id);
      recarregar();
    } catch (err) {
      setFormError(mensagemDeErro(err, 'Não foi possível publicar o modelo.'));
    } finally {
      setSaving(false);
    }
  };

  /** Executa uma ação da gestão mostrando o carregando no botão e o erro no topo. */
  const acao = async (chave: string, fn: () => Promise<void>, erroPadrao: string, recarregarDepois = true) => {
    setBusy(chave);
    setPageError('');
    try {
      await fn();
      if (recarregarDepois) recarregar();
    } catch (err) {
      setPageError(mensagemDeErro(err, erroPadrao));
    } finally {
      setBusy(null);
    }
  };

  const validar = (c: ColaboradorPainel) => {
    if (!c.envio) return;
    if (!window.confirm(`Confirmar que a assinatura de ${c.nome} foi conferida no validador oficial e está válida?`)) return;
    const id = c.envio.id;
    void acao(`validar-${id}`, () => validarEnvio(id), 'Não foi possível validar.');
  };

  const abrirRecusa = (c: ColaboradorPainel) => {
    if (!c.envio) return;
    setMotivo('');
    setMotivoError('');
    setRecusando({ envio: c.envio, nome: c.nome });
  };
  const confirmarRecusa = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!recusando) return;
    if (motivo.trim().length < 3) { setMotivoError('Explique o motivo: o colaborador vai ler este texto.'); return; }
    const id = recusando.envio.id;
    setRecusando(null);
    await acao(`recusar-${id}`, () => recusarEnvio(id, motivo.trim()), 'Não foi possível recusar.');
  };

  const acoesDe = (c: ColaboradorPainel) => c.envio && (
    <div className="row flex-wrap justify-end md:justify-start">
      <Button
        variant="ghost"
        size="sm"
        icon={<Download size={14} />}
        onClick={() => acao(`baixar-${c.envio!.id}`, () => baixarAssinado(c.envio!), 'Não foi possível baixar o arquivo.')}
        loading={busy === `baixar-${c.envio.id}`}
      >
        Baixar<span className="sr-only"> o arquivo assinado de {c.nome}</span>
      </Button>
      {c.envio.status === 'AGUARDANDO' && (
        <>
          <Button variant="secondary" size="sm" icon={<Check size={14} />} onClick={() => validar(c)} loading={busy === `validar-${c.envio.id}`}>
            Validar<span className="sr-only"> a assinatura de {c.nome}</span>
          </Button>
          <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={() => abrirRecusa(c)} loading={busy === `recusar-${c.envio.id}`}>
            Recusar<span className="sr-only"> o arquivo de {c.nome}</span>
          </Button>
        </>
      )}
    </div>
  );

  const pill = (c: ColaboradorPainel) => (
    <span className={`pill ${ESTADO_PILL[c.estado]}`}>
      <span className="pill-dot" aria-hidden="true" />
      {ESTADO_LABEL[c.estado]}
    </span>
  );

  const cabecalho = (
    <tr>
      <th>Colaborador</th>
      <th>Situação</th>
      <th>Baixou o modelo</th>
      <th>Enviou o assinado</th>
      <th>Assinatura (declarada no PDF)</th>
      <th><span className="sr-only">Ações</span></th>
    </tr>
  );

  const botaoPublicar = <Button variant="primary" icon={<Plus size={16} />} onClick={abrirForm}>Publicar modelo</Button>;
  const total = painelAtual?.colaboradores.length ?? 0;
  const validados = painelAtual?.colaboradores.filter((c) => c.estado === 'VALIDADO').length ?? 0;

  return (
    <>
      <PageHeader
        title="Autorizações de imagem · Gestão"
        description="Publique o modelo, acompanhe quem baixou e assinou, e confira as assinaturas"
        actions={botaoPublicar}
      />

      <main className="page-body stack">
        <Modal
          open={showForm}
          title="Publicar modelo"
          onClose={() => setShowForm(false)}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" variant="primary" form="form-modelo" loading={saving}>{saving ? 'Publicando...' : 'Publicar'}</Button>
            </>
          )}
        >
          <form id="form-modelo" onSubmit={publicar} className="stack">
            {formError && <Notice kind="danger">{formError}</Notice>}
            <Notice kind="info">
              O modelo não pode ser trocado depois de publicado: cada assinatura fica ligada a este arquivo. Para mudar o texto, publique um novo documento.
            </Notice>
            <Field label="Título" required>
              {(ctl) => (
                <input {...ctl} value={titulo} onChange={(e) => setTitulo(e.target.value)} required minLength={3} maxLength={150} placeholder="Ex.: Autorização de uso de imagem 2027" className="field" data-autofocus />
              )}
            </Field>
            <Field label="Orientações" hint="Opcional. Aparece para o colaborador junto do documento.">
              {(ctl) => (
                <textarea {...ctl} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={1000} rows={3} className="field" />
              )}
            </Field>
            <Field label="Modelo em PDF" required hint={`Somente PDF, até ${PDF_MAX_MB} MB.`}>
              {(ctl) => (
                <input {...ctl} type="file" accept="application/pdf,.pdf" onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)} className="field" />
              )}
            </Field>
          </form>
        </Modal>

        <Modal
          open={recusando !== null}
          title={`Recusar o arquivo de ${recusando?.nome ?? ''}`}
          onClose={() => setRecusando(null)}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setRecusando(null)}>Cancelar</Button>
              <Button type="submit" variant="danger" form="form-recusa">Recusar arquivo</Button>
            </>
          )}
        >
          <form id="form-recusa" onSubmit={confirmarRecusa} className="stack">
            <Field label="Motivo" required error={motivoError || undefined} hint="O colaborador vê este texto e poderá enviar outro arquivo.">
              {(ctl) => (
                <textarea {...ctl} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={3} placeholder="Ex.: a assinatura não foi reconhecida pelo validador." className="field" data-autofocus />
              )}
            </Field>
          </form>
        </Modal>

        {pageError && <Notice kind="danger" onClose={() => setPageError('')}>{pageError}</Notice>}

        {loadError ? (
          <Notice kind="danger" actions={<Button size="sm" variant="secondary" onClick={recarregar}>Tentar novamente</Button>}>
            Não foi possível carregar as autorizações.
          </Notice>
        ) : docs === null ? (
          <div className="skeleton h-[220px]" aria-busy="true" />
        ) : docs.length === 0 ? (
          <div className="card">
            <EmptyState icon={<FileSignature size={22} />} title="Nenhum modelo publicado ainda" action={botaoPublicar}>
              Publique o PDF da autorização. Quem o administrador marcar em Usuários com “Autorização de imagem” vai recebê-lo para assinar.
            </EmptyState>
          </div>
        ) : (
          <>
            <Card>
              <div className="stack">
                <Field label="Documento">
                  {(ctl) => (
                    <select {...ctl} value={docId} onChange={(e) => escolherDoc(e.target.value)} className="field">
                      {docs.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.titulo}{d.encerrado ? ' (encerrado)' : ''} · {d.aguardando} aguardando, {d.validados} validados
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                {painelAtual && (
                  <>
                    <p className="muted text-sm-2">
                      Publicado por {painelAtual.documento.publicadoPorNome} em {data(painelAtual.documento.createdAt)} · {validados} de {total} validados
                      {painelAtual.documento.encerrado ? ' · encerrado, não recebe novos envios' : ''}
                    </p>
                    <div className="row flex-wrap">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Download size={14} />}
                        onClick={() => acao('modelo', () => baixarModelo(painelAtual.documento), 'Não foi possível baixar o modelo.', false)}
                        loading={busy === 'modelo'}
                      >
                        Baixar o modelo
                      </Button>
                      <a href={URL_VALIDADOR} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                        <ExternalLink size={14} aria-hidden="true" />
                        Abrir o validador oficial
                        <span className="sr-only"> (abre em nova aba)</span>
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => acao('encerrar', () => definirEncerrado(docId, !painelAtual.documento.encerrado), 'Não foi possível alterar o documento.')}
                        loading={busy === 'encerrar'}
                      >
                        {painelAtual.documento.encerrado ? 'Reabrir para envios' : 'Encerrar envios'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </Card>

            <Notice kind="info" title="Como conferir">
              O portal só aceita PDF que contém uma assinatura digital, mas não confirma sozinho que ela é válida. Baixe o arquivo, envie ao validador oficial e só então marque como validado.
            </Notice>

            {!painelAtual ? (
              <Table head={cabecalho} loading rows={4} cols={6} />
            ) : (
              <>
                <div className="hidden md:block">
                  <Table
                    head={cabecalho}
                    isEmpty={painelAtual.colaboradores.length === 0}
                    empty={(
                      <EmptyState title="Ninguém marcado para assinar">
                        Em Usuários, marque “Autorização de imagem” para quem precisa assinar este documento.
                      </EmptyState>
                    )}
                  >
                    {painelAtual.colaboradores.map((c) => (
                      <tr key={c.usuarioId}>
                        <td>
                          <p className="font-medium">{c.nome}</p>
                          <p className="muted text-xs">{c.email}</p>
                        </td>
                        <td>
                          {pill(c)}
                          {c.estado === 'RECUSADO' && c.envio?.motivoRecusa && <p className="muted text-xs mt-1">{c.envio.motivoRecusa}</p>}
                          {c.envio?.conferidoPorNome && <p className="muted text-xs mt-1">por {c.envio.conferidoPorNome}, {data(c.envio.conferidoEm)}</p>}
                        </td>
                        <td className="whitespace-nowrap">{data(c.baixouEm)}</td>
                        <td className="whitespace-nowrap">{data(c.envio?.createdAt)}</td>
                        <td className="whitespace-nowrap">{data(c.envio?.dataDeclaradaPdf)}</td>
                        <td>{acoesDe(c)}</td>
                      </tr>
                    ))}
                  </Table>
                </div>
                <div className="md:hidden stack">
                  {painelAtual.colaboradores.length === 0 && (
                    <div className="card">
                      <EmptyState title="Ninguém marcado para assinar">
                        Em Usuários, marque “Autorização de imagem” para quem precisa assinar este documento.
                      </EmptyState>
                    </div>
                  )}
                  {painelAtual.colaboradores.map((c) => (
                    <div key={c.usuarioId} className="ticket-card">
                      <p className="ticket-card-title">{c.nome}</p>
                      <div className="ticket-card-meta">{pill(c)}</div>
                      <p className="ticket-card-sub">Baixou: {data(c.baixouEm)}</p>
                      <p className="ticket-card-sub">Enviou: {data(c.envio?.createdAt)}</p>
                      <p className="ticket-card-sub mb-2">Assinatura declarada no PDF: {data(c.envio?.dataDeclaradaPdf)}</p>
                      {c.estado === 'RECUSADO' && c.envio?.motivoRecusa && <p className="ticket-card-sub mb-2">Motivo: {c.envio.motivoRecusa}</p>}
                      {acoesDe(c)}
                    </div>
                  ))}
                </div>

                <Card title="Histórico">
                  {painelAtual.eventos.length === 0 ? (
                    <p className="muted text-sm-2">Nenhum registro ainda.</p>
                  ) : (
                    <ul className="stack gap-1">
                      {painelAtual.eventos.map((ev) => (
                        <li key={ev.id} className="text-sm-2">
                          <span className="muted tabular-nums">{data(ev.createdAt)}</span> · <strong>{ev.atorNome}</strong> {EVENTO_LABEL[ev.tipo] ?? ev.tipo}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
