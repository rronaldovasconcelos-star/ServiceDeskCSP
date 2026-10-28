import { useState, useEffect, useCallback, useRef, useId } from 'react';
import {
  Bot, Activity, FileText, Sparkles, Cpu, Save, Loader2, RefreshCw,
  Upload, Trash2, Paperclip, Smartphone, Wifi, WifiOff, LogOut, RotateCcw, QrCode,
  Users, Mail, Phone, CalendarCheck, Database, BarChart3, Plus, KeyRound, MapPin,
  Baby, Inbox, Check, X,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api, { setKey, hasKey, clearKey, rag as ragApi, report as reportApi, FORM_LINK } from '../lib/lizApi';
import MapaBairros from '../components/MapaBairros';
import ErrorBoundary from '../components/ErrorBoundary';
import PageHeader from '../components/PageHeader';
import { Button, Card, EmptyState, Field, IconTile, Notice } from '../components/ui';
import { onTabsKeyDown } from '../lib/a11y';

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

/** Badge e tile do estado da conexão: verde = no ar, azul = conectando, vermelho = fora, cinza = desconhecido. */
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

/* Gráficos: tokens do tema (iguais ao Relatórios). */
const TOOLTIP_STYLE = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text)' } as const;
const TICK = { fontSize: 10, fill: 'var(--text-2)' } as const;

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
  const idBase = useId();
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

  const idAba = (k: Tab) => `${idBase}-aba-${k}`;
  const idPainel = (k: Tab) => `${idBase}-painel-${k}`;
  const enterKey = () => { if (keyInput.trim()) { setKey(keyInput); setAuthed(true); window.location.reload(); } };

  if (!authed) {
    return (
      <>
        <PageHeader title="Agente IA" description="Liz · assistente do WhatsApp" />
        <div className="page-body">
          <Card raised className="mx-auto mt-8 max-w-[420px]">
            <div className="mb-3.5 flex items-center gap-3">
              <IconTile tone="electric"><KeyRound size={18} /></IconTile>
              <h2 className="card-title m-0">Gestão da Liz</h2>
            </div>
            <p className="muted mb-4 text-[13px]">
              Informe a chave de acesso do painel para gerenciar a assistente.
            </p>
            <form className="stack gap-3" onSubmit={(e) => { e.preventDefault(); enterKey(); }}>
              {authMsg && <Notice kind="danger">{authMsg}</Notice>}
              <Field label="Chave de acesso" required>
                {(ctl) => (
                  <input
                    {...ctl}
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="Chave de acesso"
                    className="field"
                    autoComplete="current-password"
                  />
                )}
              </Field>
              <Button type="submit" className="w-full">Entrar</Button>
            </form>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Agente IA"
        description="Liz · assistente do WhatsApp · alterações entram em vigor na hora"
        actions={<Button variant="secondary" icon={<RefreshCw size={15} />} onClick={fetchStatus}>Atualizar status</Button>}
      />

      <div className="page-body stack gap-4">
        {/* Toast */}
        {message && (
          <Notice kind={message.type === 'ok' ? 'success' : 'danger'} onClose={() => setMessage(null)}>
            {message.text}
          </Notice>
        )}

        {/* Abas */}
        <div className="tabs" role="tablist" aria-label="Seções do agente" onKeyDown={onTabsKeyDown}>
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={idAba(key)}
              aria-selected={tab === key}
              aria-controls={idPainel(key)}
              tabIndex={tab === key ? 0 : -1}
              className={`tab${tab === key ? ' active' : ''}`}
              onClick={() => setTab(key)}
            >
              <Icon size={15} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={idPainel(tab)} aria-labelledby={idAba(tab)} className="stack gap-4">
        {/* ── Status ── */}
        {tab === 'status' && (
          status ? (
            <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
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
                    <p className="kpi-value text-lg wrap-break-word">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Notice kind="danger" actions={<Button variant="secondary" size="sm" onClick={fetchStatus}>Tentar novamente</Button>}>
              Não foi possível obter o status do agente. Verifique se o bot está online e configurado.
            </Notice>
          )
        )}

        {/* ── Leads ── */}
        {tab === 'leads' && (
          <>
            <Card>
              <div className="section-head items-center">
                <h2 className="card-title m-0">
                  {showAllContacts ? `Todos os contatos (${leads.length})` : `Leads qualificados (${qualifiedCount})`}
                </h2>
                <div className="row">
                  <Button
                    variant="ghost" size="sm" icon={<Users size={14} />}
                    onClick={() => setShowAllContacts((v) => !v)}
                    aria-pressed={showAllContacts}
                    title="Leads = com sinal real (interesse, visita, filho ou bairro). Contatos = todo mundo que escreveu."
                  >
                    {showAllContacts ? `Ver só leads (${qualifiedCount})` : `Ver todos os contatos (${leads.length})`}
                  </Button>
                  <Button variant="secondary" size="sm" icon={<FileText size={14} />} onClick={exportLeadsCsv} disabled={visibleLeads.length === 0}>
                    Exportar CSV
                  </Button>
                  <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={fetchLeads} loading={loading['leads']}>
                    Atualizar
                  </Button>
                </div>
              </div>
              {/* Contadores por interesse */}
              <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
                {(['imediato', 'proximo_semestre', 'proximo_ano'] as const).map((k) => {
                  const count = leads.filter((l) => l.leadInterest === k).length;
                  return (
                    <div key={k} className="rounded-(--radius-sm) bg-(--bg) p-3">
                      <span className={`pill pill-${INTEREST_TONE[k]}`}>{INTEREST_LABEL[k]}</span>
                      <p className="mt-2 text-2xl leading-none font-semibold text-(--text)">{count}</p>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Lista de leads */}
            <Card>
              {loading['leads'] && leads.length === 0 ? (
                <div className="stack gap-2" aria-busy="true" aria-live="polite">
                  <div className="skeleton h-[88px]" />
                  <div className="skeleton h-[88px]" />
                  <p className="sr-only">Carregando leads…</p>
                </div>
              ) : visibleLeads.length === 0 ? (
                <EmptyState icon={<Users size={22} />} title={showAllContacts ? 'Nenhum contato ainda' : 'Nenhum lead qualificado ainda'}>
                  {showAllContacts
                    ? 'Conforme os responsáveis conversarem com a Liz, eles aparecem aqui automaticamente.'
                    : 'Use "Ver todos os contatos" para ver quem já escreveu, ou aguarde a Liz coletar interesse/bairro/visita.'}
                </EmptyState>
              ) : (
                <ul className="stack m-0 list-none gap-2 p-0">
                  {visibleLeads.map((l) => (
                    <li key={l.phone} className="rounded-(--radius-sm) bg-(--bg) p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="row">
                            <span className="text-sm font-semibold text-(--text)">
                              {l.name || 'Sem nome'}
                            </span>
                            {l.leadInterest && (
                              <span className={`pill pill-${INTEREST_TONE[l.leadInterest]}`}>{INTEREST_LABEL[l.leadInterest]}</span>
                            )}
                            {l.gradeInterest && <span className="pill pill-muted">{l.gradeInterest}</span>}
                          </div>
                          <div className="row mt-1.5 gap-3 text-xs text-(--text-2)">
                            <span className="inline-flex items-center gap-1"><Phone size={12} aria-hidden="true" /><span className="sr-only">Telefone:</span> {formatPhone(l.phone)}</span>
                            {l.email && <span className="inline-flex items-center gap-1"><Mail size={12} aria-hidden="true" /><span className="sr-only">E-mail:</span> {l.email}</span>}
                            {l.children.length > 0 && (
                              <span className="inline-flex items-center gap-1"><Baby size={12} aria-hidden="true" /><span className="sr-only">Filhos:</span> {l.children.map((c) => `${c.name}${c.age ? ` (${c.age})` : ''}`).join(', ')}</span>
                            )}
                          </div>
                          {l.lastVisit && (
                            <div className="mt-1.5 flex items-center gap-1 text-xs text-(--success-ink)">
                              <CalendarCheck size={12} aria-hidden="true" /> Visita: {l.lastVisit.date} às {l.lastVisit.time}
                            </div>
                          )}
                        </div>
                        <a
                          href={`https://wa.me/${l.phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary btn-sm shrink-0 no-underline"
                        >
                          <Smartphone size={13} aria-hidden="true" /> WhatsApp
                        </a>
                      </div>
                      <p className="mt-2 text-[11px] text-(--text-2)">Atualizado: {formatDate(l.updatedAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}

        {/* ── Conexão WhatsApp ── */}
        {tab === 'conexao' && (
          <>
            <Card className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <IconTile tone={STATE_TONE[connState]} size={44}>
                  {connState === 'open' ? <Wifi size={20} /> : <WifiOff size={20} />}
                </IconTile>
                <div>
                  <p className="font-semibold text-(--text)">{STATE_LABEL[connState]}</p>
                  <p className="text-xs text-(--text-2)">{connState === 'open' ? (connPhone ?? 'Carregando…') : 'Sem número ativo'}</p>
                </div>
              </div>
              <span className={`pill pill-strong ${STATE_PILL[connState]}`}>
                <span className="pill-dot" aria-hidden="true" />
                {STATE_LABEL[connState]}
              </span>
            </Card>

            <div className="row gap-2.5">
              <Button
                icon={<QrCode size={15} />}
                onClick={genQr}
                loading={loading['qr']}
                disabled={connState === 'open'}
              >
                {connState === 'open' ? 'Já conectado' : 'Gerar QR Code'}
              </Button>
              <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={fetchConnection}>Atualizar status</Button>
              <Button
                variant="secondary"
                icon={<RotateCcw size={15} />}
                onClick={restartConn}
                loading={loading['restart']}
              >
                Reiniciar conexão
              </Button>
              <Button
                variant="danger"
                icon={<LogOut size={15} />}
                onClick={disconnectConn}
                loading={loading['disconnect']}
                disabled={connState !== 'open'}
              >
                Desconectar
              </Button>
            </div>

            {qrcode && (
              <Card className="flex flex-col items-center gap-3.5 p-6">
                <p className="font-semibold text-(--text)">Aponte o WhatsApp para o QR Code</p>
                <p className="muted text-center text-[13px]">No celular: WhatsApp → Dispositivos conectados → Conectar dispositivo</p>
                {/* Fundo branco fixo: o QR precisa de contraste alto também no tema escuro. */}
                <div className="rounded-(--radius-sm) border border-(--line) bg-(--on-navy) p-3">
                  <img src={qrcode} alt="QR Code WhatsApp" className="block size-[220px]" />
                </div>
                <p className="text-xs text-(--text-2)">O QR expira em ~60 segundos. Se expirar, clique em "Gerar QR Code" novamente.</p>
              </Card>
            )}

            {connState === 'open' && !qrcode && (
              <Notice kind="success" title="Tudo certo!">
                A Liz está atendendo pelo número {connPhone ?? '–'}.
                Use <strong>Reiniciar conexão</strong> se houver falha no envio sem trocar de número.
                Use <strong>Desconectar</strong> apenas para trocar de número — será necessário escanear um novo QR Code.
              </Notice>
            )}

            {connState !== 'open' && !qrcode && connState !== 'unknown' && (
              <Notice kind="danger" title="Liz desconectada.">
                Clique em <strong>Gerar QR Code</strong> e escaneie com o celular do número que deve atender.
              </Notice>
            )}
          </>
        )}

        {/* ── Prompt ── */}
        {tab === 'prompt' && (
          <Card title="System prompt da Liz">
            <form className="stack gap-3.5" onSubmit={(e) => { e.preventDefault(); void savePrompt(); }}>
              <Field
                label="Prompt"
                hint={(
                  <>
                    Define a personalidade e as regras. Mantenha os marcadores{' '}
                    <code className="text-(--primary-ink)">{'{{DATETIME}}'}</code>,{' '}
                    <code className="text-(--primary-ink)">{'{{PHONE}}'}</code>,{' '}
                    <code className="text-(--primary-ink)">{'{{WHATSAPP_NAME}}'}</code> e{' '}
                    <code className="text-(--primary-ink)">{'{{MEMORY}}'}</code>.
                  </>
                )}
              >
                {(ctl) => (
                  <textarea
                    {...ctl}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="field min-h-[360px] font-mono text-[12.5px] leading-normal"
                  />
                )}
              </Field>

              <div className="row gap-3">
                <Field label={<span className="inline-flex items-center gap-1.5"><Cpu size={15} aria-hidden="true" /> Modelo</span>} inline>
                  {(ctl) => (
                    <select {...ctl} value={model} onChange={(e) => setModel(e.target.value)} className="field w-auto">
                      {[...new Set([model, ...MODELS])].filter(Boolean).map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  )}
                </Field>
                <Button type="submit" icon={<Save size={15} />} loading={loading['prompt']} className="ml-auto">
                  Salvar prompt
                </Button>
              </div>
              {config && <p className="text-[11px] text-(--text-2)">Última edição: {formatDate(config.updatedAt)}</p>}
            </form>
          </Card>
        )}

        {/* ── Contexto extra ── */}
        {tab === 'contexto' && (
          <Card title="Contexto adicional">
            <form className="stack gap-3.5" onSubmit={(e) => { e.preventDefault(); void saveContext(); }}>
              <Field
                label="Contexto"
                hint="Informações temporárias injetadas no prompt — avisos sazonais, promoções, mudanças de horário, campanhas de matrícula. Deixe em branco para não adicionar nada."
              >
                {(ctl) => (
                  <textarea
                    {...ctl}
                    value={extraContext}
                    onChange={(e) => setExtraContext(e.target.value)}
                    className="field min-h-[220px] text-[13px]"
                    placeholder="Ex: Estamos em campanha de matrícula 2026 — informe que há 10% de desconto até 30/06."
                  />
                )}
              </Field>
              <div className="form-actions">
                <Button type="submit" icon={<Save size={15} />} loading={loading['contexto']}>
                  Salvar contexto
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* ── Arquivos ── */}
        {tab === 'arquivos' && (
          <>
            <Card title="Novo arquivo">
              <form className="stack gap-3" onSubmit={(e) => { e.preventDefault(); void uploadFile(); }}>
                <p className="-mt-2 text-xs text-(--text-2)">
                  PDF, imagem ou folder que a Liz poderá enviar nas conversas. A descrição diz a ela quando usar.
                </p>
                {/* Input nativo escondido — acionado pela área clicável abaixo */}
                <input
                  ref={fileInput}
                  type="file"
                  onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                  tabIndex={-1}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-(--radius-sm) border-2 border-dashed bg-(--bg) px-4 py-6 font-[inherit] text-(--text-2) transition-colors ${pendingFile ? 'border-(--primary)' : 'border-(--line-strong)'}`}
                >
                  <Upload size={22} className="text-(--primary-ink)" aria-hidden="true" />
                  {pendingFile ? (
                    <>
                      <span className="text-sm font-semibold text-(--text)">{pendingFile.name}</span>
                      <span className="text-xs">{formatBytes(pendingFile.size)} · clique para trocar</span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-semibold text-(--text)">Clique para escolher um arquivo</span>
                      <span className="text-xs">PDF, imagem, vídeo ou documento</span>
                    </>
                  )}
                </button>
                <Field label="Descrição" hint="Diz à Liz quando usar o arquivo.">
                  {(ctl) => (
                    <input
                      {...ctl}
                      type="text"
                      value={pendingDesc}
                      onChange={(e) => setPendingDesc(e.target.value)}
                      placeholder="Descrição — ex: Tabela de valores 2026, enviar quando perguntarem sobre mensalidade"
                      className="field"
                    />
                  )}
                </Field>
                <div className="form-actions">
                  <Button type="submit" icon={<Upload size={15} />} loading={loading['upload']} disabled={!pendingFile}>
                    Enviar arquivo
                  </Button>
                </div>
              </form>
            </Card>

            <Card title={`Arquivos cadastrados (${files.length})`}>
              {files.length === 0 ? (
                <EmptyState icon={<Paperclip size={22} />} title="Nenhum arquivo ainda">
                  Use a área acima para enviar o primeiro.
                </EmptyState>
              ) : (
                <ul className="stack m-0 list-none gap-2 p-0">
                  {files.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 rounded-(--radius-sm) bg-(--bg) p-3">
                      <IconTile tone="electric" size={36}><FileText size={16} /></IconTile>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-(--text)">{f.originalName}</p>
                        <p className="truncate text-xs text-(--text-2)">{f.description || 'sem descrição'} · {formatBytes(f.sizeBytes)}</p>
                      </div>
                      <Button
                        variant="ghost" size="sm" iconOnly
                        onClick={() => removeFile(f.id)}
                        loading={loading[`del-${f.id}`]}
                        aria-label={`Remover ${f.originalName}`}
                        title="Remover arquivo"
                        className="text-(--danger)"
                        icon={<Trash2 size={14} />}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}

        {/* ── Conhecimento (RAG) ── */}
        {tab === 'rag' && (
          <>
            <Card>
              <h2 className="card-title mb-1.5 flex items-center gap-2.5"><IconTile size={32}><Users size={16} /></IconTile> Coleta de conhecimento</h2>
              <p className="muted mb-2.5 text-[13px]">Envie este link para os colaboradores preencherem as informações da escola. As respostas chegam aqui em <b>Pendentes</b> para sua aprovação.</p>
              <div className="row items-end">
                <Field label="Link do formulário" className="min-w-[220px] flex-1">
                  {(ctl) => <input {...ctl} readOnly value={FORM_LINK} className="field" onFocus={(e) => e.currentTarget.select()} />}
                </Field>
                <Button variant="secondary" icon={copied ? <Check size={14} /> : undefined} onClick={() => { navigator.clipboard.writeText(FORM_LINK); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                  {copied ? 'Copiado!' : 'Copiar link'}
                </Button>
              </div>
            </Card>

            {pending.length > 0 && (
              <Card title={<span className="flex items-center gap-2.5"><IconTile tone="amber" size={32}><Inbox size={16} /></IconTile> Pendentes de revisão ({pending.length})</span>}>
                <ul className="stack m-0 list-none gap-2 p-0">
                  {pending.map((p) => (
                    <li key={p.id} className="rounded-(--radius-sm) bg-(--bg) p-3">
                      <div className="mb-1 text-xs text-(--text-2)">{p.colaborador} · {p.categoria}</div>
                      <div className="text-[13px] text-(--text)"><b>{p.pergunta}</b></div>
                      <div className="mt-0.5 text-[13px] text-(--text)">{p.resposta}</div>
                      <div className="row mt-2.5">
                        <Button variant="secondary" size="sm" icon={<Check size={14} />} onClick={() => approvePending(p.id)} loading={loading[`pa-${p.id}`]}>
                          Aprovar
                        </Button>
                        <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={() => rejectPending(p.id)} loading={loading[`pr-${p.id}`]} className="text-(--danger)">
                          Rejeitar
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card>
              <div className="section-head items-center">
                <h2 className="card-title m-0">Base de conhecimento (RAG)</h2>
                <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={fetchRag} loading={loading.rag}>Atualizar</Button>
              </div>

              <form className="stack mb-4 gap-2" onSubmit={(e) => { e.preventDefault(); void addRag(); }}>
                <Field label="Novo conhecimento">
                  {(ctl) => (
                    <textarea
                      {...ctl}
                      value={ragText} onChange={(e) => setRagText(e.target.value)} rows={3}
                      placeholder="Escreva um novo conhecimento/FAQ que a Liz deve saber…"
                      className="field min-h-20"
                    />
                  )}
                </Field>
                <div className="row items-end">
                  <Field label="Categoria" className="w-[160px]">
                    {(ctl) => <input {...ctl} value={ragCat} onChange={(e) => setRagCat(e.target.value)} placeholder="categoria" className="field" />}
                  </Field>
                  <Button type="submit" icon={<Plus size={14} />} loading={loading.ragAdd} disabled={!ragText.trim()}>
                    Adicionar
                  </Button>
                  <label className="btn btn-secondary cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-(--primary)">
                    {loading.ragPdf ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />} Upload PDF
                    <input type="file" accept="application/pdf" className="sr-only" disabled={loading.ragPdf} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPdfRag(f); e.target.value = ''; }} />
                  </label>
                </div>
              </form>

              {loading.rag ? (
                <div className="stack gap-2" aria-busy="true" aria-live="polite">
                  <div className="skeleton h-16" />
                  <div className="skeleton h-16" />
                  <p className="sr-only">Carregando…</p>
                </div>
              ) : (
                <div className="stack gap-2">
                  <p className="text-xs text-(--text-2)">{ragChunks.length} trechos indexados</p>
                  {ragChunks.length === 0 && (
                    <EmptyState icon={<Database size={22} />} title="Nenhum trecho indexado ainda">
                      Adicione um conhecimento acima ou envie um PDF.
                    </EmptyState>
                  )}
                  {ragChunks.map((c) => (
                    <div key={c.id} className="flex items-start justify-between gap-3 rounded-(--radius-sm) bg-(--bg) p-3">
                      <div className="min-w-0">
                        <span className="pill pill-violet">{c.categoria}</span>
                        <span className="ml-2 text-xs text-(--text-2)">{c.fonte}</span>
                        <p className="mt-1 text-[13px] text-(--text)">{c.texto}</p>
                      </div>
                      <Button
                        variant="ghost" size="sm" iconOnly title="Remover" aria-label="Remover trecho"
                        onClick={() => removeRag(c.id)} loading={loading[`ragDel-${c.id}`]}
                        className="shrink-0 text-(--danger)"
                        icon={<Trash2 size={16} />}
                      />
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
            <div className="section-head items-center">
              <p className="section-label m-0">Relatório comercial</p>
              <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={fetchReport} loading={loading.relatorio}>Atualizar</Button>
            </div>

            {loading.relatorio && !reportData && (
              <div className="stack gap-3" aria-busy="true" aria-live="polite">
                <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
                  <div className="skeleton h-[88px]" /><div className="skeleton h-[88px]" /><div className="skeleton h-[88px]" />
                </div>
                <div className="skeleton h-[200px]" />
                <p className="sr-only">Carregando…</p>
              </div>
            )}

            {reportData && (
              <>
                <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
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
                      <div className="overflow-x-auto">
                        <table className="border-separate border-spacing-0.5">
                          <caption className="sr-only">Mensagens recebidas por dia da semana e hora</caption>
                          <thead><tr><th><span className="sr-only">Dia</span></th>{Array.from({ length: 24 }, (_, h) => <th key={h} scope="col" className="px-px text-[8px] font-normal text-(--text-2)">{h}</th>)}</tr></thead>
                          <tbody>
                            {DOW_LABEL.map((d, di) => (
                              <tr key={di}>
                                <th scope="row" className="pr-1.5 text-left text-[10px] font-normal text-(--text-2)">{d}</th>
                                {Array.from({ length: 24 }, (_, h) => {
                                  const c = grid[`${di}-${h}`] || 0;
                                  const op = c ? 0.15 + 0.85 * (c / max) : 0;
                                  return (
                                    <td
                                      key={h}
                                      title={`${d} ${h}h: ${c}`}
                                      className={`size-[15px] rounded-[3px] ${c ? 'bg-(--primary)' : 'bg-(--line) opacity-60'}`}
                                      style={c ? { opacity: op } : undefined}
                                    >
                                      <span className="sr-only">{c}</span>
                                    </td>
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

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Card title="Leads por interesse">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={reportData.interesse}>
                        <XAxis dataKey="interesse" tick={TICK} />
                        <YAxis allowDecimals={false} tick={TICK} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--primary-soft)' }} />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                          {reportData.interesse.map((_, i) => <Cell key={i} fill="var(--primary)" />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                  <Card title="Leads por etapa de ensino">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={reportData.etapas}>
                        <XAxis dataKey="etapa" tick={{ ...TICK, fontSize: 9 }} interval={0} />
                        <YAxis allowDecimals={false} tick={TICK} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--primary-soft)' }} />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="var(--violet)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </div>

                <Card>
                  <h2 className="card-title flex items-center gap-2.5"><IconTile size={32}><MapPin size={16} /></IconTile> Mapa de calor — leads por bairro/região</h2>
                  {reportData.bairros.filter((b) => b.bairro && !b.bairro.startsWith('(')).length === 0 ? (
                    <EmptyState icon={<MapPin size={22} />} title="Sem dados de bairro ainda">
                      A Liz passou a coletar nas conversas.
                    </EmptyState>
                  ) : (
                    <ErrorBoundary fallback={
                      <Notice kind="warning">
                        Não foi possível carregar o mapa de bairros. Veja a lista abaixo:
                        <br />{reportData.bairros.filter((b) => b.bairro && !b.bairro.startsWith('(')).map((b) => `${b.bairro} (${b.count})`).join(' · ')}
                      </Notice>
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
      </div>
    </>
  );
}
