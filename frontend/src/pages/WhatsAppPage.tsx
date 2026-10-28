import { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, LogOut, RotateCcw, Loader2, MessageSquare } from 'lucide-react';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import { Button, Card, IconTile } from '../components/ui';

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

/** Cor do estado da conexão: verde-água = no ar, elétrico = conectando, coral = fora. */
const STATE_COLOR: Record<ConnState, string> = {
  open: 'var(--teal)',
  connecting: 'var(--electric)',
  close: 'var(--coral)',
  unknown: 'var(--text-secondary)',
};
const STATE_TONE: Record<ConnState, 'teal' | 'electric' | 'coral' | 'soft'> = {
  open: 'teal',
  connecting: 'electric',
  close: 'coral',
  unknown: 'soft',
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
        subtitle={<>Instância <code style={{ fontFamily: 'inherit', fontWeight: 600 }}>{instanceLabel}</code> · {STATE_LABEL[state]}</>}
        actions={(
          <Button variant="onNavy" icon={<RefreshCw size={15} className={loading['status'] ? 'animate-spin' : ''} />} onClick={fetchStatus} disabled={loading['status']}>
            Atualizar status
          </Button>
        )}
      />

      <div className="page-body" style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Toast */}
        {message && (
          <div
            className={`pill ${message.type === 'ok' ? 'pill-teal' : 'pill-coral'}`}
            style={{ whiteSpace: 'normal', padding: '10px 14px', fontSize: 13, fontWeight: 500, borderRadius: 'var(--radius-tile)' }}
          >
            {message.text}
          </div>
        )}

        {/* Estado da conexão */}
        <Card raised style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <IconTile tone={STATE_TONE[state]} size={44}>
              {isConnected ? <Wifi size={20} /> : <WifiOff size={20} />}
            </IconTile>
            <div>
              <p style={{ color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}>{STATE_LABEL[state]}</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '2px 0 0' }}>
                {isConnected ? (phone ?? 'Carregando…') : 'Sem número ativo'}
              </p>
            </div>
          </div>
          <span
            aria-hidden="true"
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              flexShrink: 0,
              background: STATE_COLOR[state],
              boxShadow: `0 0 0 4px ${STATE_COLOR[state]}`,
              opacity: 0.9,
            }}
          />
        </Card>

        {/* Ações */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Button
            onClick={fetchQr}
            disabled={loading['qr'] || isConnected}
            icon={loading['qr'] ? <Loader2 size={15} className="animate-spin" /> : <MessageSquare size={15} />}
          >
            {isConnected ? 'Já conectado' : 'Gerar QR Code'}
          </Button>

          <Button
            variant="ghost"
            onClick={restart}
            disabled={loading['restart']}
            icon={loading['restart'] ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
          >
            Reiniciar conexão
          </Button>

          <Button
            variant="danger"
            onClick={disconnect}
            disabled={loading['disconnect'] || !isConnected}
            icon={loading['disconnect'] ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
          >
            Desconectar
          </Button>
        </div>

        {/* QR Code */}
        {qrcode && (
          <Card raised style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 24 }}>
            <p style={{ color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}>
              Aponte o WhatsApp para o QR Code abaixo
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', margin: 0 }}>
              No celular: WhatsApp → Dispositivos conectados → Conectar dispositivo
            </p>
            <div style={{ background: 'var(--on-navy)', padding: 12, borderRadius: 'var(--radius-tile)', border: '1px solid var(--border)' }}>
              <img src={qrcode} alt="QR Code WhatsApp" style={{ width: 220, height: 220, display: 'block' }} />
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: 0 }}>
              O QR expira em ~60 segundos. Se expirar, clique em "Gerar QR Code" novamente.
            </p>
          </Card>
        )}

        {/* Ajuda quando conectado */}
        {isConnected && !qrcode && (
          <Card style={{ background: 'var(--teal-soft)', borderColor: 'transparent' }}>
            <p style={{ color: 'var(--text-primary)', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
              <strong>Tudo certo!</strong> O número {phone ?? '–'} está conectado e {purpose}.
              Clique em <strong>Reiniciar conexão</strong> se houver falha no envio de mensagens sem desconectar.
              Use <strong>Desconectar</strong> apenas para trocar de número — será necessário escanear um novo QR Code.
            </p>
          </Card>
        )}

        {/* Ajuda quando desconectado */}
        {!isConnected && !qrcode && state !== 'unknown' && (
          <Card style={{ background: 'var(--coral-soft)', borderColor: 'transparent' }}>
            <p style={{ color: 'var(--text-primary)', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
              <strong>WhatsApp desconectado.</strong> Clique em <strong>Gerar QR Code</strong> e escaneie com o celular para reconectar.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
