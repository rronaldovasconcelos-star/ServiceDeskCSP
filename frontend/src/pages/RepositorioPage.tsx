import { useEffect, useState } from 'react';
import { Download, Trash2, FileStack, HardDrive } from 'lucide-react';
import api from '../lib/api';
import { formatBytes, downloadFile, type FileRecord } from '../lib/files';

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

interface SimpleUser {
  id: string;
  name: string;
}

const CATEGORIAS = [
  'Provas', 'Planos de Aula', 'Material de Apoio', 'Trabalhos', 'Documentos',
  'Atividades de Sala', 'Projetos', 'Capas', 'Para Casa', 'Simulados',
];

export default function RepositorioPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [categoria, setCategoria] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  function loadMetrics() {
    api.get('/files/metrics').then((r) => setMetrics(r.data));
  }

  function loadFiles() {
    setLoading(true);
    const params: Record<string, string> = {};
    if (q) params.q = q;
    if (ownerId) params.ownerId = ownerId;
    api.get('/files', { params })
      .then((r) => setFiles(r.data))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadMetrics();
    api.get('/users').then((r) => setUsers(r.data));
  }, []);

  useEffect(() => {
    const t = setTimeout(loadFiles, q ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, ownerId]);

  // Filtragem local: categoria e data aplicadas sobre os arquivos já carregados
  const filteredFiles = files.filter((f) => {
    if (categoria && f.folder !== categoria) return false;
    if (dataInicio && new Date(f.uploadedAt) < new Date(dataInicio)) return false;
    if (dataFim) {
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);
      if (new Date(f.uploadedAt) > fim) return false;
    }
    return true;
  });

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
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={selectStyle}>
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
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
        {(categoria || dataInicio || dataFim) && (
          <button
            onClick={() => { setCategoria(''); setDataInicio(''); setDataFim(''); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', padding: '6px 4px', textDecoration: 'underline' }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Carregando...</p>
      ) : filteredFiles.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Nenhum arquivo encontrado.</p>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden md:block" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-card-hover)', borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Nome</th>
                  <th style={thStyle}>Professor</th>
                  <th style={thStyle}>Categoria</th>
                  <th style={thStyle}>Tamanho</th>
                  <th style={thStyle}>Data</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((f, i) => (
                  <tr key={f.id} className="table-row" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontWeight: 500 }}>{f.originalName}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{f.owner.name}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{f.folder ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{formatBytes(f.sizeBytes)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{new Date(f.uploadedAt).toLocaleDateString('pt-BR')}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => downloadFile(f.id, f.originalName)} style={iconBtnStyle} title="Baixar" aria-label="Baixar"><Download size={16} /></button>
                      <button onClick={() => handleDelete(f)} style={{ ...iconBtnStyle, color: '#ef4444' }} title="Excluir" aria-label="Excluir"><Trash2 size={16} /></button>
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
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px', wordBreak: 'break-word', display: 'block' }}>{f.originalName}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{f.owner.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                    <button onClick={() => downloadFile(f.id, f.originalName)} style={iconBtnStyle} title="Baixar" aria-label="Baixar"><Download size={16} /></button>
                    <button onClick={() => handleDelete(f)} style={{ ...iconBtnStyle, color: '#ef4444' }} title="Excluir" aria-label="Excluir"><Trash2 size={16} /></button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {f.folder && <span style={{ background: 'var(--bg-card-hover)', padding: '2px 8px', borderRadius: '20px' }}>{f.folder}</span>}
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
