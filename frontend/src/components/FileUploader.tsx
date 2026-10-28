import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import api from '../lib/api';
import { Field, Notice } from './ui';
import {
  ANOS_LETIVOS,
  SEGMENTOS,
  SERIES_BY_SEGMENTO,
  ETAPAS,
  disciplinasFor,
  tiposFor,
} from '../lib/taxonomy';

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
  const disciplinaOptions = disciplinasFor(segmento);
  const tipoOptions = tiposFor(segmento);

  // Ao trocar o segmento, série/disciplina/tipo anteriores podem não pertencer
  // mais a ele → reseta para evitar combinação inválida.
  function handleSegmento(value: string) {
    setSegmento(value);
    setSerie('');
    setDisciplina('');
    setTipoMaterial('');
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

  /** Select da taxonomia: texto apagado enquanto ainda não foi escolhido. */
  const selectClass = (filled: boolean) => `field ${filled ? '' : 'text-(--text-2)'}`.trim();

  const abrirSeletor = () => { if (!uploading) inputRef.current?.click(); };

  return (
    <div className="card">
      {/* Classificação — 6 eixos obrigatórios */}
      <fieldset className="form-group mb-4">
        <legend>
          Classificação <span className="field-req" aria-hidden="true">*</span>
        </legend>
        <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
          <Field label="Ano letivo" required>
            {(ctl) => (
              <select {...ctl} value={anoLetivo} onChange={(e) => setAnoLetivo(e.target.value)} disabled={uploading} className={selectClass(!!anoLetivo)}>
                {ANOS_LETIVOS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            )}
          </Field>

          <Field label="Segmento" required>
            {(ctl) => (
              <select {...ctl} value={segmento} onChange={(e) => handleSegmento(e.target.value)} disabled={uploading} className={selectClass(!!segmento)}>
                <option value="">Segmento...</option>
                {SEGMENTOS.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            )}
          </Field>

          <Field label="Série" required>
            {(ctl) => (
              <select {...ctl} value={serie} onChange={(e) => setSerie(e.target.value)} disabled={uploading || !segmento} className={selectClass(!!serie)}>
                <option value="">{segmento ? 'Série...' : 'Escolha o segmento'}</option>
                {serieOptions.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            )}
          </Field>

          <Field label="Etapa" required>
            {(ctl) => (
              <select {...ctl} value={etapa} onChange={(e) => setEtapa(e.target.value)} disabled={uploading} className={selectClass(!!etapa)}>
                <option value="">Etapa...</option>
                {ETAPAS.map((e) => <option key={e.code} value={e.code}>{e.label}</option>)}
              </select>
            )}
          </Field>

          <Field label="Disciplina" required>
            {(ctl) => (
              <select {...ctl} value={disciplina} onChange={(e) => setDisciplina(e.target.value)} disabled={uploading || !segmento} className={selectClass(!!disciplina)}>
                <option value="">{segmento ? 'Disciplina...' : 'Escolha o segmento'}</option>
                {disciplinaOptions.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
              </select>
            )}
          </Field>

          <Field label="Tipo de material" required>
            {(ctl) => (
              <select {...ctl} value={tipoMaterial} onChange={(e) => setTipoMaterial(e.target.value)} disabled={uploading || !segmento} className={selectClass(!!tipoMaterial)}>
                <option value="">{segmento ? 'Tipo de material...' : 'Escolha o segmento'}</option>
                {tipoOptions.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            )}
          </Field>
        </div>
      </fieldset>

      {/* Área drag-and-drop (também acessível por teclado: Enter/Espaço abre o seletor) */}
      <div
        role="button"
        tabIndex={uploading ? -1 : 0}
        aria-disabled={uploading || undefined}
        aria-label="Arraste arquivos aqui ou clique para selecionar"
        onClick={abrirSeletor}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirSeletor(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!uploading && e.dataTransfer.files.length) send(e.dataTransfer.files);
        }}
        className={[
          'rounded-(--radius-md) border-2 border-dashed px-4 py-7 text-center transition-colors',
          dragging ? 'border-(--primary) bg-(--primary-soft)' : 'border-(--line-strong) bg-transparent',
          uploading ? 'cursor-default' : 'cursor-pointer',
          classificacaoCompleta ? '' : 'opacity-60',
        ].join(' ')}
      >
        <UploadCloud size={28} className="mx-auto mb-2 text-(--primary-ink)" aria-hidden="true" />
        <p className="text-[13px] font-medium text-(--text)">
          Arraste arquivos aqui ou clique para selecionar
        </p>
        <p className="text-[11px] text-(--text-2)">
          PDF, Word, Excel, PowerPoint, MP4, ZIP, imagens — até 100MB cada
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => e.target.files && send(e.target.files)}
        />
      </div>

      {/* Barra de progresso */}
      {uploading && (
        <div className="mt-3" role="status" aria-live="polite">
          <div
            className="h-2 overflow-hidden rounded-(--radius-pill) bg-(--surface-2)"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress ?? 0}
            aria-label="Progresso do envio"
          >
            <div className="h-full bg-(--primary) transition-[width] duration-200" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-(--text-2)">
            Enviando... {progress}%
          </p>
        </div>
      )}

      {error && (
        <Notice kind="danger" className="mt-3" onClose={() => setError('')}>
          {error}
        </Notice>
      )}
    </div>
  );
}
