import { useEffect, useState } from 'react';
import { List, FolderTree, FileArchive, PenLine, Search, FolderOpen } from 'lucide-react';
import api from '../lib/api';
import FileUploader from '../components/FileUploader';
import FilesTreeView from '../components/FilesTreeView';
import FileActionButtons from '../components/FileActionButtons';
import FilePreviewModal from '../components/FilePreviewModal';
import PageHeader from '../components/PageHeader';
import { Button, Card, EmptyState, Field, Notice, Table } from '../components/ui';
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
  const [erro, setErro] = useState('');
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
    setErro('');
    setSelected(new Set());
    const params: Record<string, string> = {};
    if (q) params.q = q;
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

  const vazio = (
    <EmptyState icon={<FolderOpen size={22} />} title="Nenhum arquivo com esses filtros.">
      Envie o primeiro acima ou ajuste os filtros.
    </EmptyState>
  );

  const cabecalho = (
    <tr>
      <th className="w-9">
        <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Selecionar todos" className="cursor-pointer" />
      </th>
      <th>Nome</th>
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
        title="Meus arquivos"
        description={loading ? 'Carregando…' : `${files.length} arquivo${files.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)}`}
        actions={(
          <div className="search-bar" role="search">
            <Search size={14} className="shrink-0" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome..." aria-label="Buscar arquivos" />
          </div>
        )}
      />

      <div className="page-body stack gap-4">
        <FileUploader onUploaded={load} />

        {/* Filtros */}
        <div className="toolbar mb-0">
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
                {disciplinaOptions.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
              </select>
            )}
          </Field>
          <Field label="Tipo">
            {(ctl) => (
              <select {...ctl} value={tipoMaterial} onChange={(e) => setTipoMaterial(e.target.value)} className="field w-auto">
                <option value="">Todos os tipos</option>
                {tipoOptions.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            )}
          </Field>

          <div className="kanban-filters mb-0 ml-auto" role="group" aria-label="Modo de exibição">
            {([['lista', List, 'Lista'], ['arvore', FolderTree, 'Árvore']] as const).map(([key, Icon, label]) => (
              <button key={key} type="button" onClick={() => setView(key)} className={`filter-btn inline-flex items-center gap-1.5${view === key ? ' active' : ''}`} aria-pressed={view === key}>
                <Icon size={14} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        </div>

        {erro && (
          <Notice kind="danger" actions={<Button variant="secondary" size="sm" onClick={load}>Tentar novamente</Button>}>
            {erro}
          </Notice>
        )}

        {/* Barra de ação em lote (visão lista) */}
        {view === 'lista' && selected.size > 0 && (
          <div className="row gap-3 rounded-(--radius-sm) bg-(--primary-soft) px-3.5 py-2" role="status">
            <span className="text-[13px] font-semibold text-(--text)">{selected.size} selecionado(s)</span>
            <Button size="sm" icon={<FileArchive size={14} />} onClick={() => handleZip([...selected])} loading={zipping}>
              {zipping ? 'Gerando .zip...' : 'Baixar selecionados (.zip)'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Limpar seleção
            </Button>
          </div>
        )}

        {loading ? (
          <Table head={cabecalho} loading rows={5} cols={8} />
        ) : view === 'arvore' ? (
          files.length === 0
            ? <div className="card">{vazio}</div>
            : <FilesTreeView files={files} canDelete={canDeleteFile} onDelete={handleDelete} onDownloadFolder={handleZip} canEditOffice={canEditOffice} onPreview={setPreviewTarget} />
        ) : (
          <>
            <div className="hidden md:block">
              <Table isEmpty={files.length === 0} empty={vazio} head={cabecalho}>
                {files.map((f) => (
                  <tr key={f.id} className="table-row">
                    <td>
                      <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleOne(f.id)} aria-label="Selecionar arquivo" className="cursor-pointer" />
                    </td>
                    <td className="font-medium">{f.originalName}</td>
                    <td className="text-(--text-2)">{labelFor('serie', f.serie)}</td>
                    <td className="text-(--text-2)">{labelFor('disciplina', f.disciplina)}</td>
                    <td className="text-(--text-2)">{labelFor('tipoMaterial', f.tipoMaterial)}</td>
                    <td className="text-(--text-2)">{formatBytes(f.sizeBytes)}</td>
                    <td className="whitespace-nowrap text-(--text-2)" title={f.lastEditedAt ? `Editado por ${f.lastEditedByName ?? '—'} em ${new Date(f.lastEditedAt).toLocaleString('pt-BR')}` : undefined}>
                      {new Date(f.uploadedAt).toLocaleDateString('pt-BR')}
                      {f.lastEditedAt && <PenLine size={12} className="ml-1.5 inline-block align-[-2px] text-(--primary-ink)" aria-label="Editado" />}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <FileActionButtons f={f} canDelete={canDeleteFile(f)} onDelete={handleDelete} canEditOffice={canEditOffice()} onPreview={setPreviewTarget} />
                    </td>
                  </tr>
                ))}
              </Table>
            </div>

            <div className="md:hidden space-y-3">
              {files.length === 0 && <div className="card">{vazio}</div>}
              {files.map((f) => (
                <Card key={f.id} className="p-3.5">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleOne(f.id)} aria-label="Selecionar arquivo" className="mt-0.5 cursor-pointer" />
                      <span className="text-[13px] font-semibold wrap-break-word">{f.originalName}</span>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <FileActionButtons f={f} canDelete={canDeleteFile(f)} onDelete={handleDelete} canEditOffice={canEditOffice()} onPreview={setPreviewTarget} />
                    </div>
                  </div>
                  <div className="row gap-1.5 text-[11px] text-(--text-2)">
                    {f.serie && <span className="pill pill-muted">{labelFor('serie', f.serie)}</span>}
                    {f.disciplina && <span className="pill pill-muted">{labelFor('disciplina', f.disciplina)}</span>}
                    {f.tipoMaterial && <span className="pill pill-muted">{labelFor('tipoMaterial', f.tipoMaterial)}</span>}
                    <span className="pill pill-muted">{shortType(f.mimeType)}</span>
                    <span className="ml-auto">{new Date(f.uploadedAt).toLocaleDateString('pt-BR')}</span>
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
