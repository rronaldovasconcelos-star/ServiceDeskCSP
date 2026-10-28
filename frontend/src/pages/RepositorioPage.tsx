import { useEffect, useId, useRef, useState } from 'react';
import { FileStack, HardDrive, List, FolderTree, FileArchive, History, PenLine, Search, FolderOpen } from 'lucide-react';
import api from '../lib/api';
import FilesTreeView from '../components/FilesTreeView';
import FileActionButtons from '../components/FileActionButtons';
import FilePreviewModal from '../components/FilePreviewModal';
import PageHeader from '../components/PageHeader';
import { Button, Card, EmptyState, Field, IconTile, Modal, Notice, Table } from '../components/ui';
import { useSyncOnFocus } from '../hooks/useSyncOnFocus';
import { onTabsKeyDown } from '../lib/a11y';
import {
  formatBytes, downloadZip, replaceFile, fetchFileLogs, fetchCapabilities, actionLabel, SEM_CAPACIDADES,
  type FileCapabilities, type FileRecord, type FileChangeLogRecord,
} from '../lib/files';
import { labelFor, SEGMENTOS, SERIES_BY_SEGMENTO, DISCIPLINAS, TIPOS_MATERIAL } from '../lib/taxonomy';
import { useAuth } from '../context/AuthContext';

interface Metrics {
  totalFiles: number;
  totalBytes: number;
  byUser: { ownerId: string; name: string; email: string; fileCount: number; totalBytes: number }[];
}

/** Mensagem de erro da API (ou a padrão) sem recorrer a `any`. */
function erroDaApi(e: unknown, padrao: string): string {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? padrao;
}

export default function RepositorioPage() {
  const { user } = useAuth();
  // ADMIN exclui qualquer arquivo; demais (GESTOR/USER) só os próprios — espelha o backend.
  const canDeleteFile = (f: FileRecord) => user?.role === 'ADMIN' || f.ownerId === user?.id;
  // GESTOR/ADMIN podem substituir o conteúdo de qualquer arquivo e ver o log.
  const canEdit = user?.role === 'ADMIN' || user?.role === 'GESTOR';
  const [replaceTarget, setReplaceTarget] = useState<FileRecord | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [capabilities, setCapabilities] = useState<FileCapabilities | null>(null);
  const [previewTarget, setPreviewTarget] = useState<FileRecord | null>(null);
  useEffect(() => { fetchCapabilities().then(setCapabilities).catch(() => setCapabilities(SEM_CAPACIDADES)); }, []);
  const podeEditar = (f: FileRecord) => user?.role === 'ADMIN' || user?.role === 'GESTOR' || f.ownerId === user?.id;
  const canEditOffice = (f: FileRecord) => !!capabilities?.editInOffice && podeEditar(f);
  useSyncOnFocus((f) => { setFiles((prev) => prev.map((x) => (x.id === f.id ? f : x))); loadMetrics(); });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [q, setQ] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [segmento, setSegmento] = useState('');
  const [serie, setSerie] = useState('');
  const [disciplina, setDisciplina] = useState('');
  const [tipoMaterial, setTipoMaterial] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [view, setView] = useState<'lista' | 'arvore'>('lista');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);
  const idBase = useId();

  function loadMetrics() {
    api.get('/files/metrics').then((r) => setMetrics(r.data));
  }

  function loadFiles() {
    setLoading(true);
    setErro('');
    setSelected(new Set());
    const params: Record<string, string> = {};
    if (q) params.q = q;
    if (ownerId) params.ownerId = ownerId;
    if (segmento) params.segmento = segmento;
    if (serie) params.serie = serie;
    if (disciplina) params.disciplina = disciplina;
    if (tipoMaterial) params.tipoMaterial = tipoMaterial;
    api.get('/files', { params })
      .then((r) => setFiles(r.data))
      .catch(() => setErro('Não foi possível carregar os arquivos.'))
      .finally(() => setLoading(false));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleZip(ids: string[]) {
    if (ids.length === 0 || zipping) return;
    setZipping(true);
    try {
      await downloadZip(ids);
    } finally {
      setZipping(false);
    }
  }

  useEffect(() => {
    loadMetrics();
  }, []);

  // Opções de professor para o filtro: derivadas das métricas (todo dono que tem
  // arquivos). Evita depender de GET /users — que exige o módulo "Usuários" e não
  // está liberado para quem só tem acesso ao Repositório (ex.: gestor).
  const professorOptions = (metrics?.byUser ?? [])
    .map((u) => ({ id: u.ownerId, name: u.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    const t = setTimeout(loadFiles, q ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, ownerId, segmento, serie, disciplina, tipoMaterial]);

  function handleSegmento(value: string) {
    setSegmento(value);
    setSerie('');
  }
  const serieOptions = segmento ? SERIES_BY_SEGMENTO[segmento] ?? [] : [];

  // Filtragem local: apenas a data é aplicada sobre os arquivos já carregados.
  // As bordas são interpretadas em horário LOCAL (anexar a hora evita o bug de
  // fuso: `new Date('2026-05-31')` seria meia-noite UTC = 30/05 21h no Brasil).
  const filteredFiles = files.filter((f) => {
    const enviado = new Date(f.uploadedAt);
    if (dataInicio && enviado < new Date(`${dataInicio}T00:00:00`)) return false;
    if (dataFim && enviado > new Date(`${dataFim}T23:59:59.999`)) return false;
    return true;
  });

  const allSelected = filteredFiles.length > 0 && filteredFiles.every((f) => selected.has(f.id));
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(filteredFiles.map((f) => f.id)));
  }

  async function handleDelete(f: FileRecord) {
    if (!confirm(`Excluir "${f.originalName}" de ${f.owner.name}? Esta ação não pode ser desfeita.`)) return;
    await api.delete(`/files/${f.id}`);
    loadFiles();
    loadMetrics();
  }

  const temFiltro = Boolean(segmento || serie || disciplina || tipoMaterial || dataInicio || dataFim);

  const idAba = (k: 'lista' | 'arvore') => `${idBase}-aba-${k}`;
  const idPainel = `${idBase}-painel`;

  const cabecalho = (
    <tr>
      <th className="w-9">
        <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Selecionar todos" className="cursor-pointer" />
      </th>
      <th>Nome</th>
      <th>Professor</th>
      <th>Série</th>
      <th>Disciplina</th>
      <th>Tipo</th>
      <th>Tamanho</th>
      <th>Data</th>
      <th className="text-right">Ações</th>
    </tr>
  );

  return (
    <>
      <PageHeader
        title="Repositório de arquivos"
        description={metrics ? `${metrics.totalFiles} arquivo${metrics.totalFiles === 1 ? '' : 's'} · ${formatBytes(metrics.totalBytes)} em uso` : 'Carregando…'}
        actions={(
          <>
            <div className="search-bar" role="search">
              <Search size={14} className="shrink-0" aria-hidden="true" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome..." aria-label="Buscar arquivos" />
            </div>
            {canEdit && (
              <Button variant="secondary" icon={<History size={15} />} onClick={() => setHistoryOpen(true)}>
                Histórico de alterações
              </Button>
            )}
          </>
        )}
      />

      <div className="page-body stack gap-4">
        {/* Métricas */}
        <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          <div className="kpi-card">
            <IconTile tone="electric" size={44}><FileStack size={20} aria-hidden="true" /></IconTile>
            <div>
              <p className="kpi-label">Total de arquivos</p>
              <p className="kpi-value">{metrics?.totalFiles ?? '—'}</p>
            </div>
          </div>
          <div className="kpi-card">
            <IconTile tone="teal" size={44}><HardDrive size={20} aria-hidden="true" /></IconTile>
            <div>
              <p className="kpi-label">Armazenamento total</p>
              <p className="kpi-value">{metrics ? formatBytes(metrics.totalBytes) : '—'}</p>
            </div>
          </div>
        </div>

        {/* Por professor */}
        {metrics && metrics.byUser.length > 0 && (
          <div>
            <p className="section-label">Uso por professor</p>
            <Table head={(
              <tr>
                <th>Professor</th>
                <th>Arquivos</th>
                <th>Espaço</th>
              </tr>
            )}>
              {metrics.byUser.map((u) => (
                <tr key={u.ownerId}>
                  <td>
                    {u.name}
                    <span className="ml-2 text-[11px] text-(--text-2)">{u.email}</span>
                  </td>
                  <td className="text-(--text-2)">{u.fileCount}</td>
                  <td className="text-(--text-2)">{formatBytes(u.totalBytes)}</td>
                </tr>
              ))}
            </Table>
          </div>
        )}

        {/* Filtros */}
        <div className="toolbar mb-0">
          <Field label="Professor">
            {(ctl) => (
              <select {...ctl} value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="field w-auto">
                <option value="">Todos os professores</option>
                {professorOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
          </Field>
          <Field label="Segmento">
            {(ctl) => (
              <select {...ctl} value={segmento} onChange={(e) => handleSegmento(e.target.value)} className="field w-auto">
                <option value="">Todos os segmentos</option>
                {SEGMENTOS.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            )}
          </Field>
          <Field label="Série">
            {(ctl) => (
              <select {...ctl} value={serie} onChange={(e) => setSerie(e.target.value)} disabled={!segmento} className="field w-auto">
                <option value="">Todas as séries</option>
                {serieOptions.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            )}
          </Field>
          <Field label="Disciplina">
            {(ctl) => (
              <select {...ctl} value={disciplina} onChange={(e) => setDisciplina(e.target.value)} className="field w-auto">
                <option value="">Todas as disciplinas</option>
                {DISCIPLINAS.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
              </select>
            )}
          </Field>
          <Field label="Tipo">
            {(ctl) => (
              <select {...ctl} value={tipoMaterial} onChange={(e) => setTipoMaterial(e.target.value)} className="field w-auto">
                <option value="">Todos os tipos</option>
                {TIPOS_MATERIAL.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            )}
          </Field>
          <Field label="De">
            {(ctl) => <input {...ctl} type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="field w-auto" />}
          </Field>
          <Field label="Até">
            {(ctl) => <input {...ctl} type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="field w-auto" />}
          </Field>
          {temFiltro && (
            <Button variant="ghost" size="sm" onClick={() => { setSegmento(''); setSerie(''); setDisciplina(''); setTipoMaterial(''); setDataInicio(''); setDataFim(''); }}>
              Limpar filtros
            </Button>
          )}

          {/* Toggle lista / árvore */}
          <div className="tabs ml-auto" role="tablist" aria-label="Modo de exibição" onKeyDown={onTabsKeyDown}>
            {([['lista', List, 'Lista'], ['arvore', FolderTree, 'Árvore']] as const).map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={idAba(key)}
                aria-selected={view === key}
                aria-controls={idPainel}
                tabIndex={view === key ? 0 : -1}
                onClick={() => setView(key)}
                className={`tab${view === key ? ' active' : ''}`}
              >
                <Icon size={14} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        </div>

        {erro && (
          <Notice kind="danger" actions={<Button variant="secondary" size="sm" onClick={loadFiles}>Tentar novamente</Button>}>
            {erro}
          </Notice>
        )}

        {/* Barra de ação em lote (visão lista) */}
        {view === 'lista' && selected.size > 0 && (
          <div className="row gap-3 rounded-(--radius-sm) bg-(--primary-soft) px-3.5 py-2.5" role="status">
            <span className="text-[13px] font-semibold text-(--text)">{selected.size} selecionado(s)</span>
            <Button size="sm" icon={<FileArchive size={15} />} onClick={() => handleZip([...selected])} loading={zipping}>
              {zipping ? 'Gerando .zip...' : 'Baixar selecionados (.zip)'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Limpar seleção</Button>
          </div>
        )}

        <div role="tabpanel" id={idPainel} aria-labelledby={idAba(view)}>
          {loading ? (
            <Table head={cabecalho} loading rows={5} cols={9} />
          ) : filteredFiles.length === 0 ? (
            <div className="card">
              <EmptyState icon={<FolderOpen size={22} />} title="Nenhum arquivo encontrado.">
                Ajuste os filtros ou a busca para ver outros arquivos.
              </EmptyState>
            </div>
          ) : view === 'arvore' ? (
            <FilesTreeView files={filteredFiles} canDelete={canDeleteFile} onDelete={handleDelete} onDownloadFolder={handleZip} showOwner canEditOffice={canEditOffice} onPreview={setPreviewTarget} canReplace={canEdit} onReplace={setReplaceTarget} />
          ) : (
            <>
              {/* Desktop: tabela */}
              <div className="hidden md:block">
                <Table head={cabecalho}>
                  {filteredFiles.map((f) => (
                    <tr key={f.id} className="table-row">
                      <td>
                        <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleOne(f.id)} aria-label="Selecionar arquivo" className="cursor-pointer" />
                      </td>
                      <td className="font-medium">{f.originalName}</td>
                      <td className="text-(--text-2)">{f.owner.name}</td>
                      <td className="text-(--text-2)">{labelFor('serie', f.serie)}</td>
                      <td className="text-(--text-2)">{labelFor('disciplina', f.disciplina)}</td>
                      <td className="text-(--text-2)">{labelFor('tipoMaterial', f.tipoMaterial)}</td>
                      <td className="text-(--text-2)">{formatBytes(f.sizeBytes)}</td>
                      <td className="whitespace-nowrap text-(--text-2)" title={f.lastEditedAt ? `Editado por ${f.lastEditedByName ?? '—'} em ${new Date(f.lastEditedAt).toLocaleString('pt-BR')}` : undefined}>
                        {new Date(f.uploadedAt).toLocaleDateString('pt-BR')}
                        {f.lastEditedAt && <PenLine size={12} className="ml-1.5 inline-block align-[-2px] text-(--primary-ink)" aria-label="Editado on-line" />}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <FileActionButtons f={f} canDelete={canDeleteFile(f)} onDelete={handleDelete} canReplace={canEdit} onReplace={setReplaceTarget} canEditOffice={canEditOffice(f)} onPreview={setPreviewTarget} />
                      </td>
                    </tr>
                  ))}
                </Table>
              </div>

              {/* Mobile: cards */}
              <div className="md:hidden space-y-3">
                {filteredFiles.map((f) => (
                  <Card key={f.id} className="p-3.5">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleOne(f.id)} aria-label="Selecionar arquivo" className="mt-0.5 cursor-pointer" />
                        <div className="min-w-0">
                          <span className="block text-[13px] font-semibold text-(--text) wrap-break-word">{f.originalName}</span>
                          <span className="text-[11px] text-(--text-2)">{f.owner.name}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        <FileActionButtons f={f} canDelete={canDeleteFile(f)} onDelete={handleDelete} canReplace={canEdit} onReplace={setReplaceTarget} canEditOffice={canEditOffice(f)} onPreview={setPreviewTarget} />
                      </div>
                    </div>
                    <div className="row gap-1.5 text-[11px] text-(--text-2)">
                      {f.serie && <span className="pill pill-muted">{labelFor('serie', f.serie)}</span>}
                      {f.disciplina && <span className="pill pill-muted">{labelFor('disciplina', f.disciplina)}</span>}
                      {f.tipoMaterial && <span className="pill pill-muted">{labelFor('tipoMaterial', f.tipoMaterial)}</span>}
                      <span className="pill pill-muted">{formatBytes(f.sizeBytes)}</span>
                      <span className="ml-auto">{new Date(f.uploadedAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>

        {replaceTarget && (
          <ReplaceModal
            file={replaceTarget}
            onClose={() => setReplaceTarget(null)}
            onDone={() => { setReplaceTarget(null); loadFiles(); loadMetrics(); }}
          />
        )}

        {previewTarget && <FilePreviewModal file={previewTarget} onClose={() => setPreviewTarget(null)} />}
        {historyOpen && <HistoryModal onClose={() => setHistoryOpen(false)} />}
      </div>
    </>
  );
}

// ─── Modal: substituir conteúdo do arquivo ────────────────────────────────────────

function ReplaceModal({ file, onClose, onDone }: { file: FileRecord; onClose: () => void; onDone: () => void }) {
  const [picked, setPicked] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!picked || busy) return;
    setBusy(true);
    setError('');
    try {
      await replaceFile(file.id, picked);
      onDone();
    } catch (e: unknown) {
      setError(erroDaApi(e, 'Falha ao substituir o arquivo.'));
      setBusy(false);
    }
  }

  const metaLine = [
    labelFor('serie', file.serie),
    labelFor('disciplina', file.disciplina),
    labelFor('tipoMaterial', file.tipoMaterial),
  ].filter(Boolean).join(' · ');

  return (
    <Modal
      open
      title="Substituir arquivo"
      onClose={onClose}
      maxWidth={440}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={!picked} loading={busy}>{busy ? 'Substituindo...' : 'Substituir'}</Button>
        </>
      )}
    >
      <div className="stack gap-3.5">
        <div className="text-[13px] text-(--text-2)">
          <div className="font-semibold text-(--text) wrap-break-word">{file.originalName}</div>
          <div className="mt-0.5">{file.owner.name}{metaLine ? ` · ${metaLine}` : ''} · {formatBytes(file.sizeBytes)}</div>
        </div>

        <Notice kind="info">
          A versão enviada <strong>substitui</strong> a atual mantendo a mesma classificação. A troca fica registrada no histórico.
        </Notice>

        <Field label="Novo arquivo" required>
          {(ctl) => (
            <input
              {...ctl}
              ref={inputRef}
              type="file"
              data-autofocus
              onChange={(e) => setPicked(e.target.files?.[0] ?? null)}
              className="field text-[13px]"
            />
          )}
        </Field>

        {error && <Notice kind="danger">{error}</Notice>}
      </div>
    </Modal>
  );
}

// ─── Modal: histórico de alterações ───────────────────────────────────────────────

function HistoryModal({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<FileChangeLogRecord[] | null>(null);
  const [error, setError] = useState('');
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    fetchFileLogs({ limit: 200 })
      .then(setLogs)
      .catch((e: unknown) => setError(erroDaApi(e, 'Falha ao carregar o histórico.')));
  }, [tentativa]);

  return (
    <Modal open title="Histórico de alterações" onClose={onClose} maxWidth={640}>
      {/* Lista encostada nas bordas do painel: compensa o padding do .modal-body. */}
      <div className="-mx-[22px] -mb-[22px]">
        {error ? (
          <div className="p-4">
            <Notice kind="danger" actions={<Button variant="secondary" size="sm" onClick={() => { setError(''); setTentativa((n) => n + 1); }}>Tentar novamente</Button>}>
              {error}
            </Notice>
          </div>
        ) : !logs ? (
          <div className="p-4" aria-busy="true" aria-live="polite">
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
            <div className="skeleton skeleton-row" />
            <p className="sr-only">Carregando...</p>
          </div>
        ) : logs.length === 0 ? (
          <EmptyState icon={<History size={22} />} title="Nenhuma alteração registrada ainda." />
        ) : (
          <ul className="m-0 list-none p-0">
            {logs.map((l) => (
              <li key={l.id} className="border-t border-(--line) px-[22px] py-2.5">
                <div className="text-[13px] font-semibold text-(--text) wrap-break-word">{l.fileName}</div>
                <div className="mt-0.5 text-xs text-(--text-2)">
                  {actionLabel(l)} <strong>{l.actorName}</strong>{l.actorEmail ? ` (${l.actorEmail})` : ''}
                </div>
                <div className="row mt-0.5 gap-2 text-xs text-(--text-2)">
                  <span>{new Date(l.createdAt).toLocaleString('pt-BR')}</span>
                  {l.oldSize != null && l.newSize != null && (
                    <span>{formatBytes(l.oldSize)} → {formatBytes(l.newSize)}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
