import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import { getToken, setToken as persistToken, clearToken } from '../lib/token';

/** Tempo de inatividade (ms) após o qual o usuário é deslogado automaticamente. */
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/** Desativa o auto-login (One Tap / auto-select) do Google, se carregado. */
function disableGoogleAutoSelect(): void {
  try {
    window.google?.accounts?.id?.disableAutoSelect();
  } catch {
    /* GSI pode não estar carregado — ignore */
  }
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  modules?: string[];
}

/** Resultado do login com Google: ou autentica, ou exige coleta do WhatsApp. */
export type GoogleLoginResult =
  | { status: 'ok' }
  | { status: 'need_phone'; userId: string; name?: string };

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<GoogleLoginResult>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(getToken());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.get('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => { clearToken(); setToken(null); })
      .finally(() => setLoading(false));
  }, [token]);

  // Detecta restauração do bfcache (botão voltar após logout)
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && !getToken()) {
        setUser(null);
        setToken(null);
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    disableGoogleAutoSelect();
    setToken(null);
    setUser(null);
  }, []);

  // Logout automático por inatividade: zera a sessão após IDLE_TIMEOUT_MS sem
  // qualquer interação. Proteção para computadores compartilhados — se o usuário
  // se ausenta sem clicar em "Sair", a sessão expira sozinha.
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!token) return; // só monitora quando há sessão ativa

    const reset = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(logout, IDLE_TIMEOUT_MS);
    };

    const events: (keyof WindowEventMap)[] = [
      'mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click',
    ];
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    // Deslogar também ao trocar de aba e voltar depois do tempo (visibilitychange
    // não dispara os eventos acima enquanto a aba está em segundo plano).
    document.addEventListener('visibilitychange', reset);

    reset(); // inicia o cronômetro

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      events.forEach((ev) => window.removeEventListener(ev, reset));
      document.removeEventListener('visibilitychange', reset);
    };
  }, [token, logout]);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    const { token: t, user: u } = res.data;
    persistToken(t);
    setToken(t);
    setUser(u);
  };

  const loginWithGoogle = async (credential: string): Promise<GoogleLoginResult> => {
    const res = await api.post('/auth/google', { credential });
    // Conta sem WhatsApp verificado: o backend pede a coleta do telefone.
    if (res.data?.status === 'need_phone') {
      return { status: 'need_phone', userId: res.data.userId, name: res.data.name };
    }
    const { token: t, user: u } = res.data;
    persistToken(t);
    setToken(t);
    setUser(u);
    return { status: 'ok' };
  };

  return (
    <AuthContext.Provider value={{ user, token, login, loginWithGoogle, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
