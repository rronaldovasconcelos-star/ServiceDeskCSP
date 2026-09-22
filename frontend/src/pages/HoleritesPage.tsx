import { useEffect, useState } from 'react';
import { Receipt, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import api from '../lib/api';
import { formatarCentavos, formatarCompetencia, baixarHoleritePdf, type HoleriteResumo } from '../lib/holerites';

interface Resposta {
  vinculado: boolean;
  colaborador: { id: string; codigo: string; nome: string } | null;
  holerites: HoleriteResumo[];
}

const thStyle: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', whiteSpace: 'nowrap',
};
const tdNum: React.CSSProperties = { padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

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
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Receipt size={20} /> Meus Holerites
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Demonstrativos de pagamento disponíveis para download em PDF.
            {dados?.colaborador && <> Colaborador <strong>{dados.colaborador.codigo}</strong> · {dados.colaborador.nome}</>}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{ padding: '7px 12px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)', color: '#ef4444', fontSize: '13px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Carregando...</p>
      ) : !dados?.vinculado ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '14px 16px', background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 'var(--radius-sm)', color: '#ca8a04', fontSize: '13px' }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <strong>Seu login ainda não está vinculado a um colaborador da folha.</strong>
            <p style={{ margin: '4px 0 0' }}>
              Procure o RH para fazer o vínculo. Assim que estiver feito, os holerites aparecem aqui.
            </p>
          </div>
        </div>
      ) : dados.holerites.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Nenhum holerite importado ainda para o seu cadastro.</p>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-card-hover)', borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Competência</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Vencimentos</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Descontos</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Líquido</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {dados.holerites.map((h, i) => (
                <tr key={h.id} className="table-row" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                    {formatarCompetencia(h.competencia)}
                  </td>
                  <td style={{ ...tdNum, color: 'var(--text-secondary)' }}>{formatarCentavos(h.totalVencimentos)}</td>
                  <td style={{ ...tdNum, color: 'var(--text-secondary)' }}>{formatarCentavos(h.totalDescontos)}</td>
                  <td style={{ ...tdNum, color: 'var(--text-primary)', fontWeight: 600 }}>{formatarCentavos(h.liquido)}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleDownload(h)}
                      disabled={busyId === h.id}
                      style={{ padding: '6px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: busyId === h.id ? 0.6 : 1 }}
                    >
                      <Download size={13} /> {busyId === h.id ? 'Gerando...' : 'Baixar PDF'}
                    </button>
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
