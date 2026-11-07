import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import { Button, Card, Field, Notice } from '../components/ui';
import { mensagemDeErro } from '../lib/beneficios';

// Espelha o backend (auth.controller.ts: changePasswordSchema novaSenha.min(6)).
const SENHA_MIN = 6;

/** Troca da própria senha. Quem entra só pelo Google não tem senha para trocar. */
export default function AlterarSenhaPage() {
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState('');
  const [erroConfirmacao, setErroConfirmacao] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [salvando, setSalvando] = useState(false);

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setErro('');
    setErroConfirmacao('');
    setSucesso('');
    if (novaSenha !== confirmacao) {
      setErroConfirmacao('As senhas não conferem.');
      return;
    }
    setSalvando(true);
    try {
      const r = await api.post<{ message: string }>('/auth/change-password', { senhaAtual, novaSenha });
      setSucesso(r.data.message);
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmacao('');
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível alterar a senha.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <PageHeader title="Alterar senha" description="Troque a senha que você usa para entrar no portal." />

      <main className="page-body stack">
        <div className="max-w-[520px]">
          <Card title="Nova senha">
            <form onSubmit={handleSubmit} className="stack">
              {erro && <Notice kind="danger">{erro}</Notice>}
              {sucesso && <Notice kind="success" onClose={() => setSucesso('')}>{sucesso}</Notice>}

              <Field label="Senha atual" required hint="Se você recebeu uma senha provisória do administrador, é ela.">
                {(ctl) => (
                  <input {...ctl} type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} required autoComplete="current-password" className="field" />
                )}
              </Field>
              <Field label="Nova senha" required hint={`${SENHA_MIN} caracteres ou mais.`}>
                {(ctl) => (
                  <input {...ctl} type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} required minLength={SENHA_MIN} autoComplete="new-password" className="field" />
                )}
              </Field>
              <Field label="Confirmar nova senha" required error={erroConfirmacao || undefined}>
                {(ctl) => (
                  <input {...ctl} type="password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} required minLength={SENHA_MIN} autoComplete="new-password" className="field" />
                )}
              </Field>

              <div className="form-actions">
                <Button type="submit" variant="primary" icon={<KeyRound size={16} />} loading={salvando}>
                  {salvando ? 'Salvando...' : 'Alterar senha'}
                </Button>
              </div>
            </form>
          </Card>

          <p className="muted text-sm-2 mt-3">
            Entra com a conta Google? Então não há senha do portal para trocar: continue usando o botão do Google.
          </p>
        </div>
      </main>
    </>
  );
}
