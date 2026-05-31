import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import api from '../lib/api';

const CATEGORIA_SUGESTOES = [
  'Provas',
  'Planos de Aula',
  'Material de Apoio',
  'Trabalhos',
  'Documentos',
  'Atividades de Sala',
  'Projetos',
  'Capas',
  'Para Casa',
  'Simulados',
];

export default function FileUploader({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState('');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  async function send(list: FileList | File[]) {
    const files = Array.from(list);
    if (files.length === 0) return;
    if (!folder.trim()) {
      setError('Selecione uma categoria antes de enviar.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setError('');
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    fd.append('folder', folder.trim());

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
      {/* Categoria */}
      <div style={{ marginBottom: '12px' }}>
        <label
          style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}
        >
          Categoria <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <select
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          disabled={uploading}
          style={{
            width: '100%',
            maxWidth: '320px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 12px',
            fontSize: '13px',
            background: 'var(--bg-primary)',
            color: folder ? 'var(--text-primary)' : 'var(--text-secondary)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        >
          <option value="">Selecione uma categoria...</option>
          {CATEGORIA_SUGESTOES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
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
