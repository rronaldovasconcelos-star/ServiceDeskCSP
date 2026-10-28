import { useState, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';
import AuthShell, { AuthAlert, AuthField, AuthHeading, authInputClass } from '../components/AuthShell';
import { Button, IconTile } from '../components/ui';
import { User, Mail, Lock, Phone, ArrowLeft, ShieldCheck, CheckCircle2 } from 'lucide-react';

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

// Espelha o backend (auth.controller.ts: registerSchema password.min(6); lib/phone.ts: DDD + 8 ou 9 dígitos).
const SENHA_MIN = 6;
const MSG_TELEFONE = 'Informe um telefone válido com DDD (ex: (31) 98436-7833).';
const MSG_SENHA_MIN = `A senha deve ter no mínimo ${SENHA_MIN} caracteres.`;
const MSG_SENHAS_DIFERENTES = 'As senhas não conferem.';

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

  // Erros de validação local, por campo (a API continua no aviso do topo).
  const [phoneError, setPhoneError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const phoneDigits = phone.replace(/\D/g, '');

  const apiError = (err: unknown, fallback: string) =>
    (axios.isAxiosError(err) ? err.response?.data?.error : undefined) ?? fallback;

  const limparErros = () => {
    setError('');
    setInfo('');
    setPhoneError('');
    setPasswordError('');
    setConfirmError('');
  };

  const startCooldown = () => {
    setCooldown(60);
    const id = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(id); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const telefoneValido = () => phoneDigits.length >= 10 && phoneDigits.length <= 11;

  const handleRegister = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    limparErros();

    let invalido = false;
    if (!telefoneValido()) {
      setPhoneError(MSG_TELEFONE);
      invalido = true;
    }
    if (password.length < SENHA_MIN) {
      setPasswordError(MSG_SENHA_MIN);
      invalido = true;
    }
    if (password !== confirm) {
      setConfirmError(MSG_SENHAS_DIFERENTES);
      invalido = true;
    }
    if (invalido) return;

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
    limparErros();
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
    limparErros();

    if (!telefoneValido()) {
      setPhoneError(MSG_TELEFONE);
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

  const voltarDoOtp = () => {
    setStep(fromGoogle ? 'google-phone' : 'form');
    limparErros();
  };

  const campoTelefone = (autoFocus?: boolean) => (
    <AuthField
      label="WhatsApp"
      icon={<Phone size={16} />}
      hint="Com DDD, ex.: (31) 98436-7833. Você receberá um código de verificação neste número."
      error={phoneError || undefined}
    >
      {(ctl) => (
        <>
          <span className="absolute left-9 top-1/2 -translate-y-1/2 pointer-events-none text-sm-2" aria-hidden="true">+55</span>
          <input
            {...ctl}
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            required
            autoFocus={autoFocus}
            className="field with-prefix"
            placeholder="(31) 98436-7833"
            autoComplete="tel-national"
          />
        </>
      )}
    </AuthField>
  );

  const botaoEnviar = (texto: string, desabilitado = false) => (
    <Button type="submit" loading={loading} disabled={desabilitado} className="w-full mt-2">
      {texto}
    </Button>
  );

  return (
    <AuthShell>
      {/* ----------------------------- PASSO 1 ----------------------------- */}
      {step === 'form' && (
        <>
          <AuthHeading title="Criar conta" subtitle="Seu acesso é liberado por um administrador depois do cadastro" />

          {error && <AuthAlert kind="error">{error}</AuthAlert>}
          {info && <AuthAlert kind="info">{info}</AuthAlert>}

          <form onSubmit={handleRegister} className="space-y-4">
            <AuthField label="Nome completo" icon={<User size={16} />}>
              {(ctl) => (
                <input
                  {...ctl}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  className={authInputClass}
                  placeholder="Seu nome"
                  autoComplete="name"
                />
              )}
            </AuthField>
            <AuthField label="E-mail" icon={<Mail size={16} />}>
              {(ctl) => (
                <input
                  {...ctl}
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={authInputClass}
                  placeholder="seu@email.com"
                  autoComplete="email"
                />
              )}
            </AuthField>
            {campoTelefone()}
            <AuthField label="Senha" icon={<Lock size={16} />} hint={`${SENHA_MIN} caracteres ou mais`} error={passwordError || undefined}>
              {(ctl) => (
                <input
                  {...ctl}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={SENHA_MIN}
                  className={authInputClass}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              )}
            </AuthField>
            <AuthField label="Confirmar senha" icon={<Lock size={16} />} error={confirmError || undefined}>
              {(ctl) => (
                <input
                  {...ctl}
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className={authInputClass}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              )}
            </AuthField>
            {botaoEnviar('Continuar')}
          </form>

          <div className="auth-divider">ou</div>
          <GoogleSignInButton onCredential={handleGoogle} text="signup_with" />

          <div className="auth-links">
            <span>
              Já tem uma conta?{' '}
              <Link to="/login">Entrar</Link>
            </span>
          </div>
        </>
      )}

      {/* --------------------- COLETA DE TELEFONE (GOOGLE) --------------------- */}
      {step === 'google-phone' && (
        <>
          <AuthHeading title="Informe seu WhatsApp" subtitle="Precisamos do seu número para enviar as notificações dos seus chamados" />

          {error && <AuthAlert kind="error">{error}</AuthAlert>}
          {info && <AuthAlert kind="info">{info}</AuthAlert>}

          <form onSubmit={handleGooglePhone} className="space-y-4">
            {campoTelefone(true)}
            {botaoEnviar('Enviar código')}
          </form>

          <div className="auth-links">
            <Link to="/login">Voltar ao login</Link>
          </div>
        </>
      )}

      {/* ----------------------------- PASSO 2 ----------------------------- */}
      {step === 'otp' && (
        <>
          <AuthHeading title="Verifique seu WhatsApp" subtitle="Enviamos um código pelo WhatsApp cadastrado" />

          {error && <AuthAlert kind="error">{error}</AuthAlert>}
          {info && <AuthAlert kind="info">{info}</AuthAlert>}

          <div className="flex justify-center mb-4"><IconTile size={52}><ShieldCheck size={24} /></IconTile></div>
          <p className="text-sm-2 text-center mb-4">
            Passo 2 de 2: digite o código de 6 dígitos que chegou no seu WhatsApp para confirmar o número.
          </p>

          <form onSubmit={handleVerify} className="space-y-4">
            <AuthField label="Código de verificação" hint="6 dígitos">
              {(ctl) => (
                <input
                  {...ctl}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  maxLength={6}
                  className="field text-center text-2xl font-semibold tracking-[0.5em]"
                  placeholder="000000"
                  autoFocus
                />
              )}
            </AuthField>
            {botaoEnviar('Verificar', code.length < 6)}
          </form>

          <div className="flex items-center justify-between gap-2 mt-4">
            <Button type="button" variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={voltarDoOtp}>
              Voltar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleResend} disabled={cooldown > 0}>
              {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar código'}
            </Button>
          </div>
        </>
      )}

      {/* ----------------------------- CONCLUÍDO ----------------------------- */}
      {step === 'done' && (
        <div className="text-center py-2">
          <div className="flex justify-center mb-4"><IconTile tone="teal" size={56}><CheckCircle2 size={28} /></IconTile></div>
          <h1 className="auth-card-title mb-2">Cadastro enviado</h1>
          <p className="text-sm-2 mb-5">
            Sua conta está <strong>aguardando a aprovação</strong> de um administrador. Você poderá entrar assim que for aprovada.
          </p>
          <Button onClick={() => navigate('/login')} className="w-full">Voltar para o login</Button>
        </div>
      )}
    </AuthShell>
  );
}
