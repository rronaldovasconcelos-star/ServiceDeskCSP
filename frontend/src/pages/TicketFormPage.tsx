import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import PageHeader from '../components/PageHeader';
import { Button, Card, Field, Fieldset, Notice } from '../components/ui';

const URGENCIAS: { value: string; title: string; desc: string }[] = [
  { value: 'BAIXA', title: 'Baixa', desc: 'Pode esperar alguns dias' },
  { value: 'MEDIA', title: 'Média', desc: 'Atrapalha, mas há contorno' },
  { value: 'ALTA', title: 'Alta', desc: 'Impede o trabalho de uma pessoa ou turma' },
  { value: 'URGENTE', title: 'Urgente', desc: 'Para a escola ou envolve segurança' },
];

/** Espelha o zod do backend: title ≥ 3, description ≥ 5. */
function validarTitulo(v: string): string | undefined {
  return v.trim().length < 3 ? 'Informe um título com pelo menos 3 caracteres.' : undefined;
}
function validarDescricao(v: string): string | undefined {
  return v.trim().length < 5 ? 'Descreva um pouco mais (mínimo 5 caracteres).' : undefined;
}

export default function TicketFormPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('TI');
  const [urgency, setUrgency] = useState('BAIXA');
  const [tocado, setTocado] = useState<{ title?: boolean; description?: boolean }>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const tituloRef = useRef<HTMLInputElement>(null);
  const descricaoRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    tituloRef.current?.focus();
  }, []);

  const erros = {
    title: tocado.title ? validarTitulo(title) : undefined,
    description: tocado.description ? validarDescricao(description) : undefined,
  };

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError('');

    const errTitulo = validarTitulo(title);
    const errDescricao = validarDescricao(description);
    if (errTitulo || errDescricao) {
      setTocado({ title: true, description: true });
      if (errTitulo) tituloRef.current?.focus();
      else descricaoRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/tickets', { title, description, category, urgency });
      navigate(`/tickets/${res.data.id}`, { state: { justCreated: true } });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Erro ao abrir chamado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Abrir chamado"
        description="Conte o que está acontecendo; a equipe responsável recebe na hora."
        backTo="/tickets"
        backLabel="Chamados"
      />

      <main className="page-body" style={{ maxWidth: 760 }}>
        {error && (
          <Notice kind="danger" className="mb-4">{error}</Notice>
        )}

        <Card raised>
          <form onSubmit={handleSubmit} noValidate>
            <Fieldset legend="O que está acontecendo?">
              <Field label="Título" required hint="Resumo curto, pelo menos 3 caracteres" error={erros.title}>
                {(ctl) => (
                  <input
                    {...ctl}
                    ref={tituloRef}
                    className="field"
                    value={title}
                    maxLength={120}
                    placeholder="Ex.: Projetor da sala 12 não liga"
                    data-autofocus
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => setTocado((t) => ({ ...t, title: true }))}
                  />
                )}
              </Field>

              <Field
                label="Descrição"
                required
                hint="Onde acontece, desde quando e o que já tentou (mínimo 5 caracteres)"
                error={erros.description}
              >
                {(ctl) => (
                  <textarea
                    {...ctl}
                    ref={descricaoRef}
                    className="field"
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={() => setTocado((t) => ({ ...t, description: true }))}
                  />
                )}
              </Field>
            </Fieldset>

            <Fieldset legend="Classificação">
              <Field label="Categoria">
                {(ctl) => (
                  <select {...ctl} className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="TI">TI</option>
                    <option value="MANUTENCAO">Manutenção</option>
                    <option value="PEDAGOGICO">Pedagógico</option>
                    <option value="ADMINISTRATIVO">Administrativo</option>
                    <option value="OUTROS">Outros</option>
                  </select>
                )}
              </Field>

              <fieldset className="form-group">
                <legend>Urgência</legend>
                <div className="choice-grid">
                  {URGENCIAS.map((u) => (
                    <label key={u.value} className="choice">
                      <input
                        type="radio"
                        name="urgency"
                        value={u.value}
                        checked={urgency === u.value}
                        onChange={() => setUrgency(u.value)}
                      />
                      <span>
                        <span className="choice-title">{u.title}</span>
                        <span className="choice-desc block">{u.desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </Fieldset>

            <div className="form-actions">
              <Button type="submit" loading={loading}>Abrir chamado</Button>
              <Button variant="secondary" onClick={() => navigate('/tickets')}>Cancelar</Button>
            </div>
          </form>
        </Card>
      </main>
    </>
  );
}
