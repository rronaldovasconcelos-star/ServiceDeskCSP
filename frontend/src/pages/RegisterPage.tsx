import { useState, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';
import AuthShell, { AuthAlert, AuthField, authInputClass } from '../components/AuthShell';
import { Button, IconTile } from '../components/ui';
import { User, Mail, Lock, Phone, ArrowLeft, Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react';

type Step = 'form' | 'google-phone' | 'otp' | 'done';

/** Estado opcional recebido da LoginPage quando o Google exige coleta de telefone. */
interface GooglePhoneState {
  googlePhone?: { userId: string; name?: string };
}

/** Formata os dígitos do telefone (sem DDI) como (DD) 9XXXX-XXXX. */
function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const linkStyle = { color: 'var(--electric)', fontWeight: 500, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 } as const;

export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginWithGoogle } = useAuth();

  // Vindo da LoginPage via Google (conta sem telefone): inicia na coleta do WhatsApp.
  const googleState = (location.state as GooglePhoneState | null)?.googlePhone;

  const [step, setStep] = useState<Step>(googleState ? 'google-phone' : 'form');
  // Distingue o fluxo Google (volta para 'google-phone') do cadastro normal (volta para 'form').
  const [fromGoogle, setFromGoogle] = useState(Boolean(googleState));

  // Passo 1
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  // Passo 2
  const [userId, setUserId] = useState(googleState?.userId ?? '');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const phoneDigits = phone.replace(/\D/g, '');

  const apiError = (err: unknown, fallback: string) =>
    (axios.isAxiosError(err) ? err.response?.data?.error : undefined) ?? fallback;

  const startCooldown = () => {
    setCooldown(60);
    const id = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(id); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const handleRegister = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      setError('Informe um telefone válido com DDD (ex: (31) 98436-7833).');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }
    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      // Envia com DDI 55 + dígitos; o backend normaliza/valida.
      const res = await api.post('/auth/register', {
        name,
        email,
        phone: '+55' + phoneDigits,
        password,
      });
      setUserId(res.data.userId);
      setStep('otp');
      setInfo('Enviamos um código de 6 dígitos para o seu WhatsApp.');
      startCooldown();
    } catch (err) {
      setError(apiError(err, 'Não foi possível concluir o cadastro.'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await api.post('/auth/verify-otp', { userId, code });
      setStep('done');
    } catch (err) {
      setError(apiError(err, 'Código inválido.'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = useCallback(async (credential: string) => {
    setError('');
    setInfo('');
    try {
      const result = await loginWithGoogle(credential);
      if (result.status === 'need_phone') {
        // Conta sem WhatsApp verificado → coleta o telefone antes de prosseguir.
        setUserId(result.userId);
        setFromGoogle(true);
        setStep('google-phone');
        return;
      }
      navigate('/'); // conta já ativa → entra direto
    } catch (err) {
      // 403 = conta aguardando aprovação → mostra tela de conclusão.
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setStep('done');
        return;
      }
      setError(apiError(err, 'Não foi possível entrar com o Google.'));
    }
  }, [loginWithGoogle, navigate]);

  const handleGooglePhone = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      setError('Informe um telefone válido com DDD (ex: (31) 98436-7833).');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/google/phone', { userId, phone: '+55' + phoneDigits });
      setStep('otp');
      setInfo('Enviamos um código de 6 dígitos para o seu WhatsApp.');
      startCooldown();
    } catch (err) {
      setError(apiError(err, 'Não foi possível enviar o código.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError('');
    setInfo('');
    try {
      await api.post('/auth/resend-otp', { userId });
      setInfo('Novo código enviado por WhatsApp.');
      startCooldown();
    } catch (err) {
      setError(apiError(err, 'Não foi possível reenviar o código.'));
    }
  };

  const campoTelefone = (autoFocus?: boolean) => (
    <AuthField label="WhatsApp" icon={<Phone size={16} />} hint="Você receberá um código de verificação neste número.">
      <span className="absolute left-9 top-1/2 -translate-y-1/2 pointer-events-none" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>+55</span>
      <input
        type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} required autoFocus={autoFocus}
        className="field with-prefix" placeholder="(31) 98436-7833" autoComplete="tel-national"
      />
    </AuthField>
  );

  const botaoEnviar = (texto: string, desabilitado = false) => (
    <Button type="submit" disabled={loading || desabilitado} className="w-full" style={{ marginTop: 6, padding: '11px 18px' }}>
      {loading ? <Loader2 size={16} className="animate-spin" /> : texto}
    </Button>
  );

  return (
    <AuthShell>
      {error && <AuthAlert kind="error">{error}</AuthAlert>}
      {info && step !== 'done' && <AuthAlert kind="info">{info}</AuthAlert>}

      {/* ----------------------------- PASSO 1 ----------------------------- */}
      {step === 'form' && (
        <>
          <h2 style={{ fontSize: 22, margin: 0 }}>Criar conta</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '4px 0 22px' }}>Preencha seus dados. Um administrador aprova o acesso.</p>

          <form onSubmit={handleRegister} className="space-y-4">
            <AuthField label="Nome completo" icon={<User size={16} />}>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} className={authInputClass} placeholder="Seu nome" autoComplete="name" />
            </AuthField>
            <AuthField label="Email" icon={<Mail size={16} />}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={authInputClass} placeholder="seu@email.com" autoComplete="email" />
            </AuthField>
            {campoTelefone()}
            <AuthField label="Senha" icon={<Lock size={16} />}>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className={authInputClass} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
            </AuthField>
            <AuthField label="Confirmar senha" icon={<Lock size={16} />}>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className={authInputClass} placeholder="••••••••" autoComplete="new-password" />
            </AuthField>
            {botaoEnviar('Continuar')}
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1" style={{ height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>ou</span>
            <div className="flex-1" style={{ height: 1, background: 'var(--border)' }} />
          </div>
          <GoogleSignInButton onCredential={handleGoogle} text="signup_with" />
        </>
      )}

      {/* --------------------- COLETA DE TELEFONE (GOOGLE) --------------------- */}
      {step === 'google-phone' && (
        <>
          <div className="flex justify-center mb-3"><IconTile size={52}><Phone size={24} /></IconTile></div>
          <h2 className="text-center" style={{ fontSize: 22, margin: 0 }}>Informe seu WhatsApp</h2>
          <p className="text-center" style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '4px 0 22px' }}>
            Precisamos do seu número para enviar as notificações dos seus chamados.
          </p>
          <form onSubmit={handleGooglePhone} className="space-y-4">
            {campoTelefone(true)}
            {botaoEnviar('Enviar código')}
          </form>
        </>
      )}

      {/* ----------------------------- PASSO 2 ----------------------------- */}
      {step === 'otp' && (
        <>
          <div className="flex justify-center mb-3"><IconTile size={52}><ShieldCheck size={24} /></IconTile></div>
          <h2 className="text-center" style={{ fontSize: 22, margin: 0 }}>Verifique seu WhatsApp</h2>
          <p className="text-center" style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '4px 0 22px' }}>Digite o código de 6 dígitos que enviamos.</p>

          <form onSubmit={handleVerify} className="space-y-4">
            <input
              type="text" inputMode="numeric" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required maxLength={6}
              className="field text-center tracking-[0.5em]"
              style={{ fontSize: 24, fontWeight: 600, padding: '12px 16px' }}
              placeholder="000000" autoFocus
            />
            {botaoEnviar('Verificar', code.length < 6)}
          </form>

          <div className="flex items-center justify-between mt-5">
            <button type="button" onClick={() => { setStep(fromGoogle ? 'google-phone' : 'form'); setError(''); setInfo(''); }} className="inline-flex items-center gap-1" style={{ ...linkStyle, color: 'var(--text-secondary)' }}>
              <ArrowLeft size={14} /> Voltar
            </button>
            <button type="button" onClick={handleResend} disabled={cooldown > 0} style={{ ...linkStyle, opacity: cooldown > 0 ? 0.6 : 1, cursor: cooldown > 0 ? 'default' : 'pointer' }}>
              {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar código'}
            </button>
          </div>
        </>
      )}

      {/* ----------------------------- CONCLUÍDO ----------------------------- */}
      {step === 'done' && (
        <div className="text-center py-2">
          <div className="flex justify-center mb-4"><IconTile tone="teal" size={56}><CheckCircle2 size={28} /></IconTile></div>
          <h2 style={{ fontSize: 22, margin: '0 0 8px' }}>Cadastro enviado</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 22px' }}>
            Sua conta está <strong>aguardando a aprovação</strong> de um administrador. Você poderá entrar assim que for aprovada.
          </p>
          <Button onClick={() => navigate('/login')} className="w-full" style={{ padding: '11px 18px' }}>Voltar para o login</Button>
        </div>
      )}

      {step === 'form' && (
        <p className="text-center" style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '22px 0 0' }}>
          Já tem uma conta?{' '}
          <Link to="/login" style={{ color: 'var(--electric)', fontWeight: 600 }}>Entrar</Link>
        </p>
      )}
    </AuthShell>
  );
}
