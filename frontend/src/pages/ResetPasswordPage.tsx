import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import api from '../lib/api';
import AuthShell, { AuthAlert, AuthField, AuthHeading, authInputClass } from '../components/AuthShell';
import { Button, IconTile } from '../components/ui';
import { Mail, Lock, KeyRound, MessageCircle, CheckCircle2 } from 'lucide-react';

// Espelha o backend (auth.controller.ts: resetPasswordSchema password.min(6); OTP_LENGTH = 6).
const SENHA_MIN = 6;
const CODIGO_TAM = 6;

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
  const [sending, setSending] = useState(false);

  // Erros de validação local, por campo (a API continua no aviso do topo).
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const apiError = (err: unknown, fallback: string) =>
    (axios.isAxiosError(err) ? err.response?.data?.error : undefined) ?? fallback;

  const limparErros = () => {
    setError('');
    setInfo('');
    setEmailError('');
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

  const handleSendCode = async () => {
    if (cooldown > 0) return;
    limparErros();
    if (!email) {
      setEmailError('Informe seu e-mail para receber o código.');
      return;
    }
    setSending(true);
    try {
      await api.post('/auth/request-password-reset', { email });
      setInfo('Se houver uma conta com este e-mail, enviamos um código por WhatsApp.');
      startCooldown();
    } catch (err) {
      setError(apiError(err, 'Não foi possível enviar o código.'));
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    limparErros();

    let invalido = false;
    if (password.length < SENHA_MIN) {
      setPasswordError(`A senha deve ter no mínimo ${SENHA_MIN} caracteres.`);
      invalido = true;
    }
    if (password !== confirm) {
      setConfirmError('As senhas não conferem.');
      invalido = true;
    }
    if (invalido) return;

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
      {!done ? (
        <>
          <AuthHeading title="Redefinir senha" subtitle="Enviamos um código pelo WhatsApp cadastrado" />

          {error && <AuthAlert kind="error">{error}</AuthAlert>}
          {info && <AuthAlert kind="info">{info}</AuthAlert>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm-2">
              Passo 1: informe o e-mail da sua conta e peça o código. Ele chega no WhatsApp cadastrado.
            </p>

            <AuthField label="E-mail" icon={<Mail size={16} />} error={emailError || undefined}>
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

            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<MessageCircle size={14} />}
                onClick={handleSendCode}
                disabled={cooldown > 0}
                loading={sending}
              >
                {cooldown > 0 ? `Reenviar código em ${cooldown}s` : 'Enviar código por WhatsApp'}
              </Button>
            </div>

            <p className="text-sm-2">
              Passo 2: digite o código de {CODIGO_TAM} dígitos recebido e escolha a nova senha.
            </p>

            <AuthField label="Código de verificação" icon={<KeyRound size={16} />} hint={`${CODIGO_TAM} dígitos`}>
              {(ctl) => (
                <input
                  {...ctl}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODIGO_TAM))}
                  required
                  maxLength={CODIGO_TAM}
                  className={authInputClass + ' tracking-[0.3em]'}
                  placeholder="000000"
                />
              )}
            </AuthField>

            <AuthField label="Nova senha" icon={<Lock size={16} />} hint={`${SENHA_MIN} caracteres ou mais`} error={passwordError || undefined}>
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

            <AuthField label="Confirmar nova senha" icon={<Lock size={16} />} error={confirmError || undefined}>
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

            <Button type="submit" loading={loading} disabled={code.length < CODIGO_TAM} className="w-full mt-2">
              Redefinir senha
            </Button>
          </form>

          <div className="auth-links">
            <Link to="/login">Voltar ao login</Link>
          </div>
        </>
      ) : (
        <div className="text-center py-2">
          <div className="flex justify-center mb-4">
            <IconTile tone="teal" size={56}><CheckCircle2 size={28} /></IconTile>
          </div>
          <h1 className="auth-card-title mb-2">Senha redefinida</h1>
          <p className="text-sm-2 mb-5">
            Sua senha foi alterada. Entre com a nova senha.
          </p>
          <Button onClick={() => navigate('/login')} className="w-full">Ir para o login</Button>
        </div>
      )}
    </AuthShell>
  );
}
