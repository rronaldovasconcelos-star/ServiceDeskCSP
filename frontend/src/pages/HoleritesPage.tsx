import { useEffect, useState } from 'react';
import { Download, RefreshCw, AlertTriangle } from 'lucide-react';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import { Button, IconTile, Table } from '../components/ui';
import { formatarCentavos, formatarCompetencia, baixarHoleritePdf, type HoleriteResumo } from '../lib/holerites';

interface Resposta {
  vinculado: boolean;
  colaborador: { id: string; codigo: string; nome: string } | null;
  holerites: HoleriteResumo[];
}

const tdNum: React.CSSProperties = { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

export default function HoleritesPage() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    api.get<Resposta>('/holerites/meus')
      .then((r) => setDados(r.data))
      .catch(() => setError('Não foi possível carregar os holerites.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDownload = async (h: HoleriteResumo) => {
    setBusyId(h.id);
    setError('');
    try {
      await baixarHoleritePdf(h.id, `holerite_${h.competencia}.pdf`);
    } catch {
      setError('Falha ao baixar o holerite.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Meus holerites"
        subtitle={dados?.colaborador ? `Colaborador ${dados.colaborador.codigo} · ${dados.colaborador.nome}` : 'Demonstrativos de pagamento em PDF'}
        actions={<Button variant="onNavy" icon={<RefreshCw size={14} />} onClick={load} disabled={loading}>Atualizar</Button>}
      />

      <div className="page-body" style={{ maxWidth: 1000, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <div role="alert" style={{ padding: '10px 14px', background: 'var(--coral-soft)', borderRadius: 'var(--radius-tile)', color: 'var(--coral)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Carregando...</p>
        ) : !dados?.vinculado ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 18px', background: 'var(--amber-soft)', borderRadius: 'var(--radius-card)', fontSize: 13 }}>
            <IconTile tone="amber" size={36}><AlertTriangle size={18} /></IconTile>
            <div>
              <strong>Seu login ainda não está vinculado a um colaborador da folha.</strong>
              <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>
                Procure o RH para fazer o vínculo. Assim que estiver feito, os holerites aparecem aqui.
              </p>
            </div>
          </div>
        ) : (
          <Table
            isEmpty={dados.holerites.length === 0}
            empty="Nenhum holerite importado ainda para o seu cadastro."
            head={(
              <tr>
                <th>Competência</th>
                <th style={{ textAlign: 'right' }}>Vencimentos</th>
                <th style={{ textAlign: 'right' }}>Descontos</th>
                <th style={{ textAlign: 'right' }}>Líquido</th>
                <th></th>
              </tr>
            )}
          >
            {dados.holerites.map((h) => (
              <tr key={h.id} className="table-row">
                <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{formatarCompetencia(h.competencia)}</td>
                <td style={{ ...tdNum, color: 'var(--text-secondary)' }}>{formatarCentavos(h.totalVencimentos)}</td>
                <td style={{ ...tdNum, color: 'var(--text-secondary)' }}>{formatarCentavos(h.totalDescontos)}</td>
                <td style={{ ...tdNum, fontWeight: 600 }}>{formatarCentavos(h.liquido)}</td>
                <td style={{ textAlign: 'right' }}>
                  <Button size="sm" icon={<Download size={13} />} onClick={() => handleDownload(h)} disabled={busyId === h.id}>
                    {busyId === h.id ? 'Gerando...' : 'Baixar PDF'}
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </>
  );
}
