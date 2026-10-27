import { useEffect, useState } from 'react';
import { Database, Download, Trash2, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import { Button, IconTile, Table } from '../components/ui';

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

const linkBtn = (cor: string): React.CSSProperties => ({
  background: 'none', border: 'none', cursor: 'pointer', color: cor, fontSize: 12, padding: 0, fontWeight: 500, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4,
});

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
    <>
      <PageHeader
        title="Backups do sistema"
        subtitle="Cópia do banco de dados na pasta Backups CSP do Google Drive"
        actions={(
          <>
            <Button variant="onNavy" icon={<RefreshCw size={14} />} onClick={load} disabled={loading}>Atualizar</Button>
            <Button variant="secondary" icon={<Database size={14} />} onClick={handleCreate} disabled={creating || !configured}>{creating ? 'Gerando...' : 'Backup agora'}</Button>
          </>
        )}
      />

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!configured && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--amber-soft)', borderRadius: 'var(--radius-card)', fontSize: 13 }}>
            <IconTile tone="amber" size={34}><AlertTriangle size={16} /></IconTile>
            Google Drive não está configurado neste ambiente. Os backups ficam indisponíveis.
          </div>
        )}

        {configured && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--teal-soft)', borderRadius: 'var(--radius-card)', fontSize: 13 }}>
            <IconTile tone="teal" size={34}><ShieldCheck size={16} /></IconTile>
            Backup automático diário ativo. Os mais antigos são removidos conforme a retenção.
          </div>
        )}

        {error && (
          <div role="alert" style={{ padding: '10px 14px', background: 'var(--coral-soft)', borderRadius: 'var(--radius-tile)', color: 'var(--coral)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Carregando...</p>
        ) : (
          <Table
            isEmpty={backups.length === 0}
            empty="Nenhum backup gerado ainda."
            head={(
              <tr>
                <th>Arquivo</th>
                <th>Data</th>
                <th>Tamanho</th>
                <th>Ações</th>
              </tr>
            )}
          >
            {backups.map((b) => (
              <tr key={b.id} className="table-row">
                <td style={{ fontWeight: 500, wordBreak: 'break-all' }}>{b.name}</td>
                <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {new Date(b.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{formatSize(b.sizeBytes)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <button onClick={() => handleDownload(b)} disabled={busyId === b.id} style={{ ...linkBtn('var(--electric)'), opacity: busyId === b.id ? 0.5 : 1 }}>
                      <Download size={13} /> Baixar
                    </button>
                    <button onClick={() => handleDelete(b)} disabled={busyId === b.id} style={{ ...linkBtn('var(--coral)'), opacity: busyId === b.id ? 0.5 : 1 }}>
                      <Trash2 size={13} /> Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </>
  );
}
