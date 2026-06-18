import { useEffect, useRef } from 'react';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const GSI_SRC = 'https://accounts.google.com/gsi/client';

// Tipagem mínima da API global do Google Identity Services.
interface GoogleId {
  accounts: {
    id: {
      initialize: (cfg: {
        client_id: string;
        callback: (r: { credential: string }) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }) => void;
      renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
      disableAutoSelect: () => void;
    };
  };
}
declare global {
  interface Window { google?: GoogleId }
}

/** Carrega o script GSI uma única vez (cache da Promise). */
function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar Google')));
      return;
    }
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Falha ao carregar Google'));
    document.head.appendChild(s);
  });
}

interface Props {
  onCredential: (credential: string) => void;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
}

export default function GoogleSignInButton({ onCredential, text = 'continue_with' }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLIENT_ID) return; // sem client id configurado, não renderiza nada
    let cancelled = false;

    loadGsi()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (r) => onCredential(r.credential),
          // Máximo rigor: nunca autentica sozinho. Sem auto-select, o Google
          // exige clique no botão e a escolha da conta — evita que, num PC
          // compartilhado, a sessão Google do usuário anterior entre sozinha.
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        // Garante que qualquer auto-select previamente memorizado seja apagado.
        window.google.accounts.id.disableAutoSelect();
        window.google.accounts.id.renderButton(ref.current, {
          theme: 'outline',
          size: 'large',
          width: ref.current.offsetWidth || 320,
          text,
          shape: 'pill',
          logo_alignment: 'center',
        });
      })
      .catch(() => { /* silencioso — o login por senha continua disponível */ });

    return () => { cancelled = true; };
  }, [onCredential, text]);

  if (!CLIENT_ID) return null;
  return <div ref={ref} className="w-full flex justify-center" />;
}
