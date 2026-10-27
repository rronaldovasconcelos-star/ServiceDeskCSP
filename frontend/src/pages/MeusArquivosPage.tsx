import { useEffect, useState } from 'react';
import { List, FolderTree, FileArchive, PenLine, Search } from 'lucide-react';
import api from '../lib/api';
import FileUploader from '../components/FileUploader';
import FilesTreeView from '../components/FilesTreeView';
import FileActionButtons from '../components/FileActionButtons';
import FilePreviewModal from '../components/FilePreviewModal';
import PageHeader from '../components/PageHeader';
import { Button, Card, Table } from '../components/ui';
import { useSyncOnFocus } from '../hooks/useSyncOnFocus';
import { formatBytes, downloadZip, fetchCapabilities, SEM_CAPACIDADES, type FileCapabilities, type FileRecord } from '../lib/files';
import { labelFor, SEGMENTOS, SERIES_BY_SEGMENTO, DISCIPLINAS, TIPOS_MATERIAL, disciplinasFor, tiposFor } from '../lib/taxonomy';
import { useAuth } from '../context/AuthContext';

/** Tipo curto a partir do mimetype para exibição. */
function shortType(mime: string): string {
  if (mime === 'application/pdf') return 'PDF';
  if (mime.includes('word')) return 'Word';
  if (mime.includes('sheet') || mime.includes('excel')) return 'Excel';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'PPT';
  if (mime.startsWith('video/')) return 'Vídeo';
  if (mime.startsWith('image/')) return 'Imagem';
  if (mime.includes('zip')) return 'ZIP';
  return mime.split('/')[1]?.toUpperCase() ?? 'Arquivo';
}

export default function MeusArquivosPage() {
  const { user } = useAuth();
  // ADMIN exclui qualquer arquivo; demais (GESTOR/USER) só os próprios — espelha o backend.
  const canDeleteFile = (f: FileRecord) => user?.role === 'ADMIN' || f.ownerId === user?.id;
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [capabilities, setCapabilities] = useState<FileCapabilities | null>(null);
  const [previewTarget, setPreviewTarget] = useState<FileRecord | null>(null);
  useEffect(() => { fetchCapabilities().then(setCapabilities).catch(() => setCapabilities(SEM_CAPACIDADES)); }, []);
  const canEditOffice = () => !!capabilities?.editInOffice;
  useSyncOnFocus((f) => setFiles((prev) => prev.map((x) => (x.id === f.id ? f : x))));
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [segmento, setSegmento] = useState('');
  const [serie, setSerie] = useState('');
  const [disciplina, setDisciplina] = useState('');
  const [tipoMaterial, setTipoMaterial] = useState('');
  const [view, setView] = useState<'lista' | 'arvore'>('lista');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);

  function load() {
    setLoading(true);
    setSelected(new Set());
    const params: Record<string, string> = {};
    if (q) params.q = q;
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
  const allSelected = files.length > 0 && selected.size === files.length;
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(files.map((f) => f.id)));
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
    const t = setTimeout(load, q ? 300 : 0); // pequeno debounce na busca
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, segmento, serie, disciplina, tipoMaterial]);

  // Ao trocar o segmento, série/disciplina/tipo anteriores podem não pertencer
  // mais a ele → reseta para não filtrar por um valor fora da nova coluna.
  function handleSegmento(value: string) {
    setSegmento(value);
    setSerie('');
    setDisciplina('');
    setTipoMaterial('');
  }
  const serieOptions = segmento ? SERIES_BY_SEGMENTO[segmento] ?? [] : [];
  const disciplinaOptions = segmento ? disciplinasFor(segmento) : DISCIPLINAS;
  const tipoOptions = segmento ? tiposFor(segmento) : TIPOS_MATERIAL;

  async function handleDelete(f: FileRecord) {
    if (!confirm(`Excluir "${f.originalName}"? Esta ação não pode ser desfeita.`)) return;
    await api.delete(`/files/${f.id}`);
    load();
  }

  const totalBytes = files.reduce((s, f) => s + f.sizeBytes, 0);

  return (
    <>
      <PageHeader
        title="Meus arquivos"
        subtitle={loading ? 'Carregando…' : `${files.length} arquivo${files.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)}`}
        actions={(
          <div className="search-bar" role="search" style={{ background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.18)' }}>
            <Search size={14} style={{ color: 'var(--on-navy-muted)', flexShrink: 0 }} aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome..." aria-label="Buscar arquivos" style={{ color: 'var(--on-navy)' }} />
          </div>
        )}
      />

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FileUploader onUploaded={load} />

        {/* Filtros */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
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
            {disciplinaOptions.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
          </select>
          <select value={tipoMaterial} onChange={(e) => setTipoMaterial(e.target.value)} className="field" style={{ width: 'auto' }}>
            <option value="">Todos os tipos</option>
            {tipoOptions.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>

          <div className="kanban-filters" style={{ marginLeft: 'auto', marginBottom: 0 }} role="group" aria-label="Modo de exibição">
            {([['lista', List, 'Lista'], ['arvore', FolderTree, 'Árvore']] as const).map(([key, Icon, label]) => (
              <button key={key} onClick={() => setView(key)} className={`filter-btn${view === key ? ' active' : ''}`} aria-pressed={view === key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Barra de ação em lote (visão lista) */}
        {view === 'lista' && selected.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', background: 'var(--electric-soft)', borderRadius: 'var(--radius-tile)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{selected.size} selecionado(s)</span>
            <Button size="sm" icon={<FileArchive size={14} />} onClick={() => handleZip([...selected])} disabled={zipping}>
              {zipping ? 'Gerando .zip...' : 'Baixar selecionados (.zip)'}
            </Button>
            <button onClick={() => setSelected(new Set())} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'underline', fontFamily: 'inherit' }}>
              Limpar seleção
            </button>
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Carregando...</p>
        ) : view === 'arvore' ? (
          files.length === 0
            ? <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Nenhum arquivo com esses filtros.</p>
            : <FilesTreeView files={files} canDelete={canDeleteFile} onDelete={handleDelete} onDownloadFolder={handleZip} canEditOffice={canEditOffice} onPreview={setPreviewTarget} />
        ) : (
          <>
            <div className="hidden md:block">
              <Table
                isEmpty={files.length === 0}
                empty="Nenhum arquivo com esses filtros. Envie o primeiro acima."
                head={(
                  <tr>
                    <th style={{ width: 36 }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Selecionar todos" style={{ cursor: 'pointer' }} />
                    </th>
                    <th>Nome</th>
                    <th>Série</th>
                    <th>Disciplina</th>
                    <th>Tipo</th>
                    <th>Tamanho</th>
                    <th>Data</th>
                    <th style={{ textAlign: 'right' }}>Ações</th>
                  </tr>
                )}
              >
                {files.map((f) => (
                  <tr key={f.id} className="table-row">
                    <td>
                      <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleOne(f.id)} aria-label="Selecionar arquivo" style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ fontWeight: 500 }}>{f.originalName}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{labelFor('serie', f.serie)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{labelFor('disciplina', f.disciplina)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{labelFor('tipoMaterial', f.tipoMaterial)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{formatBytes(f.sizeBytes)}</td>
                    <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }} title={f.lastEditedAt ? `Editado por ${f.lastEditedByName ?? '—'} em ${new Date(f.lastEditedAt).toLocaleString('pt-BR')}` : undefined}>
                      {new Date(f.uploadedAt).toLocaleDateString('pt-BR')}
                      {f.lastEditedAt && <PenLine size={12} style={{ marginLeft: 6, verticalAlign: -2, color: 'var(--electric)' }} aria-label="Editado" />}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <FileActionButtons f={f} canDelete={canDeleteFile(f)} onDelete={handleDelete} canEditOffice={canEditOffice()} onPreview={setPreviewTarget} />
                    </td>
                  </tr>
                ))}
              </Table>
            </div>

            <div className="md:hidden space-y-3">
              {files.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Nenhum arquivo com esses filtros.</p>}
              {files.map((f) => (
                <Card key={f.id} style={{ padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                      <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleOne(f.id)} aria-label="Selecionar arquivo" style={{ cursor: 'pointer', marginTop: 2 }} />
                      <span style={{ fontWeight: 600, fontSize: 13, wordBreak: 'break-word' }}>{f.originalName}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <FileActionButtons f={f} canDelete={canDeleteFile(f)} onDelete={handleDelete} canEditOffice={canEditOffice()} onPreview={setPreviewTarget} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11, color: 'var(--text-secondary)', alignItems: 'center' }}>
                    {f.serie && <span className="pill pill-muted">{labelFor('serie', f.serie)}</span>}
                    {f.disciplina && <span className="pill pill-muted">{labelFor('disciplina', f.disciplina)}</span>}
                    {f.tipoMaterial && <span className="pill pill-muted">{labelFor('tipoMaterial', f.tipoMaterial)}</span>}
                    <span className="pill pill-muted">{shortType(f.mimeType)}</span>
                    <span style={{ marginLeft: 'auto' }}>{new Date(f.uploadedAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
        {previewTarget && <FilePreviewModal file={previewTarget} onClose={() => setPreviewTarget(null)} />}
      </div>
    </>
  );
}
