import { useEffect, useRef, useState } from 'react';
import { FileStack, HardDrive, List, FolderTree, FileArchive, History, PenLine, Search } from 'lucide-react';
import api from '../lib/api';
import FilesTreeView from '../components/FilesTreeView';
import FileActionButtons from '../components/FileActionButtons';
import FilePreviewModal from '../components/FilePreviewModal';
import PageHeader from '../components/PageHeader';
import { Button, Card, IconTile, Modal, Table } from '../components/ui';
import { useSyncOnFocus } from '../hooks/useSyncOnFocus';
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

  function loadMetrics() {
    api.get('/files/metrics').then((r) => setMetrics(r.data));
  }

  function loadFiles() {
    setLoading(true);
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

  return (
    <>
      <PageHeader
        title="Repositório de arquivos"
        subtitle={metrics ? `${metrics.totalFiles} arquivo${metrics.totalFiles === 1 ? '' : 's'} · ${formatBytes(metrics.totalBytes)} em uso` : 'Carregando…'}
        actions={(
          <>
            <div className="search-bar" role="search" style={{ background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.18)' }}>
              <Search size={14} style={{ color: 'var(--on-navy-muted)', flexShrink: 0 }} aria-hidden="true" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome..." aria-label="Buscar arquivos" style={{ color: 'var(--on-navy)' }} />
            </div>
            {canEdit && (
              <Button variant="onNavy" icon={<History size={15} />} onClick={() => setHistoryOpen(true)}>
                Histórico de alterações
              </Button>
            )}
          </>
        )}
      />

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Métricas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
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
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-secondary)' }}>{u.email}</span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{u.fileCount}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{formatBytes(u.totalBytes)}</td>
                </tr>
              ))}
            </Table>
          </div>
        )}

        {/* Filtros */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="field" style={{ width: 'auto' }}>
            <option value="">Todos os professores</option>
            {professorOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select value={segmento} onChange={(e) => handleSegmento(e.target.value)} className="field" style={{ width: 'auto' }}>
            <option value="">Todos os segmentos</option>
            {SEGMENTOS.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
          <select value={serie} onChange={(e) => setSerie(e.target.value)} disabled={!segmento} className="field" style={{ width: 'auto' }}>
            <option value="">Todas as séries</option>
            {serieOptions.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
          <select value={disciplina} onChange={(e) => setDisciplina(e.target.value)} className="field" style={{ width: 'auto' }}>
            <option value="">Todas as disciplinas</option>
            {DISCIPLINAS.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
          </select>
          <select value={tipoMaterial} onChange={(e) => setTipoMaterial(e.target.value)} className="field" style={{ width: 'auto' }}>
            <option value="">Todos os tipos</option>
            {TIPOS_MATERIAL.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            De{' '}
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="field" style={{ width: 'auto' }} />
          </label>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Até{' '}
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="field" style={{ width: 'auto' }} />
          </label>
          {temFiltro && (
            <Button variant="ghost" size="sm" onClick={() => { setSegmento(''); setSerie(''); setDisciplina(''); setTipoMaterial(''); setDataInicio(''); setDataFim(''); }}>
              Limpar filtros
            </Button>
          )}

          {/* Toggle lista / árvore */}
          <div className="tabs" style={{ marginLeft: 'auto' }} role="tablist" aria-label="Modo de exibição">
            {([['lista', List, 'Lista'], ['arvore', FolderTree, 'Árvore']] as const).map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                title={label}
                className={`tab${view === key ? ' active' : ''}`}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Barra de ação em lote (visão lista) */}
        {view === 'lista' && selected.size > 0 && (
          <Card style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--electric-soft)', borderColor: 'transparent' }}>
            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{selected.size} selecionado(s)</span>
            <Button size="sm" icon={<FileArchive size={15} />} onClick={() => handleZip([...selected])} disabled={zipping}>
              {zipping ? 'Gerando .zip...' : 'Baixar selecionados (.zip)'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Limpar seleção</Button>
          </Card>
        )}

        {loading ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Carregando...</p>
        ) : filteredFiles.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Nenhum arquivo encontrado.</p>
        ) : view === 'arvore' ? (
          <FilesTreeView files={filteredFiles} canDelete={canDeleteFile} onDelete={handleDelete} onDownloadFolder={handleZip} showOwner canEditOffice={canEditOffice} onPreview={setPreviewTarget} canReplace={canEdit} onReplace={setReplaceTarget} />
        ) : (
          <>
            {/* Desktop: tabela */}
            <div className="hidden md:block">
              <Table head={(
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Selecionar todos" style={{ cursor: 'pointer' }} />
                  </th>
                  <th>Nome</th>
                  <th>Professor</th>
                  <th>Série</th>
                  <th>Disciplina</th>
                  <th>Tipo</th>
                  <th>Tamanho</th>
                  <th>Data</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              )}>
                {filteredFiles.map((f) => (
                  <tr key={f.id} className="table-row">
                    <td>
                      <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleOne(f.id)} aria-label="Selecionar arquivo" style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ fontWeight: 500 }}>{f.originalName}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{f.owner.name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{labelFor('serie', f.serie)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{labelFor('disciplina', f.disciplina)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{labelFor('tipoMaterial', f.tipoMaterial)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{formatBytes(f.sizeBytes)}</td>
                    <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }} title={f.lastEditedAt ? `Editado por ${f.lastEditedByName ?? '—'} em ${new Date(f.lastEditedAt).toLocaleString('pt-BR')}` : undefined}>
                      {new Date(f.uploadedAt).toLocaleDateString('pt-BR')}
                      {f.lastEditedAt && <PenLine size={12} style={{ marginLeft: 6, verticalAlign: '-2px', color: 'var(--electric)' }} aria-label="Editado on-line" />}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <FileActionButtons f={f} canDelete={canDeleteFile(f)} onDelete={handleDelete} canReplace={canEdit} onReplace={setReplaceTarget} canEditOffice={canEditOffice(f)} onPreview={setPreviewTarget} />
                    </td>
                  </tr>
                ))}
              </Table>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden space-y-3">
              {filteredFiles.map((f) => (
                <Card key={f.id} style={{ padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                      <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleOne(f.id)} aria-label="Selecionar arquivo" style={{ cursor: 'pointer', marginTop: 2 }} />
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13, wordBreak: 'break-word', display: 'block' }}>{f.originalName}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{f.owner.name}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <FileActionButtons f={f} canDelete={canDeleteFile(f)} onDelete={handleDelete} canReplace={canEdit} onReplace={setReplaceTarget} canEditOffice={canEditOffice(f)} onPreview={setPreviewTarget} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 11, color: 'var(--text-secondary)' }}>
                    {f.serie && <span className="pill pill-muted">{labelFor('serie', f.serie)}</span>}
                    {f.disciplina && <span className="pill pill-muted">{labelFor('disciplina', f.disciplina)}</span>}
                    {f.tipoMaterial && <span className="pill pill-muted">{labelFor('tipoMaterial', f.tipoMaterial)}</span>}
                    <span className="pill pill-muted">{formatBytes(f.sizeBytes)}</span>
                    <span style={{ marginLeft: 'auto' }}>{new Date(f.uploadedAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}

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
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Falha ao substituir o arquivo.');
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
          <Button onClick={submit} disabled={!picked || busy}>{busy ? 'Substituindo...' : 'Substituir'}</Button>
        </>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600, wordBreak: 'break-word' }}>{file.originalName}</div>
          <div style={{ marginTop: 2 }}>{file.owner.name}{metaLine ? ` · ${metaLine}` : ''} · {formatBytes(file.sizeBytes)}</div>
        </div>

        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
          A versão enviada <strong>substitui</strong> a atual mantendo a mesma classificação. A troca fica registrada no histórico.
        </p>

        <input
          ref={inputRef}
          type="file"
          onChange={(e) => setPicked(e.target.files?.[0] ?? null)}
          style={{ fontSize: 13, color: 'var(--text-primary)' }}
        />

        {error && <div style={{ fontSize: 12, color: 'var(--coral)' }}>{error}</div>}
      </div>
    </Modal>
  );
}

// ─── Modal: histórico de alterações ───────────────────────────────────────────────

function HistoryModal({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<FileChangeLogRecord[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchFileLogs({ limit: 200 })
      .then(setLogs)
      .catch((e: any) => setError(e?.response?.data?.error ?? 'Falha ao carregar o histórico.'));
  }, []);

  return (
    <Modal open title="Histórico de alterações" onClose={onClose} maxWidth={640}>
      <div style={{ margin: '0 -22px -22px' }}>
        {error ? (
          <p style={{ padding: 16, fontSize: 13, color: 'var(--coral)' }}>{error}</p>
        ) : !logs ? (
          <p style={{ padding: 16, fontSize: 13, color: 'var(--text-secondary)' }}>Carregando...</p>
        ) : logs.length === 0 ? (
          <p style={{ padding: 16, fontSize: 13, color: 'var(--text-secondary)' }}>Nenhuma alteração registrada ainda.</p>
        ) : (
          logs.map((l) => (
            <div key={l.id} style={{ padding: '10px 22px', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, wordBreak: 'break-word' }}>{l.fileName}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                {actionLabel(l)} <strong>{l.actorName}</strong>{l.actorEmail ? ` (${l.actorEmail})` : ''}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span>{new Date(l.createdAt).toLocaleString('pt-BR')}</span>
                {l.oldSize != null && l.newSize != null && (
                  <span>{formatBytes(l.oldSize)} → {formatBytes(l.newSize)}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
