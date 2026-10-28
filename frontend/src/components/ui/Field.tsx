import { useId, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Atributos que o `Field` entrega ao controle filho (input, select, textarea).
 * Espalhe no elemento: `<input className="field" {...ctl} />`.
 */
export interface FieldCtl {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
}

interface FieldProps {
  label: ReactNode;
  /** Texto de apoio abaixo do controle. */
  hint?: ReactNode;
  /** Mensagem de erro; quando presente, marca o controle como inválido. */
  error?: ReactNode;
  required?: boolean;
  /** Id fixo para o controle; se omitido, gera um com `useId`. */
  id?: string;
  className?: string;
  /** Rótulo ao lado do controle (checkbox, switch). */
  inline?: boolean;
  /** Render prop: recebe os atributos de acessibilidade e devolve o controle. */
  children: (ctl: FieldCtl) => ReactNode;
}

/**
 * Campo de formulário com rótulo, dica e erro ligados por aria ao controle.
 * As classes `.field-wrap`, `.field-label`, `.field-hint`, `.field-error`
 * e `.field-req` vivem no index.css.
 */
export default function Field({ label, hint, error, required, id, className = '', inline, children }: FieldProps) {
  const gerado = useId();
  const ctlId = id ?? gerado;
  const hintId = `${ctlId}-hint`;
  const errId = `${ctlId}-err`;

  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined;

  const ctl: FieldCtl = { id: ctlId };
  if (describedBy) ctl['aria-describedby'] = describedBy;
  if (error) ctl['aria-invalid'] = true;
  if (required) ctl['aria-required'] = true;

  return (
    <div className={`field-wrap${inline ? ' inline' : ''} ${className}`.trim()}>
      <label htmlFor={ctlId} className="field-label">
        {label}
        {required && <span className="field-req" aria-hidden="true">*</span>}
      </label>
      {children(ctl)}
      {hint && <p id={hintId} className="field-hint">{hint}</p>}
      {error && (
        <p id={errId} className="field-error" role="alert">
          <AlertCircle size={13} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

interface FieldsetProps {
  legend: ReactNode;
  /** Texto curto abaixo da legenda. */
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Grupo de campos com legenda; separa seções de um formulário longo. */
export function Fieldset({ legend, hint, children, className = '' }: FieldsetProps) {
  return (
    <fieldset className={`form-group ${className}`.trim()}>
      <legend>{legend}</legend>
      {hint && <p className="form-legend-hint">{hint}</p>}
      {children}
    </fieldset>
  );
}
