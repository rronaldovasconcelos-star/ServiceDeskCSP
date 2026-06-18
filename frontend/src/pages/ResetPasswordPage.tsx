import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import api from '../lib/api';
import { Mail, Lock, KeyRound, ArrowRight, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';

const inputClass =
  'w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all';
const ringStyle = { '--tw-ring-color': '#2e6db4' } as React.CSSProperties;

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [done, setDone] = useState(false);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

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

  const handleSendCode = async () => {
    if (cooldown > 0) return;
    setError('');
    setInfo('');
    if (!email) {
      setError('Informe seu e-mail para receber o código.');
      return;
    }
    try {
      await api.post('/auth/request-password-reset', { email });
      setInfo('Se houver uma conta com este e-mail, enviamos um código por WhatsApp.');
      startCooldown();
    } catch (err) {
      setError(apiError(err, 'Não foi possível enviar o código.'));
    }
  };

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError('');
    setInfo('');

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
      await api.post('/auth/reset-password', { email, code, password });
      setDone(true);
    } catch (err) {
      setError(apiError(err, 'Não foi possível redefinir a senha.'));
    } finally {
      setLoading(false);
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
            <img src="/logo.png" alt="Colégio Santa Paula" className="w-24 h-24 object-contain" />
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
          {info && !done && (
            <div className="mb-5 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
              {info}
            </div>
          )}

          {!done ? (
            <>
              <h2 className="text-slate-800 text-lg font-semibold mb-1">Redefinir senha</h2>
              <p className="text-slate-400 text-sm mb-6">
                Informe seu e-mail, peça o código por WhatsApp e escolha uma nova senha.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
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
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Código de verificação</label>
                  <div className="relative">
                    <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text" inputMode="numeric" value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required maxLength={6}
                      className={inputClass + ' tracking-[0.3em]'} style={ringStyle} placeholder="000000"
                    />
                  </div>
                  <button
                    type="button" onClick={handleSendCode} disabled={cooldown > 0}
                    className="mt-1.5 text-xs font-medium hover:underline disabled:opacity-50 disabled:no-underline"
                    style={{ color: '#2e6db4' }}
                  >
                    {cooldown > 0 ? `Reenviar código em ${cooldown}s` : 'Enviar código por WhatsApp'}
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nova senha</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                      className={inputClass} style={ringStyle} placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirmar nova senha</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
                      className={inputClass} style={ringStyle} placeholder="••••••••"
                    />
                  </div>
                </div>

                <button
                  type="submit" disabled={loading || code.length < 6}
                  className="w-full text-white py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 mt-2 shadow-md hover:shadow-lg"
                  style={{ background: 'linear-gradient(90deg, #1a3a8a, #2e6db4)' }}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : (<>Redefinir senha <ArrowRight size={16} /></>)}
                </button>
              </form>

              <p className="text-center text-sm text-slate-500 mt-6">
                <Link to="/login" className="font-semibold hover:underline inline-flex items-center gap-1" style={{ color: '#2e6db4' }}>
                  <ArrowLeft size={14} /> Voltar para o login
                </Link>
              </p>
            </>
          ) : (
            <div className="text-center py-2">
              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center bg-green-50">
                  <CheckCircle2 size={30} className="text-green-500" />
                </div>
              </div>
              <h2 className="text-slate-800 text-lg font-semibold mb-2">Senha redefinida!</h2>
              <p className="text-slate-500 text-sm mb-6">
                Sua senha foi alterada com sucesso. Agora você já pode entrar com a nova senha.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full text-white py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
                style={{ background: 'linear-gradient(90deg, #1a3a8a, #2e6db4)' }}
              >
                Ir para o login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
