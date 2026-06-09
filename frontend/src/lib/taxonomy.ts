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
  { code: 'FUND_I', label: 'Fundamental I — Anos Iniciais' },
  { code: 'FUND_II', label: 'Fundamental II — Anos Finais' },
];

export const SERIES_BY_SEGMENTO: Record<string, Term[]> = {
  EI: [
    { code: 'EI_MATERNAL', label: 'Maternal' },
    { code: 'EI_1PERIODO', label: '1º período' },
    { code: 'EI_2PERIODO', label: '2º período' },
  ],
  FUND_I: [
    { code: 'F1_1ANO', label: '1º ano' },
    { code: 'F1_2ANO', label: '2º ano' },
    { code: 'F1_3ANO', label: '3º ano' },
    { code: 'F1_4ANO', label: '4º ano' },
    { code: 'F1_5ANO', label: '5º ano' },
  ],
  FUND_II: [
    { code: 'F2_6ANO', label: '6º ano' },
    { code: 'F2_7ANO', label: '7º ano' },
    { code: 'F2_8ANO', label: '8º ano' },
    { code: 'F2_9ANO', label: '9º ano' },
  ],
};

export const ETAPAS: Term[] = [
  { code: '1', label: '1ª etapa' },
  { code: '2', label: '2ª etapa' },
  { code: '3', label: '3ª etapa' },
];

export const DISCIPLINAS: Term[] = [
  { code: 'ARTE', label: 'Arte' },
  { code: 'MATEMATICA', label: 'Matemática' },
  { code: 'PORTUGUES', label: 'Português' },
  { code: 'CIENCIAS', label: 'Ciências' },
  { code: 'GEOGRAFIA', label: 'Geografia' },
  { code: 'HISTORIA', label: 'História' },
  { code: 'INGLES', label: 'Inglês' },
  { code: 'ED_FISICA', label: 'Ed. Física' },
  { code: 'ENS_RELIGIOSO', label: 'Ens. Religioso' },
  { code: 'LITERATURA', label: 'Literatura' },
  { code: 'MUSICALIZACAO', label: 'Musicalização' },
];

export const TIPOS_MATERIAL: Term[] = [
  { code: 'PROVA_AVALIATIVA', label: 'Prova avaliativa' },
  { code: 'PROVA_ETAPA', label: 'Prova de etapa' },
  { code: 'PROVA_RECUPERACAO', label: 'Prova de recuperação' },
  { code: 'REVISAO_PROVA', label: 'Revisão de prova' },
  { code: 'ATIVIDADE_AVALIATIVA', label: 'Atividade avaliativa' },
  { code: 'PARA_CASA', label: 'Para casa' },
  { code: 'PRODUCAO_TEXTO', label: 'Produção de texto' },
  { code: 'TRABALHO', label: 'Trabalho' },
  { code: 'PROJETO', label: 'Projeto' },
  { code: 'PLANEJAMENTO', label: 'Planejamento' },
  { code: 'CAPA', label: 'Capa' },
  { code: 'FICHA', label: 'Ficha' },
  { code: 'CRONOGRAMA_PROVAS', label: 'Cronograma de provas' },
  { code: 'DIVERSOS', label: 'Diversos' },
];

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
