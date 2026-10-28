/**
 * Crédito profissional: "Desenvolvido por Orbit Lab", com link para o site da empresa.
 * Usado na tela de login e no rodapé do portal.
 */
const ORBITLAB_URL = 'https://orbitlab.com.br';

interface Props {
  /** 'onDark' = sobre o navy (faixa de login); 'onSurface' = rodapé claro/escuro temático. */
  variant?: 'onDark' | 'onSurface';
}

export default function DevCredit({ variant = 'onSurface' }: Props) {
  const onDark = variant === 'onDark';
  const baseColor = onDark ? 'var(--on-navy-muted)' : 'var(--text-2)';
  const linkColor = onDark ? 'var(--on-navy)' : 'var(--primary-ink)';

  return (
    <span className="text-[11px]" style={{ color: baseColor }}>
      Desenvolvido por{' '}
      <a
        href={ORBITLAB_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Site da Orbit Lab"
        className="font-semibold no-underline hover:underline"
        style={{ color: linkColor }}
      >
        Orbit Lab
      </a>
    </span>
  );
}
