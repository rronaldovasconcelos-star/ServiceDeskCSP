import { Fragment, useEffect, useId, useRef, useState } from 'react';
import {
  Upload, CloudDownload, RefreshCw, Users, History,
  Link2, Pencil, Save, X, Download, MessageSquareText, Trash2, Inbox,
} from 'lucide-react';
import api from '../lib/api';
import { formatarCentavos, formatarCompetencia, baixarHoleritePdf, type HoleriteResumo } from '../lib/holerites';
import PageHeader from '../components/PageHeader';
import { Button, Card, EmptyState, Field, IconTile, Notice, Table } from '../components/ui';
import { onTabsKeyDown } from '../lib/a11y';

// ---------- tipos ----------

interface ResultadoImportacao {
  importacaoId: string;
  arquivo: string;
  origem: 'UPLOAD' | 'DRIVE';
  competencias: string[];
  totalHolerites: number;
  novosColaboradores: number;
  semVinculo: Array<{ codigo: string; nome: string }>;
}

interface ResultadoDrive {
  importados: ResultadoImportacao[];
  erros: Array<{ arquivo: string; erro: string }>;
  ignorados: number;
}

interface ArquivoDrive {
  id: string;
  name: string;
  sizeBytes: number;
  modifiedTime: string;
  importadoEm: string | null;
}

interface EstadoDrive {
  configured: boolean;
  pasta: string;
  intervaloMin: number;
  arquivos: ArquivoDrive[];
}

interface UsuarioVinculo {
  id: string;
  name: string;
  email: string;
  colaborador: { id: string; codigo: string; nome: string } | null;
}

interface Colaborador {
  id: string;
  codigo: string;
  nome: string;
  userId: string | null;
  cpf: string | null;
  ctps: string | null;
  admissao: string | null;
  cargoCodigo: string | null;
  deptoCodigo: string | null;
  user: { id: string; name: string; email: string; isActive: boolean } | null;
  totalHolerites: number;
  ultimaCompetencia: string | null;
}

interface Importacao {
  id: string;
  arquivo: string;
  origem: 'UPLOAD' | 'DRIVE';
  competencias: string[];
  totalHolerites: number;
  novosColaboradores: number;
  atorNome: string;
  createdAt: string;
}

type EscopoMensagem = 'GERAL' | 'INDIVIDUAL';

interface Mensagem {
  id: string;
  escopo: EscopoMensagem;
  colaboradorId: string | null;
  competencia: string | null; // null = todos os meses
  texto: string;
  atorNome: string;
  createdAt: string;
  updatedAt: string;
  colaborador: { id: string; codigo: string; nome: string } | null;
}

/** Mesmo limite do backend (LIMITE_MENSAGEM); a caixa do PDF é fixa. */
const LIMITE_MENSAGEM = 120;

type Aba = 'importar' | 'colaboradores' | 'mensagens' | 'importacoes';

// ---------- apoio ----------

/* Tabelas, cards, avisos e botões vêm de components/ui. Células de linhas com
   conteúdo expansível ficam alinhadas ao topo (`align-top`). */
const TD_TOP = 'align-top';

function mensagemErro(err: unknown, padrao: string): string {
  const e = err as { response?: { data?: { error?: string; details?: Record<string, string[]> } } };
  const details = e?.response?.data?.details;
  if (details) {
    const primeira = Object.values(details).flat()[0];
    if (primeira) return primeira;
  }
  return e?.response?.data?.error ?? padrao;
}

/** Título de card com ícone em tile, no padrão das outras telas. */
function TituloCard({ icone, children }: { icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="card-title flex items-center gap-2.5">
      <IconTile size={32}>{icone}</IconTile>
      {children}
    </h2>
  );
}

function ResumoImportacao({ r, onVerColaboradores }: { r: ResultadoImportacao; onVerColaboradores: () => void }) {
  return (
    <div>
      <strong>{r.arquivo}</strong> importado: {r.totalHolerites} holerite(s) de{' '}
      {r.competencias.map(formatarCompetencia).join(', ')}
      {r.novosColaboradores > 0 && <>, {r.novosColaboradores} colaborador(es) novo(s)</>}.
      {r.semVinculo.length > 0 && (
        <p className="mt-1.5">
          {r.semVinculo.length} colaborador(es) sem login vinculado — eles ainda não veem o holerite:{' '}
          {r.semVinculo.map((c) => c.nome).join(', ')}.{' '}
          <button type="button" onClick={onVerColaboradores} className="cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-[length:inherit] font-semibold text-inherit underline">Vincular agora</button>
        </p>
      )}
    </div>
  );
}

/** Texto de "carregando" com esqueleto, para listas curtas sem tabela. */
function Carregando({ texto = 'Carregando...' }: { texto?: string }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="skeleton skeleton-row w-2/3" />
      <div className="skeleton skeleton-row w-1/2" />
      <p className="sr-only">{texto}</p>
    </div>
  );
}

// ---------- página ----------

const ABAS: Array<[Aba, string, typeof Upload]> = [
  ['importar', 'Importar', Upload],
  ['colaboradores', 'Colaboradores e vínculos', Users],
  ['mensagens', 'Mensagens', MessageSquareText],
  ['importacoes', 'Histórico', History],
];

export default function HoleritesRhPage() {
  const [aba, setAba] = useState<Aba>('importar');
  const idBase = useId();
  const idAba = (k: Aba) => `${idBase}-aba-${k}`;
  const idPainel = (k: Aba) => `${idBase}-painel-${k}`;

  return (
    <>
      <PageHeader
        title="RH · Holerites"
        description="Importe o TXT da folha, vincule cada colaborador ao login dele e o portal gera o PDF. Em Mensagens, o que sai no campo Observações."
      />

      <div className="page-body max-w-[1400px]">
        <div className="tabs mb-4" role="tablist" aria-label="Seções do RH de holerites" onKeyDown={onTabsKeyDown}>
          {ABAS.map(([k, label, Icone]) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={idAba(k)}
              aria-selected={aba === k}
              aria-controls={idPainel(k)}
              tabIndex={aba === k ? 0 : -1}
              onClick={() => setAba(k)}
              className={`tab${aba === k ? ' active' : ''}`}
            >
              <Icone size={14} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={idPainel(aba)} aria-labelledby={idAba(aba)}>
          {aba === 'importar' && <AbaImportar irParaColaboradores={() => setAba('colaboradores')} />}
          {aba === 'colaboradores' && <AbaColaboradores />}
          {aba === 'mensagens' && <AbaMensagens />}
          {aba === 'importacoes' && <AbaImportacoes />}
        </div>
      </div>
    </>
  );
}

// ---------- aba Importar ----------

function AbaImportar({ irParaColaboradores }: { irParaColaboradores: () => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [drive, setDrive] = useState<EstadoDrive | null>(null);
  const [driveLoading, setDriveLoading] = useState(true);
  const [driveBusy, setDriveBusy] = useState<string | null>(null); // fileId ou 'todos'
  const [driveErro, setDriveErro] = useState('');
  const [driveResultado, setDriveResultado] = useState<ResultadoDrive | null>(null);

  const carregarDrive = () => {
    setDriveLoading(true);
    setDriveErro('');
    api.get<EstadoDrive>('/holerites/rh/drive')
      .then((r) => setDrive(r.data))
      .catch((err) => setDriveErro(mensagemErro(err, 'Não foi possível consultar o Google Drive.')))
      .finally(() => setDriveLoading(false));
  };

  useEffect(() => { carregarDrive(); }, []);

  const enviar = async () => {
    if (!arquivo) return;
    setEnviando(true);
    setErro('');
    setResultado(null);
    try {
      const form = new FormData();
      form.append('arquivo', arquivo);
      const r = await api.post<ResultadoImportacao>('/holerites/rh/importar', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResultado(r.data);
      setArquivo(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setErro(mensagemErro(err, 'Falha ao importar o arquivo.'));
    } finally {
      setEnviando(false);
    }
  };

  const importarDrive = async (fileId?: string) => {
    setDriveBusy(fileId ?? 'todos');
    setDriveErro('');
    setDriveResultado(null);
    try {
      const r = await api.post<ResultadoDrive>('/holerites/rh/drive/importar', fileId ? { fileId } : {});
      setDriveResultado(r.data);
      carregarDrive();
    } catch (err) {
      setDriveErro(mensagemErro(err, 'Falha ao importar do Google Drive.'));
    } finally {
      setDriveBusy(null);
    }
  };

  const cabecalhoDrive = (
    <tr>
      <th>Arquivo</th>
      <th>Modificado</th>
      <th>Situação</th>
      <th><span className="sr-only">Ações</span></th>
    </tr>
  );

  return (
    <div className="stack gap-4">
      {/* Google Drive */}
      <Card>
        <div className="section-head items-center">
          <TituloCard icone={<CloudDownload size={16} />}>Pasta no Google Drive</TituloCard>
          <div className="row">
            <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={carregarDrive} disabled={driveLoading}>Atualizar</Button>
            <Button size="sm" icon={<CloudDownload size={14} />} onClick={() => importarDrive()} disabled={!drive?.configured || (driveBusy !== null && driveBusy !== 'todos')} loading={driveBusy === 'todos'}>
              {driveBusy === 'todos' ? 'Importando...' : 'Importar novos'}
            </Button>
          </div>
        </div>

        {driveLoading ? (
          <Carregando texto="Consultando o Drive..." />
        ) : !drive?.configured ? (
          <Notice kind="warning">Google Drive não está configurado neste ambiente. Use o upload manual abaixo.</Notice>
        ) : (
          <div className="stack gap-3">
            <p className="text-xs text-(--text-2)">
              Salve o TXT exportado da folha na pasta <strong>{drive.pasta}</strong> do Drive do portal.
              {drive.intervaloMin > 0
                ? <> O portal confere a pasta a cada {drive.intervaloMin} min e importa o que for novo; se não quiser esperar, clique em “Importar novos”.</>
                : <> A importação automática está desligada — clique em “Importar novos” depois de salvar o arquivo.</>}
            </p>
            {driveErro && (
              <Notice kind="danger" actions={<Button variant="secondary" size="sm" onClick={carregarDrive}>Tentar novamente</Button>}>{driveErro}</Notice>
            )}
            {driveResultado && (
              <>
                {driveResultado.importados.map((r) => (
                  <Notice key={r.importacaoId} kind="success"><ResumoImportacao r={r} onVerColaboradores={irParaColaboradores} /></Notice>
                ))}
                {driveResultado.erros.map((e) => (
                  <Notice key={e.arquivo} kind="danger"><strong>{e.arquivo}</strong>: {e.erro}</Notice>
                ))}
                {driveResultado.importados.length === 0 && driveResultado.erros.length === 0 && (
                  <Notice kind="warning" onClose={() => setDriveResultado(null)}>Nenhum arquivo novo na pasta ({driveResultado.ignorados} já importado(s)).</Notice>
                )}
              </>
            )}
            <Table
              head={cabecalhoDrive}
              isEmpty={drive.arquivos.length === 0}
              empty="Nenhum arquivo .txt na pasta."
            >
              {drive.arquivos.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td className="whitespace-nowrap text-(--text-2)">
                    {a.modifiedTime ? new Date(a.modifiedTime).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </td>
                  <td className="whitespace-nowrap">
                    {a.importadoEm
                      ? <span className="pill pill-teal">Importado em {new Date(a.importadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      : <span className="pill pill-amber">Pendente</span>}
                  </td>
                  <td className="text-right">
                    <Button variant="ghost" size="sm" icon={<CloudDownload size={13} />} onClick={() => importarDrive(a.id)} disabled={driveBusy !== null && driveBusy !== a.id} loading={driveBusy === a.id}>
                      {a.importadoEm ? 'Reimportar' : 'Importar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Card>

      {/* Upload manual */}
      <Card>
        <TituloCard icone={<Upload size={16} />}>Enviar arquivo manualmente</TituloCard>
        <p className="mb-3 text-xs text-(--text-2)">
          Aceita o .txt exportado da folha. O arquivo é conferido inteiro antes de entrar: se alguma soma não bater, nada é gravado e o motivo aparece aqui.
          Reimportar a mesma competência substitui os holerites daquele mês.
        </p>
        {erro && <Notice kind="danger" className="mb-3" onClose={() => setErro('')}>{erro}</Notice>}
        {resultado && <Notice kind="success" className="mb-3" onClose={() => setResultado(null)}><ResumoImportacao r={resultado} onVerColaboradores={irParaColaboradores} /></Notice>}
        <form className="row items-end gap-2" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
          <Field label="Arquivo TXT da folha" className="min-w-60 flex-1">
            {(ctl) => (
              <input
                {...ctl}
                ref={inputRef}
                type="file"
                accept=".txt,text/plain"
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                className="field"
              />
            )}
          </Field>
          <Button type="submit" variant="secondary" icon={<Upload size={14} />} disabled={!arquivo} loading={enviando}>
            {enviando ? 'Importando...' : 'Importar'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

// ---------- aba Colaboradores ----------

const CAMPOS_PDF: Array<[keyof FormDadosPdf, string, string]> = [
  ['cpf', 'CPF', '000.000.000-00'],
  ['ctps', 'CTPS', '0000000 / 00000'],
  ['admissao', 'Admissão', 'dd/mm/aaaa'],
  ['cargoCodigo', 'Código do cargo', '0005'],
  ['deptoCodigo', 'Código do depto.', '000005'],
];
interface FormDadosPdf { cpf: string; ctps: string; admissao: string; cargoCodigo: string; deptoCodigo: string }

function AbaColaboradores() {
  const [lista, setLista] = useState<Colaborador[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioVinculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<FormDadosPdf>({ cpf: '', ctps: '', admissao: '', cargoCodigo: '', deptoCodigo: '' });
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [holeritesDe, setHoleritesDe] = useState<Record<string, HoleriteResumo[]>>({});
  const [filtro, setFiltro] = useState('');

  const carregar = () => {
    setLoading(true);
    setErro('');
    Promise.all([
      api.get<Colaborador[]>('/holerites/rh/colaboradores'),
      api.get<UsuarioVinculo[]>('/holerites/rh/usuarios'),
    ])
      .then(([c, u]) => { setLista(c.data); setUsuarios(u.data); })
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar os colaboradores.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { carregar(); }, []);

  const vincular = async (c: Colaborador, userId: string) => {
    setBusyId(c.id);
    setErro('');
    setOk('');
    try {
      await api.put(`/holerites/rh/colaboradores/${c.id}/vinculo`, { userId: userId || null });
      setOk(userId ? `${c.nome} vinculado.` : `Vínculo de ${c.nome} desfeito.`);
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Falha ao salvar o vínculo.'));
    } finally {
      setBusyId(null);
    }
  };

  const abrirEdicao = (c: Colaborador) => {
    setEditando(c.id);
    setForm({ cpf: c.cpf ?? '', ctps: c.ctps ?? '', admissao: c.admissao ?? '', cargoCodigo: c.cargoCodigo ?? '', deptoCodigo: c.deptoCodigo ?? '' });
  };

  const salvarDados = async (c: Colaborador) => {
    setBusyId(c.id);
    setErro('');
    setOk('');
    try {
      await api.put(`/holerites/rh/colaboradores/${c.id}/dados`, form);
      setOk(`Dados de ${c.nome} salvos.`);
      setEditando(null);
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Falha ao salvar os dados.'));
    } finally {
      setBusyId(null);
    }
  };

  const alternarHolerites = async (c: Colaborador) => {
    if (abertoId === c.id) { setAbertoId(null); return; }
    setAbertoId(c.id);
    if (!holeritesDe[c.id]) {
      try {
        const r = await api.get<{ holerites: HoleriteResumo[] }>(`/holerites/rh/colaboradores/${c.id}/holerites`);
        setHoleritesDe((h) => ({ ...h, [c.id]: r.data.holerites }));
      } catch (err) {
        setErro(mensagemErro(err, 'Falha ao listar os holerites.'));
      }
    }
  };

  const f = filtro.trim().toLowerCase();
  const visiveis = f
    ? lista.filter((c) => c.nome.toLowerCase().includes(f) || c.codigo.includes(f) || c.user?.name.toLowerCase().includes(f) || c.user?.email.toLowerCase().includes(f))
    : lista;
  const semVinculo = lista.filter((c) => !c.userId).length;

  const cabecalho = (
    <tr>
      <th>Código</th>
      <th>Nome (folha)</th>
      <th>Login no portal</th>
      <th>Holerites</th>
      <th>Dados do PDF</th>
    </tr>
  );

  return (
    <div className="stack gap-3">
      {erro && (
        <Notice kind="danger" onClose={() => setErro('')} actions={<Button variant="secondary" size="sm" onClick={carregar}>Tentar novamente</Button>}>{erro}</Notice>
      )}
      {ok && <Notice kind="success" onClose={() => setOk('')}>{ok}</Notice>}
      {!loading && semVinculo > 0 && (
        <Notice kind="warning">{semVinculo} colaborador(es) sem login vinculado — eles não conseguem ver o próprio holerite até o vínculo ser feito.</Notice>
      )}

      <div className="toolbar mb-0 items-center">
        <Field label="Buscar" className="w-full max-w-[360px]">
          {(ctl) => (
            <input
              {...ctl}
              type="search"
              placeholder="Buscar por nome, código ou login..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="field"
            />
          )}
        </Field>
        <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={carregar} disabled={loading} className="self-end">Atualizar</Button>
        <span className="self-end pb-2 text-xs text-(--text-2)">{lista.length} colaborador(es)</span>
      </div>

      <Table
        head={cabecalho}
        loading={loading}
        cols={5}
        isEmpty={lista.length === 0}
        empty={(
          <EmptyState icon={<Users size={22} />} title="Nenhum colaborador ainda">
            Eles aparecem aqui após a primeira importação.
          </EmptyState>
        )}
      >
        {visiveis.map((c) => {
          const emEdicao = editando === c.id;
          const ocupado = busyId === c.id;
          return (
            <Fragment key={c.id}>
              <tr>
                <td className={`${TD_TOP} font-mono whitespace-nowrap`}>{c.codigo}</td>
                <td className={`${TD_TOP} font-medium`}>{c.nome}</td>
                <td className={`${TD_TOP} min-w-60`}>
                  <div className="flex items-center gap-1.5">
                    <Link2 size={13} className={`shrink-0 ${c.userId ? 'text-(--success)' : 'text-(--warning)'}`} aria-hidden="true" />
                    <select
                      value={c.userId ?? ''}
                      disabled={ocupado}
                      onChange={(e) => vincular(c, e.target.value)}
                      className="field min-h-8 px-2 py-1"
                      aria-label={`Login no portal de ${c.nome}`}
                    >
                      <option value="">— sem vínculo —</option>
                      {usuarios.map((u) => {
                        const ocupadoPorOutro = u.colaborador && u.colaborador.id !== c.id;
                        return (
                          <option key={u.id} value={u.id} disabled={!!ocupadoPorOutro}>
                            {u.name} ({u.email}){ocupadoPorOutro ? ` — já vinculado a ${u.colaborador!.nome}` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  {c.user && !c.user.isActive && (
                    <span className="pill pill-amber mt-1">Login desativado</span>
                  )}
                </td>
                <td className={`${TD_TOP} whitespace-nowrap`}>
                  {c.totalHolerites === 0 ? (
                    <span className="text-(--text-2)">nenhum</span>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => alternarHolerites(c)} aria-expanded={abertoId === c.id}>
                      {c.totalHolerites} · último {c.ultimaCompetencia ? formatarCompetencia(c.ultimaCompetencia) : ''}
                    </Button>
                  )}
                </td>
                <td className={`${TD_TOP} whitespace-nowrap`}>
                  {emEdicao ? (
                    <div className="row">
                      <Button variant="secondary" size="sm" icon={<Save size={13} />} onClick={() => salvarDados(c)} loading={ocupado}>Salvar</Button>
                      <Button variant="ghost" size="sm" icon={<X size={13} />} onClick={() => setEditando(null)}>Cancelar</Button>
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" icon={<Pencil size={13} />} onClick={() => abrirEdicao(c)}>
                      {c.cpf || c.ctps || c.admissao ? 'Editar' : 'Preencher'}
                    </Button>
                  )}
                  {!emEdicao && (
                    <div className="mt-0.5 text-[11px] text-(--text-2)">
                      {[c.cpf && `CPF ${c.cpf}`, c.admissao && `adm. ${c.admissao}`, c.ctps && `CTPS ${c.ctps}`].filter(Boolean).join(' · ') || 'CPF, CTPS e admissão em branco'}
                    </div>
                  )}
                </td>
              </tr>
              {emEdicao && (
                <tr className="bg-(--surface-2)">
                  <td colSpan={5} className="px-3.5 py-2.5">
                    <form className="grid gap-2.5 grid-cols-[repeat(auto-fit,minmax(160px,1fr))]" onSubmit={(e) => { e.preventDefault(); void salvarDados(c); }}>
                      {CAMPOS_PDF.map(([campo, rotulo, ph]) => (
                        <Field key={campo} label={rotulo}>
                          {(ctl) => <input {...ctl} value={form[campo]} placeholder={ph} onChange={(e) => setForm({ ...form, [campo]: e.target.value })} className="field" />}
                        </Field>
                      ))}
                    </form>
                    <p className="mt-2 text-[11px] text-(--text-2)">
                      O TXT completo da folha já traz esses dados e os atualiza a cada importação; preencha aqui só se o arquivo vier no formato antigo. O que estiver em branco sai em branco no PDF.
                    </p>
                  </td>
                </tr>
              )}
              {abertoId === c.id && (
                <tr className="bg-(--surface-2)">
                  <td colSpan={5} className="px-3.5 pt-2 pb-3">
                    {!holeritesDe[c.id] ? (
                      <Carregando />
                    ) : (
                      <div className="row">
                        {holeritesDe[c.id].map((h) => (
                          <Button
                            key={h.id}
                            variant="secondary"
                            size="sm"
                            icon={<Download size={12} />}
                            onClick={() => baixarHoleritePdf(h.id, `holerite_${h.competencia}.pdf`).catch(() => setErro('Falha ao baixar o PDF.'))}
                          >
                            {formatarCompetencia(h.competencia)} · {formatarCentavos(h.liquido)}
                          </Button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </Table>
    </div>
  );
}


// ---------- aba Mensagens (campo Observações do PDF) ----------

const rotuloCompetencia = (c: string | null) => (c ? formatarCompetencia(c) : 'Todos os meses');

function AbaMensagens() {
  const [lista, setLista] = useState<Mensagem[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [competencias, setCompetencias] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [salvando, setSalvando] = useState(false);
  const idBase = useId();

  // formulário de nova mensagem
  const [escopo, setEscopo] = useState<EscopoMensagem>('GERAL');
  const [colaboradorId, setColaboradorId] = useState('');
  const [competencia, setCompetencia] = useState('');
  const [texto, setTexto] = useState('');

  // edição e exclusão em linha
  const [editando, setEditando] = useState<string | null>(null);
  const [edicao, setEdicao] = useState({ texto: '', competencia: '' });
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // buscar() só mexe no estado nos callbacks (a regra react-hooks/set-state-in-effect
  // não aceita setState síncrono dentro do efeito); carregar() é o botão "Atualizar".
  const buscar = () => Promise.all([
    api.get<Mensagem[]>('/holerites/rh/mensagens'),
    api.get<Colaborador[]>('/holerites/rh/colaboradores'),
    api.get<string[]>('/holerites/rh/competencias'),
  ])
    .then(([m, c, k]) => { setLista(m.data); setColaboradores(c.data); setCompetencias(k.data); })
    .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar as mensagens.')))
    .finally(() => setLoading(false));

  const carregar = () => {
    setLoading(true);
    setErro('');
    void buscar();
  };

  useEffect(() => { void buscar(); }, []);

  const salvar = async () => {
    setSalvando(true);
    setErro('');
    setOk('');
    try {
      await api.post('/holerites/rh/mensagens', {
        escopo,
        colaboradorId: escopo === 'INDIVIDUAL' ? colaboradorId || null : null,
        competencia: competencia || null,
        texto,
      });
      setOk(escopo === 'GERAL' ? 'Mensagem geral salva. Ela sai no próximo PDF baixado.' : 'Mensagem individual salva. Ela sai no próximo PDF baixado.');
      setTexto('');
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Falha ao salvar a mensagem.'));
    } finally {
      setSalvando(false);
    }
  };

  const abrirEdicao = (m: Mensagem) => {
    setConfirmandoExclusao(null);
    setEditando(m.id);
    setEdicao({ texto: m.texto, competencia: m.competencia ?? '' });
  };

  const salvarEdicao = async (m: Mensagem) => {
    setBusyId(m.id);
    setErro('');
    setOk('');
    try {
      await api.put(`/holerites/rh/mensagens/${m.id}`, { texto: edicao.texto, competencia: edicao.competencia || null });
      setOk('Mensagem atualizada.');
      setEditando(null);
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Falha ao atualizar a mensagem.'));
    } finally {
      setBusyId(null);
    }
  };

  const excluir = async (m: Mensagem) => {
    setBusyId(m.id);
    setErro('');
    setOk('');
    try {
      await api.delete(`/holerites/rh/mensagens/${m.id}`);
      setOk('Mensagem excluída.');
      setConfirmandoExclusao(null);
      carregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Falha ao excluir a mensagem.'));
    } finally {
      setBusyId(null);
    }
  };

  const textoOk = texto.trim().length > 0 && texto.trim().length <= LIMITE_MENSAGEM;
  const podeSalvar = textoOk && (escopo === 'GERAL' || colaboradorId !== '') && !salvando;

  const contador = (t: string) => (
    <span className={`text-[11px] ${t.length > LIMITE_MENSAGEM ? 'text-(--danger-ink)' : 'text-(--text-2)'}`} aria-live="polite">
      {t.length}/{LIMITE_MENSAGEM} caracteres
    </span>
  );

  const idAbaEscopo = (k: EscopoMensagem) => `${idBase}-escopo-${k}`;
  const idPainelEscopo = `${idBase}-escopo-painel`;

  const cabecalho = (
    <tr>
      <th>Tipo</th>
      <th>Colaborador</th>
      <th>Competência</th>
      <th>Texto</th>
      <th>Por</th>
      <th><span className="sr-only">Ações</span></th>
    </tr>
  );

  return (
    <div className="stack gap-4">
      {erro && <Notice kind="danger" onClose={() => setErro('')} actions={<Button variant="secondary" size="sm" onClick={carregar}>Tentar novamente</Button>}>{erro}</Notice>}
      {ok && <Notice kind="success" onClose={() => setOk('')}>{ok}</Notice>}

      {/* Nova mensagem */}
      <Card>
        <TituloCard icone={<MessageSquareText size={16} />}>Nova mensagem</TituloCard>
        <p className="mb-3 text-xs text-(--text-2)">
          Sai no campo <strong>Observações</strong> do holerite, nas duas vias. <strong>Geral</strong> vale para todos os colaboradores;
          <strong> individual</strong>, só para o escolhido. Sem competência, vale para todos os meses.
          Até {LIMITE_MENSAGEM} caracteres por mensagem: a caixa do holerite é pequena, e o portal recusa o que não couber.
        </p>

        <div className="tabs mb-3" role="tablist" aria-label="Alcance da mensagem" onKeyDown={onTabsKeyDown}>
          {([['GERAL', 'Geral (todos)'], ['INDIVIDUAL', 'Individual']] as Array<[EscopoMensagem, string]>).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={idAbaEscopo(k)}
              aria-selected={escopo === k}
              aria-controls={idPainelEscopo}
              tabIndex={escopo === k ? 0 : -1}
              className={`tab${escopo === k ? ' active' : ''}`}
              onClick={() => setEscopo(k)}
            >
              {label}
            </button>
          ))}
        </div>

        <form
          role="tabpanel"
          id={idPainelEscopo}
          aria-labelledby={idAbaEscopo(escopo)}
          className="stack gap-3"
          onSubmit={(e) => { e.preventDefault(); if (podeSalvar) void salvar(); }}
        >
          <div className="form-grid-2">
            {escopo === 'INDIVIDUAL' && (
              <Field label="Colaborador" required>
                {(ctl) => (
                  <select {...ctl} value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)} className="field">
                    <option value="">— escolha —</option>
                    {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>)}
                  </select>
                )}
              </Field>
            )}
            <Field label="Competência" hint="Sem competência, vale para todos os meses.">
              {(ctl) => (
                <select {...ctl} value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="field">
                  <option value="">Todos os meses</option>
                  {competencias.map((c) => <option key={c} value={c}>{formatarCompetencia(c)}</option>)}
                </select>
              )}
            </Field>
          </div>

          <Field label="Mensagem" required hint={contador(texto)}>
            {(ctl) => (
              <textarea
                {...ctl}
                value={texto}
                maxLength={LIMITE_MENSAGEM}
                rows={3}
                placeholder="Ex.: Lembramos que o recesso escolar começa em 15/10. Dúvidas, procure o RH."
                onChange={(e) => setTexto(e.target.value)}
                className="field min-h-20"
              />
            )}
          </Field>

          <div className="form-actions">
            <Button type="submit" icon={<Save size={14} />} disabled={!podeSalvar} loading={salvando}>
              {salvando ? 'Salvando...' : 'Salvar mensagem'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Cadastradas */}
      <div>
        <div className="section-head items-center">
          <h2>Mensagens cadastradas</h2>
          <div className="row">
            <span className="text-xs text-(--text-2)">{lista.length} mensagem(ns)</span>
            <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={carregar} disabled={loading}>Atualizar</Button>
          </div>
        </div>

        <Table
          head={cabecalho}
          loading={loading}
          cols={6}
          isEmpty={lista.length === 0}
          empty={(
            <EmptyState icon={<MessageSquareText size={22} />} title="Nenhuma mensagem">
              O que você escrever aqui sai no campo Observações do holerite.
            </EmptyState>
          )}
        >
          {lista.map((m) => {
            const emEdicao = editando === m.id;
            const ocupado = busyId === m.id;
            return (
              <Fragment key={m.id}>
                <tr>
                  <td className={`${TD_TOP} whitespace-nowrap`}>
                    <span className={`pill pill-strong ${m.escopo === 'GERAL' ? 'pill-electric' : 'pill-amber'}`}>
                      {m.escopo === 'GERAL' ? 'Geral' : 'Individual'}
                    </span>
                  </td>
                  <td className={TD_TOP}>{m.colaborador ? <>{m.colaborador.codigo} · {m.colaborador.nome}</> : <span className="text-(--text-2)">todos</span>}</td>
                  <td className={`${TD_TOP} whitespace-nowrap`}>
                    {emEdicao ? (
                      <select value={edicao.competencia} onChange={(e) => setEdicao({ ...edicao, competencia: e.target.value })} className="field min-h-8 px-2 py-1" aria-label="Competência da mensagem">
                        <option value="">Todos os meses</option>
                        {competencias.map((c) => <option key={c} value={c}>{formatarCompetencia(c)}</option>)}
                      </select>
                    ) : rotuloCompetencia(m.competencia)}
                  </td>
                  <td className={`${TD_TOP} min-w-70`}>
                    {emEdicao ? (
                      <div className="stack gap-1">
                        <textarea
                          value={edicao.texto}
                          maxLength={LIMITE_MENSAGEM}
                          rows={2}
                          onChange={(e) => setEdicao({ ...edicao, texto: e.target.value })}
                          className="field min-h-14"
                          aria-label="Texto da mensagem"

                        />
                        {contador(edicao.texto)}
                      </div>
                    ) : m.texto}
                  </td>
                  <td className={`${TD_TOP} text-xs whitespace-nowrap text-(--text-2)`}>
                    {m.atorNome}<br />
                    {new Date(m.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className={`${TD_TOP} text-right whitespace-nowrap`}>
                    {emEdicao ? (
                      <div className="row justify-end">
                        <Button variant="secondary" size="sm" icon={<Save size={13} />} onClick={() => salvarEdicao(m)} disabled={!edicao.texto.trim()} loading={ocupado}>Salvar</Button>
                        <Button variant="ghost" size="sm" icon={<X size={13} />} onClick={() => setEditando(null)}>Cancelar</Button>
                      </div>
                    ) : confirmandoExclusao === m.id ? (
                      <div className="row justify-end" role="group" aria-label="Confirmar exclusão">
                        <span className="text-xs text-(--text-2)">Excluir?</span>
                        <Button variant="danger" size="sm" onClick={() => excluir(m)} loading={ocupado}>Sim</Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmandoExclusao(null)}>Não</Button>
                      </div>
                    ) : (
                      <div className="row justify-end">
                        <Button variant="ghost" size="sm" icon={<Pencil size={13} />} onClick={() => abrirEdicao(m)}>Editar</Button>
                        <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} className="text-(--danger)" onClick={() => { setEditando(null); setConfirmandoExclusao(m.id); }}>Excluir</Button>
                      </div>
                    )}
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </Table>
      </div>
    </div>
  );
}

// ---------- aba Histórico ----------

function AbaImportacoes() {
  const [lista, setLista] = useState<Importacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    api.get<Importacao[]>('/holerites/rh/importacoes')
      .then((r) => setLista(r.data))
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar o histórico.')))
      .finally(() => setLoading(false));
  }, [tentativa]);

  const cabecalho = (
    <tr>
      <th>Quando</th>
      <th>Arquivo</th>
      <th>Origem</th>
      <th>Competências</th>
      <th>Holerites</th>
      <th>Novos</th>
      <th>Por</th>
    </tr>
  );

  if (erro) {
    return (
      <Notice kind="danger" actions={<Button variant="secondary" size="sm" onClick={() => { setErro(''); setLoading(true); setTentativa((n) => n + 1); }}>Tentar novamente</Button>}>
        {erro}
      </Notice>
    );
  }

  return (
    <Table
      head={cabecalho}
      loading={loading}
      cols={7}
      isEmpty={lista.length === 0}
      empty={<EmptyState icon={<Inbox size={22} />} title="Nenhuma importação ainda." />}
    >
      {lista.map((i) => (
        <tr key={i.id}>
          <td className="whitespace-nowrap text-(--text-2)">
            {new Date(i.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
          </td>
          <td>{i.arquivo}</td>
          <td><span className={`pill ${i.origem === 'DRIVE' ? 'pill-teal' : 'pill-muted'}`}>{i.origem === 'DRIVE' ? 'Google Drive' : 'Upload'}</span></td>
          <td>{i.competencias.map(formatarCompetencia).join(', ')}</td>
          <td>{i.totalHolerites}</td>
          <td>{i.novosColaboradores}</td>
          <td className="text-(--text-2)">{i.atorNome}</td>
        </tr>
      ))}
    </Table>
  );
}
