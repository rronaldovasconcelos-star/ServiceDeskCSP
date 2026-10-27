import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';
import AuthShell, { AuthAlert, AuthField, authInputClass } from '../components/AuthShell';
import { Button } from '../components/ui';
import { Mail, Lock, Loader2 } from 'lucide-react';

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
    <AuthShell>
      <h2 style={{ fontSize: 22, margin: 0 }}>Entrar</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '4px 0 22px' }}>Use o e-mail e a senha do portal.</p>

      {error && <AuthAlert kind="error">{error}</AuthAlert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField label="Email" icon={<Mail size={16} />}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={authInputClass}
            placeholder="seu@email.com"
            autoComplete="email"
          />
        </AuthField>

        <AuthField label="Senha" icon={<Lock size={16} />}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={authInputClass}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </AuthField>

        <Button type="submit" disabled={loading} className="w-full" style={{ marginTop: 6, padding: '11px 18px' }}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : 'Entrar'}
        </Button>
      </form>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1" style={{ height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>ou</span>
        <div className="flex-1" style={{ height: 1, background: 'var(--border)' }} />
      </div>
      <GoogleSignInButton onCredential={handleGoogle} text="continue_with" />

      <p className="text-center" style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '20px 0 0' }}>
        <Link to="/redefinir-senha" style={{ color: 'var(--electric)', fontWeight: 500 }}>Esqueci minha senha</Link>
      </p>
      <p className="text-center" style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0 0' }}>
        Ainda não tem conta?{' '}
        <Link to="/register" style={{ color: 'var(--electric)', fontWeight: 600 }}>Criar conta</Link>
      </p>
    </AuthShell>
  );
}
