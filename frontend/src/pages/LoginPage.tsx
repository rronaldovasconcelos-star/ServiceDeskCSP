import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';
import DevCredit from '../components/DevCredit';
import { Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogle = useCallback(async (credential: string) => {
    setError('');
    try {
      const result = await loginWithGoogle(credential);
      if (result.status === 'need_phone') {
        // Conta sem WhatsApp verificado → coleta o telefone na tela de cadastro.
        navigate('/register', { state: { googlePhone: { userId: result.userId, name: result.name } } });
        return;
      }
      navigate('/');
    } catch (err) {
      const apiError = axios.isAxiosError(err) ? err.response?.data?.error : undefined;
      setError(apiError ?? 'Não foi possível entrar com o Google.');
    }
  }, [loginWithGoogle, navigate]);

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      const apiError = axios.isAxiosError(err) ? err.response?.data?.error : undefined;
      setError(apiError ?? 'Email ou senha inválidos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0f2662 0%, #1a3a8a 50%, #2e6db4 100%)' }}
    >
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-10"
          style={{ background: '#7fb3d3' }}
        />
        <div
          className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full opacity-10"
          style={{ background: '#c5ddf0' }}
        />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo card */}
        <div className="flex flex-col items-center mb-6">
          <div className="bg-white rounded-2xl p-3 shadow-2xl mb-4">
            <img
              src="/logo.jpg"
              alt="Colégio Santa Paula"
              className="w-24 h-24 object-contain"
            />
          </div>
          <h1 className="text-white text-xl font-bold text-center">Colégio Santa Paula</h1>
          <p className="text-blue-200 text-sm mt-1">Portal de Chamados</p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-slate-800 text-lg font-semibold mb-1">Bem-vindo(a)</h2>
          <p className="text-slate-400 text-sm mb-6">Faça login para continuar</p>

          {error && (
            <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                  style={{ '--tw-ring-color': '#2e6db4' } as React.CSSProperties}
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Senha</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                  style={{ '--tw-ring-color': '#2e6db4' } as React.CSSProperties}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 mt-2 shadow-md hover:shadow-lg"
              style={{ background: 'linear-gradient(90deg, #1a3a8a, #2e6db4)' }}
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  Entrar
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Divisor + login com Google */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400">ou</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
          <GoogleSignInButton onCredential={handleGoogle} text="continue_with" />

          <p className="text-center text-sm text-slate-500 mt-5">
            <Link to="/redefinir-senha" className="font-medium hover:underline" style={{ color: '#2e6db4' }}>
              Esqueci minha senha
            </Link>
          </p>

          <p className="text-center text-sm text-slate-500 mt-2">
            Não tem uma conta?{' '}
            <Link to="/register" className="font-semibold hover:underline" style={{ color: '#2e6db4' }}>
              Criar conta
            </Link>
          </p>
        </div>

        {/* Crédito do desenvolvedor */}
        <div className="text-center mt-5">
          <DevCredit variant="onDark" />
        </div>
      </div>
    </div>
  );
}
