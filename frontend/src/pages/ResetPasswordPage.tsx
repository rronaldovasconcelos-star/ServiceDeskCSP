import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import api from '../lib/api';
import AuthShell, { AuthAlert, AuthField, authInputClass } from '../components/AuthShell';
import { Button, IconTile } from '../components/ui';
import { Mail, Lock, KeyRound, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';

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
    <AuthShell>
      {error && <AuthAlert kind="error">{error}</AuthAlert>}
      {info && !done && <AuthAlert kind="info">{info}</AuthAlert>}

      {!done ? (
        <>
          <h2 style={{ fontSize: 22, margin: 0 }}>Redefinir senha</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '4px 0 22px' }}>
            Informe seu e-mail, peça o código por WhatsApp e escolha uma nova senha.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <AuthField label="Email" icon={<Mail size={16} />}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={authInputClass} placeholder="seu@email.com" autoComplete="email" />
            </AuthField>

            <AuthField
              label="Código de verificação"
              icon={<KeyRound size={16} />}
              hint={(
                <button
                  type="button" onClick={handleSendCode} disabled={cooldown > 0}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: cooldown > 0 ? 'default' : 'pointer', color: 'var(--electric)', fontWeight: 500, fontSize: 12, fontFamily: 'inherit', opacity: cooldown > 0 ? 0.6 : 1 }}
                >
                  {cooldown > 0 ? `Reenviar código em ${cooldown}s` : 'Enviar código por WhatsApp'}
                </button>
              )}
            >
              <input
                type="text" inputMode="numeric" value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required maxLength={6}
                className={authInputClass + ' tracking-[0.3em]'} placeholder="000000"
              />
            </AuthField>

            <AuthField label="Nova senha" icon={<Lock size={16} />}>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className={authInputClass} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
            </AuthField>

            <AuthField label="Confirmar nova senha" icon={<Lock size={16} />}>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className={authInputClass} placeholder="••••••••" autoComplete="new-password" />
            </AuthField>

            <Button type="submit" disabled={loading || code.length < 6} className="w-full" style={{ marginTop: 6, padding: '11px 18px' }}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : 'Redefinir senha'}
            </Button>
          </form>

          <p className="text-center" style={{ fontSize: 13, margin: '22px 0 0' }}>
            <Link to="/login" className="inline-flex items-center gap-1" style={{ color: 'var(--electric)', fontWeight: 500 }}>
              <ArrowLeft size={14} /> Voltar para o login
            </Link>
          </p>
        </>
      ) : (
        <div className="text-center py-2">
          <div className="flex justify-center mb-4">
            <IconTile tone="teal" size={56}><CheckCircle2 size={28} /></IconTile>
          </div>
          <h2 style={{ fontSize: 22, margin: '0 0 8px' }}>Senha redefinida</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 22px' }}>
            Sua senha foi alterada. Entre com a nova senha.
          </p>
          <Button onClick={() => navigate('/login')} className="w-full" style={{ padding: '11px 18px' }}>Ir para o login</Button>
        </div>
      )}
    </AuthShell>
  );
}
