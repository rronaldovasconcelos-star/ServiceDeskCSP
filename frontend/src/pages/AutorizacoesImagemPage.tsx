import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileSignature, Upload } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { Button, EmptyState, Field, Notice } from '../components/ui';
import { formatDateTime } from '../lib/dates';
import { mensagemDeErro } from '../lib/beneficios';
import {
  listarMinhas, baixarModelo, enviarAssinado, baixarAssinado,
  ESTADO_LABEL, ESTADO_PILL, PDF_MAX_MB, URL_ASSINADOR, type MinhaAutorizacao,
} from '../lib/autorizacoes';

export default function AutorizacoesImagemPage() {
  const [itens, setItens] = useState<MinhaAutorizacao[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [versao, setVersao] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [arquivos, setArquivos] = useState<Record<string, File | null>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let vivo = true;
    listarMinhas()
      .then((r) => { if (vivo) { setItens(r); setLoadError(false); } })
      .catch(() => { if (vivo) setLoadError(true); });
    return () => { vivo = false; };
  }, [versao]);

  const recarregar = () => setVersao((v) => v + 1);
  const erroDe = (id: string, msg: string) => setErros((e) => ({ ...e, [id]: msg }));

  const baixar = async (d: MinhaAutorizacao) => {
    setBusy(`modelo-${d.id}`);
    erroDe(d.id, '');
    try {
      await baixarModelo(d);
      recarregar();
    } catch {
      erroDe(d.id, 'Não foi possível baixar o modelo.');
    } finally {
      setBusy(null);
    }
  };

  const escolher = (d: MinhaAutorizacao, file: File | null) => {
    if (file && file.size > PDF_MAX_MB * 1024 * 1024) {
      erroDe(d.id, `O arquivo tem mais de ${PDF_MAX_MB} MB.`);
      setArquivos((a) => ({ ...a, [d.id]: null }));
      return;
    }
    erroDe(d.id, '');
    setArquivos((a) => ({ ...a, [d.id]: file }));
  };

  const enviar = async (d: MinhaAutorizacao) => {
    const arquivo = arquivos[d.id];
    if (!arquivo) { erroDe(d.id, 'Escolha o arquivo assinado (PDF).'); return; }
    setBusy(`envio-${d.id}`);
    erroDe(d.id, '');
    setAviso('');
    try {
      await enviarAssinado(d.id, arquivo);
      setArquivos((a) => ({ ...a, [d.id]: null }));
      setAviso(`Arquivo assinado de "${d.titulo}" recebido. A gestão vai conferir a assinatura.`);
      recarregar();
    } catch (err) {
      erroDe(d.id, mensagemDeErro(err, 'Não foi possível enviar o arquivo.'));
    } finally {
      setBusy(null);
    }
  };

  const verMeuAssinado = async (d: MinhaAutorizacao) => {
    if (!d.envio) return;
    setBusy(`assinado-${d.id}`);
    try {
      await baixarAssinado(d.envio);
    } catch {
      erroDe(d.id, 'Não foi possível baixar o seu arquivo.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Autorização de imagem"
        description="Baixe o documento, assine pelo gov.br e envie o arquivo assinado"
      />

      <main className="page-body stack max-w-[860px]">
        {aviso && <Notice kind="success" onClose={() => setAviso('')}>{aviso}</Notice>}

        {loadError ? (
          <Notice kind="danger" actions={<Button size="sm" variant="secondary" onClick={recarregar}>Tentar novamente</Button>}>
            Não foi possível carregar as autorizações.
          </Notice>
        ) : itens === null ? (
          <div className="stack" aria-busy="true">
            <div className="skeleton h-[220px]" />
          </div>
        ) : itens.length === 0 ? (
          <div className="card">
            <EmptyState icon={<FileSignature size={22} />} title="Nenhuma autorização pendente">
              Quando a gestão publicar um documento para você assinar, ele aparece aqui.
            </EmptyState>
          </div>
        ) : (
          itens.map((d) => {
            const podeEnviar = !d.encerrado && (d.estado === 'BAIXOU' || d.estado === 'RECUSADO');
            return (
              <article key={d.id} className="card stack">
                <div className="row justify-between items-start flex-wrap">
                  <h2 className="card-title">{d.titulo}</h2>
                  <span className={`pill ${ESTADO_PILL[d.estado]}`}>
                    <span className="pill-dot" aria-hidden="true" />
                    {ESTADO_LABEL[d.estado]}
                  </span>
                </div>
                {d.descricao && <p className="text-sm-2 whitespace-pre-line text-(--text-2)">{d.descricao}</p>}

                {erros[d.id] && <Notice kind="danger">{erros[d.id]}</Notice>}
                {d.estado === 'RECUSADO' && d.envio?.motivoRecusa && (
                  <Notice kind="warning" title="O arquivo enviado foi recusado">
                    {d.envio.motivoRecusa} Assine novamente e envie outro arquivo.
                  </Notice>
                )}
                {d.estado === 'VALIDADO' && (
                  <Notice kind="success">
                    Autorização validada{d.envio?.conferidoEm ? ` em ${formatDateTime(d.envio.conferidoEm)}` : ''}. Não é preciso fazer mais nada.
                  </Notice>
                )}

                <ol className="stack">
                  <li className="stack gap-1">
                    <p className="font-semibold">1. Baixe o documento</p>
                    <div className="row flex-wrap">
                      <Button variant={d.baixouEm ? 'secondary' : 'primary'} size="sm" icon={<Download size={14} />} onClick={() => baixar(d)} loading={busy === `modelo-${d.id}`}>
                        {d.baixouEm ? 'Baixar de novo' : 'Baixar o documento'}
                      </Button>
                      {d.baixouEm && <span className="muted text-sm-2">Baixado em {formatDateTime(d.baixouEm)}</span>}
                    </div>
                  </li>
                  <li className="stack gap-1">
                    <p className="font-semibold">2. Assine pelo gov.br</p>
                    <p className="muted text-sm-2">
                      No assinador do governo, envie o PDF que você baixou, assine com a sua conta gov.br e baixe o arquivo assinado.
                    </p>
                    <div>
                      <a href={URL_ASSINADOR} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                        <ExternalLink size={14} aria-hidden="true" />
                        Abrir o assinador gov.br
                        <span className="sr-only"> (abre em nova aba)</span>
                      </a>
                    </div>
                  </li>
                  <li className="stack gap-1">
                    <p className="font-semibold">3. Envie o arquivo assinado</p>
                    {d.envio && (
                      <div className="row flex-wrap">
                        <span className="muted text-sm-2">
                          Enviado em {formatDateTime(d.envio.createdAt)}
                          {d.envio.dataDeclaradaPdf ? ` · assinatura declarada no PDF em ${formatDateTime(d.envio.dataDeclaradaPdf)}` : ''}
                        </span>
                        <Button variant="ghost" size="sm" icon={<Download size={14} />} onClick={() => verMeuAssinado(d)} loading={busy === `assinado-${d.id}`}>
                          Baixar o que enviei
                        </Button>
                      </div>
                    )}
                    {podeEnviar ? (
                      <>
                        <Field label="Arquivo assinado" hint={`Somente o PDF devolvido pelo assinador, até ${PDF_MAX_MB} MB. Foto ou digitalização não servem.`}>
                          {(ctl) => (
                            <input {...ctl} type="file" accept="application/pdf,.pdf" onChange={(e) => escolher(d, e.target.files?.[0] ?? null)} className="field" />
                          )}
                        </Field>
                        <div>
                          <Button variant="primary" size="sm" icon={<Upload size={14} />} onClick={() => enviar(d)} loading={busy === `envio-${d.id}`} disabled={!arquivos[d.id]}>
                            Enviar o arquivo assinado
                          </Button>
                        </div>
                      </>
                    ) : d.estado === 'NAO_BAIXOU' && !d.encerrado ? (
                      <p className="muted text-sm-2">Baixe o documento primeiro (passo 1).</p>
                    ) : d.estado === 'AGUARDANDO' ? (
                      <p className="muted text-sm-2">Recebemos o seu arquivo. Aguarde a conferência da gestão.</p>
                    ) : d.encerrado && d.estado !== 'VALIDADO' ? (
                      <p className="muted text-sm-2">Este documento foi encerrado e não recebe mais envios.</p>
                    ) : null}
                  </li>
                </ol>
              </article>
            );
          })
        )}
      </main>
    </>
  );
}
