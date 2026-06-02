import { useState, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';
import { User, Mail, Lock, Phone, ArrowRight, ArrowLeft, Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react';

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

const inputClass =
  'w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all';
const ringStyle = { '--tw-ring-color': '#2e6db4' } as React.CSSProperties;

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

  return (
    <div
      className="relative min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0f2662 0%, #1a3a8a 50%, #2e6db4 100%)' }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-10" style={{ background: '#7fb3d3' }} />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full opacity-10" style={{ background: '#c5ddf0' }} />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-white rounded-2xl p-3 shadow-2xl mb-4">
            <img src="/logo.jpg" alt="Colégio Santa Paula" className="w-24 h-24 object-contain" />
          </div>
          <h1 className="text-white text-xl font-bold text-center">Colégio Santa Paula</h1>
          <p className="text-blue-200 text-sm mt-1">Portal de Chamados</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {error && (
            <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
              {error}
            </div>
          )}
          {info && step !== 'done' && (
            <div className="mb-5 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
              {info}
            </div>
          )}

          {/* ----------------------------- PASSO 1 ----------------------------- */}
          {step === 'form' && (
            <>
              <h2 className="text-slate-800 text-lg font-semibold mb-1">Criar conta</h2>
              <p className="text-slate-400 text-sm mb-6">Preencha seus dados para começar</p>

              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome completo</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text" value={name} onChange={(e) => setName(e.target.value)} required minLength={2}
                      className={inputClass} style={ringStyle} placeholder="Seu nome"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                      className={inputClass} style={ringStyle} placeholder="seu@email.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">WhatsApp</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <span className="absolute left-9 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">+55</span>
                    <input
                      type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} required
                      className={inputClass + ' pl-16'} style={ringStyle} placeholder="(31) 98436-7833"
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Você receberá um código de verificação neste número.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Senha</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                      className={inputClass} style={ringStyle} placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirmar senha</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
                      className={inputClass} style={ringStyle} placeholder="••••••••"
                    />
                  </div>
                </div>

                <button
                  type="submit" disabled={loading}
                  className="w-full text-white py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 mt-2 shadow-md hover:shadow-lg"
                  style={{ background: 'linear-gradient(90deg, #1a3a8a, #2e6db4)' }}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : (<>Continuar <ArrowRight size={16} /></>)}
                </button>
              </form>

              {/* Divisor + cadastro com Google */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400">ou</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              <GoogleSignInButton onCredential={handleGoogle} text="signup_with" />
            </>
          )}

          {/* --------------------- COLETA DE TELEFONE (GOOGLE) --------------------- */}
          {step === 'google-phone' && (
            <>
              <div className="flex justify-center mb-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#e8f1fb' }}>
                  <Phone size={24} style={{ color: '#2e6db4' }} />
                </div>
              </div>
              <h2 className="text-slate-800 text-lg font-semibold mb-1 text-center">Informe seu WhatsApp</h2>
              <p className="text-slate-400 text-sm mb-6 text-center">
                Precisamos do seu número para enviar as notificações dos seus chamados.
              </p>

              <form onSubmit={handleGooglePhone} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">WhatsApp</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <span className="absolute left-9 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">+55</span>
                    <input
                      type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} required autoFocus
                      className={inputClass + ' pl-16'} style={ringStyle} placeholder="(31) 98436-7833"
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Você receberá um código de verificação neste número.</p>
                </div>

                <button
                  type="submit" disabled={loading}
                  className="w-full text-white py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 shadow-md hover:shadow-lg"
                  style={{ background: 'linear-gradient(90deg, #1a3a8a, #2e6db4)' }}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : (<>Enviar código <ArrowRight size={16} /></>)}
                </button>
              </form>
            </>
          )}

          {/* ----------------------------- PASSO 2 ----------------------------- */}
          {step === 'otp' && (
            <>
              <div className="flex justify-center mb-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#e8f1fb' }}>
                  <ShieldCheck size={24} style={{ color: '#2e6db4' }} />
                </div>
              </div>
              <h2 className="text-slate-800 text-lg font-semibold mb-1 text-center">Verifique seu WhatsApp</h2>
              <p className="text-slate-400 text-sm mb-6 text-center">Digite o código de 6 dígitos que enviamos.</p>

              <form onSubmit={handleVerify} className="space-y-4">
                <input
                  type="text" inputMode="numeric" value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required maxLength={6}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] font-semibold focus:outline-none focus:ring-2 focus:border-transparent"
                  style={ringStyle} placeholder="000000" autoFocus
                />

                <button
                  type="submit" disabled={loading || code.length < 6}
                  className="w-full text-white py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 shadow-md hover:shadow-lg"
                  style={{ background: 'linear-gradient(90deg, #1a3a8a, #2e6db4)' }}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : (<>Verificar <ArrowRight size={16} /></>)}
                </button>
              </form>

              <div className="flex items-center justify-between mt-5 text-sm">
                <button onClick={() => { setStep(fromGoogle ? 'google-phone' : 'form'); setError(''); setInfo(''); }} className="text-slate-500 hover:underline flex items-center gap-1">
                  <ArrowLeft size={14} /> Voltar
                </button>
                <button
                  onClick={handleResend} disabled={cooldown > 0}
                  className="font-medium hover:underline disabled:opacity-50 disabled:no-underline"
                  style={{ color: '#2e6db4' }}
                >
                  {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar código'}
                </button>
              </div>
            </>
          )}

          {/* ----------------------------- CONCLUÍDO ----------------------------- */}
          {step === 'done' && (
            <div className="text-center py-2">
              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center bg-green-50">
                  <CheckCircle2 size={30} className="text-green-500" />
                </div>
              </div>
              <h2 className="text-slate-800 text-lg font-semibold mb-2">Cadastro enviado!</h2>
              <p className="text-slate-500 text-sm mb-6">
                Sua conta está <strong>aguardando a aprovação</strong> de um administrador.
                Você poderá entrar assim que for aprovada.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full text-white py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
                style={{ background: 'linear-gradient(90deg, #1a3a8a, #2e6db4)' }}
              >
                Voltar para o login
              </button>
            </div>
          )}

          {step === 'form' && (
            <p className="text-center text-sm text-slate-500 mt-6">
              Já tem uma conta?{' '}
              <Link to="/login" className="font-semibold hover:underline" style={{ color: '#2e6db4' }}>
                Entrar
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
