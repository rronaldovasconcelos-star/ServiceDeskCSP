import { useEffect, useState } from 'react';
import { ExternalLink, Eye, EyeOff, HeartHandshake, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import { Button, EmptyState, Field, IconTile, Modal, Notice } from '../components/ui';
import {
  listarBeneficios, criarBeneficio, editarBeneficio, definirAtivo, excluirBeneficio, fetchLogoUrl,
  mensagemDeErro, LOGO_ACCEPT, LOGO_MAX_MB, type Beneficio, type BeneficioForm,
} from '../lib/beneficios';

const formVazio: BeneficioForm = { nome: '', descricao: '', link: '', ordem: '0', logo: null, removerLogo: false };

/** Logo do parceiro (rota autenticada → blob). Sem logo, ou se falhar, mostra o ícone padrão. */
function LogoParceiro({ beneficio }: { beneficio: Beneficio }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!beneficio.temLogo) return;
    let vivo = true;
    let criada: string | null = null;
    fetchLogoUrl(beneficio.id, beneficio.updatedAt)
      .then((u) => { criada = u; if (vivo) setUrl(u); else URL.revokeObjectURL(u); })
      .catch(() => { /* fica no ícone padrão */ });
    return () => {
      vivo = false;
      if (criada) URL.revokeObjectURL(criada);
      setUrl(null);
    };
  }, [beneficio.id, beneficio.temLogo, beneficio.updatedAt]);

  // Faixa de altura fixa no topo do card, com o logo grande e centralizado; sem logo,
  // o ícone padrão ocupa o mesmo lugar para os cards ficarem alinhados.
  if (!beneficio.temLogo || !url) {
    return (
      <div className="flex h-[140px] w-full items-center justify-center rounded-lg bg-white">
        <IconTile size={64}><HeartHandshake size={30} /></IconTile>
      </div>
    );
  }
  return (
    <div className="flex h-[140px] w-full items-center justify-center rounded-lg bg-white p-3">
      <img src={url} alt={`Logo de ${beneficio.nome}`} className="max-h-full max-w-full object-contain" />
    </div>
  );
}

export default function BeneficiosPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [itens, setItens] = useState<Beneficio[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pageError, setPageError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<Beneficio | null>(null);
  const [form, setForm] = useState<BeneficioForm>(formVazio);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const buscar = () => listarBeneficios()
    .then((r) => { setItens(r); setLoadError(false); })
    .catch(() => setLoadError(true))
    .finally(() => setLoading(false));
  const load = () => { setLoading(true); void buscar(); };

  // A primeira carga já nasce com `loading` ligado: o efeito só busca.
  useEffect(() => { void buscar(); }, []);

  const openNew = () => { setEditando(null); setForm(formVazio); setFormError(''); setShowForm(true); };
  const openEdit = (b: Beneficio) => {
    setEditando(b);
    setForm({ nome: b.nome, descricao: b.descricao, link: b.link ?? '', ordem: String(b.ordem), logo: null, removerLogo: false });
    setFormError('');
    setShowForm(true);
  };
  const closeModal = () => setShowForm(false);

  const escolherLogo = (file: File | null) => {
    if (file && file.size > LOGO_MAX_MB * 1024 * 1024) {
      setFormError(`O logo tem mais de ${LOGO_MAX_MB} MB. Escolha uma imagem menor.`);
      setForm((f) => ({ ...f, logo: null }));
      return;
    }
    setFormError('');
    setForm((f) => ({ ...f, logo: file, removerLogo: false }));
  };

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      if (editando) await editarBeneficio(editando.id, form);
      else await criarBeneficio(form);
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(mensagemDeErro(err, 'Não foi possível salvar o benefício.'));
    } finally {
      setSaving(false);
    }
  };

  const alternarAtivo = async (b: Beneficio) => {
    setBusyId(b.id);
    setPageError('');
    try {
      await definirAtivo(b.id, !b.ativo);
      load();
    } catch (err) {
      setPageError(mensagemDeErro(err, 'Não foi possível alterar o benefício.'));
    } finally {
      setBusyId(null);
    }
  };

  const excluir = async (b: Beneficio) => {
    if (!window.confirm(`Excluir o benefício "${b.nome}"? Esta ação não pode ser desfeita.`)) return;
    setBusyId(b.id);
    setPageError('');
    try {
      await excluirBeneficio(b.id);
      load();
    } catch (err) {
      setPageError(mensagemDeErro(err, 'Não foi possível excluir o benefício.'));
    } finally {
      setBusyId(null);
    }
  };

  const botaoNovo = isAdmin
    ? <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>Novo benefício</Button>
    : undefined;

  return (
    <>
      <PageHeader
        title="Central de benefícios"
        description="Parcerias e vantagens para colaboradores do Colégio Santa Paula"
        actions={botaoNovo}
      />

      <main className="page-body stack">
        <Modal
          open={showForm}
          title={editando ? 'Editar benefício' : 'Novo benefício'}
          onClose={closeModal}
          footer={(
            <>
              <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
              <Button type="submit" variant="primary" form="form-beneficio" loading={saving}>
                {saving ? 'Salvando...' : editando ? 'Salvar alterações' : 'Cadastrar'}
              </Button>
            </>
          )}
        >
          <form id="form-beneficio" onSubmit={handleSubmit} className="stack">
            {formError && <Notice kind="danger">{formError}</Notice>}
            <Field label="Nome do parceiro" required>
              {(ctl) => (
                <input {...ctl} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required minLength={2} maxLength={120} className="field" data-autofocus />
              )}
            </Field>
            <Field label="Descrição" required hint="O que é a parceria, qual a vantagem e como usar.">
              {(ctl) => (
                <textarea {...ctl} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} required maxLength={2000} rows={5} className="field" />
              )}
            </Field>
            <Field label="Link do parceiro" hint="Opcional. Precisa começar com http:// ou https://">
              {(ctl) => (
                <input {...ctl} type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} maxLength={500} placeholder="https://" className="field" />
              )}
            </Field>
            <Field label="Logo" hint={`Opcional. PNG, JPG ou WEBP, até ${LOGO_MAX_MB} MB.${editando?.temLogo ? ' Enviar outra imagem substitui o logo atual.' : ''}`}>
              {(ctl) => (
                <input {...ctl} type="file" accept={LOGO_ACCEPT} onChange={(e) => escolherLogo(e.target.files?.[0] ?? null)} className="field" />
              )}
            </Field>
            {editando?.temLogo && !form.logo && (
              <Field label="Remover o logo atual" inline>
                {(ctl) => (
                  <input {...ctl} type="checkbox" checked={form.removerLogo} onChange={(e) => setForm({ ...form, removerLogo: e.target.checked })} />
                )}
              </Field>
            )}
            <Field label="Ordem de exibição" hint="Números menores aparecem primeiro.">
              {(ctl) => (
                <input {...ctl} type="number" min={0} max={9999} value={form.ordem} onChange={(e) => setForm({ ...form, ordem: e.target.value })} className="field max-w-[140px]" />
              )}
            </Field>
          </form>
        </Modal>

        {pageError && <Notice kind="danger" onClose={() => setPageError('')}>{pageError}</Notice>}

        {loadError ? (
          <Notice kind="danger" actions={<Button size="sm" variant="secondary" onClick={load}>Tentar novamente</Button>}>
            Não foi possível carregar os benefícios.
          </Notice>
        ) : loading ? (
          <div className="grid-auto" aria-busy="true">
            <div className="skeleton h-[220px]" />
            <div className="skeleton h-[220px]" />
            <div className="skeleton h-[220px]" />
          </div>
        ) : itens.length === 0 ? (
          <div className="card">
            <EmptyState icon={<HeartHandshake size={22} />} title="Nenhum benefício cadastrado ainda" action={botaoNovo}>
              {isAdmin
                ? 'Cadastre a primeira parceria em Novo benefício.'
                : 'Quando a escola firmar parcerias, elas aparecem aqui.'}
            </EmptyState>
          </div>
        ) : (
          <div className="grid-auto">
            {itens.map((b) => (
              <article key={b.id} className={`card stack ${b.ativo ? '' : 'opacity-70'}`.trim()}>
                <div className="relative">
                  <LogoParceiro beneficio={b} />
                  {!b.ativo && (
                    <span className="pill pill-muted absolute top-2 right-2">
                      <span className="pill-dot" aria-hidden="true" />
                      Oculto
                    </span>
                  )}
                </div>
                <h2 className="card-title">{b.nome}</h2>
                <p className="text-sm-2 whitespace-pre-line break-words text-(--text-2)">{b.descricao}</p>
                {b.link && (
                  <div>
                    <a href={b.link} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                      <ExternalLink size={14} aria-hidden="true" />
                      Acessar o parceiro
                      <span className="sr-only"> {b.nome} (abre em nova aba)</span>
                    </a>
                  </div>
                )}
                {isAdmin && (
                  <div className="row flex-wrap mt-auto">
                    <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => openEdit(b)}>Editar</Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={b.ativo ? <EyeOff size={14} /> : <Eye size={14} />}
                      onClick={() => alternarAtivo(b)}
                      loading={busyId === b.id}
                    >
                      {b.ativo ? 'Ocultar' : 'Mostrar'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      aria-label={`Excluir ${b.nome}`}
                      title="Excluir benefício"
                      icon={<Trash2 size={16} />}
                      onClick={() => excluir(b)}
                      disabled={busyId === b.id}
                    />
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
