import { Fragment, useEffect, useRef, useState } from 'react';
import {
  Upload, CloudDownload, RefreshCw, Users, History,
  AlertTriangle, CheckCircle2, Link2, Pencil, Save, X, Download, MessageSquareText, Trash2,
} from 'lucide-react';
import api from '../lib/api';
import { formatarCentavos, formatarCompetencia, baixarHoleritePdf, type HoleriteResumo } from '../lib/holerites';
import PageHeader from '../components/PageHeader';
import { Button, Card, Table } from '../components/ui';

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

// ---------- estilos ----------

/* Tabelas, cards e botões vêm de components/ui; aqui só o que não tem componente. */
const tdTop: React.CSSProperties = { verticalAlign: 'top' };
const labelStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' };
const cardTitle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px' };
const btnLink: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--electric)', fontSize: '12px',
  padding: 0, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit',
};

function mensagemErro(err: unknown, padrao: string): string {
  const e = err as { response?: { data?: { error?: string; details?: Record<string, string[]> } } };
  const details = e?.response?.data?.details;
  if (details) {
    const primeira = Object.values(details).flat()[0];
    if (primeira) return primeira;
  }
  return e?.response?.data?.error ?? padrao;
}

function Aviso({ tipo, children }: { tipo: 'erro' | 'ok' | 'atencao'; children: React.ReactNode }) {
  const cores = {
    erro: ['var(--coral-soft)', 'var(--coral)'],
    ok: ['var(--teal-soft)', 'var(--teal)'],
    atencao: ['var(--amber-soft)', 'var(--amber)'],
  }[tipo];
  const Icone = tipo === 'erro' ? AlertTriangle : tipo === 'ok' ? CheckCircle2 : AlertTriangle;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', background: cores[0], borderLeft: `3px solid ${cores[1]}`, borderRadius: 'var(--radius-tile)', color: 'var(--text-primary)', fontSize: '13px', marginBottom: '12px' }}>
      <Icone size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function ResumoImportacao({ r, onVerColaboradores }: { r: ResultadoImportacao; onVerColaboradores: () => void }) {
  return (
    <div>
      <strong>{r.arquivo}</strong> importado: {r.totalHolerites} holerite(s) de{' '}
      {r.competencias.map(formatarCompetencia).join(', ')}
      {r.novosColaboradores > 0 && <>, {r.novosColaboradores} colaborador(es) novo(s)</>}.
      {r.semVinculo.length > 0 && (
        <p style={{ margin: '6px 0 0' }}>
          {r.semVinculo.length} colaborador(es) sem login vinculado — eles ainda não veem o holerite:{' '}
          {r.semVinculo.map((c) => c.nome).join(', ')}.{' '}
          <button onClick={onVerColaboradores} style={{ ...btnLink, color: 'inherit', textDecoration: 'underline' }}>Vincular agora</button>
        </p>
      )}
    </div>
  );
}

// ---------- página ----------

export default function HoleritesRhPage() {
  const [aba, setAba] = useState<Aba>('importar');

  return (
    <>
      <PageHeader
        title="RH · Holerites"
        subtitle="Importe o TXT da folha, vincule cada colaborador ao login dele e o portal gera o PDF. Em Mensagens, o que sai no campo Observações."
      />

      <div className="page-body" style={{ maxWidth: 1400 }}>
        <div className="tabs" style={{ marginBottom: '16px' }}>
          {([
            ['importar', 'Importar', Upload],
            ['colaboradores', 'Colaboradores e vínculos', Users],
            ['mensagens', 'Mensagens', MessageSquareText],
            ['importacoes', 'Histórico', History],
          ] as Array<[Aba, string, typeof Upload]>).map(([k, label, Icone]) => (
            <button key={k} type="button" onClick={() => setAba(k)} className={`tab${aba === k ? ' active' : ''}`}>
              <Icone size={14} /> {label}
            </button>
          ))}
        </div>

        {aba === 'importar' && <AbaImportar irParaColaboradores={() => setAba('colaboradores')} />}
        {aba === 'colaboradores' && <AbaColaboradores />}
        {aba === 'mensagens' && <AbaMensagens />}
        {aba === 'importacoes' && <AbaImportacoes />}
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

  return (
    <>
      {/* Google Drive */}
      <Card style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
          <h2 className="card-title" style={{ ...cardTitle, margin: 0 }}>
            <CloudDownload size={16} /> Pasta no Google Drive
          </h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={carregarDrive} disabled={driveLoading}>Atualizar</Button>
            <Button size="sm" icon={<CloudDownload size={14} />} onClick={() => importarDrive()} disabled={!drive?.configured || driveBusy !== null}>
              {driveBusy === 'todos' ? 'Importando...' : 'Importar novos'}
            </Button>
          </div>
        </div>

        {driveLoading ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>Consultando o Drive...</p>
        ) : !drive?.configured ? (
          <Aviso tipo="atencao">Google Drive não está configurado neste ambiente. Use o upload manual abaixo.</Aviso>
        ) : (
          <>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
              Salve o TXT exportado da folha na pasta <strong>{drive.pasta}</strong> do Drive do portal.
              {drive.intervaloMin > 0
                ? <> O portal confere a pasta a cada {drive.intervaloMin} min e importa o que for novo; se não quiser esperar, clique em “Importar novos”.</>
                : <> A importação automática está desligada — clique em “Importar novos” depois de salvar o arquivo.</>}
            </p>
            {driveErro && <Aviso tipo="erro">{driveErro}</Aviso>}
            {driveResultado && (
              <>
                {driveResultado.importados.map((r) => (
                  <Aviso key={r.importacaoId} tipo="ok"><ResumoImportacao r={r} onVerColaboradores={irParaColaboradores} /></Aviso>
                ))}
                {driveResultado.erros.map((e) => (
                  <Aviso key={e.arquivo} tipo="erro"><strong>{e.arquivo}</strong>: {e.erro}</Aviso>
                ))}
                {driveResultado.importados.length === 0 && driveResultado.erros.length === 0 && (
                  <Aviso tipo="atencao">Nenhum arquivo novo na pasta ({driveResultado.ignorados} já importado(s)).</Aviso>
                )}
              </>
            )}
            {drive.arquivos.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>Nenhum arquivo .txt na pasta.</p>
            ) : (
              <Table
                head={(
                  <tr>
                    <th>Arquivo</th>
                    <th>Modificado</th>
                    <th>Situação</th>
                    <th></th>
                  </tr>
                )}
              >
                {drive.arquivos.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {a.modifiedTime ? new Date(a.modifiedTime).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {a.importadoEm
                        ? <span className="pill pill-teal">Importado em {new Date(a.importadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                        : <span className="pill pill-amber">Pendente</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button onClick={() => importarDrive(a.id)} disabled={driveBusy !== null} style={{ ...btnLink, opacity: driveBusy !== null ? 0.5 : 1 }}>
                        <CloudDownload size={13} /> {a.importadoEm ? 'Reimportar' : 'Importar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </>
        )}
      </Card>

      {/* Upload manual */}
      <Card style={{ marginBottom: '16px' }}>
        <h2 className="card-title" style={{ ...cardTitle, margin: '0 0 10px' }}>
          <Upload size={16} /> Enviar arquivo manualmente
        </h2>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
          Aceita o .txt exportado da folha. O arquivo é conferido inteiro antes de entrar: se alguma soma não bater, nada é gravado e o motivo aparece aqui.
          Reimportar a mesma competência substitui os holerites daquele mês.
        </p>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {resultado && <Aviso tipo="ok"><ResumoImportacao r={resultado} onVerColaboradores={irParaColaboradores} /></Aviso>}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={inputRef}
            type="file"
            accept=".txt,text/plain"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="field"
            style={{ width: 'auto', flex: 1, minWidth: '240px' }}
          />
          <Button size="sm" icon={<Upload size={14} />} onClick={enviar} disabled={!arquivo || enviando}>
            {enviando ? 'Importando...' : 'Importar'}
          </Button>
        </div>
      </Card>
    </>
  );
}

// ---------- aba Colaboradores ----------

function AbaColaboradores() {
  const [lista, setLista] = useState<Colaborador[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioVinculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState({ cpf: '', ctps: '', admissao: '', cargoCodigo: '', deptoCodigo: '' });
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

  return (
    <>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {!loading && semVinculo > 0 && (
        <Aviso tipo="atencao">{semVinculo} colaborador(es) sem login vinculado — eles não conseguem ver o próprio holerite até o vínculo ser feito.</Aviso>
      )}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
        <input
          placeholder="Buscar por nome, código ou login..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="field"
          style={{ maxWidth: '360px' }}
        />
        <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={carregar} disabled={loading}>Atualizar</Button>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{lista.length} colaborador(es)</span>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Carregando...</p>
      ) : lista.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Nenhum colaborador ainda — eles aparecem aqui após a primeira importação.</p>
      ) : (
        <Table
          head={(
            <tr>
              <th>Código</th>
              <th>Nome (folha)</th>
              <th>Login no portal</th>
              <th>Holerites</th>
              <th>Dados do PDF</th>
            </tr>
          )}
        >
              {visiveis.map((c) => {
                const emEdicao = editando === c.id;
                const ocupado = busyId === c.id;
                return (
                  <Fragment key={c.id}>
                    <tr>
                      <td style={{ ...tdTop, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{c.codigo}</td>
                      <td style={{ ...tdTop, fontWeight: 500 }}>{c.nome}</td>
                      <td style={{ ...tdTop, minWidth: '240px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Link2 size={13} style={{ color: c.userId ? 'var(--teal)' : 'var(--amber)', flexShrink: 0 }} />
                          <select
                            value={c.userId ?? ''}
                            disabled={ocupado}
                            onChange={(e) => vincular(c, e.target.value)}
                            className="field"
                            style={{ padding: '5px 8px' }}
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
                          <span className="pill pill-amber" style={{ marginTop: '4px' }}>Login desativado</span>
                        )}
                      </td>
                      <td style={{ ...tdTop, whiteSpace: 'nowrap' }}>
                        {c.totalHolerites === 0 ? (
                          <span style={{ color: 'var(--text-secondary)' }}>nenhum</span>
                        ) : (
                          <button onClick={() => alternarHolerites(c)} style={btnLink}>
                            {c.totalHolerites} · último {c.ultimaCompetencia ? formatarCompetencia(c.ultimaCompetencia) : ''}
                          </button>
                        )}
                      </td>
                      <td style={{ ...tdTop, whiteSpace: 'nowrap' }}>
                        {emEdicao ? (
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => salvarDados(c)} disabled={ocupado} style={btnLink}><Save size={13} /> Salvar</button>
                            <button onClick={() => setEditando(null)} style={{ ...btnLink, color: 'var(--text-secondary)' }}><X size={13} /> Cancelar</button>
                          </div>
                        ) : (
                          <button onClick={() => abrirEdicao(c)} style={btnLink}>
                            <Pencil size={13} /> {c.cpf || c.ctps || c.admissao ? 'Editar' : 'Preencher'}
                          </button>
                        )}
                        {!emEdicao && (
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {[c.cpf && `CPF ${c.cpf}`, c.admissao && `adm. ${c.admissao}`, c.ctps && `CTPS ${c.ctps}`].filter(Boolean).join(' · ') || 'CPF, CTPS e admissão em branco'}
                          </div>
                        )}
                      </td>
                    </tr>
                    {emEdicao && (
                      <tr style={{ background: 'var(--bg-card-hover)' }}>
                        <td colSpan={5} style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                            {([
                              ['cpf', 'CPF', '000.000.000-00'],
                              ['ctps', 'CTPS', '0000000 / 00000'],
                              ['admissao', 'Admissão', 'dd/mm/aaaa'],
                              ['cargoCodigo', 'Código do cargo', '0005'],
                              ['deptoCodigo', 'Código do depto.', '000005'],
                            ] as Array<[keyof typeof form, string, string]>).map(([campo, rotulo, ph]) => (
                              <label key={campo} style={labelStyle}>
                                {rotulo}
                                <input value={form[campo]} placeholder={ph} onChange={(e) => setForm({ ...form, [campo]: e.target.value })} className="field" />
                              </label>
                            ))}
                          </div>
                          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '8px 0 0' }}>
                            O TXT completo da folha já traz esses dados e os atualiza a cada importação; preencha aqui só se o arquivo vier no formato antigo. O que estiver em branco sai em branco no PDF.
                          </p>
                        </td>
                      </tr>
                    )}
                    {abertoId === c.id && (
                      <tr style={{ background: 'var(--bg-card-hover)' }}>
                        <td colSpan={5} style={{ padding: '8px 14px 12px' }}>
                          {!holeritesDe[c.id] ? (
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Carregando...</span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                              {holeritesDe[c.id].map((h) => (
                                <Button
                                  key={h.id}
                                  variant="ghost"
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
      )}
    </>
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
    <span style={{ fontSize: '11px', color: t.length > LIMITE_MENSAGEM ? 'var(--coral)' : 'var(--text-secondary)' }}>
      {t.length}/{LIMITE_MENSAGEM}
    </span>
  );

  return (
    <>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      {/* Nova mensagem */}
      <Card style={{ marginBottom: '16px' }}>
        <h2 className="card-title" style={{ ...cardTitle, margin: '0 0 6px' }}>
          <MessageSquareText size={16} /> Nova mensagem
        </h2>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
          Sai no campo <strong>Observações</strong> do holerite, nas duas vias. <strong>Geral</strong> vale para todos os colaboradores;
          <strong> individual</strong>, só para o escolhido. Sem competência, vale para todos os meses.
          Até {LIMITE_MENSAGEM} caracteres por mensagem: a caixa do holerite é pequena, e o portal recusa o que não couber.
        </p>

        <div className="tabs" style={{ marginBottom: '12px' }}>
          {([['GERAL', 'Geral (todos)'], ['INDIVIDUAL', 'Individual']] as Array<[EscopoMensagem, string]>).map(([k, label]) => (
            <button key={k} type="button" className={`tab${escopo === k ? ' active' : ''}`} onClick={() => setEscopo(k)}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '10px' }}>
          {escopo === 'INDIVIDUAL' && (
            <label style={labelStyle}>
              Colaborador
              <select value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)} className="field">
                <option value="">— escolha —</option>
                {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.nome}</option>)}
              </select>
            </label>
          )}
          <label style={labelStyle}>
            Competência
            <select value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="field">
              <option value="">Todos os meses</option>
              {competencias.map((c) => <option key={c} value={c}>{formatarCompetencia(c)}</option>)}
            </select>
          </label>
        </div>

        <label style={labelStyle}>
          <span style={{ display: 'flex', justifyContent: 'space-between' }}>Mensagem {contador(texto)}</span>
          <textarea
            value={texto}
            maxLength={LIMITE_MENSAGEM}
            rows={3}
            placeholder="Ex.: Lembramos que o recesso escolar começa em 15/10. Dúvidas, procure o RH."
            onChange={(e) => setTexto(e.target.value)}
            className="field"
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </label>

        <div style={{ marginTop: '10px' }}>
          <Button icon={<Save size={14} />} onClick={salvar} disabled={!podeSalvar}>
            {salvando ? 'Salvando...' : 'Salvar mensagem'}
          </Button>
        </div>
      </Card>

      {/* Cadastradas */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
        <h2 className="card-title" style={{ margin: 0 }}>Mensagens cadastradas</h2>
        <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={carregar} disabled={loading}>Atualizar</Button>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{lista.length} mensagem(ns)</span>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Carregando...</p>
      ) : lista.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Nenhuma mensagem. O que você escrever aqui sai no campo Observações do holerite.</p>
      ) : (
        <Table
          head={(
            <tr>
              <th>Tipo</th>
              <th>Colaborador</th>
              <th>Competência</th>
              <th>Texto</th>
              <th>Por</th>
              <th></th>
            </tr>
          )}
        >
              {lista.map((m) => {
                const emEdicao = editando === m.id;
                const ocupado = busyId === m.id;
                return (
                  <Fragment key={m.id}>
                    <tr>
                      <td style={{ ...tdTop, whiteSpace: 'nowrap' }}>
                        <span className={`pill ${m.escopo === 'GERAL' ? 'pill-electric' : 'pill-amber'}`} style={{ fontWeight: 600 }}>
                          {m.escopo === 'GERAL' ? 'Geral' : 'Individual'}
                        </span>
                      </td>
                      <td style={tdTop}>{m.colaborador ? <>{m.colaborador.codigo} · {m.colaborador.nome}</> : <span style={{ color: 'var(--text-secondary)' }}>todos</span>}</td>
                      <td style={{ ...tdTop, whiteSpace: 'nowrap' }}>
                        {emEdicao ? (
                          <select value={edicao.competencia} onChange={(e) => setEdicao({ ...edicao, competencia: e.target.value })} className="field" style={{ padding: '5px 8px' }}>
                            <option value="">Todos os meses</option>
                            {competencias.map((c) => <option key={c} value={c}>{formatarCompetencia(c)}</option>)}
                          </select>
                        ) : rotuloCompetencia(m.competencia)}
                      </td>
                      <td style={{ ...tdTop, minWidth: '280px' }}>
                        {emEdicao ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <textarea
                              value={edicao.texto}
                              maxLength={LIMITE_MENSAGEM}
                              rows={2}
                              onChange={(e) => setEdicao({ ...edicao, texto: e.target.value })}
                              className="field"
                              style={{ resize: 'vertical', fontFamily: 'inherit' }}
                            />
                            {contador(edicao.texto)}
                          </div>
                        ) : m.texto}
                      </td>
                      <td style={{ ...tdTop, color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '12px' }}>
                        {m.atorNome}<br />
                        {new Date(m.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td style={{ ...tdTop, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {emEdicao ? (
                          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button onClick={() => salvarEdicao(m)} disabled={ocupado || !edicao.texto.trim()} style={btnLink}><Save size={13} /> Salvar</button>
                            <button onClick={() => setEditando(null)} style={{ ...btnLink, color: 'var(--text-secondary)' }}><X size={13} /> Cancelar</button>
                          </div>
                        ) : confirmandoExclusao === m.id ? (
                          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Excluir?</span>
                            <button onClick={() => excluir(m)} disabled={ocupado} style={{ ...btnLink, color: 'var(--coral)' }}>Sim</button>
                            <button onClick={() => setConfirmandoExclusao(null)} style={{ ...btnLink, color: 'var(--text-secondary)' }}>Não</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button onClick={() => abrirEdicao(m)} style={btnLink}><Pencil size={13} /> Editar</button>
                            <button onClick={() => { setEditando(null); setConfirmandoExclusao(m.id); }} style={{ ...btnLink, color: 'var(--coral)' }}><Trash2 size={13} /> Excluir</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
        </Table>
      )}
    </>
  );
}

// ---------- aba Histórico ----------

function AbaImportacoes() {
  const [lista, setLista] = useState<Importacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api.get<Importacao[]>('/holerites/rh/importacoes')
      .then((r) => setLista(r.data))
      .catch((err) => setErro(mensagemErro(err, 'Não foi possível carregar o histórico.')))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Carregando...</p>;
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (lista.length === 0) return <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Nenhuma importação ainda.</p>;

  return (
    <Table
      head={(
        <tr>
          <th>Quando</th>
          <th>Arquivo</th>
          <th>Origem</th>
          <th>Competências</th>
          <th>Holerites</th>
          <th>Novos</th>
          <th>Por</th>
        </tr>
      )}
    >
      {lista.map((i) => (
        <tr key={i.id}>
          <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
            {new Date(i.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
          </td>
          <td>{i.arquivo}</td>
          <td><span className={`pill ${i.origem === 'DRIVE' ? 'pill-teal' : 'pill-muted'}`}>{i.origem === 'DRIVE' ? 'Google Drive' : 'Upload'}</span></td>
          <td>{i.competencias.map(formatarCompetencia).join(', ')}</td>
          <td>{i.totalHolerites}</td>
          <td>{i.novosColaboradores}</td>
          <td style={{ color: 'var(--text-secondary)' }}>{i.atorNome}</td>
        </tr>
      ))}
    </Table>
  );
}
