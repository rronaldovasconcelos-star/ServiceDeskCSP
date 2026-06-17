// ─── Taxonomia do Repositório de Arquivos (frontend) ────────────────────────────
// Vocabulário controlado dos 6 eixos de classificação. Guarda CÓDIGOS no banco;
// rótulos são só para exibição.
//
// ⚠️ MANTER EM SINCRONIA com backend/src/modules/files/taxonomy.ts.

export interface Term {
  code: string;
  label: string;
}

export const SEGMENTOS: Term[] = [
  { code: 'EI', label: 'Educação Infantil' },
  { code: 'FUND_I', label: 'Ensino Fundamental — Anos Iniciais' },
  { code: 'FUND_II', label: 'Ensino Fundamental — Anos Finais' },
];

// Rótulos fiéis ao Sistema_Ronaldo.
export const SERIES_BY_SEGMENTO: Record<string, Term[]> = {
  EI: [
    { code: 'EI_MATERNAL_II', label: 'Maternal II' },
    { code: 'EI_MATERNAL_III', label: 'Maternal III' },
    { code: 'EI_1PERIODO', label: '1º Período' },
    { code: 'EI_2PERIODO', label: '2º Período' },
  ],
  FUND_I: [
    { code: 'F1_1ANO', label: '1º Ano' },
    { code: 'F1_2ANO', label: '2º Ano' },
    { code: 'F1_3ANO', label: '3º Ano' },
    { code: 'F1_4ANO', label: '4º Ano' },
    { code: 'F1_5ANO', label: '5º Ano' },
  ],
  FUND_II: [
    { code: 'F2_6ANO', label: '6º Ano' },
    { code: 'F2_7ANO', label: '7º Ano' },
    { code: 'F2_8ANO', label: '8º Ano' },
    { code: 'F2_9ANO', label: '9º Ano' },
  ],
};

export const ETAPAS: Term[] = [
  { code: '1', label: '1ª Etapa' },
  { code: '2', label: '2ª Etapa' },
  { code: '3', label: '3ª Etapa' },
];

// ─── Classificação POR segmento (Disciplina ≡ Tipo de Material) ───────────────
// No documento Sistema_Ronaldo as colunas "Disciplina" e "Tipo de Material" são
// IDÊNTICAS em cada segmento — a escola usa um único vocabulário para os dois
// eixos. Por isso ambos derivam da mesma fonte abaixo (ordem fiel ao documento).
export const CLASSIFICACAO_BY_SEGMENTO: Record<string, Term[]> = {
  EI: [
    { code: 'ARTE', label: 'Arte' },
    { code: 'ATIVIDADE_AVALIATIVA', label: 'Atividade Avaliativa' },
    { code: 'CAPA', label: 'Capas' },
    { code: 'DIVERSOS', label: 'Diversos' },
    { code: 'FICHA', label: 'Ficha' },
    { code: 'INGLES', label: 'Língua Inglesa' },
    { code: 'LINGUAGEM', label: 'Linguagem' },
    { code: 'LITERATURA_INFANTIL', label: 'Literatura Infantil' },
    { code: 'MATEMATICA', label: 'Matemática' },
    { code: 'MUSICALIZACAO', label: 'Musicalização' },
    { code: 'NATUREZA', label: 'Natureza' },
    { code: 'PARA_CASA', label: 'Para Casa' },
    { code: 'PLANEJAMENTO', label: 'Planejamento' },
    { code: 'PROJETO', label: 'Projetos' },
    { code: 'SOCIEDADE', label: 'Sociedade' },
  ],
  FUND_I: [
    { code: 'ARTE', label: 'Arte' },
    { code: 'CAPA', label: 'Capas' },
    { code: 'CIENCIAS', label: 'Ciências' },
    { code: 'CIRANDA_LITERARIA', label: 'Ciranda Literária' },
    { code: 'CRONOGRAMA_PROVAS', label: 'Cronograma de Provas' },
    { code: 'DIVERSOS', label: 'Diversos' },
    { code: 'ED_FISICA', label: 'Educação Física' },
    { code: 'ENS_RELIGIOSO', label: 'Ensino Religioso' },
    { code: 'FICHA', label: 'Fichas' },
    { code: 'GEOGRAFIA', label: 'Geografia' },
    { code: 'HISTORIA', label: 'História' },
    { code: 'INGLES', label: 'Língua Inglesa' },
    { code: 'PORTUGUES', label: 'Língua Portuguesa' },
    { code: 'LITERATURA', label: 'Literatura' },
    { code: 'MATEMATICA', label: 'Matemática' },
    { code: 'PARA_CASA', label: 'Para Casa' },
    { code: 'PLANEJAMENTO', label: 'Planejamento' },
    { code: 'PRODUCAO_TEXTO', label: 'Produção de Texto' },
    { code: 'PROJETO', label: 'Projetos' },
    { code: 'PROVA_DIAGNOSTICA', label: 'Prova Diagnóstica' },
    { code: 'PROVA_FINAL', label: 'Prova Final' },
    { code: 'PROVA_PARCIAL', label: 'Prova Parcial' },
    { code: 'REVISAO_PROVA', label: 'Revisão de Prova' },
    { code: 'TRABALHO', label: 'Trabalhos' },
  ],
  // Doc repete "Geografia" e "Prova Diagnóstica"; mantida 1 ocorrência de cada.
  FUND_II: [
    { code: 'ARTE', label: 'Arte' },
    { code: 'ATIVIDADE_ADAPTADA', label: 'Atividade Adaptada' },
    { code: 'CIENCIAS', label: 'Ciências' },
    { code: 'CRONOGRAMA_PROVAS', label: 'Cronograma de Provas' },
    { code: 'ED_FISICA', label: 'Educação Física' },
    { code: 'GEOGRAFIA', label: 'Geografia' },
    { code: 'HISTORIA', label: 'História' },
    { code: 'INGLES', label: 'Língua Inglesa' },
    { code: 'PORTUGUES', label: 'Língua Portuguesa' },
    { code: 'MATEMATICA', label: 'Matemática' },
    { code: 'PLANEJAMENTO', label: 'Planejamento' },
    { code: 'REDACAO', label: 'Redação' },
    { code: 'PROVA_DIAGNOSTICA', label: 'Prova Diagnóstica' },
    { code: 'PROVA_FINAL', label: 'Prova Final' },
    { code: 'PROVA_PARCIAL', label: 'Prova Parcial' },
    { code: 'REVISAO_PROVA', label: 'Revisão de Prova' },
    { code: 'TRABALHO', label: 'Trabalhos' },
  ],
};

// Disciplina e Tipo de Material compartilham o MESMO vocabulário (ver doc acima).
export const DISCIPLINAS_BY_SEGMENTO: Record<string, Term[]> = CLASSIFICACAO_BY_SEGMENTO;
export const TIPOS_BY_SEGMENTO: Record<string, Term[]> = CLASSIFICACAO_BY_SEGMENTO;

// Códigos antigos não mais oferecidos nos menus, mantidos só para exibir o rótulo
// de arquivos já classificados antes da remodelagem (Sistema_Ronaldo).
const TIPOS_LEGACY: Term[] = [
  { code: 'PROVA_AVALIATIVA', label: 'Prova avaliativa' },
  { code: 'PROVA_ETAPA', label: 'Prova de etapa' },
  { code: 'PROVA_RECUPERACAO', label: 'Prova de recuperação' },
];

function dedupByCode(terms: Term[]): Term[] {
  const seen = new Set<string>();
  return terms.filter((t) => (seen.has(t.code) ? false : (seen.add(t.code), true)));
}

// União de todos os segmentos (+ legados nos tipos) — usada por filtros do
// repositório e por labelFor(). Para o MENU DE ENVIO use disciplinasFor()/tiposFor().
export const DISCIPLINAS: Term[] = dedupByCode(Object.values(DISCIPLINAS_BY_SEGMENTO).flat());
export const TIPOS_MATERIAL: Term[] = dedupByCode([
  ...Object.values(TIPOS_BY_SEGMENTO).flat(),
  ...TIPOS_LEGACY,
]);

export function disciplinasFor(segmento: string | null | undefined): Term[] {
  return (segmento && DISCIPLINAS_BY_SEGMENTO[segmento]) || [];
}
export function tiposFor(segmento: string | null | undefined): Term[] {
  return (segmento && TIPOS_BY_SEGMENTO[segmento]) || [];
}

// Anos letivos disponíveis (ano corrente + alguns anteriores).
export const ANOS_LETIVOS: string[] = ['2026', '2025', '2024'];

type Axis = 'segmento' | 'serie' | 'etapa' | 'disciplina' | 'tipoMaterial';

function termsFor(axis: Axis): Term[] {
  switch (axis) {
    case 'segmento': return SEGMENTOS;
    case 'etapa': return ETAPAS;
    case 'disciplina': return DISCIPLINAS;
    case 'tipoMaterial': return TIPOS_MATERIAL;
    case 'serie': return Object.values(SERIES_BY_SEGMENTO).flat();
  }
}

export function labelFor(axis: Axis, code: string | null | undefined): string {
  if (!code) return '—';
  return termsFor(axis).find((t) => t.code === code)?.label ?? code;
}
