import { useEffect, useState } from 'react';
import { Download, RefreshCw, AlertTriangle, FileText } from 'lucide-react';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import { Button, EmptyState, Notice, Table } from '../components/ui';
import { formatarCentavos, formatarCompetencia, baixarHoleritePdf, type HoleriteResumo } from '../lib/holerites';

interface Resposta {
  vinculado: boolean;
  colaborador: { id: string; codigo: string; nome: string } | null;
  holerites: HoleriteResumo[];
}

/** Célula numérica: alinhada à direita, sem quebra e com dígitos tabulares. */
const TD_NUM = 'text-right whitespace-nowrap tabular-nums';

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

  const cabecalho = (
    <tr>
      <th>Competência</th>
      <th className="text-right">Vencimentos</th>
      <th className="text-right">Descontos</th>
      <th className="text-right">Líquido</th>
      <th><span className="sr-only">Ações</span></th>
    </tr>
  );

  return (
    <>
      <PageHeader
        title="Meus holerites"
        description={dados?.colaborador ? `Colaborador ${dados.colaborador.codigo} · ${dados.colaborador.nome}` : 'Demonstrativos de pagamento em PDF'}
        actions={<Button variant="secondary" icon={<RefreshCw size={14} />} onClick={load} disabled={loading}>Atualizar</Button>}
      />

      <div className="page-body stack max-w-[1000px] gap-4">
        {error && (
          <Notice
            kind="danger"
            onClose={() => setError('')}
            actions={<Button variant="secondary" size="sm" onClick={load}>Tentar novamente</Button>}
          >
            {error}
          </Notice>
        )}

        {loading ? (
          <Table head={cabecalho} loading rows={4} cols={5} />
        ) : !dados?.vinculado ? (
          <div className="card">
            <EmptyState
              icon={<AlertTriangle size={22} />}
              title="Seu login ainda não está vinculado a um colaborador da folha."
            >
              Procure o RH para fazer o vínculo. Assim que estiver feito, os holerites aparecem aqui.
            </EmptyState>
          </div>
        ) : (
          <Table
            isEmpty={dados.holerites.length === 0}
            empty={(
              <EmptyState icon={<FileText size={22} />} title="Nenhum holerite importado ainda">
                Nenhum holerite importado ainda para o seu cadastro.
              </EmptyState>
            )}
            head={cabecalho}
          >
            {dados.holerites.map((h) => (
              <tr key={h.id}>
                <td className="font-semibold whitespace-nowrap">{formatarCompetencia(h.competencia)}</td>
                <td className={`${TD_NUM} text-(--text-2)`}>{formatarCentavos(h.totalVencimentos)}</td>
                <td className={`${TD_NUM} text-(--text-2)`}>{formatarCentavos(h.totalDescontos)}</td>
                <td className={`${TD_NUM} font-semibold`}>{formatarCentavos(h.liquido)}</td>
                <td className="text-right">
                  <Button variant="secondary" size="sm" icon={<Download size={13} />} onClick={() => handleDownload(h)} loading={busyId === h.id}>
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
