import { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, LogOut, RotateCcw, MessageSquare } from 'lucide-react';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import { Button, Card, IconTile, Notice } from '../components/ui';

type ConnState = 'open' | 'connecting' | 'close' | 'unknown';

interface StatusData {
  state: ConnState;
  phone?: string | null;
}

interface QrData {
  qrcode: string | null;
  state: ConnState;
}

const STATE_LABEL: Record<ConnState, string> = {
  open: 'Conectado',
  connecting: 'Conectando…',
  close: 'Desconectado',
  unknown: 'Desconhecido',
};

/** Badge do estado da conexão: verde = no ar, azul = conectando, vermelho = fora, cinza = desconhecido. */
const STATE_PILL: Record<ConnState, string> = {
  open: 'pill-teal',
  connecting: 'pill-electric',
  close: 'pill-coral',
  unknown: 'pill-muted',
};
const STATE_TONE: Record<ConnState, 'teal' | 'electric' | 'coral' | 'muted'> = {
  open: 'teal',
  connecting: 'electric',
  close: 'coral',
  unknown: 'muted',
};

interface WhatsAppPanelProps {
  /** Prefixo das rotas de conexão na API (default: '/whatsapp' = instância csp-portal). */
  apiBase?: string;
  /** Título exibido no cabeçalho. */
  title?: string;
  /** Nome da instância Evolution mostrado no subtítulo. */
  instanceLabel?: string;
  /** Texto que descreve a finalidade do número quando conectado. */
  purpose?: string;
}

export default function WhatsAppPage({
  apiBase = '/whatsapp',
  title = 'WhatsApp — Gestão de Conexão',
  instanceLabel = 'csp-portal',
  purpose = 'enviando notificações normalmente',
}: WhatsAppPanelProps = {}) {
  const [state, setState] = useState<ConnState>('unknown');
  const [phone, setPhone] = useState<string | null>(null);
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  const setLoad = (key: string, val: boolean) =>
    setLoading((prev) => ({ ...prev, [key]: val }));

  const notify = (text: string, type: 'ok' | 'err') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get<StatusData>(`${apiBase}/status`);
      setState(res.data.state);
      setPhone(res.data.phone ?? null);
    } catch {
      setState('unknown');
    }
  }, [apiBase]);

  const fetchQr = useCallback(async () => {
    setLoad('qr', true);
    setQrcode(null);
    try {
      const res = await api.get<QrData>(`${apiBase}/qrcode`);
      setState(res.data.state);
      setQrcode(res.data.qrcode);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      notify(msg ?? 'Erro ao gerar QR code', 'err');
    } finally {
      setLoad('qr', false);
    }
  }, [apiBase]);

  const disconnect = async () => {
    setLoad('disconnect', true);
    try {
      await api.post(`${apiBase}/disconnect`);
      notify('Instância desconectada com sucesso.', 'ok');
      setQrcode(null);
      await fetchStatus();
    } catch {
      notify('Erro ao desconectar.', 'err');
    } finally {
      setLoad('disconnect', false);
    }
  };

  const restart = async () => {
    setLoad('restart', true);
    try {
      await api.post(`${apiBase}/restart`);
      notify('Reconexão iniciada. Aguarde alguns segundos…', 'ok');
      setTimeout(fetchStatus, 3000);
    } catch {
      notify('Erro ao reiniciar conexão.', 'err');
    } finally {
      setLoad('restart', false);
    }
  };

  // Poll status every 8s when not connected
  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 8000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const isConnected = state === 'open';

  return (
    <>
      <PageHeader
        title={title}
        description={<>Instância <code className="font-[inherit] font-semibold">{instanceLabel}</code> · {STATE_LABEL[state]}</>}
        actions={(
          <Button variant="secondary" icon={<RefreshCw size={15} className={loading['status'] ? 'animate-spin' : ''} />} onClick={fetchStatus} disabled={loading['status']}>
            Atualizar status
          </Button>
        )}
      />

      <div className="page-body stack max-w-[720px] gap-4">
        {/* Toast */}
        {message && (
          <Notice kind={message.type === 'ok' ? 'success' : 'danger'} onClose={() => setMessage(null)}>
            {message.text}
          </Notice>
        )}

        {/* Estado da conexão */}
        <Card raised className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <IconTile tone={STATE_TONE[state]} size={44}>
              {isConnected ? <Wifi size={20} /> : <WifiOff size={20} />}
            </IconTile>
            <div>
              <p className="font-semibold text-(--text)">{STATE_LABEL[state]}</p>
              <p className="mt-0.5 text-xs text-(--text-2)">
                {isConnected ? (phone ?? 'Carregando…') : 'Sem número ativo'}
              </p>
            </div>
          </div>
          <span className={`pill pill-strong ${STATE_PILL[state]}`}>
            <span className="pill-dot" aria-hidden="true" />
            {STATE_LABEL[state]}
          </span>
        </Card>

        {/* Ações */}
        <div className="row gap-2.5">
          <Button
            onClick={fetchQr}
            disabled={isConnected}
            loading={loading['qr']}
            icon={<MessageSquare size={15} />}
          >
            {isConnected ? 'Já conectado' : 'Gerar QR Code'}
          </Button>

          <Button
            variant="secondary"
            onClick={restart}
            loading={loading['restart']}
            icon={<RotateCcw size={15} />}
          >
            Reiniciar conexão
          </Button>

          <Button
            variant="danger"
            onClick={disconnect}
            disabled={!isConnected}
            loading={loading['disconnect']}
            icon={<LogOut size={15} />}
          >
            Desconectar
          </Button>
        </div>

        {/* QR Code */}
        {qrcode && (
          <Card raised className="flex flex-col items-center gap-3.5 p-6">
            <p className="font-semibold text-(--text)">
              Aponte o WhatsApp para o QR Code abaixo
            </p>
            <p className="text-center text-[13px] text-(--text-2)">
              No celular: WhatsApp → Dispositivos conectados → Conectar dispositivo
            </p>
            {/* Fundo branco fixo: o QR precisa de contraste alto também no tema escuro. */}
            <div className="rounded-(--radius-sm) border border-(--line) bg-(--on-navy) p-3">
              <img src={qrcode} alt="QR Code WhatsApp" className="block size-[220px]" />
            </div>
            <p className="text-xs text-(--text-2)">
              O QR expira em ~60 segundos. Se expirar, clique em "Gerar QR Code" novamente.
            </p>
          </Card>
        )}

        {/* Ajuda quando conectado */}
        {isConnected && !qrcode && (
          <Notice kind="success" title="Tudo certo!">
            O número {phone ?? '–'} está conectado e {purpose}.
            Clique em <strong>Reiniciar conexão</strong> se houver falha no envio de mensagens sem desconectar.
            Use <strong>Desconectar</strong> apenas para trocar de número — será necessário escanear um novo QR Code.
          </Notice>
        )}

        {/* Ajuda quando desconectado */}
        {!isConnected && !qrcode && state !== 'unknown' && (
          <Notice kind="danger" title="WhatsApp desconectado.">
            Clique em <strong>Gerar QR Code</strong> e escaneie com o celular para reconectar.
          </Notice>
        )}
      </div>
    </>
  );
}
