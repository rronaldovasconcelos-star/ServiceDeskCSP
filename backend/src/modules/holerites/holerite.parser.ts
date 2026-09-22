/**
 * Parser do arquivo TXT de holerites exportado pelo sistema de folha (Folpag).
 *
 * O arquivo é posicional (colunas fixas), codificado em Windows-1252, com um
 * bloco por colaborador. Cada linha começa pelo tipo do registro:
 *
 *   1  cabeçalho do colaborador (competência, empresa, CNPJ, código, nome, depto, cargo, salário)
 *   2  verba (código, referência, descrição, vencimento OU desconto)
 *   3  totais (vencimentos, descontos, líquido, data de geração)
 *   4  bases (BASE INSS, BASE FGTS, BASE IRRF, FGTS MÊS)
 *   5  fim do bloco
 *
 * Layout medido no arquivo de 22/09/2026 (ver docs/holerites.md). Os valores
 * monetários viram inteiros em centavos. O parser é determinístico e recusa o
 * arquivo inteiro se qualquer bloco não fechar (soma das verbas ≠ totais,
 * líquido ≠ vencimentos − descontos): folha errada não entra pela metade.
 */

export interface HoleriteVerba {
  codigo: string;        // "0001"
  descricao: string;     // "Salário Contratual"
  referencia: string;    // "30,00" (como vem, com vírgula)
  vencimento: number | null; // centavos
  desconto: number | null;   // centavos
}

export interface HoleriteParseado {
  competencia: string;   // "2026-08"
  empresaNome: string;   // como vem no TXT (truncado em 42 caracteres)
  empresaCnpj: string;
  colaboradorCodigo: string; // "000285"
  colaboradorNome: string;
  departamento: string;
  cargo: string;
  salarioBase: number;   // centavos
  verbas: HoleriteVerba[];
  totalVencimentos: number;
  totalDescontos: number;
  liquido: number;
  dataGeracao: Date | null;
  baseInss: number | null;
  baseFgts: number | null;
  baseIrrf: number | null;
  fgtsMes: number | null;
  faixaIrrf: string | null; // referência da verba de IRRF ("27,50"), quando existe
}

export class HoleriteParseError extends Error {
  constructor(message: string, public readonly linha?: number) {
    super(linha ? `Linha ${linha}: ${message}` : message);
    this.name = 'HoleriteParseError';
  }
}

// ---------- utilitários ----------

/** Decodifica o buffer: tenta UTF-8 estrito e cai para Windows-1252 (padrão do Folpag). */
export function decodificar(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/** "8.501,58" → 850158; "6321,85" → 632185. Lança se não for um valor monetário. */
export function paraCentavos(texto: string, linha?: number): number {
  const t = texto.trim();
  if (!/^-?[\d.]*\d,\d{2}$/.test(t)) {
    throw new HoleriteParseError(`valor monetário inválido: "${texto}"`, linha);
  }
  const negativo = t.startsWith('-');
  const digitos = t.replace(/[^\d]/g, '');
  const n = parseInt(digitos, 10);
  return negativo ? -n : n;
}

function centavosOuNulo(texto: string, linha?: number): number | null {
  return texto.trim() === '' ? null : paraCentavos(texto, linha);
}

/** "dd/mm/aaaa" → Date em UTC (meia-noite). Null se vazio ou inválido. */
function dataBr(texto: string): Date | null {
  const m = texto.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, a] = m;
  const data = new Date(Date.UTC(+a, +mo - 1, +d));
  return isNaN(data.getTime()) ? null : data;
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

const COLUNAS_TIPO2 = { fim: 78 } as const;
const COLUNAS_TIPO3 = { fim: 64 } as const;

// ---------- parser ----------

export function parseHolerites(conteudo: string | Buffer): HoleriteParseado[] {
  const texto = Buffer.isBuffer(conteudo) ? decodificar(conteudo) : conteudo;
  const linhas = texto.split(/\r?\n/);

  const resultado: HoleriteParseado[] = [];
  let atual: HoleriteParseado | null = null;
  let viuTotais = false;

  for (let i = 0; i < linhas.length; i++) {
    const numero = i + 1;
    const linha = linhas[i];
    if (linha.trim() === '') continue;

    const tipo = linha[0];

    if (tipo === '1') {
      if (atual) throw new HoleriteParseError('novo colaborador começou sem fechar o anterior (faltou a linha 5)', numero);
      atual = lerCabecalho(linha, numero);
      viuTotais = false;
      continue;
    }

    if (!atual) throw new HoleriteParseError(`registro tipo "${tipo}" fora de um bloco de colaborador`, numero);

    switch (tipo) {
      case '2':
        atual.verbas.push(lerVerba(linha, numero));
        break;
      case '3':
        lerTotais(linha, numero, atual);
        viuTotais = true;
        break;
      case '4':
        lerBases(linha, atual);
        break;
      case '5':
        if (!viuTotais) throw new HoleriteParseError('bloco fechou sem a linha de totais (tipo 3)', numero);
        conferirBloco(atual, numero);
        resultado.push(atual);
        atual = null;
        break;
      default:
        throw new HoleriteParseError(`tipo de registro desconhecido: "${tipo}"`, numero);
    }
  }

  if (atual) throw new HoleriteParseError('arquivo terminou sem fechar o último colaborador (faltou a linha 5)');
  if (resultado.length === 0) throw new HoleriteParseError('nenhum holerite encontrado no arquivo');

  return resultado;
}

function lerCabecalho(linha: string, numero: number): HoleriteParseado {
  if (linha.length < 186) throw new HoleriteParseError('cabeçalho do colaborador mais curto que o layout', numero);

  const mmaaaa = linha.slice(1, 7);
  if (!/^\d{6}$/.test(mmaaaa)) throw new HoleriteParseError(`competência inválida: "${mmaaaa}"`, numero);
  const mes = mmaaaa.slice(0, 2);
  const ano = mmaaaa.slice(2, 6);
  if (+mes < 1 || +mes > 12) throw new HoleriteParseError(`mês inválido na competência: "${mes}"`, numero);

  const cauda = linha.slice(185);
  const salario = cauda.match(/^[\d.]*\d,\d{2}/);
  if (!salario) throw new HoleriteParseError('salário base não encontrado no cabeçalho', numero);

  const codigo = linha.slice(67, 73).trim();
  if (!/^\d{1,6}$/.test(codigo)) throw new HoleriteParseError(`código do colaborador inválido: "${codigo}"`, numero);

  return {
    competencia: `${ano}-${mes}`,
    empresaNome: linha.slice(7, 49).trim(),
    empresaCnpj: linha.slice(49, 67).trim(),
    colaboradorCodigo: codigo.padStart(6, '0'),
    colaboradorNome: linha.slice(73, 113).trim().replace(/\s+/g, ' '),
    departamento: linha.slice(113, 143).trim(),
    cargo: linha.slice(143, 185).trim(),
    salarioBase: paraCentavos(salario[0], numero),
    verbas: [],
    totalVencimentos: 0,
    totalDescontos: 0,
    liquido: 0,
    dataGeracao: null,
    baseInss: null,
    baseFgts: null,
    baseIrrf: null,
    fgtsMes: null,
    faixaIrrf: null,
  };
}

function lerVerba(linha: string, numero: number): HoleriteVerba {
  const l = linha.padEnd(COLUNAS_TIPO2.fim, ' ');
  const codigo = l.slice(1, 5).trim();
  if (!/^\d{1,4}$/.test(codigo)) throw new HoleriteParseError(`código de verba inválido: "${codigo}"`, numero);
  const vencimento = centavosOuNulo(l.slice(58, 68), numero);
  const desconto = centavosOuNulo(l.slice(68, 78), numero);
  if (vencimento === null && desconto === null) {
    throw new HoleriteParseError('verba sem valor em vencimentos nem em descontos', numero);
  }
  return {
    codigo: codigo.padStart(4, '0'),
    referencia: l.slice(5, 13).trim().replace('.', ',').replace(/^0+(?=[0-9])/, ''),
    descricao: l.slice(13, 58).trim(),
    vencimento,
    desconto,
  };
}

function lerTotais(linha: string, numero: number, h: HoleriteParseado): void {
  const l = linha.padEnd(COLUNAS_TIPO3.fim, ' ');
  h.totalVencimentos = paraCentavos(l.slice(24, 34), numero);
  h.totalDescontos = paraCentavos(l.slice(34, 44), numero);
  h.liquido = paraCentavos(l.slice(44, 54), numero);
  h.dataGeracao = dataBr(l.slice(54, 64));
}

function lerBases(linha: string, h: HoleriteParseado): void {
  // Blocos "RÓTULO            :valor" — lê por rótulo, não por posição, para
  // tolerar variação de espaçamento entre versões do exportador.
  const re = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]*?)\s*:\s*(-?[\d.]*\d,\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(linha.slice(1))) !== null) {
    const rotulo = semAcento(m[1]).replace(/\s+/g, ' ').trim();
    const valor = paraCentavos(m[2]);
    if (rotulo === 'BASE INSS') h.baseInss = valor;
    else if (rotulo === 'BASE FGTS') h.baseFgts = valor;
    else if (rotulo === 'BASE IRRF') h.baseIrrf = valor;
    else if (rotulo === 'FGTS MES') h.fgtsMes = valor;
  }
}

/** Fecha o bloco: somas das verbas batem com os totais e líquido = venc − desc. */
function conferirBloco(h: HoleriteParseado, numero: number): void {
  const somaVenc = h.verbas.reduce((s, v) => s + (v.vencimento ?? 0), 0);
  const somaDesc = h.verbas.reduce((s, v) => s + (v.desconto ?? 0), 0);
  const quem = `colaborador ${h.colaboradorCodigo} (${h.colaboradorNome})`;

  if (somaVenc !== h.totalVencimentos) {
    throw new HoleriteParseError(`${quem}: soma dos vencimentos (${somaVenc}) difere do total (${h.totalVencimentos})`, numero);
  }
  if (somaDesc !== h.totalDescontos) {
    throw new HoleriteParseError(`${quem}: soma dos descontos (${somaDesc}) difere do total (${h.totalDescontos})`, numero);
  }
  if (h.totalVencimentos - h.totalDescontos !== h.liquido) {
    throw new HoleriteParseError(`${quem}: líquido (${h.liquido}) ≠ vencimentos − descontos (${h.totalVencimentos - h.totalDescontos})`, numero);
  }

  const irrf = h.verbas.find((v) => /IRRF/i.test(v.descricao) && v.desconto !== null);
  h.faixaIrrf = irrf ? irrf.referencia : null;
}
