import { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, LogOut, RotateCcw, Loader2, MessageSquare } from 'lucide-react';
import api from '../lib/api';

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

const STATE_COLOR: Record<ConnState, string> = {
  open: 'var(--status-concluido)',
  connecting: 'var(--status-andamento)',
  close: 'var(--prio-alta)',
  unknown: 'var(--text-muted)',
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
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '2rem 1rem' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <MessageSquare size={28} style={{ color: 'var(--accent)' }} />
        <div>
          <h1 style={{ color: 'var(--text-primary)', fontSize: '1.4rem', fontWeight: 700, lineHeight: 1 }}>
            {title}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
            Instância: <code style={{ color: 'var(--accent)' }}>{instanceLabel}</code>
          </p>
        </div>
      </div>

      {/* Toast */}
      {message && (
        <div
          className="mb-4 rounded-lg px-4 py-3 text-sm font-medium"
          style={{
            background: message.type === 'ok' ? '#14532d' : '#450a0a',
            color: message.type === 'ok' ? '#86efac' : '#fca5a5',
            border: `1px solid ${message.type === 'ok' ? '#166534' : '#7f1d1d'}`,
          }}
        >
          {message.text}
        </div>
      )}

      {/* Status Card */}
      <div
        className="rounded-xl p-5 mb-5 flex items-center justify-between"
        style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: STATE_COLOR[state],
              boxShadow: `0 0 8px ${STATE_COLOR[state]}`,
            }}
          />
          <div>
            <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{STATE_LABEL[state]}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              {isConnected ? (phone ?? 'Carregando…') : 'Sem número ativo'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Wifi size={22} style={{ color: STATE_COLOR['open'] }} />
          ) : (
            <WifiOff size={22} style={{ color: STATE_COLOR[state] }} />
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={fetchStatus}
          disabled={loading['status']}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition"
          style={{ background: 'var(--bg-card-hover)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <RefreshCw size={15} className={loading['status'] ? 'animate-spin' : ''} />
          Atualizar status
        </button>

        <button
          onClick={fetchQr}
          disabled={loading['qr'] || isConnected}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition"
          style={{
            background: isConnected ? 'rgba(77,142,240,0.1)' : 'var(--accent)',
            color: isConnected ? 'var(--text-muted)' : '#fff',
            cursor: isConnected ? 'not-allowed' : 'pointer',
            opacity: isConnected ? 0.5 : 1,
          }}
        >
          {loading['qr'] ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {isConnected ? 'Já conectado' : 'Gerar QR Code'}
        </button>

        <button
          onClick={restart}
          disabled={loading['restart']}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition"
          style={{ background: '#78350f', color: '#fcd34d', border: '1px solid #92400e' }}
        >
          {loading['restart'] ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
          Reiniciar conexão
        </button>

        <button
          onClick={disconnect}
          disabled={loading['disconnect'] || !isConnected}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition"
          style={{
            background: isConnected ? '#450a0a' : 'rgba(239,68,68,0.1)',
            color: isConnected ? '#fca5a5' : 'var(--text-muted)',
            border: '1px solid #7f1d1d',
            cursor: !isConnected ? 'not-allowed' : 'pointer',
            opacity: !isConnected ? 0.5 : 1,
          }}
        >
          {loading['disconnect'] ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
          Desconectar
        </button>
      </div>

      {/* QR Code */}
      {qrcode && (
        <div
          className="rounded-xl p-6 flex flex-col items-center gap-4"
          style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            Aponte o WhatsApp para o QR Code abaixo
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center' }}>
            No celular: WhatsApp → Dispositivos conectados → Conectar dispositivo
          </p>
          <div className="rounded-xl overflow-hidden" style={{ background: '#fff', padding: 12 }}>
            <img src={qrcode} alt="QR Code WhatsApp" style={{ width: 220, height: 220, display: 'block' }} />
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            O QR expira em ~60 segundos. Se expirar, clique em "Gerar QR Code" novamente.
          </p>
        </div>
      )}

      {/* Help when connected */}
      {isConnected && !qrcode && (
        <div
          className="rounded-xl p-4"
          style={{
            background: 'rgba(34,197,94,0.06)',
            border: '1px solid rgba(34,197,94,0.2)',
          }}
        >
          <p style={{ color: '#86efac', fontSize: '0.85rem' }}>
            <strong>Tudo certo!</strong> O número {phone ?? '–'} está conectado e {purpose}.
            Clique em <strong>Reiniciar conexão</strong> se houver falha no envio de mensagens sem desconectar.
            Use <strong>Desconectar</strong> apenas para trocar de número — será necessário escanear um novo QR Code.
          </p>
        </div>
      )}

      {/* Help when disconnected */}
      {!isConnected && !qrcode && state !== 'unknown' && (
        <div
          className="rounded-xl p-4"
          style={{
            background: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.2)',
          }}
        >
          <p style={{ color: '#fca5a5', fontSize: '0.85rem' }}>
            <strong>WhatsApp desconectado.</strong> Clique em <strong>Gerar QR Code</strong> e escaneie com o celular para reconectar.
          </p>
        </div>
      )}
    </div>
  );
}
