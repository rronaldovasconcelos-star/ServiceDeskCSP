import type { ReactNode } from 'react';
import { Headset, ShieldCheck, Clock3 } from 'lucide-react';
import DevCredit from './DevCredit';

interface Props {
  children: ReactNode;
}

const pontos = [
  { icon: Headset, texto: 'Chamados de TI, manutenção e pedagógico num só lugar' },
  { icon: Clock3, texto: 'Acompanhe cada pedido até a conclusão' },
  { icon: ShieldCheck, texto: 'Acesso só para a equipe do colégio' },
];

/**
 * Casca das telas de entrada (login, cadastro, redefinir senha): metade
 * azul-marinho com a forma elétrica e o logo em máscara circular; metade clara
 * com o card do formulário. No celular, só o card sobre o navy.
 */
export default function AuthShell({ children }: Props) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: 'var(--navy)' }}>
      {/* Lado navy */}
      <section className="relative overflow-hidden lg:flex-1 flex flex-col justify-between px-6 pt-8 pb-6 lg:p-14" style={{ color: 'var(--on-navy)' }}>
        <img src="/blob.svg" alt="" aria-hidden="true" className="absolute pointer-events-none" style={{ right: -120, top: -90, width: 560, opacity: 0.95 }} />
        <img src="/blob.svg" alt="" aria-hidden="true" className="absolute pointer-events-none hidden lg:block" style={{ left: -260, bottom: -200, width: 520, transform: 'rotate(160deg)', opacity: 0.35 }} />

        <div className="relative z-10 flex items-center gap-3">
          <img src="/logo.png" alt="Colégio Santa Paula" className="w-12 h-12 object-contain bg-white p-0.5" style={{ borderRadius: 'var(--radius-tile)' }} />
          <div>
            <p className="font-semibold leading-tight" style={{ margin: 0 }}>Colégio Santa Paula</p>
            <p className="text-xs leading-tight" style={{ margin: '2px 0 0', color: 'var(--sky)', fontWeight: 500 }}>Portal de Chamados</p>
          </div>
        </div>

        <div className="relative z-10 hidden lg:block" style={{ maxWidth: 480 }}>
          <div
            className="flex items-center justify-center mb-8"
            style={{ width: 180, height: 180, borderRadius: '50%', background: '#fff', boxShadow: 'var(--shadow-navy)' }}
          >
            <img src="/logo-hd.png" alt="" aria-hidden="true" className="w-36 h-36 object-contain" />
          </div>
          <h1 style={{ fontSize: 40, lineHeight: 1.1, fontWeight: 600, margin: 0 }}>
            Suporte da escola,
            <br />
            <span style={{ color: 'var(--sky)' }}>sem perder nada no caminho.</span>
          </h1>
          <ul className="mt-8 flex flex-col gap-4" style={{ listStyle: 'none', padding: 0, margin: '32px 0 0' }}>
            {pontos.map(({ icon: Icon, texto }) => (
              <li key={texto} className="flex items-center gap-3">
                <span className="icon-tile" style={{ background: 'rgba(255,255,255,0.12)' }}><Icon size={18} /></span>
                <span style={{ color: 'var(--on-navy-muted)', fontSize: 14 }}>{texto}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 hidden lg:block" style={{ margin: 0 }}><DevCredit variant="onDark" /></p>
      </section>

      {/* Lado do formulário */}
      <section className="flex-1 lg:flex-none lg:w-[520px] flex items-start lg:items-center justify-center px-4 pb-8 lg:p-10" style={{ background: 'var(--paper)' }}>
        <div className="w-full" style={{ maxWidth: 400 }}>
          <div className="card card-raised" style={{ padding: '32px 28px', marginTop: 24 }}>
            {children}
          </div>
          <p className="text-center mt-5 lg:hidden" style={{ margin: '20px 0 0' }}><DevCredit variant="onSurface" /></p>
        </div>
      </section>
    </div>
  );
}

/** Campo com ícone à esquerda, no padrão do portal. */
export function AuthField({ label, icon, children, hint }: { label: string; icon?: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)', display: 'inline-flex' }}>{icon}</span>}
        {children}
      </div>
      {hint && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '6px 0 0' }}>{hint}</p>}
    </div>
  );
}

export const authInputClass = 'field with-icon';

export function AuthAlert({ kind, children }: { kind: 'error' | 'info'; children: ReactNode }) {
  const cor = kind === 'error' ? 'var(--coral)' : 'var(--electric)';
  const fundo = kind === 'error' ? 'var(--coral-soft)' : 'var(--electric-soft)';
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} style={{ background: fundo, color: cor, borderRadius: 'var(--radius-tile)', padding: '10px 14px', fontSize: 13, marginBottom: 18 }}>
      {children}
    </div>
  );
}
