// ─── Taxonomia do Repositório de Arquivos ───────────────────────────────────────
// Vocabulário controlado dos 6 eixos de classificação (Ano, Segmento, Série,
// Etapa, Disciplina, Tipo de material). O banco guarda os CÓDIGOS (ex.
// "MATEMATICA"), nunca os rótulos — renomear um rótulo não exige reescrever dados.
//
// ⚠️ MANTER EM SINCRONIA com frontend/src/lib/taxonomy.ts (cópia estrutural).

export interface Term {
  code: string;
  label: string;
}

export const SEGMENTOS: Term[] = [
  { code: 'EI', label: 'Educação Infantil' },
  { code: 'FUND_I', label: 'Fundamental I — Anos Iniciais' },
  { code: 'FUND_II', label: 'Fundamental II — Anos Finais' },
];

// Dependência: séries disponíveis POR segmento.
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

// ─── Validação ──────────────────────────────────────────────────────────────────

export function isValidAno(code: string): boolean {
  return /^\d{4}$/.test(code);
}
export function isValidSegmento(code: string): boolean {
  return SEGMENTOS.some((t) => t.code === code);
}
export function isValidSerie(segmento: string, code: string): boolean {
  return (SERIES_BY_SEGMENTO[segmento] ?? []).some((t) => t.code === code);
}
export function isValidEtapa(code: string): boolean {
  return ETAPAS.some((t) => t.code === code);
}
export function isValidDisciplina(code: string): boolean {
  return DISCIPLINAS.some((t) => t.code === code);
}
export function isValidTipo(code: string): boolean {
  return TIPOS_MATERIAL.some((t) => t.code === code);
}

// ─── Rótulos / nomes de pasta ────────────────────────────────────────────────────

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

// Remove caracteres inválidos para nome de pasta (em disco e no Drive).
// Carga crítica: rótulos pt-BR podem conter "/" (ex. antigas "Prova avaliativa/etapa").
export function sanitizeFolderName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

export interface AxisValues {
  anoLetivo: string;
  segmento: string;
  serie: string;
  etapa: string;
  disciplina: string;
  tipoMaterial: string;
}

// Monta a chave de storage espelhando a árvore acadêmica:
//   {Ano}/{Segmento}/{Série}/{Etapa}/{Disciplina}/{Tipo}/{storedName}
// Usa rótulos legíveis (sanitizados) nos níveis de pasta.
export function buildStorageKey(axes: AxisValues, storedName: string): string {
  const parts = [
    axes.anoLetivo || 'Sem ano',
    labelFor('segmento', axes.segmento),
    labelFor('serie', axes.serie),
    labelFor('etapa', axes.etapa),
    labelFor('disciplina', axes.disciplina),
    labelFor('tipoMaterial', axes.tipoMaterial),
  ].map(sanitizeFolderName);
  return [...parts, storedName].join('/');
}

// Caminho interno do arquivo dentro do .zip de download em lote — espelha a
// árvore acadêmica usando o NOME ORIGINAL do arquivo (legível). Arquivos legados
// sem eixos caem em "Sem classificação". A deduplicação de nomes repetidos é
// responsabilidade do chamador.
export function buildZipEntryPath(file: {
  anoLetivo: string | null;
  segmento: string | null;
  serie: string | null;
  etapa: string | null;
  disciplina: string | null;
  tipoMaterial: string | null;
  originalName: string;
}): string {
  if (!file.anoLetivo && !file.segmento) {
    return ['Sem classificação', sanitizeFolderName(file.originalName)].join('/');
  }
  const parts = [
    file.anoLetivo || 'Sem ano',
    labelFor('segmento', file.segmento),
    labelFor('serie', file.serie),
    labelFor('etapa', file.etapa),
    labelFor('disciplina', file.disciplina),
    labelFor('tipoMaterial', file.tipoMaterial),
  ].map(sanitizeFolderName);
  return [...parts, sanitizeFolderName(file.originalName)].join('/');
}
