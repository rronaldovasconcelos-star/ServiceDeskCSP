import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bot, Activity, FileText, Sparkles, Cpu, Save, Loader2, RefreshCw,
  Upload, Trash2, Paperclip, Smartphone, Wifi, WifiOff, LogOut, RotateCcw, QrCode,
} from 'lucide-react';
import api from '../lib/api';

interface AgentStatus {
  agent: string;
  uptimeSeconds: number;
  sessions: number;
  model: string;
  configUpdatedAt: string | null;
  filesCount: number;
}

interface AgentConfig {
  systemPrompt: string;
  extraContext: string;
  model: string;
  updatedAt: string;
}

interface AgentFile {
  id: string;
  originalName: string;
  mimeType: string;
  description: string;
  sizeBytes: number;
  uploadedAt: string;
}

type Tab = 'status' | 'prompt' | 'contexto' | 'arquivos' | 'conexao';

type ConnState = 'open' | 'connecting' | 'close' | 'unknown';

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

const MODELS = ['gpt-4o', 'gpt-4o-mini', 'llama-3.3-70b-versatile'];

function formatUptime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

export default function AgentePage() {
  const [tab, setTab] = useState<Tab>('status');
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [files, setFiles] = useState<AgentFile[]>([]);
  const [prompt, setPrompt] = useState('');
  const [extraContext, setExtraContext] = useState('');
  const [model, setModel] = useState('');
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingDesc, setPendingDesc] = useState('');
  const [connState, setConnState] = useState<ConnState>('unknown');
  const [connPhone, setConnPhone] = useState<string | null>(null);
  const [qrcode, setQrcode] = useState<string | null>(null);

  const setLoad = (k: string, v: boolean) => setLoading((p) => ({ ...p, [k]: v }));
  const notify = (text: string, type: 'ok' | 'err') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };
  const errMsg = (err: unknown, fallback: string) =>
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get<AgentStatus>('/agent/status');
      setStatus(res.data);
    } catch {
      setStatus(null);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await api.get<AgentConfig>('/agent/config');
      setConfig(res.data);
      setPrompt(res.data.systemPrompt);
      setExtraContext(res.data.extraContext);
      setModel(res.data.model);
    } catch (err) {
      notify(errMsg(err, 'Erro ao carregar configuração do agente'), 'err');
    }
  }, []);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await api.get<AgentFile[]>('/agent/files');
      setFiles(res.data);
    } catch {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchConfig();
    fetchFiles();
    const id = setInterval(fetchStatus, 15000);
    return () => clearInterval(id);
  }, [fetchStatus, fetchConfig, fetchFiles]);

  const savePrompt = async () => {
    setLoad('prompt', true);
    try {
      await api.put('/agent/config', { systemPrompt: prompt, model });
      notify('Prompt atualizado. A Sofia já está usando a nova versão.', 'ok');
      await Promise.all([fetchConfig(), fetchStatus()]);
    } catch (err) {
      notify(errMsg(err, 'Erro ao salvar prompt'), 'err');
    } finally {
      setLoad('prompt', false);
    }
  };

  const saveContext = async () => {
    setLoad('contexto', true);
    try {
      await api.put('/agent/config', { extraContext });
      notify('Contexto adicional salvo.', 'ok');
      await fetchConfig();
    } catch (err) {
      notify(errMsg(err, 'Erro ao salvar contexto'), 'err');
    } finally {
      setLoad('contexto', false);
    }
  };

  const uploadFile = async () => {
    if (!pendingFile) return;
    setLoad('upload', true);
    try {
      const form = new FormData();
      form.append('file', pendingFile);
      form.append('description', pendingDesc);
      await api.post('/agent/files', form);
      notify('Arquivo enviado. A Sofia já pode anexá-lo nas conversas.', 'ok');
      setPendingFile(null);
      setPendingDesc('');
      if (fileInput.current) fileInput.current.value = '';
      await Promise.all([fetchFiles(), fetchStatus()]);
    } catch (err) {
      notify(errMsg(err, 'Erro ao enviar arquivo'), 'err');
    } finally {
      setLoad('upload', false);
    }
  };

  const removeFile = async (id: string) => {
    setLoad(`del-${id}`, true);
    try {
      await api.delete(`/agent/files/${id}`);
      notify('Arquivo removido.', 'ok');
      await Promise.all([fetchFiles(), fetchStatus()]);
    } catch (err) {
      notify(errMsg(err, 'Erro ao remover arquivo'), 'err');
    } finally {
      setLoad(`del-${id}`, false);
    }
  };

  // ── Conexão WhatsApp da Sofia ──
  const fetchConnection = useCallback(async () => {
    try {
      const res = await api.get<{ state: ConnState; phone: string | null }>('/agent/connection');
      setConnState(res.data.state);
      setConnPhone(res.data.phone ?? null);
    } catch {
      setConnState('unknown');
    }
  }, []);

  const genQr = async () => {
    setLoad('qr', true);
    setQrcode(null);
    try {
      const res = await api.get<{ qrcode: string | null; state: ConnState }>('/agent/connection/qrcode');
      setConnState(res.data.state);
      setQrcode(res.data.qrcode);
      if (!res.data.qrcode && res.data.state === 'open') notify('Número já conectado.', 'ok');
    } catch (err) {
      notify(errMsg(err, 'Erro ao gerar QR Code'), 'err');
    } finally {
      setLoad('qr', false);
    }
  };

  const disconnectConn = async () => {
    setLoad('disconnect', true);
    try {
      await api.post('/agent/connection/disconnect');
      notify('Número desconectado. Gere o QR Code para conectar outro.', 'ok');
      setQrcode(null);
      await fetchConnection();
    } catch (err) {
      notify(errMsg(err, 'Erro ao desconectar'), 'err');
    } finally {
      setLoad('disconnect', false);
    }
  };

  const restartConn = async () => {
    setLoad('restart', true);
    try {
      await api.post('/agent/connection/restart');
      notify('Reconexão iniciada. Aguarde alguns segundos…', 'ok');
      setTimeout(fetchConnection, 3000);
    } catch (err) {
      notify(errMsg(err, 'Erro ao reiniciar conexão'), 'err');
    } finally {
      setLoad('restart', false);
    }
  };

  // Carrega a conexão ao abrir a aba; faz polling enquanto não conectado
  useEffect(() => {
    if (tab !== 'conexao') return;
    fetchConnection();
    const id = setInterval(() => {
      if (connState !== 'open') fetchConnection();
    }, 8000);
    return () => clearInterval(id);
  }, [tab, connState, fetchConnection]);

  const card = { background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.06)' };
  const textareaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 360,
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: 14,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.82rem',
    lineHeight: 1.5,
    resize: 'vertical',
  };

  const TABS: { key: Tab; label: string; icon: typeof Activity }[] = [
    { key: 'status', label: 'Status', icon: Activity },
    { key: 'conexao', label: 'Conexão', icon: Smartphone },
    { key: 'prompt', label: 'Prompt', icon: FileText },
    { key: 'contexto', label: 'Contexto', icon: Sparkles },
    { key: 'arquivos', label: 'Arquivos', icon: Paperclip },
  ];

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1rem' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Bot size={28} style={{ color: 'var(--accent)' }} />
        <div>
          <h1 style={{ color: 'var(--text-primary)', fontSize: '1.4rem', fontWeight: 700, lineHeight: 1 }}>
            Agente IA — Central de Comando
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
            Sofia · assistente do WhatsApp · alterações entram em vigor na hora
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

      {/* Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition"
              style={{
                background: active ? 'var(--accent)' : 'var(--bg-card-hover)',
                color: active ? '#fff' : 'var(--text-primary)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <Icon size={15} />
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Status ── */}
      {tab === 'status' && (
        <div className="rounded-xl p-5" style={card}>
          <div className="flex items-center justify-between mb-4">
            <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Estado do agente</p>
            <button
              onClick={fetchStatus}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm"
              style={{ background: 'var(--bg-card-hover)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <RefreshCw size={14} /> Atualizar
            </button>
          </div>
          {status ? (
            <div className="grid grid-cols-2 gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              {[
                { icon: Activity, label: 'Online há', value: formatUptime(status.uptimeSeconds) },
                { icon: Bot, label: 'Conversas ativas', value: String(status.sessions) },
                { icon: Cpu, label: 'Modelo', value: status.model },
                { icon: Paperclip, label: 'Arquivos da IA', value: String(status.filesCount) },
                { icon: FileText, label: 'Prompt editado em', value: formatDate(status.configUpdatedAt) },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-lg p-3" style={{ background: 'var(--bg-primary)' }}>
                  <div className="flex items-center gap-2 mb-1" style={{ color: 'var(--text-muted)' }}>
                    <Icon size={14} />
                    <span style={{ fontSize: '0.75rem' }}>{label}</span>
                  </div>
                  <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.95rem' }}>{value}</p>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Não foi possível obter o status do agente. Verifique se o bot está online e configurado.
            </p>
          )}
        </div>
      )}

      {/* ── Conexão WhatsApp ── */}
      {tab === 'conexao' && (
        <div className="flex flex-col gap-4">
          {/* Card de status da conexão */}
          <div
            className="rounded-xl p-5 flex items-center justify-between"
            style={card}
          >
            <div className="flex items-center gap-3">
              <div
                style={{
                  width: 14, height: 14, borderRadius: '50%',
                  background: STATE_COLOR[connState], boxShadow: `0 0 8px ${STATE_COLOR[connState]}`,
                }}
              />
              <div>
                <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{STATE_LABEL[connState]}</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                  {connState === 'open' ? (connPhone ?? 'Carregando…') : 'Sem número ativo'}
                </p>
              </div>
            </div>
            {connState === 'open'
              ? <Wifi size={22} style={{ color: STATE_COLOR.open }} />
              : <WifiOff size={22} style={{ color: STATE_COLOR[connState] }} />}
          </div>

          {/* Botões de ação */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={fetchConnection}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition"
              style={{ background: 'var(--bg-card-hover)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <RefreshCw size={15} /> Atualizar status
            </button>

            <button
              onClick={genQr}
              disabled={loading['qr'] || connState === 'open'}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition"
              style={{
                background: connState === 'open' ? 'rgba(77,142,240,0.1)' : 'var(--accent)',
                color: connState === 'open' ? 'var(--text-muted)' : '#fff',
                cursor: connState === 'open' ? 'not-allowed' : 'pointer',
                opacity: connState === 'open' ? 0.5 : 1,
              }}
            >
              {loading['qr'] ? <Loader2 size={15} className="animate-spin" /> : <QrCode size={15} />}
              {connState === 'open' ? 'Já conectado' : 'Gerar QR Code'}
            </button>

            <button
              onClick={restartConn}
              disabled={loading['restart']}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition"
              style={{ background: '#78350f', color: '#fcd34d', border: '1px solid #92400e' }}
            >
              {loading['restart'] ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
              Reiniciar conexão
            </button>

            <button
              onClick={disconnectConn}
              disabled={loading['disconnect'] || connState !== 'open'}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition"
              style={{
                background: connState === 'open' ? '#450a0a' : 'rgba(239,68,68,0.1)',
                color: connState === 'open' ? '#fca5a5' : 'var(--text-muted)',
                border: '1px solid #7f1d1d',
                cursor: connState !== 'open' ? 'not-allowed' : 'pointer',
                opacity: connState !== 'open' ? 0.5 : 1,
              }}
            >
              {loading['disconnect'] ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
              Desconectar
            </button>
          </div>

          {/* QR Code */}
          {qrcode && (
            <div className="rounded-xl p-6 flex flex-col items-center gap-4" style={card}>
              <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Aponte o WhatsApp para o QR Code</p>
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

          {/* Ajuda conectado */}
          {connState === 'open' && !qrcode && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <p style={{ color: '#86efac', fontSize: '0.85rem' }}>
                <strong>Tudo certo!</strong> A Sofia está atendendo pelo número {connPhone ?? '–'}.
                Use <strong>Reiniciar conexão</strong> se houver falha no envio sem trocar de número.
                Use <strong>Desconectar</strong> apenas para trocar de número — será necessário escanear um novo QR Code.
              </p>
            </div>
          )}

          {/* Ajuda desconectado */}
          {connState !== 'open' && !qrcode && connState !== 'unknown' && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p style={{ color: '#fca5a5', fontSize: '0.85rem' }}>
                <strong>Sofia desconectada.</strong> Clique em <strong>Gerar QR Code</strong> e escaneie com o celular do número que deve atender.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Prompt ── */}
      {tab === 'prompt' && (
        <div className="rounded-xl p-5" style={card}>
          <div className="mb-3">
            <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>System prompt da Sofia</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 4 }}>
              Define a personalidade e as regras. Mantenha os marcadores{' '}
              <code style={{ color: 'var(--accent)' }}>{'{{DATETIME}}'}</code>,{' '}
              <code style={{ color: 'var(--accent)' }}>{'{{PHONE}}'}</code>,{' '}
              <code style={{ color: 'var(--accent)' }}>{'{{WHATSAPP_NAME}}'}</code> e{' '}
              <code style={{ color: 'var(--accent)' }}>{'{{MEMORY}}'}</code>.
            </p>
          </div>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} style={textareaStyle} />

          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Cpu size={15} style={{ color: 'var(--text-muted)' }} />
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {[...new Set([model, ...MODELS])].filter(Boolean).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <button
              onClick={savePrompt}
              disabled={loading['prompt']}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
              style={{ background: 'var(--accent)', color: '#fff', marginLeft: 'auto' }}
            >
              {loading['prompt'] ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Salvar prompt
            </button>
          </div>
          {config && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 8 }}>
              Última edição: {formatDate(config.updatedAt)}
            </p>
          )}
        </div>
      )}

      {/* ── Contexto extra ── */}
      {tab === 'contexto' && (
        <div className="rounded-xl p-5" style={card}>
          <div className="mb-3">
            <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Contexto adicional</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 4 }}>
              Informações temporárias injetadas no prompt — avisos sazonais, promoções, mudanças de horário,
              campanhas de matrícula. Deixe em branco para não adicionar nada.
            </p>
          </div>
          <textarea
            value={extraContext}
            onChange={(e) => setExtraContext(e.target.value)}
            style={{ ...textareaStyle, minHeight: 220, fontFamily: 'inherit', fontSize: '0.9rem' }}
            placeholder="Ex: Estamos em campanha de matrícula 2026 — informe que há 10% de desconto até 30/06."
          />
          <button
            onClick={saveContext}
            disabled={loading['contexto']}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium mt-4"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {loading['contexto'] ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Salvar contexto
          </button>
        </div>
      )}

      {/* ── Arquivos ── */}
      {tab === 'arquivos' && (
        <div className="flex flex-col gap-4">
          {/* Upload */}
          <div className="rounded-xl p-5" style={card}>
            <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}>Novo arquivo</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 12 }}>
              PDF, imagem ou folder que a Sofia poderá enviar nas conversas. A descrição diz a ela quando usar.
            </p>
            <input
              ref={fileInput}
              type="file"
              onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm mb-3"
              style={{ color: 'var(--text-secondary)' }}
            />
            <input
              type="text"
              value={pendingDesc}
              onChange={(e) => setPendingDesc(e.target.value)}
              placeholder="Descrição — ex: Tabela de valores 2026, enviar quando perguntarem sobre mensalidade"
              className="block w-full rounded-lg px-3 py-2 text-sm mb-3"
              style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <button
              onClick={uploadFile}
              disabled={!pendingFile || loading['upload']}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
              style={{ background: 'var(--accent)', color: '#fff', opacity: !pendingFile ? 0.5 : 1, cursor: !pendingFile ? 'not-allowed' : 'pointer' }}
            >
              {loading['upload'] ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              Enviar arquivo
            </button>
          </div>

          {/* Lista */}
          <div className="rounded-xl p-5" style={card}>
            <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 12 }}>
              Arquivos cadastrados ({files.length})
            </p>
            {files.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhum arquivo cadastrado ainda.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {files.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 rounded-lg p-3"
                    style={{ background: 'var(--bg-primary)' }}
                  >
                    <FileText size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <div className="min-w-0 flex-1">
                      <p style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.88rem' }} className="truncate">
                        {f.originalName}
                      </p>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }} className="truncate">
                        {f.description || 'sem descrição'} · {formatBytes(f.sizeBytes)}
                      </p>
                    </div>
                    <button
                      onClick={() => removeFile(f.id)}
                      disabled={loading[`del-${f.id}`]}
                      className="rounded-lg p-2"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid #7f1d1d' }}
                      aria-label="Remover arquivo"
                    >
                      {loading[`del-${f.id}`] ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
