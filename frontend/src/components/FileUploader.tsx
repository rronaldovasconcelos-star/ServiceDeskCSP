import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import api from '../lib/api';
import {
  ANOS_LETIVOS,
  SEGMENTOS,
  SERIES_BY_SEGMENTO,
  ETAPAS,
  DISCIPLINAS,
  TIPOS_MATERIAL,
} from '../lib/taxonomy';

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: '6px',
};

const baseSelectStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 12px',
  fontSize: '13px',
  background: 'var(--bg-primary)',
  outline: 'none',
  boxSizing: 'border-box',
};

export default function FileUploader({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [anoLetivo, setAnoLetivo] = useState(ANOS_LETIVOS[0]);
  const [segmento, setSegmento] = useState('');
  const [serie, setSerie] = useState('');
  const [etapa, setEtapa] = useState('');
  const [disciplina, setDisciplina] = useState('');
  const [tipoMaterial, setTipoMaterial] = useState('');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  const serieOptions = segmento ? SERIES_BY_SEGMENTO[segmento] ?? [] : [];

  // Ao trocar o segmento, a série anterior pode não pertencer mais a ele → reseta.
  function handleSegmento(value: string) {
    setSegmento(value);
    setSerie('');
  }

  const classificacaoCompleta =
    !!anoLetivo && !!segmento && !!serie && !!etapa && !!disciplina && !!tipoMaterial;

  async function send(list: FileList | File[]) {
    const files = Array.from(list);
    if (files.length === 0) return;
    if (!classificacaoCompleta) {
      setError('Preencha toda a classificação (ano, segmento, série, etapa, disciplina e tipo) antes de enviar.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setError('');
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    fd.append('anoLetivo', anoLetivo);
    fd.append('segmento', segmento);
    fd.append('serie', serie);
    fd.append('etapa', etapa);
    fd.append('disciplina', disciplina);
    fd.append('tipoMaterial', tipoMaterial);

    setProgress(0);
    try {
      await api.post('/files', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      onUploaded();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Erro ao enviar arquivo(s).');
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const uploading = progress !== null;

  function selectStyle(filled: boolean): React.CSSProperties {
    return { ...baseSelectStyle, color: filled ? 'var(--text-primary)' : 'var(--text-secondary)' };
  }

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '16px',
        marginBottom: '16px',
        boxShadow: 'var(--shadow)',
      }}
    >
      {/* Classificação — 6 eixos obrigatórios */}
      <div style={{ marginBottom: '12px' }}>
        <label style={fieldLabelStyle}>
          Classificação <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
          <select value={anoLetivo} onChange={(e) => setAnoLetivo(e.target.value)} disabled={uploading} style={selectStyle(!!anoLetivo)}>
            {ANOS_LETIVOS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>

          <select value={segmento} onChange={(e) => handleSegmento(e.target.value)} disabled={uploading} style={selectStyle(!!segmento)}>
            <option value="">Segmento...</option>
            {SEGMENTOS.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>

          <select value={serie} onChange={(e) => setSerie(e.target.value)} disabled={uploading || !segmento} style={selectStyle(!!serie)}>
            <option value="">{segmento ? 'Série...' : 'Escolha o segmento'}</option>
            {serieOptions.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>

          <select value={etapa} onChange={(e) => setEtapa(e.target.value)} disabled={uploading} style={selectStyle(!!etapa)}>
            <option value="">Etapa...</option>
            {ETAPAS.map((e) => <option key={e.code} value={e.code}>{e.label}</option>)}
          </select>

          <select value={disciplina} onChange={(e) => setDisciplina(e.target.value)} disabled={uploading} style={selectStyle(!!disciplina)}>
            <option value="">Disciplina...</option>
            {DISCIPLINAS.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
          </select>

          <select value={tipoMaterial} onChange={(e) => setTipoMaterial(e.target.value)} disabled={uploading} style={selectStyle(!!tipoMaterial)}>
            <option value="">Tipo de material...</option>
            {TIPOS_MATERIAL.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Área drag-and-drop */}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!uploading && e.dataTransfer.files.length) send(e.dataTransfer.files);
        }}
        style={{
          border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--radius)',
          padding: '28px 16px',
          textAlign: 'center',
          cursor: uploading ? 'default' : 'pointer',
          background: dragging ? 'var(--bg-active)' : 'transparent',
          transition: 'background 0.15s, border-color 0.15s',
          opacity: classificacaoCompleta ? 1 : 0.6,
        }}
      >
        <UploadCloud size={28} color="var(--accent)" style={{ marginBottom: '8px' }} />
        <p style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, margin: '0 0 2px' }}>
          Arraste arquivos aqui ou clique para selecionar
        </p>
        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
          PDF, Word, Excel, PowerPoint, MP4, ZIP, imagens — até 100MB cada
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => e.target.files && send(e.target.files)}
        />
      </div>

      {/* Barra de progresso */}
      {uploading && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ height: '8px', background: 'var(--bg-card-hover)', borderRadius: '20px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                background: 'var(--accent)',
                transition: 'width 0.2s',
              }}
            />
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Enviando... {progress}%
          </p>
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: '12px',
            padding: '8px 12px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#ef4444',
            fontSize: '12px',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
