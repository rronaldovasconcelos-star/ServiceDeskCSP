import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bot, Activity, FileText, Sparkles, Cpu, Save, Loader2, RefreshCw,
  Upload, Trash2, Paperclip, Smartphone, Wifi, WifiOff, LogOut, RotateCcw, QrCode,
  Users, Mail, Phone, CalendarCheck, Database, BarChart3, Plus, KeyRound, MapPin,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api, { setKey, hasKey, rag as ragApi, report as reportApi, FORM_LINK } from '../lib/lizApi';
import MapaBairros from '../components/MapaBairros';

interface RagPending { id: number; colaborador: string; categoria: string; pergunta: string; resposta: string; created_at: string }

interface RagChunk { id: string; categoria: string; fonte: string; texto: string }
interface ReportData {
  heatmap: { dow: number; hour: number; count: number }[];
  interesse: { interesse: string; count: number }[];
  etapas: { etapa: string; count: number }[];
  bairros: { bairro: string; count: number }[];
  totais: { leads: number; visitasAgendadas: number; comFilho: number };
}

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

interface Lead {
  phone: string;
  name: string | null;
  email: string | null;
  children: { name: string; age: number }[];
  leadInterest: 'imediato' | 'proximo_semestre' | 'proximo_ano' | null;
  gradeInterest: string | null;
  visitsCount: number;
  lastVisit: { date: string; time: string; childName: string } | null;
  updatedAt: string | null;
}

type Tab = 'status' | 'prompt' | 'contexto' | 'arquivos' | 'conexao' | 'leads' | 'rag' | 'relatorio';

const DOW_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const INTEREST_LABEL: Record<NonNullable<Lead['leadInterest']>, string> = {
  imediato: 'Imediato',
  proximo_semestre: 'Próximo semestre',
  proximo_ano: 'Próximo ano',
};

const INTEREST_COLOR: Record<NonNullable<Lead['leadInterest']>, { bg: string; fg: string }> = {
  imediato: { bg: 'rgba(34,197,94,0.12)', fg: '#86efac' },
  proximo_semestre: { bg: 'rgba(234,179,8,0.12)', fg: '#fde047' },
  proximo_ano: { bg: 'rgba(96,165,250,0.12)', fg: '#93c5fd' },
};

// Formata telefone BR (ex 553195478946 → +55 31 9547-8946) de forma tolerante.
function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  const local = d.startsWith('55') ? d.slice(2) : d;
  if (local.length >= 10) {
    const ddd = local.slice(0, 2);
    const rest = local.slice(2);
    return `(${ddd}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return raw;
}

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
  const [leads, setLeads] = useState<Lead[]>([]);
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
  const [ragChunks, setRagChunks] = useState<RagChunk[]>([]);
  const [ragText, setRagText] = useState('');
  const [ragCat, setRagCat] = useState('manual');
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [pending, setPending] = useState<RagPending[]>([]);
  const [copied, setCopied] = useState(false);
  const [authed, setAuthed] = useState(hasKey());
  const [keyInput, setKeyInput] = useState('');

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

  const fetchLeads = useCallback(async () => {
    setLoad('leads', true);
    try {
      const res = await api.get<{ total: number; leads: Lead[] }>('/agent/leads');
      setLeads(res.data.leads);
    } catch (err) {
      notify(errMsg(err, 'Erro ao carregar leads'), 'err');
    } finally {
      setLoad('leads', false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchConfig();
    fetchFiles();
    const id = setInterval(fetchStatus, 15000);
    return () => clearInterval(id);
  }, [fetchStatus, fetchConfig, fetchFiles]);

  const fetchRag = useCallback(async () => {
    setLoad('rag', true);
    try {
      const r = await ragApi.list();
      setRagChunks(r.chunks ?? []);
    } catch (err) {
      notify(errMsg(err, 'Erro ao carregar conhecimento'), 'err');
    } finally {
      setLoad('rag', false);
    }
  }, []);

  const fetchPending = useCallback(async () => {
    try {
      const r = await ragApi.pendingList();
      setPending(r.pendentes ?? []);
    } catch { /* silencioso */ }
  }, []);

  const approvePending = async (id: number) => {
    setLoad(`pa-${id}`, true);
    try {
      await ragApi.pendingApprove(id);
      setPending((p) => p.filter((x) => x.id !== id));
      notify('Conhecimento aprovado e adicionado à base.', 'ok');
      fetchRag();
    } catch (err) { notify(errMsg(err, 'Erro ao aprovar'), 'err'); }
    finally { setLoad(`pa-${id}`, false); }
  };

  const rejectPending = async (id: number) => {
    setLoad(`pr-${id}`, true);
    try {
      await ragApi.pendingReject(id);
      setPending((p) => p.filter((x) => x.id !== id));
    } catch (err) { notify(errMsg(err, 'Erro ao rejeitar'), 'err'); }
    finally { setLoad(`pr-${id}`, false); }
  };

  const fetchReport = useCallback(async () => {
    setLoad('relatorio', true);
    try {
      setReportData(await reportApi());
    } catch (err) {
      notify(errMsg(err, 'Erro ao carregar relatório'), 'err');
    } finally {
      setLoad('relatorio', false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'leads') fetchLeads();
    if (tab === 'rag') { fetchRag(); fetchPending(); }
    if (tab === 'relatorio') fetchReport();
  }, [tab, fetchLeads, fetchRag, fetchReport, fetchPending]);

  const addRag = async () => {
    if (!ragText.trim()) return;
    setLoad('ragAdd', true);
    try {
      await ragApi.add(ragText.trim(), ragCat || 'manual');
      notify('Conhecimento adicionado à base da Liz.', 'ok');
      setRagText('');
      await fetchRag();
    } catch (err) {
      notify(errMsg(err, 'Erro ao adicionar'), 'err');
    } finally {
      setLoad('ragAdd', false);
    }
  };

  const removeRag = async (id: string) => {
    setLoad(`ragDel-${id}`, true);
    try {
      await ragApi.remove(id);
      setRagChunks((p) => p.filter((c) => c.id !== id));
    } catch (err) {
      notify(errMsg(err, 'Erro ao remover'), 'err');
    } finally {
      setLoad(`ragDel-${id}`, false);
    }
  };

  const uploadPdfRag = async (file: File) => {
    setLoad('ragPdf', true);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).replace(/^data:[^;]+;base64,/, ''));
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });
      const r = await ragApi.uploadPdf(b64, file.name);
      notify(`PDF indexado (${r.count ?? 0} trechos).`, 'ok');
      await fetchRag();
    } catch (err) {
      notify(errMsg(err, 'Erro no upload do PDF'), 'err');
    } finally {
      setLoad('ragPdf', false);
    }
  };

  const exportLeadsCsv = () => {
    const header = ['Nome', 'Telefone', 'E-mail', 'Filhos', 'Interesse', 'Serie', 'Visitas', 'Ultima visita', 'Atualizado'];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = leads.map((l) => [
      l.name ?? '',
      l.phone,
      l.email ?? '',
      l.children.map((c) => `${c.name}${c.age ? ` (${c.age})` : ''}`).join('; '),
      l.leadInterest ? INTEREST_LABEL[l.leadInterest] : '',
      l.gradeInterest ?? '',
      String(l.visitsCount),
      l.lastVisit ? `${l.lastVisit.date} ${l.lastVisit.time}` : '',
      l.updatedAt ?? '',
    ].map(esc).join(','));
    const csv = '﻿' + [header.map(esc).join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-sofia-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
    { key: 'leads', label: 'Leads', icon: Users },
    { key: 'relatorio', label: 'Relatório', icon: BarChart3 },
    { key: 'rag', label: 'Conhecimento', icon: Database },
    { key: 'prompt', label: 'Prompt', icon: FileText },
    { key: 'contexto', label: 'Contexto', icon: Sparkles },
    { key: 'arquivos', label: 'Arquivos', icon: Paperclip },
  ];

  if (!authed) {
    return (
      <div style={{ maxWidth: 420, margin: '4rem auto', padding: '2rem 1rem' }}>
        <div className="rounded-xl p-6" style={card}>
          <div className="flex items-center gap-3 mb-4">
            <KeyRound size={24} style={{ color: 'var(--accent)' }} />
            <h1 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 700 }}>Gestão da Liz</h1>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>
            Informe a chave de acesso do painel para gerenciar a assistente.
          </p>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && keyInput.trim()) { setKey(keyInput); setAuthed(true); window.location.reload(); } }}
            placeholder="Chave de acesso"
            className="w-full rounded-lg px-3 py-2 mb-3 text-sm"
            style={{ background: 'var(--bg-card-hover)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)' }}
          />
          <button
            onClick={() => { if (keyInput.trim()) { setKey(keyInput); setAuthed(true); window.location.reload(); } }}
            className="w-full rounded-lg px-4 py-2 text-sm font-medium"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Entrar
          </button>
        </div>
      </div>
    );
  }

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

      {/* ── Leads ── */}
      {tab === 'leads' && (
        <div className="flex flex-col gap-4">
          {/* Resumo + ações */}
          <div className="rounded-xl p-5" style={card}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                Leads captados ({leads.length})
              </p>
              <div className="flex gap-2">
                <button
                  onClick={exportLeadsCsv}
                  disabled={leads.length === 0}
                  className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm"
                  style={{
                    background: 'var(--bg-card-hover)', color: 'var(--text-primary)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    opacity: leads.length === 0 ? 0.5 : 1, cursor: leads.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <FileText size={14} /> Exportar CSV
                </button>
                <button
                  onClick={fetchLeads}
                  className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm"
                  style={{ background: 'var(--bg-card-hover)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  {loading['leads'] ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar
                </button>
              </div>
            </div>
            {/* Contadores por interesse */}
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              {(['imediato', 'proximo_semestre', 'proximo_ano'] as const).map((k) => {
                const count = leads.filter((l) => l.leadInterest === k).length;
                const c = INTEREST_COLOR[k];
                return (
                  <div key={k} className="rounded-lg p-3" style={{ background: 'var(--bg-primary)' }}>
                    <span style={{ fontSize: '0.72rem', color: c.fg, background: c.bg, padding: '2px 8px', borderRadius: 6 }}>
                      {INTEREST_LABEL[k]}
                    </span>
                    <p style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '1.4rem', marginTop: 8 }}>{count}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lista de leads */}
          <div className="rounded-xl p-5" style={card}>
            {loading['leads'] && leads.length === 0 ? (
              <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <Loader2 size={15} className="animate-spin" /> Carregando leads…
              </div>
            ) : leads.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Nenhum lead captado ainda. Conforme os responsáveis conversarem com a Sofia, eles aparecem aqui automaticamente.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {leads.map((l) => (
                  <div key={l.phone} className="rounded-lg p-3" style={{ background: 'var(--bg-primary)' }}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.92rem' }}>
                            {l.name || 'Sem nome'}
                          </span>
                          {l.leadInterest && (
                            <span style={{
                              fontSize: '0.68rem', color: INTEREST_COLOR[l.leadInterest].fg,
                              background: INTEREST_COLOR[l.leadInterest].bg, padding: '2px 8px', borderRadius: 6,
                            }}>
                              {INTEREST_LABEL[l.leadInterest]}
                            </span>
                          )}
                          {l.gradeInterest && (
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', background: 'var(--bg-card-hover)', padding: '2px 8px', borderRadius: 6 }}>
                              {l.gradeInterest}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap" style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                          <span className="flex items-center gap-1"><Phone size={12} /> {formatPhone(l.phone)}</span>
                          {l.email && <span className="flex items-center gap-1"><Mail size={12} /> {l.email}</span>}
                          {l.children.length > 0 && (
                            <span>👦 {l.children.map((c) => `${c.name}${c.age ? ` (${c.age})` : ''}`).join(', ')}</span>
                          )}
                        </div>
                        {l.lastVisit && (
                          <div className="flex items-center gap-1 mt-1.5" style={{ color: 'var(--status-concluido)', fontSize: '0.76rem' }}>
                            <CalendarCheck size={12} /> Visita: {l.lastVisit.date} às {l.lastVisit.time}
                          </div>
                        )}
                      </div>
                      <a
                        href={`https://wa.me/${l.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg px-3 py-1.5 text-sm flex items-center gap-1.5 flex-shrink-0"
                        style={{ background: 'rgba(34,197,94,0.12)', color: '#86efac', border: '1px solid rgba(34,197,94,0.25)' }}
                      >
                        <Smartphone size={13} /> WhatsApp
                      </a>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: 8 }}>
                      Atualizado: {formatDate(l.updatedAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
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
            {/* Input nativo escondido — acionado pela área clicável abaixo */}
            <input
              ref={fileInput}
              type="file"
              onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex flex-col items-center justify-center gap-2 w-full rounded-lg mb-3 transition"
              style={{
                background: 'var(--bg-primary)',
                border: `2px dashed ${pendingFile ? 'var(--accent)' : 'rgba(255,255,255,0.2)'}`,
                padding: '24px 16px',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
              }}
            >
              <Upload size={22} style={{ color: 'var(--accent)' }} />
              {pendingFile ? (
                <>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem' }}>
                    {pendingFile.name}
                  </span>
                  <span style={{ fontSize: '0.75rem' }}>
                    {formatBytes(pendingFile.size)} · clique para trocar
                  </span>
                </>
              ) : (
                <>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem' }}>
                    Clique para escolher um arquivo
                  </span>
                  <span style={{ fontSize: '0.75rem' }}>PDF, imagem, vídeo ou documento</span>
                </>
              )}
            </button>
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
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Nenhum arquivo ainda. Use a área acima para enviar o primeiro.
              </p>
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

      {/* ── Conhecimento (RAG) ── */}
      {tab === 'rag' && (
        <>
        {/* Coleta de conhecimento (link da landing) */}
        <div className="rounded-xl p-5 mb-4" style={card}>
          <p className="flex items-center gap-2" style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 6 }}><Users size={16} /> Coleta de conhecimento</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 10 }}>Envie este link para os colaboradores preencherem as informações da escola. As respostas chegam aqui em <b>Pendentes</b> para sua aprovação.</p>
          <div className="flex items-center gap-2 flex-wrap">
            <input readOnly value={FORM_LINK} className="rounded-lg px-3 py-2 text-sm" style={{ flex: 1, minWidth: 220, background: 'var(--bg-card-hover)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)' }} />
            <button onClick={() => { navigator.clipboard.writeText(FORM_LINK); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="rounded-lg px-4 py-2 text-sm font-medium" style={{ background: 'var(--accent)', color: '#fff' }}>
              {copied ? 'Copiado!' : 'Copiar link'}
            </button>
          </div>
        </div>

        {/* Pendentes de revisão */}
        {pending.length > 0 && (
          <div className="rounded-xl p-5 mb-4" style={card}>
            <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 10 }}>📥 Pendentes de revisão ({pending.length})</p>
            <div className="space-y-2">
              {pending.map((p) => (
                <div key={p.id} className="rounded-lg p-3" style={{ background: 'var(--bg-card-hover)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>{p.colaborador} · {p.categoria}</div>
                  <div style={{ color: 'var(--text-primary)', fontSize: '0.82rem' }}><b>{p.pergunta}</b></div>
                  <div style={{ color: 'var(--text-primary)', fontSize: '0.82rem', marginTop: 2 }}>{p.resposta}</div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => approvePending(p.id)} disabled={loading[`pa-${p.id}`]}
                      className="rounded-lg px-3 py-1 text-xs font-medium" style={{ background: 'rgba(34,197,94,0.15)', color: '#86efac', border: '1px solid rgba(34,197,94,0.3)' }}>
                      {loading[`pa-${p.id}`] ? '...' : '✓ Aprovar'}
                    </button>
                    <button onClick={() => rejectPending(p.id)} disabled={loading[`pr-${p.id}`]}
                      className="rounded-lg px-3 py-1 text-xs font-medium" style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}>
                      {loading[`pr-${p.id}`] ? '...' : '✕ Rejeitar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl p-5" style={card}>
          <div className="flex items-center justify-between mb-4">
            <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Base de conhecimento (RAG)</p>
            <button onClick={fetchRag} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm"
              style={{ background: 'var(--bg-card-hover)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <RefreshCw size={14} /> Atualizar
            </button>
          </div>

          {/* adicionar texto */}
          <div className="mb-4">
            <textarea value={ragText} onChange={(e) => setRagText(e.target.value)} rows={3}
              placeholder="Escreva um novo conhecimento/FAQ que a Liz deve saber…"
              className="w-full rounded-lg px-3 py-2 text-sm mb-2"
              style={{ background: 'var(--bg-card-hover)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)' }} />
            <div className="flex items-center gap-2 flex-wrap">
              <input value={ragCat} onChange={(e) => setRagCat(e.target.value)} placeholder="categoria"
                className="rounded-lg px-3 py-1.5 text-sm" style={{ background: 'var(--bg-card-hover)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)', width: 140 }} />
              <button onClick={addRag} disabled={loading.ragAdd || !ragText.trim()}
                className="flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium" style={{ background: 'var(--accent)', color: '#fff', opacity: loading.ragAdd ? 0.6 : 1 }}>
                {loading.ragAdd ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar
              </button>
              <label className="flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium cursor-pointer"
                style={{ background: 'var(--bg-card-hover)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {loading.ragPdf ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload PDF
                <input type="file" accept="application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPdfRag(f); e.target.value = ''; }} />
              </label>
            </div>
          </div>

          {/* lista */}
          {loading.rag ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}><Loader2 size={16} className="animate-spin" /> Carregando…</div>
          ) : (
            <div className="space-y-2">
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{ragChunks.length} trechos indexados</p>
              {ragChunks.map((c) => (
                <div key={c.id} className="rounded-lg p-3 flex items-start justify-between gap-3" style={{ background: 'var(--bg-card-hover)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ minWidth: 0 }}>
                    <span className="rounded px-2 py-0.5 text-xs" style={{ background: 'rgba(124,58,237,0.15)', color: '#c4b5fd' }}>{c.categoria}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginLeft: 8 }}>{c.fonte}</span>
                    <p style={{ color: 'var(--text-primary)', fontSize: '0.82rem', marginTop: 4 }}>{c.texto}</p>
                  </div>
                  <button onClick={() => removeRag(c.id)} disabled={loading[`ragDel-${c.id}`]} title="Remover"
                    style={{ color: 'var(--prio-alta)', flexShrink: 0 }}>
                    {loading[`ragDel-${c.id}`] ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        </>
      )}

      {/* ── Relatório ── */}
      {tab === 'relatorio' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Relatório comercial</p>
            <button onClick={fetchReport} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm"
              style={{ background: 'var(--bg-card-hover)', color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <RefreshCw size={14} /> Atualizar
            </button>
          </div>

          {loading.relatorio && <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}><Loader2 size={16} className="animate-spin" /> Carregando…</div>}

          {reportData && (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { l: 'Leads', v: reportData.totais.leads },
                  { l: 'Visitas agendadas', v: reportData.totais.visitasAgendadas },
                  { l: 'Crianças', v: reportData.totais.comFilho },
                ].map((k) => (
                  <div key={k.l} className="rounded-xl p-4" style={card}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{k.l}</p>
                    <p style={{ color: 'var(--text-primary)', fontSize: '1.6rem', fontWeight: 700 }}>{k.v}</p>
                  </div>
                ))}
              </div>

              {/* Heatmap dia x hora */}
              <div className="rounded-xl p-5" style={card}>
                <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 12 }}>Mapa de calor — quando chegam mensagens</p>
                {(() => {
                  const grid: Record<string, number> = {};
                  let max = 1;
                  reportData.heatmap.forEach((h) => { grid[`${h.dow}-${h.hour}`] = h.count; if (h.count > max) max = h.count; });
                  return (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ borderCollapse: 'collapse' }}>
                        <thead><tr><th></th>{Array.from({ length: 24 }, (_, h) => <th key={h} style={{ fontSize: 8, color: 'var(--text-muted)', padding: '0 1px', fontWeight: 400 }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {DOW_LABEL.map((d, di) => (
                            <tr key={di}>
                              <td style={{ fontSize: 10, color: 'var(--text-muted)', paddingRight: 6 }}>{d}</td>
                              {Array.from({ length: 24 }, (_, h) => {
                                const c = grid[`${di}-${h}`] || 0;
                                const op = c ? 0.15 + 0.85 * (c / max) : 0;
                                return <td key={h} title={`${d} ${h}h: ${c}`} style={{ width: 15, height: 15, background: c ? `rgba(124,58,237,${op})` : 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,0,0,0.2)' }} />;
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>

              {/* Funil + bairros */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl p-5" style={card}>
                  <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 12 }}>Leads por interesse</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={reportData.interesse}>
                      <XAxis dataKey="interesse" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {reportData.interesse.map((_, i) => <Cell key={i} fill="#7c3aed" />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-xl p-5" style={card}>
                  <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 12 }}>Leads por etapa de ensino</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={reportData.etapas}>
                      <XAxis dataKey="etapa" tick={{ fontSize: 9, fill: '#94a3b8' }} interval={0} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#a855f7" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Bairros */}
              <div className="rounded-xl p-5" style={card}>
                <p className="flex items-center gap-2" style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 12 }}><MapPin size={16} /> Mapa de calor — leads por bairro/região</p>
                {reportData.bairros.filter((b) => b.bairro && !b.bairro.startsWith('(')).length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Sem dados de bairro ainda — a Liz passou a coletar nas conversas.</p>
                ) : (
                  <MapaBairros bairros={reportData.bairros} />
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
