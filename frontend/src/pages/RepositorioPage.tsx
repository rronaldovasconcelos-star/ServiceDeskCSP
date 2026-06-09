import { useEffect, useState } from 'react';
import { Download, Trash2, FileStack, HardDrive, List, FolderTree, FileArchive } from 'lucide-react';
import api from '../lib/api';
import FilesTreeView from '../components/FilesTreeView';
import { formatBytes, downloadFile, downloadZip, type FileRecord } from '../lib/files';
import { labelFor, SEGMENTOS, SERIES_BY_SEGMENTO, DISCIPLINAS, TIPOS_MATERIAL } from '../lib/taxonomy';
import { useAuth } from '../context/AuthContext';

const selectStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '6px 12px',
  fontSize: '13px',
  background: 'var(--bg-card)',
  color: 'var(--text-primary)',
  outline: 'none',
};

const thStyle: React.CSSProperties = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
};

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '4px',
  color: 'var(--text-secondary)',
  display: 'inline-flex',
  alignItems: 'center',
};

interface Metrics {
  totalFiles: number;
  totalBytes: number;
  byUser: { ownerId: string; name: string; email: string; fileCount: number; totalBytes: number }[];
}

export default function RepositorioPage() {
  const { user } = useAuth();
  // ADMIN exclui qualquer arquivo; demais (GESTOR/USER) só os próprios — espelha o backend.
  const canDeleteFile = (f: FileRecord) => user?.role === 'ADMIN' || f.ownerId === user?.id;
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
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

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '16px',
    boxShadow: 'var(--shadow)',
    flex: '1 1 200px',
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>
        Repositório de Arquivos
      </h2>

      {/* Métricas */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '6px' }}>
            <FileStack size={15} /> Total de Arquivos
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {metrics?.totalFiles ?? '—'}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '6px' }}>
            <HardDrive size={15} /> Armazenamento Total
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {metrics ? formatBytes(metrics.totalBytes) : '—'}
          </div>
        </div>
      </div>

      {/* Por professor */}
      {metrics && metrics.byUser.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)', marginBottom: '24px' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Uso por Professor
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-card-hover)', borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Professor</th>
                <th style={thStyle}>Arquivos</th>
                <th style={thStyle}>Espaço</th>
              </tr>
            </thead>
            <tbody>
              {metrics.byUser.map((u, i) => (
                <tr key={u.ownerId} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                  <td style={{ padding: '10px 16px', color: 'var(--text-primary)' }}>
                    {u.name}
                    <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-secondary)' }}>{u.email}</span>
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{u.fileCount}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{formatBytes(u.totalBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome..."
          style={{ ...selectStyle, minWidth: '180px' }}
        />
        <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} style={selectStyle}>
          <option value="">Todos os professores</option>
          {professorOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={segmento} onChange={(e) => handleSegmento(e.target.value)} style={selectStyle}>
          <option value="">Todos os segmentos</option>
          {SEGMENTOS.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
        <select value={serie} onChange={(e) => setSerie(e.target.value)} disabled={!segmento} style={selectStyle}>
          <option value="">Todas as séries</option>
          {serieOptions.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
        <select value={disciplina} onChange={(e) => setDisciplina(e.target.value)} style={selectStyle}>
          <option value="">Todas as disciplinas</option>
          {DISCIPLINAS.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
        </select>
        <select value={tipoMaterial} onChange={(e) => setTipoMaterial(e.target.value)} style={selectStyle}>
          <option value="">Todos os tipos</option>
          {TIPOS_MATERIAL.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>De</span>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            style={{ ...selectStyle, colorScheme: 'dark' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Até</span>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            style={{ ...selectStyle, colorScheme: 'dark' }}
          />
        </div>
        {(segmento || serie || disciplina || tipoMaterial || dataInicio || dataFim) && (
          <button
            onClick={() => { setSegmento(''); setSerie(''); setDisciplina(''); setTipoMaterial(''); setDataInicio(''); setDataFim(''); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', padding: '6px 4px', textDecoration: 'underline' }}
          >
            Limpar filtros
          </button>
        )}

        {/* Toggle lista / árvore */}
        <div style={{ display: 'flex', marginLeft: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          {([['lista', List, 'Lista'], ['arvore', FolderTree, 'Árvore']] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              title={label}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px',
                border: 'none', cursor: 'pointer', fontSize: '12px',
                background: view === key ? 'var(--bg-active)' : 'var(--bg-card)',
                color: view === key ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Barra de ação em lote (visão lista) */}
      {view === 'lista' && selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', padding: '8px 12px', background: 'var(--bg-active)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>{selected.size} selecionado(s)</span>
          <button
            onClick={() => handleZip([...selected])}
            disabled={zipping}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', border: 'none', borderRadius: 'var(--radius-sm)', background: 'var(--accent)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: zipping ? 'default' : 'pointer', opacity: zipping ? 0.7 : 1 }}
          >
            <FileArchive size={15} /> {zipping ? 'Gerando .zip...' : 'Baixar selecionados (.zip)'}
          </button>
          <button onClick={() => setSelected(new Set())} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', textDecoration: 'underline' }}>
            Limpar seleção
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Carregando...</p>
      ) : filteredFiles.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Nenhum arquivo encontrado.</p>
      ) : view === 'arvore' ? (
        <FilesTreeView files={filteredFiles} canDelete={canDeleteFile} onDelete={handleDelete} onDownloadFolder={handleZip} showOwner />
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden md:block" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-card-hover)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ ...thStyle, width: '36px' }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Selecionar todos" style={{ cursor: 'pointer' }} />
                  </th>
                  <th style={thStyle}>Nome</th>
                  <th style={thStyle}>Professor</th>
                  <th style={thStyle}>Série</th>
                  <th style={thStyle}>Disciplina</th>
                  <th style={thStyle}>Tipo</th>
                  <th style={thStyle}>Tamanho</th>
                  <th style={thStyle}>Data</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((f, i) => (
                  <tr key={f.id} className="table-row" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                    <td style={{ padding: '10px 16px' }}>
                      <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleOne(f.id)} aria-label="Selecionar arquivo" style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontWeight: 500 }}>{f.originalName}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{f.owner.name}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{labelFor('serie', f.serie)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{labelFor('disciplina', f.disciplina)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{labelFor('tipoMaterial', f.tipoMaterial)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{formatBytes(f.sizeBytes)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{new Date(f.uploadedAt).toLocaleDateString('pt-BR')}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => downloadFile(f.id, f.originalName)} style={iconBtnStyle} title="Baixar" aria-label="Baixar"><Download size={16} /></button>
                      {canDeleteFile(f) && <button onClick={() => handleDelete(f)} style={{ ...iconBtnStyle, color: '#ef4444' }} title="Excluir" aria-label="Excluir"><Trash2 size={16} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-3">
            {filteredFiles.map((f) => (
              <div key={f.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: 0 }}>
                    <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleOne(f.id)} aria-label="Selecionar arquivo" style={{ cursor: 'pointer', marginTop: '2px' }} />
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px', wordBreak: 'break-word', display: 'block' }}>{f.originalName}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{f.owner.name}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                    <button onClick={() => downloadFile(f.id, f.originalName)} style={iconBtnStyle} title="Baixar" aria-label="Baixar"><Download size={16} /></button>
                    {canDeleteFile(f) && <button onClick={() => handleDelete(f)} style={{ ...iconBtnStyle, color: '#ef4444' }} title="Excluir" aria-label="Excluir"><Trash2 size={16} /></button>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {f.serie && <span style={{ background: 'var(--bg-card-hover)', padding: '2px 8px', borderRadius: '20px' }}>{labelFor('serie', f.serie)}</span>}
                  {f.disciplina && <span style={{ background: 'var(--bg-card-hover)', padding: '2px 8px', borderRadius: '20px' }}>{labelFor('disciplina', f.disciplina)}</span>}
                  {f.tipoMaterial && <span style={{ background: 'var(--bg-card-hover)', padding: '2px 8px', borderRadius: '20px' }}>{labelFor('tipoMaterial', f.tipoMaterial)}</span>}
                  <span style={{ background: 'var(--bg-card-hover)', padding: '2px 8px', borderRadius: '20px' }}>{formatBytes(f.sizeBytes)}</span>
                  <span style={{ marginLeft: 'auto' }}>{new Date(f.uploadedAt).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
