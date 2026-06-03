import { useEffect, useState } from 'react';
import { Database, Download, Trash2, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import api from '../lib/api';

interface BackupFile {
  id: string;
  name: string;
  sizeBytes: number;
  createdAt: string;
}

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', whiteSpace: 'nowrap',
};

export default function BackupPage() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/backup')
      .then((r) => { setConfigured(r.data.configured); setBackups(r.data.backups ?? []); })
      .catch(() => setError('Não foi possível carregar os backups.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    try {
      await api.post('/backup/run-now');
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Falha ao gerar o backup.');
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (b: BackupFile) => {
    setBusyId(b.id);
    setError('');
    try {
      const res = await api.get(`/backup/${b.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = b.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Falha ao baixar o backup.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (b: BackupFile) => {
    if (!window.confirm(`Excluir o backup "${b.name}"? Esta ação não pode ser desfeita.`)) return;
    setBusyId(b.id);
    setError('');
    try {
      await api.delete(`/backup/${b.id}`);
      load();
    } catch {
      setError('Falha ao excluir o backup.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={20} /> Backups do Sistema
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Cópia do banco de dados enviada para a pasta <strong>Backups CSP</strong> no Google Drive.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={load}
            disabled={loading}
            style={{ padding: '7px 12px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} /> Atualizar
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !configured}
            style={{ padding: '7px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: creating || !configured ? 'not-allowed' : 'pointer', opacity: creating || !configured ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Database size={14} /> {creating ? 'Gerando...' : 'Backup agora'}
          </button>
        </div>
      </div>

      {/* Aviso de configuração */}
      {!configured && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 14px', background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 'var(--radius-sm)', color: '#ca8a04', fontSize: '13px', marginBottom: '16px' }}>
          <AlertTriangle size={16} />
          Google Drive não está configurado neste ambiente — os backups ficam indisponíveis.
        </div>
      )}

      {configured && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 14px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 'var(--radius-sm)', color: '#16a34a', fontSize: '13px', marginBottom: '16px' }}>
          <ShieldCheck size={16} />
          Backup automático diário ativo. Os mais antigos são removidos automaticamente conforme a retenção.
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)', color: '#ef4444', fontSize: '13px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Carregando...</p>
      ) : backups.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Nenhum backup gerado ainda.</p>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-card-hover)', borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Arquivo</th>
                <th style={thStyle}>Data</th>
                <th style={thStyle}>Tamanho</th>
                <th style={thStyle}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b, i) => (
                <tr key={b.id} className="table-row" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                  <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{b.name}</td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {new Date(b.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{formatSize(b.sizeBytes)}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', gap: '14px' }}>
                      <button onClick={() => handleDownload(b)} disabled={busyId === b.id} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '12px', padding: 0, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px', opacity: busyId === b.id ? 0.5 : 1 }}>
                        <Download size={13} /> Baixar
                      </button>
                      <button onClick={() => handleDelete(b)} disabled={busyId === b.id} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '12px', padding: 0, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px', opacity: busyId === b.id ? 0.5 : 1 }}>
                        <Trash2 size={13} /> Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
