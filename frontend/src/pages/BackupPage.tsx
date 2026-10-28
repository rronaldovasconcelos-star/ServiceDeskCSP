import { useEffect, useState } from 'react';
import { Database, Download, Trash2, RefreshCw, HardDrive } from 'lucide-react';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import { Button, EmptyState, Notice, Table } from '../components/ui';
import { formatDateTime } from '../lib/dates';

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

export default function BackupPage() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/backup')
      .then((r) => { setConfigured(r.data.configured); setBackups(r.data.backups ?? []); setLoadError(false); })
      .catch(() => setLoadError(true))
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

  const cabecalho = (
    <tr>
      <th>Arquivo</th>
      <th>Data</th>
      <th>Tamanho</th>
      <th><span className="sr-only">Ações</span></th>
    </tr>
  );

  const vazio = (
    <EmptyState
      icon={<HardDrive size={22} />}
      title="Nenhum backup gerado ainda"
      action={configured ? <Button variant="primary" icon={<Database size={15} />} onClick={handleCreate} loading={creating}>Backup agora</Button> : undefined}
    >
      {configured
        ? 'O backup automático diário cria o primeiro arquivo; você também pode gerar um agora.'
        : 'Configure o Google Drive para habilitar os backups.'}
    </EmptyState>
  );

  return (
    <>
      <PageHeader
        title="Backups do sistema"
        description="Cópia do banco de dados na pasta Backups CSP do Google Drive"
        actions={(
          <>
            <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={load} disabled={loading}>Atualizar</Button>
            <Button variant="primary" icon={<Database size={14} />} onClick={handleCreate} disabled={!configured} loading={creating}>
              {creating ? 'Gerando...' : 'Backup agora'}
            </Button>
          </>
        )}
      />

      <main className="page-body stack">
        {!loading && !loadError && !configured && (
          <Notice kind="warning" title="Google Drive não configurado">
            Google Drive não está configurado neste ambiente. Os backups ficam indisponíveis.
          </Notice>
        )}

        {!loading && !loadError && configured && (
          <Notice kind="success">
            Backup automático diário ativo. Os mais antigos são removidos conforme a retenção.
          </Notice>
        )}

        {error && (
          <Notice kind="danger" onClose={() => setError('')}>{error}</Notice>
        )}

        {loadError ? (
          <Notice
            kind="danger"
            actions={<Button size="sm" variant="secondary" onClick={load}>Tentar novamente</Button>}
          >
            Não foi possível carregar os backups.
          </Notice>
        ) : loading ? (
          <Table loading rows={5} cols={4} head={cabecalho} />
        ) : (
          <Table isEmpty={backups.length === 0} empty={vazio} head={cabecalho}>
            {backups.map((b) => (
              <tr key={b.id}>
                <td className="font-medium break-all">{b.name}</td>
                <td className="muted whitespace-nowrap">{formatDateTime(b.createdAt)}</td>
                <td className="muted whitespace-nowrap">{formatSize(b.sizeBytes)}</td>
                <td>
                  <div className="row flex-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Download size={14} />}
                      onClick={() => handleDownload(b)}
                      disabled={busyId !== null && busyId !== b.id}
                      loading={busyId === b.id}
                    >
                      Baixar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      aria-label={`Excluir backup ${b.name}`}
                      title="Excluir backup"
                      icon={<Trash2 size={16} />}
                      onClick={() => handleDelete(b)}
                      disabled={busyId !== null}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </main>
    </>
  );
}
