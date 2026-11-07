import { Link } from 'react-router-dom';
import AuthShell, { AuthHeading } from '../components/AuthShell';
import { IconTile } from '../components/ui';
import { KeyRound } from 'lucide-react';

/**
 * "Esqueci minha senha". Decisão de 06/11/2026: enquanto o portal não envia
 * WhatsApp, não há código por celular — quem redefine é o administrador, que gera
 * uma senha provisória em Usuários e repassa à pessoa.
 */
export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <AuthHeading title="Esqueci minha senha" subtitle="A redefinição é feita pelo administrador do portal" />

      <div className="flex justify-center mb-4"><IconTile size={52}><KeyRound size={24} /></IconTile></div>
      <p className="text-sm-2 text-center mb-3">
        Procure o <strong>administrador do portal</strong> (TI do colégio). Ele gera uma senha
        provisória para você entrar.
      </p>
      <p className="text-sm-2 text-center mb-5">
        Se você entra com a conta Google, não há senha para redefinir: use o botão
        "Continuar com o Google" na tela de entrada.
      </p>

      <div className="auth-links">
        <Link to="/login">Voltar para o login</Link>
      </div>
    </AuthShell>
  );
}
