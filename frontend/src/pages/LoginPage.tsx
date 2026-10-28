import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';
import AuthShell, { AuthAlert, AuthField, AuthHeading, authInputClass } from '../components/AuthShell';
import { Button } from '../components/ui';
import { Mail, Lock } from 'lucide-react';

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
      <AuthHeading title="Entrar" subtitle="Use o e-mail e a senha do portal" />

      {error && <AuthAlert kind="error">{error}</AuthAlert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField label="E-mail" icon={<Mail size={16} />}>
          {(ctl) => (
            <input
              {...ctl}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={authInputClass}
              placeholder="seu@email.com"
              autoComplete="email"
              inputMode="email"
            />
          )}
        </AuthField>

        <AuthField label="Senha" icon={<Lock size={16} />}>
          {(ctl) => (
            <input
              {...ctl}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={authInputClass}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          )}
        </AuthField>

        <Button type="submit" loading={loading} className="w-full mt-2">
          Entrar
        </Button>
      </form>

      <div className="auth-divider">ou</div>
      <GoogleSignInButton onCredential={handleGoogle} text="continue_with" />

      <div className="auth-links">
        <Link to="/redefinir-senha">Esqueci minha senha</Link>
        <span>
          Ainda não tem conta?{' '}
          <Link to="/register">Criar conta</Link>
        </span>
      </div>
    </AuthShell>
  );
}
