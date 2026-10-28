import { useId } from 'react';
import type { ReactNode } from 'react';
import { Headset, ShieldCheck, Clock3, AlertCircle, Info } from 'lucide-react';
import DevCredit from './DevCredit';

interface Props {
  children: ReactNode;
}

const pontos = [
  { icon: Headset, texto: 'Chamados de TI, manutenção e pedagógico' },
  { icon: Clock3, texto: 'Acompanhe cada pedido até a conclusão' },
  { icon: ShieldCheck, texto: 'Acesso só para a equipe do colégio' },
];

/**
 * Casca das telas de entrada (login, cadastro, redefinir senha): faixa
 * azul-marinho com a marca no topo, card do formulário sobreposto à faixa e
 * três pontos de confiança abaixo. Sem forma decorativa — plano, como o resto.
 */
export default function AuthShell({ children }: Props) {
  return (
    <div className="auth-page">
      <header className="auth-band">
        <div className="auth-band-brand">
          <img src="/logo.png" alt="Colégio Santa Paula" />
          <div>
            <p className="auth-band-name">Colégio Santa Paula</p>
            <p className="auth-band-sub">Central de Suporte</p>
          </div>
        </div>
        <div className="hidden lg:block">
          <DevCredit variant="onDark" />
        </div>
      </header>

      <main className="auth-main">
        <div className="card card-raised auth-card">
          {children}
        </div>
        <div className="auth-points">
          {pontos.map(({ icon: Icon, texto }) => (
            <div key={texto} className="auth-point">
              <span className="icon-tile soft" aria-hidden="true"><Icon size={16} /></span>
              <span>{texto}</span>
            </div>
          ))}
        </div>
        <p className="mt-5 text-center lg:hidden"><DevCredit variant="onSurface" /></p>
      </main>
    </div>
  );
}

/** Cabeçalho do card de autenticação: logo em alta + título + subtítulo. */
export function AuthHeading({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="auth-card-logo">
      <img src="/logo-hd.png" alt="" aria-hidden="true" />
      <div>
        <h1 className="auth-card-title">{title}</h1>
        {subtitle && <p className="auth-card-sub">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Atributos que o campo deve espalhar no `<input>` para ligar rótulo, dica e erro. */
export interface AuthFieldControl {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

interface AuthFieldProps {
  label: string;
  icon?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /**
   * Render-prop: recebe `{ id, aria-describedby, aria-invalid }` para espalhar no
   * controle. Também aceita um nó pronto (modo antigo, sem `htmlFor`) para as
   * páginas que ainda não migraram.
   */
  children: ((ctl: AuthFieldControl) => ReactNode) | ReactNode;
}

/** Campo com rótulo, ícone à esquerda, dica e erro, no padrão do portal. */
export function AuthField({ label, icon, hint, error, children }: AuthFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const isRenderProp = typeof children === 'function';

  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined;
  const ctl: AuthFieldControl = { id };
  if (describedBy) ctl['aria-describedby'] = describedBy;
  if (error) ctl['aria-invalid'] = true;

  return (
    <div className="field-wrap">
      <label htmlFor={isRenderProp ? id : undefined} className="field-label">{label}</label>
      <div className="relative">
        {icon && (
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none inline-flex"
            style={{ color: 'var(--text-2)' }}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        {isRenderProp ? (children as (ctl: AuthFieldControl) => ReactNode)(ctl) : children}
      </div>
      {hint && <p id={hintId} className="field-hint">{hint}</p>}
      {error && <p id={errId} className="field-error" role="alert">{error}</p>}
    </div>
  );
}

export const authInputClass = 'field with-icon';

/** Aviso dentro do card: erro (vermelho) ou informação (azul), sempre com ícone. */
export function AuthAlert({ kind, children }: { kind: 'error' | 'info'; children: ReactNode }) {
  const isError = kind === 'error';
  return (
    <div
      className={`notice ${isError ? 'notice-danger' : 'notice-info'} mb-4`}
      role={isError ? 'alert' : 'status'}
    >
      {isError ? <AlertCircle size={16} aria-hidden="true" /> : <Info size={16} aria-hidden="true" />}
      <div className="notice-body">{children}</div>
    </div>
  );
}
