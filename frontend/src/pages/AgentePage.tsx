import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bot, Activity, FileText, Sparkles, Cpu, Save, Loader2, RefreshCw,
  Upload, Trash2, Paperclip, Smartphone, Wifi, WifiOff, LogOut, RotateCcw, QrCode,
  Users, Mail, Phone, CalendarCheck, Database, BarChart3, Plus, KeyRound, MapPin,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api, { setKey, hasKey, clearKey, rag as ragApi, report as reportApi, FORM_LINK } from '../lib/lizApi';
import MapaBairros from '../components/MapaBairros';
import ErrorBoundary from '../components/ErrorBoundary';
import PageHeader from '../components/PageHeader';
import { Button, Card, IconTile } from '../components/ui';

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
  bairro?: string | null;
  visitsCount: number;
  lastVisit: { date: string; time: string; childName: string } | null;
  updatedAt: string | null;
  qualified?: boolean;
}

type Tab = 'status' | 'prompt' | 'contexto' | 'arquivos' | 'conexao' | 'leads' | 'rag' | 'relatorio';

const DOW_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const INTEREST_LABEL: Record<NonNullable<Lead['leadInterest']>, string> = {
  imediato: 'Imediato',
  proximo_semestre: 'Próximo semestre',
  proximo_ano: 'Próximo ano',
};

// Tom da pílula (classes .pill-* do index.css): quanto mais perto a matrícula, mais quente.
const INTEREST_TONE: Record<NonNullable<Lead['leadInterest']>, 'teal' | 'amber' | 'electric'> = {
  imediato: 'teal',
  proximo_semestre: 'amber',
  proximo_ano: 'electric',
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
  open: 'var(--teal)',
  connecting: 'var(--electric)',
  close: 'var(--coral)',
  unknown: 'var(--text-secondary)',
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
  const [showAllContacts, setShowAllContacts] = useState(false);
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
  const [authMsg, setAuthMsg] = useState('');

  const setLoad = (k: string, v: boolean) => setLoading((p) => ({ ...p, [k]: v }));
  const notify = (text: string, type: 'ok' | 'err') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };
  const errMsg = (err: unknown, fallback: string) =>
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

  // Chave admin inválida/expirada → limpa e volta ao gate com aviso claro.
  // Retorna true se tratou (o chamador deve evitar o notify genérico nesse caso).
  const handleAuthError = (err: unknown): boolean => {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 401) {
      clearKey();
      setAuthed(false);
      setAuthMsg('Chave de acesso inválida ou expirada. Informe a chave correta para continuar.');
      return true;
    }
    return false;
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get<AgentStatus>('/agent/status');
      setStatus(res.data);
    } catch (err) {
      if (!handleAuthError(err)) setStatus(null);
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
      if (!handleAuthError(err)) notify(errMsg(err, 'Erro ao carregar configuração do agente'), 'err');
    }
  }, []);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await api.get<AgentFile[]>('/agent/files');
      setFiles(res.data);
    } catch (err) {
      handleAuthError(err); /* demais erros: silencioso */
    }
  }, []);

  const fetchLeads = useCallback(async () => {
    setLoad('leads', true);
    try {
      const res = await api.get<{ total: number; leads: Lead[] }>('/agent/leads');
      setLeads(res.data.leads);
    } catch (err) {
      if (!handleAuthError(err)) notify(errMsg(err, 'Erro ao carregar leads'), 'err');
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
      if (!handleAuthError(err)) notify(errMsg(err, 'Erro ao carregar conhecimento'), 'err');
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
      if (!handleAuthError(err)) notify(errMsg(err, 'Erro ao carregar relatório'), 'err');
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
    const header = ['Nome', 'Telefone', 'E-mail', 'Bairro', 'Filhos', 'Interesse', 'Serie', 'Visitas', 'Ultima visita', 'Atualizado'];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = visibleLeads.map((l) => [
      l.name ?? '',
      l.phone,
      l.email ?? '',
      l.bairro ?? '',
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
    a.download = `${showAllContacts ? 'contatos' : 'leads'}-liz-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const savePrompt = async () => {
    setLoad('prompt', true);
    try {
      await api.put('/agent/config', { systemPrompt: prompt, model });
      notify('Prompt atualizado. A Liz já está usando a nova versão.', 'ok');
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
      const base64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ''));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(pendingFile);
      });
      await api.post('/agent/files', {
        base64,
        name: pendingFile.name,
        mime: pendingFile.type || 'application/octet-stream',
        description: pendingDesc,
      });
      notify('Arquivo enviado. A Liz já pode anexá-lo nas conversas.', 'ok');
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

  // ── Conexão WhatsApp da Liz ──
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

  const textareaStyle: React.CSSProperties = {
    minHeight: 360,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12.5,
    lineHeight: 1.5,
    resize: 'vertical',
  };

  // Lead qualificado = tem sinal real (interesse/visita/filho/bairro). Demais = contato casual.
  const qualifiedCount = leads.filter((l) => l.qualified).length;
  const visibleLeads = showAllContacts ? leads : leads.filter((l) => l.qualified);

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

  const muted: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: 13 };
  const small: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: 12 };
  const inner: React.CSSProperties = { background: 'var(--bg-primary)', borderRadius: 'var(--radius-tile)', padding: 12 };
  const enterKey = () => { if (keyInput.trim()) { setKey(keyInput); setAuthed(true); window.location.reload(); } };

  if (!authed) {
    return (
      <>
        <PageHeader title="Agente IA" subtitle="Liz · assistente do WhatsApp" />
        <div className="page-body">
          <Card raised style={{ maxWidth: 420, margin: '32px auto 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <IconTile tone="electric"><KeyRound size={18} /></IconTile>
              <h2 className="card-title" style={{ margin: 0 }}>Gestão da Liz</h2>
            </div>
            <p style={{ ...muted, marginBottom: 16 }}>
              Informe a chave de acesso do painel para gerenciar a assistente.
            </p>
            {authMsg && (
              <p style={{ background: 'var(--coral-soft)', color: 'var(--coral)', borderRadius: 'var(--radius-tile)', padding: '10px 12px', fontSize: 12.5, marginBottom: 12 }}>
                {authMsg}
              </p>
            )}
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') enterKey(); }}
              placeholder="Chave de acesso"
              className="field"
              style={{ marginBottom: 12 }}
            />
            <Button onClick={enterKey} style={{ width: '100%', justifyContent: 'center' }}>Entrar</Button>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Agente IA"
        subtitle="Liz · assistente do WhatsApp · alterações entram em vigor na hora"
        actions={<Button variant="onNavy" icon={<RefreshCw size={15} />} onClick={fetchStatus}>Atualizar status</Button>}
      />

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Toast */}
        {message && (
          <div
            role="status"
            style={{
              background: message.type === 'ok' ? 'var(--teal-soft)' : 'var(--coral-soft)',
              color: message.type === 'ok' ? 'var(--teal)' : 'var(--coral)',
              borderRadius: 'var(--radius-tile)',
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {message.text}
          </div>
        )}

        {/* Abas */}
        <div className="tabs">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" className={`tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Status ── */}
        {tab === 'status' && (
          status ? (
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              {([
                { icon: Activity, label: 'Online há', value: formatUptime(status.uptimeSeconds), tone: 'teal' },
                { icon: Bot, label: 'Conversas ativas', value: String(status.sessions), tone: 'electric' },
                { icon: Cpu, label: 'Modelo', value: status.model, tone: 'violet' },
                { icon: Paperclip, label: 'Arquivos da IA', value: String(status.filesCount), tone: 'amber' },
                { icon: FileText, label: 'Prompt editado em', value: formatDate(status.configUpdatedAt), tone: 'electric' },
              ] as const).map(({ icon: Icon, label, value, tone }) => (
                <div key={label} className="kpi-card">
                  <IconTile tone={tone} size={44}><Icon size={20} aria-hidden="true" /></IconTile>
                  <div className="min-w-0">
                    <p className="kpi-label">{label}</p>
                    <p className="kpi-value" style={{ fontSize: 18, wordBreak: 'break-word' }}>{value}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Card>
              <p style={muted}>Não foi possível obter o status do agente. Verifique se o bot está online e configurado.</p>
            </Card>
          )
        )}

        {/* ── Leads ── */}
        {tab === 'leads' && (
          <>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                <h2 className="card-title" style={{ margin: 0 }}>
                  {showAllContacts ? `Todos os contatos (${leads.length})` : `Leads qualificados (${qualifiedCount})`}
                </h2>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button
                    variant="ghost" size="sm" icon={<Users size={14} />}
                    onClick={() => setShowAllContacts((v) => !v)}
                    title="Leads = com sinal real (interesse, visita, filho ou bairro). Contatos = todo mundo que escreveu."
                  >
                    {showAllContacts ? `Ver só leads (${qualifiedCount})` : `Ver todos os contatos (${leads.length})`}
                  </Button>
                  <Button variant="ghost" size="sm" icon={<FileText size={14} />} onClick={exportLeadsCsv} disabled={visibleLeads.length === 0}>
                    Exportar CSV
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    icon={loading['leads'] ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    onClick={fetchLeads}
                  >
                    Atualizar
                  </Button>
                </div>
              </div>
              {/* Contadores por interesse */}
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                {(['imediato', 'proximo_semestre', 'proximo_ano'] as const).map((k) => {
                  const count = leads.filter((l) => l.leadInterest === k).length;
                  return (
                    <div key={k} style={inner}>
                      <span className={`pill pill-${INTEREST_TONE[k]}`}>{INTEREST_LABEL[k]}</span>
                      <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 24, marginTop: 8, lineHeight: 1.1 }}>{count}</p>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Lista de leads */}
            <Card>
              {loading['leads'] && leads.length === 0 ? (
                <div style={{ ...muted, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 size={15} className="animate-spin" /> Carregando leads…
                </div>
              ) : visibleLeads.length === 0 ? (
                <p style={muted}>
                  {showAllContacts
                    ? 'Nenhum contato ainda. Conforme os responsáveis conversarem com a Liz, eles aparecem aqui automaticamente.'
                    : 'Nenhum lead qualificado ainda. Use "Ver todos os contatos" para ver quem já escreveu, ou aguarde a Liz coletar interesse/bairro/visita.'}
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {visibleLeads.map((l) => (
                    <div key={l.phone} style={inner}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div className="min-w-0">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                              {l.name || 'Sem nome'}
                            </span>
                            {l.leadInterest && (
                              <span className={`pill pill-${INTEREST_TONE[l.leadInterest]}`}>{INTEREST_LABEL[l.leadInterest]}</span>
                            )}
                            {l.gradeInterest && <span className="pill pill-muted">{l.gradeInterest}</span>}
                          </div>
                          <div style={{ ...small, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={12} /> {formatPhone(l.phone)}</span>
                            {l.email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Mail size={12} /> {l.email}</span>}
                            {l.children.length > 0 && (
                              <span>👦 {l.children.map((c) => `${c.name}${c.age ? ` (${c.age})` : ''}`).join(', ')}</span>
                            )}
                          </div>
                          {l.lastVisit && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, color: 'var(--teal)', fontSize: 12 }}>
                              <CalendarCheck size={12} /> Visita: {l.lastVisit.date} às {l.lastVisit.time}
                            </div>
                          )}
                        </div>
                        <a
                          href={`https://wa.me/${l.phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary btn-sm"
                          style={{ textDecoration: 'none', flexShrink: 0 }}
                        >
                          <Smartphone size={13} /> WhatsApp
                        </a>
                      </div>
                      <p style={{ ...small, fontSize: 11, marginTop: 8 }}>Atualizado: {formatDate(l.updatedAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}

        {/* ── Conexão WhatsApp ── */}
        {tab === 'conexao' && (
          <>
            <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                    background: STATE_COLOR[connState], boxShadow: `0 0 8px ${STATE_COLOR[connState]}`,
                  }}
                />
                <div>
                  <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{STATE_LABEL[connState]}</p>
                  <p style={small}>{connState === 'open' ? (connPhone ?? 'Carregando…') : 'Sem número ativo'}</p>
                </div>
              </div>
              {connState === 'open'
                ? <Wifi size={22} style={{ color: STATE_COLOR.open }} />
                : <WifiOff size={22} style={{ color: STATE_COLOR[connState] }} />}
            </Card>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <Button variant="ghost" icon={<RefreshCw size={15} />} onClick={fetchConnection}>Atualizar status</Button>
              <Button
                icon={loading['qr'] ? <Loader2 size={15} className="animate-spin" /> : <QrCode size={15} />}
                onClick={genQr}
                disabled={loading['qr'] || connState === 'open'}
              >
                {connState === 'open' ? 'Já conectado' : 'Gerar QR Code'}
              </Button>
              <Button
                variant="ghost"
                icon={loading['restart'] ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                onClick={restartConn}
                disabled={loading['restart']}
              >
                Reiniciar conexão
              </Button>
              <Button
                variant="danger"
                icon={loading['disconnect'] ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
                onClick={disconnectConn}
                disabled={loading['disconnect'] || connState !== 'open'}
              >
                Desconectar
              </Button>
            </div>

            {qrcode && (
              <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 24 }}>
                <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Aponte o WhatsApp para o QR Code</p>
                <p style={{ ...muted, textAlign: 'center' }}>No celular: WhatsApp → Dispositivos conectados → Conectar dispositivo</p>
                <div style={{ background: 'var(--on-navy)', padding: 12, borderRadius: 'var(--radius-tile)' }}>
                  <img src={qrcode} alt="QR Code WhatsApp" style={{ width: 220, height: 220, display: 'block' }} />
                </div>
                <p style={small}>O QR expira em ~60 segundos. Se expirar, clique em "Gerar QR Code" novamente.</p>
              </Card>
            )}

            {connState === 'open' && !qrcode && (
              <div style={{ background: 'var(--teal-soft)', color: 'var(--text-primary)', borderRadius: 'var(--radius-card)', padding: 16, fontSize: 13 }}>
                <strong style={{ color: 'var(--teal)' }}>Tudo certo!</strong> A Liz está atendendo pelo número {connPhone ?? '–'}.
                Use <strong>Reiniciar conexão</strong> se houver falha no envio sem trocar de número.
                Use <strong>Desconectar</strong> apenas para trocar de número — será necessário escanear um novo QR Code.
              </div>
            )}

            {connState !== 'open' && !qrcode && connState !== 'unknown' && (
              <div style={{ background: 'var(--coral-soft)', color: 'var(--text-primary)', borderRadius: 'var(--radius-card)', padding: 16, fontSize: 13 }}>
                <strong style={{ color: 'var(--coral)' }}>Liz desconectada.</strong> Clique em <strong>Gerar QR Code</strong> e escaneie com o celular do número que deve atender.
              </div>
            )}
          </>
        )}

        {/* ── Prompt ── */}
        {tab === 'prompt' && (
          <Card title="System prompt da Liz">
            <p style={{ ...small, marginTop: -8, marginBottom: 12 }}>
              Define a personalidade e as regras. Mantenha os marcadores{' '}
              <code style={{ color: 'var(--electric)' }}>{'{{DATETIME}}'}</code>,{' '}
              <code style={{ color: 'var(--electric)' }}>{'{{PHONE}}'}</code>,{' '}
              <code style={{ color: 'var(--electric)' }}>{'{{WHATSAPP_NAME}}'}</code> e{' '}
              <code style={{ color: 'var(--electric)' }}>{'{{MEMORY}}'}</code>.
            </p>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="field" style={textareaStyle} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cpu size={15} style={{ color: 'var(--text-secondary)' }} />
                <select value={model} onChange={(e) => setModel(e.target.value)} className="field" style={{ width: 'auto' }}>
                  {[...new Set([model, ...MODELS])].filter(Boolean).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <Button
                icon={loading['prompt'] ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                onClick={savePrompt}
                disabled={loading['prompt']}
                style={{ marginLeft: 'auto' }}
              >
                Salvar prompt
              </Button>
            </div>
            {config && <p style={{ ...small, fontSize: 11, marginTop: 8 }}>Última edição: {formatDate(config.updatedAt)}</p>}
          </Card>
        )}

        {/* ── Contexto extra ── */}
        {tab === 'contexto' && (
          <Card title="Contexto adicional">
            <p style={{ ...small, marginTop: -8, marginBottom: 12 }}>
              Informações temporárias injetadas no prompt — avisos sazonais, promoções, mudanças de horário,
              campanhas de matrícula. Deixe em branco para não adicionar nada.
            </p>
            <textarea
              value={extraContext}
              onChange={(e) => setExtraContext(e.target.value)}
              className="field"
              style={{ ...textareaStyle, minHeight: 220, fontFamily: 'inherit', fontSize: 13 }}
              placeholder="Ex: Estamos em campanha de matrícula 2026 — informe que há 10% de desconto até 30/06."
            />
            <div style={{ marginTop: 14 }}>
              <Button
                icon={loading['contexto'] ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                onClick={saveContext}
                disabled={loading['contexto']}
              >
                Salvar contexto
              </Button>
            </div>
          </Card>
        )}

        {/* ── Arquivos ── */}
        {tab === 'arquivos' && (
          <>
            <Card title="Novo arquivo">
              <p style={{ ...small, marginTop: -8, marginBottom: 12 }}>
                PDF, imagem ou folder que a Liz poderá enviar nas conversas. A descrição diz a ela quando usar.
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
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                  width: '100%', marginBottom: 12,
                  background: 'var(--bg-primary)',
                  border: `2px dashed ${pendingFile ? 'var(--electric)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-tile)',
                  padding: '24px 16px',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  font: 'inherit',
                }}
              >
                <Upload size={22} style={{ color: 'var(--electric)' }} />
                {pendingFile ? (
                  <>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>{pendingFile.name}</span>
                    <span style={{ fontSize: 12 }}>{formatBytes(pendingFile.size)} · clique para trocar</span>
                  </>
                ) : (
                  <>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>Clique para escolher um arquivo</span>
                    <span style={{ fontSize: 12 }}>PDF, imagem, vídeo ou documento</span>
                  </>
                )}
              </button>
              <input
                type="text"
                value={pendingDesc}
                onChange={(e) => setPendingDesc(e.target.value)}
                placeholder="Descrição — ex: Tabela de valores 2026, enviar quando perguntarem sobre mensalidade"
                className="field"
                style={{ marginBottom: 12 }}
              />
              <Button
                icon={loading['upload'] ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                onClick={uploadFile}
                disabled={!pendingFile || loading['upload']}
              >
                Enviar arquivo
              </Button>
            </Card>

            <Card title={`Arquivos cadastrados (${files.length})`}>
              {files.length === 0 ? (
                <p style={muted}>Nenhum arquivo ainda. Use a área acima para enviar o primeiro.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {files.map((f) => (
                    <div key={f.id} style={{ ...inner, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <IconTile tone="electric" size={36}><FileText size={16} /></IconTile>
                      <div className="min-w-0 flex-1">
                        <p className="truncate" style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: 13.5 }}>{f.originalName}</p>
                        <p className="truncate" style={small}>{f.description || 'sem descrição'} · {formatBytes(f.sizeBytes)}</p>
                      </div>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => removeFile(f.id)}
                        disabled={loading[`del-${f.id}`]}
                        aria-label="Remover arquivo"
                        style={{ color: 'var(--coral)', padding: 8 }}
                      >
                        {loading[`del-${f.id}`] ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}

        {/* ── Conhecimento (RAG) ── */}
        {tab === 'rag' && (
          <>
            <Card>
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><Users size={16} /> Coleta de conhecimento</h2>
              <p style={{ ...muted, marginBottom: 10 }}>Envie este link para os colaboradores preencherem as informações da escola. As respostas chegam aqui em <b>Pendentes</b> para sua aprovação.</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <input readOnly value={FORM_LINK} className="field" style={{ flex: 1, minWidth: 220, width: 'auto' }} />
                <Button onClick={() => { navigator.clipboard.writeText(FORM_LINK); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                  {copied ? 'Copiado!' : 'Copiar link'}
                </Button>
              </div>
            </Card>

            {pending.length > 0 && (
              <Card title={`📥 Pendentes de revisão (${pending.length})`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pending.map((p) => (
                    <div key={p.id} style={inner}>
                      <div style={{ ...small, marginBottom: 4 }}>{p.colaborador} · {p.categoria}</div>
                      <div style={{ color: 'var(--text-primary)', fontSize: 13 }}><b>{p.pergunta}</b></div>
                      <div style={{ color: 'var(--text-primary)', fontSize: 13, marginTop: 2 }}>{p.resposta}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <Button variant="secondary" size="sm" onClick={() => approvePending(p.id)} disabled={loading[`pa-${p.id}`]}>
                          {loading[`pa-${p.id}`] ? '...' : '✓ Aprovar'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => rejectPending(p.id)} disabled={loading[`pr-${p.id}`]} style={{ color: 'var(--coral)' }}>
                          {loading[`pr-${p.id}`] ? '...' : '✕ Rejeitar'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h2 className="card-title" style={{ margin: 0 }}>Base de conhecimento (RAG)</h2>
                <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={fetchRag}>Atualizar</Button>
              </div>

              <div style={{ marginBottom: 16 }}>
                <textarea
                  value={ragText} onChange={(e) => setRagText(e.target.value)} rows={3}
                  placeholder="Escreva um novo conhecimento/FAQ que a Liz deve saber…"
                  className="field" style={{ marginBottom: 8, resize: 'vertical' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input value={ragCat} onChange={(e) => setRagCat(e.target.value)} placeholder="categoria" className="field" style={{ width: 140 }} />
                  <Button
                    icon={loading.ragAdd ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    onClick={addRag} disabled={loading.ragAdd || !ragText.trim()}
                  >
                    Adicionar
                  </Button>
                  <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                    {loading.ragPdf ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload PDF
                    <input type="file" accept="application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPdfRag(f); e.target.value = ''; }} />
                  </label>
                </div>
              </div>

              {loading.rag ? (
                <div style={{ ...muted, display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={16} className="animate-spin" /> Carregando…</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={small}>{ragChunks.length} trechos indexados</p>
                  {ragChunks.map((c) => (
                    <div key={c.id} style={{ ...inner, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <span className="pill pill-violet">{c.categoria}</span>
                        <span style={{ ...small, marginLeft: 8 }}>{c.fonte}</span>
                        <p style={{ color: 'var(--text-primary)', fontSize: 13, marginTop: 4 }}>{c.texto}</p>
                      </div>
                      <Button
                        variant="ghost" size="sm" title="Remover" aria-label="Remover"
                        onClick={() => removeRag(c.id)} disabled={loading[`ragDel-${c.id}`]}
                        style={{ color: 'var(--coral)', padding: 6, flexShrink: 0 }}
                      >
                        {loading[`ragDel-${c.id}`] ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}

        {/* ── Relatório ── */}
        {tab === 'relatorio' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p className="section-label" style={{ margin: 0 }}>Relatório comercial</p>
              <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={fetchReport}>Atualizar</Button>
            </div>

            {loading.relatorio && <div style={{ ...muted, display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={16} className="animate-spin" /> Carregando…</div>}

            {reportData && (
              <>
                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  {([
                    { l: 'Leads', v: reportData.totais.leads, icon: Users, tone: 'electric' },
                    { l: 'Visitas agendadas', v: reportData.totais.visitasAgendadas, icon: CalendarCheck, tone: 'teal' },
                    { l: 'Crianças', v: reportData.totais.comFilho, icon: Sparkles, tone: 'amber' },
                  ] as const).map(({ l, v, icon: Icon, tone }) => (
                    <div key={l} className="kpi-card">
                      <IconTile tone={tone} size={44}><Icon size={20} aria-hidden="true" /></IconTile>
                      <div>
                        <p className="kpi-label">{l}</p>
                        <p className="kpi-value">{v}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <Card title="Mapa de calor — quando chegam mensagens">
                  {(() => {
                    const grid: Record<string, number> = {};
                    let max = 1;
                    reportData.heatmap.forEach((h) => { grid[`${h.dow}-${h.hour}`] = h.count; if (h.count > max) max = h.count; });
                    return (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ borderCollapse: 'separate', borderSpacing: 2 }}>
                          <thead><tr><th></th>{Array.from({ length: 24 }, (_, h) => <th key={h} style={{ fontSize: 8, color: 'var(--text-secondary)', padding: '0 1px', fontWeight: 400 }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {DOW_LABEL.map((d, di) => (
                              <tr key={di}>
                                <td style={{ fontSize: 10, color: 'var(--text-secondary)', paddingRight: 6 }}>{d}</td>
                                {Array.from({ length: 24 }, (_, h) => {
                                  const c = grid[`${di}-${h}`] || 0;
                                  const op = c ? 0.15 + 0.85 * (c / max) : 0;
                                  return (
                                    <td
                                      key={h}
                                      title={`${d} ${h}h: ${c}`}
                                      style={{ width: 15, height: 15, borderRadius: 3, background: c ? 'var(--electric)' : 'var(--border)', opacity: c ? op : 0.6 }}
                                    />
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card title="Leads por interesse">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={reportData.interesse}>
                        <XAxis dataKey="interesse" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                        <Tooltip cursor={{ fill: 'var(--bg-card-hover)' }} />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                          {reportData.interesse.map((_, i) => <Cell key={i} fill="var(--electric)" />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                  <Card title="Leads por etapa de ensino">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={reportData.etapas}>
                        <XAxis dataKey="etapa" tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} interval={0} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                        <Tooltip cursor={{ fill: 'var(--bg-card-hover)' }} />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="var(--violet)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </div>

                <Card>
                  <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MapPin size={16} /> Mapa de calor — leads por bairro/região</h2>
                  {reportData.bairros.filter((b) => b.bairro && !b.bairro.startsWith('(')).length === 0 ? (
                    <p style={muted}>Sem dados de bairro ainda — a Liz passou a coletar nas conversas.</p>
                  ) : (
                    <ErrorBoundary fallback={
                      <p style={muted}>
                        Não foi possível carregar o mapa de bairros. Veja a lista abaixo:
                        <br />{reportData.bairros.filter((b) => b.bairro && !b.bairro.startsWith('(')).map((b) => `${b.bairro} (${b.count})`).join(' · ')}
                      </p>
                    }>
                      <MapaBairros bairros={reportData.bairros} />
                    </ErrorBoundary>
                  )}
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
