/**
 * Crédito profissional do desenvolvedor (marca "Ronaldo Dev").
 * Link abre conversa no WhatsApp. Usado na tela de login e no rodapé do portal.
 */
const WHATSAPP_URL =
  'https://wa.me/5531984367833?text=' +
  encodeURIComponent('Olá Ronaldo! Vi seu trabalho na Central de Suporte do colégio.');

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
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Falar com o desenvolvedor no WhatsApp"
        className="font-semibold no-underline hover:underline"
        style={{ color: linkColor }}
      >
        Ronaldo Dev
      </a>
    </span>
  );
}
