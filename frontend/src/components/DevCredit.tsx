/**
 * Crédito profissional do desenvolvedor (marca "Ronaldo Dev").
 * Link abre conversa no WhatsApp. Usado na tela de login e no rodapé do portal.
 */
const WHATSAPP_URL =
  'https://wa.me/5531984367833?text=' +
  encodeURIComponent('Olá Ronaldo! Vi seu trabalho no Portal de Chamados.');

interface Props {
  /** 'onDark' = sobre fundo escuro/gradiente (login); 'onSurface' = rodapé temático. */
  variant?: 'onDark' | 'onSurface';
}

export default function DevCredit({ variant = 'onSurface' }: Props) {
  const onDark = variant === 'onDark';
  const baseColor = onDark ? 'var(--on-navy-muted)' : 'var(--text-secondary)';
  const linkColor = onDark ? 'var(--on-navy)' : 'var(--electric)';

  return (
    <span style={{ color: baseColor, fontSize: '11px' }}>
      Desenvolvido por{' '}
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Falar com o desenvolvedor no WhatsApp"
        style={{ color: linkColor, fontWeight: 600, textDecoration: 'none' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none'; }}
      >
        Ronaldo Dev
      </a>
    </span>
  );
}
