/**
 * Parser do arquivo TXT de holerites exportado pelo sistema de folha (Folpag).
 *
 * O arquivo é posicional (colunas fixas), codificado em Windows-1252, com um
 * bloco por colaborador. O Folpag já exportou em dois layouts, reconhecidos
 * pelo primeiro caractere da primeira linha (ver docs/holerites.md):
 *
 * Formato "1" (arquivo de 22/09/2026) — cada linha começa pelo tipo do registro:
 *   1  cabeçalho do colaborador (competência, empresa, CNPJ, código, nome, depto, cargo, salário)
 *   2  verba (código, referência, descrição, vencimento OU desconto)
 *   3  totais (vencimentos, descontos, líquido, data de geração)
 *   4  bases (BASE INSS, BASE FGTS, BASE IRRF, FGTS MÊS)
 *   5  fim do bloco
 *
 * Formato "C" (export completo, arquivo de 23/09/2026) — traz também CPF, CTPS,
 * admissão e os códigos de cargo e departamento:
 *   C   cabeçalho do colaborador (435 colunas)
 *   DP  verba de provento / DD verba de desconto (81 colunas, valores em centavos)
 *   R   totais e bases (85 colunas); fecha o bloco — não há registro de fim
 *
 * Os valores monetários viram inteiros em centavos. O parser é determinístico e
 * recusa o arquivo inteiro se qualquer bloco não fechar (soma das verbas ≠
 * totais, líquido ≠ vencimentos − descontos): folha errada não entra pela metade.
 */

export interface HoleriteVerba {
  codigo: string;        // "0001"
  descricao: string;     // "Salário Contratual"
  referencia: string;    // "30,00" (como vem, com vírgula)
  vencimento: number | null; // centavos
  desconto: number | null;   // centavos
}

export type FormatoTxt = '1' | 'C';

export interface HoleriteParseado {
  formato: FormatoTxt;
  competencia: string;   // "2026-08"
  empresaNome: string;   // como vem no TXT (truncado)
  empresaCnpj: string;   // "01.241.815/0001-25"
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
  // Dados do colaborador — só o formato "C" traz; no "1" ficam nulos.
  cpf: string | null;        // "092.349.907-57"
  ctps: string | null;       // "0923499 / 00757"
  admissao: string | null;   // "dd/mm/aaaa"
  cargoCodigo: string | null; // "0005"
  deptoCodigo: string | null; // "000005"
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

/** Formato americano do cabeçalho "C": "5,458.30" → 545830. */
export function paraCentavosUs(texto: string, linha?: number): number {
  const t = texto.trim();
  if (!/^-?[\d,]*\d\.\d{2}$/.test(t)) {
    throw new HoleriteParseError(`valor monetário (formato americano) inválido: "${texto}"`, linha);
  }
  const negativo = t.startsWith('-');
  const n = parseInt(t.replace(/[^\d]/g, ''), 10);
  return negativo ? -n : n;
}

/** Campo numérico de largura fixa já em centavos: "000000680126" → 680126. */
function centavosFixo(texto: string, campo: string, linha: number): number {
  const t = texto.trim();
  if (!/^-?\d+$/.test(t)) throw new HoleriteParseError(`${campo} inválido: "${texto}"`, linha);
  return parseInt(t, 10);
}

/** Centavos → referência como o formato "1" a traz: 3000 → "30,00"; 200 → "2,00"; 2750 → "27,50". */
function referenciaDeCentavos(v: number): string {
  const inteiro = Math.floor(Math.abs(v) / 100);
  const cents = (Math.abs(v) % 100).toString().padStart(2, '0');
  return `${v < 0 ? '-' : ''}${inteiro},${cents}`;
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

/** "01042025" → "01/04/2025". Null se vier zerado ou em branco; lança se vier lixo. */
function dataCompacta(texto: string, campo: string, linha: number): string | null {
  const t = texto.trim();
  if (t === '' || /^0+$/.test(t)) return null;
  const m = t.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (!m) throw new HoleriteParseError(`${campo} inválida: "${texto}"`, linha);
  const [, d, mo, a] = m;
  if (+d < 1 || +d > 31 || +mo < 1 || +mo > 12) throw new HoleriteParseError(`${campo} inválida: "${texto}"`, linha);
  return `${d}/${mo}/${a}`;
}

function formatarCpf(digitos: string): string {
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9, 11)}`;
}

function formatarCnpj(digitos: string): string {
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12, 14)}`;
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

/** Tira zeros à esquerda e completa até a largura pedida: "000022" → "0022"; "00000000000000000005" → "000005". */
function codigoComLargura(digitos: string, largura: number): string {
  return digitos.replace(/^0+(?=\d)/, '').padStart(largura, '0');
}

function competenciaDeMmaaaa(mmaaaa: string, numero: number): string {
  if (!/^\d{6}$/.test(mmaaaa)) throw new HoleriteParseError(`competência inválida: "${mmaaaa}"`, numero);
  const mes = mmaaaa.slice(0, 2);
  const ano = mmaaaa.slice(2, 6);
  if (+mes < 1 || +mes > 12) throw new HoleriteParseError(`mês inválido na competência: "${mes}"`, numero);
  return `${ano}-${mes}`;
}

type BaseCabecalho = Pick<HoleriteParseado,
  'competencia' | 'empresaNome' | 'empresaCnpj' | 'colaboradorCodigo' | 'colaboradorNome' | 'departamento' | 'cargo' | 'salarioBase'
>;

function novoHolerite(formato: FormatoTxt, base: BaseCabecalho): HoleriteParseado {
  return {
    formato,
    ...base,
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
    cpf: null,
    ctps: null,
    admissao: null,
    cargoCodigo: null,
    deptoCodigo: null,
  };
}

// ---------- parser ----------

export function parseHolerites(conteudo: string | Buffer): HoleriteParseado[] {
  const texto = Buffer.isBuffer(conteudo) ? decodificar(conteudo) : conteudo;
  const linhas = texto.split(/\r?\n/);

  const primeira = linhas.find((l) => l.trim() !== '');
  if (primeira === undefined) throw new HoleriteParseError('nenhum holerite encontrado no arquivo');

  const resultado = primeira[0] === 'C' ? parseFormatoC(linhas) : parseFormato1(linhas);
  if (resultado.length === 0) throw new HoleriteParseError('nenhum holerite encontrado no arquivo');
  return resultado;
}

// ---------- formato "1" (22/09/2026) ----------

const COLUNAS_TIPO2 = { fim: 78 } as const;
const COLUNAS_TIPO3 = { fim: 64 } as const;

function parseFormato1(linhas: string[]): HoleriteParseado[] {
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
  return resultado;
}

function lerCabecalho(linha: string, numero: number): HoleriteParseado {
  if (linha.length < 186) throw new HoleriteParseError('cabeçalho do colaborador mais curto que o layout', numero);

  const competencia = competenciaDeMmaaaa(linha.slice(1, 7), numero);

  const cauda = linha.slice(185);
  const salario = cauda.match(/^[\d.]*\d,\d{2}/);
  if (!salario) throw new HoleriteParseError('salário base não encontrado no cabeçalho', numero);

  const codigo = linha.slice(67, 73).trim();
  if (!/^\d{1,6}$/.test(codigo)) throw new HoleriteParseError(`código do colaborador inválido: "${codigo}"`, numero);

  return novoHolerite('1', {
    competencia,
    empresaNome: linha.slice(7, 49).trim(),
    empresaCnpj: linha.slice(49, 67).trim(),
    colaboradorCodigo: codigo.padStart(6, '0'),
    colaboradorNome: linha.slice(73, 113).trim().replace(/\s+/g, ' '),
    departamento: linha.slice(113, 143).trim(),
    cargo: linha.slice(143, 185).trim(),
    salarioBase: paraCentavos(salario[0], numero),
  });
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

// ---------- formato "C" (export completo, 23/09/2026) ----------

type Faixa = readonly [number, number];

// Colunas do cabeçalho "C" (índices 0-based, medidos em Holerite23092026.txt).
const C = {
  empresa: [1, 49] as Faixa,        // nome da empresa (truncado; 3 espaços à esquerda)
  cnpj: [49, 63] as Faixa,          // 14 dígitos
  competencia: [63, 69] as Faixa,   // MMAAAA
  codigo: [69, 80] as Faixa,        // 11 dígitos
  nome: [80, 125] as Faixa,         // 45
  deptoCodigo: [125, 145] as Faixa, // 20 dígitos
  depto: [145, 190] as Faixa,       // 45
  cargoCodigo: [190, 196] as Faixa, // 6 dígitos
  cargoESalario: [196, 243] as Faixa, // cargo à esquerda, salário "d,ddd.dd" alinhado à direita
  admissao: [243, 251] as Faixa,    // ddmmaaaa
  demissao: [251, 259] as Faixa,    // ddmmaaaa ou zeros (não usado)
  ctpsNumero: [397, 417] as Faixa,  // 20 dígitos
  cpf: [417, 428] as Faixa,         // 11 dígitos
  ctpsSerie: [428, 433] as Faixa,   // 5 dígitos
  ctpsUf: [433, 435] as Faixa,      // "MG" (não usado)
  fim: 435,
};

const C_VERBA = {
  codigo: [2, 7] as Faixa,
  descricao: [7, 57] as Faixa,
  referencia: [57, 69] as Faixa,   // 12 dígitos, duas casas ("000000003000" = 30,00)
  valor: [69, 81] as Faixa,        // 12 dígitos em centavos
  fim: 81,
};

const C_TOTAIS_CAMPOS = 7; // venc, desc, líquido, base INSS, base FGTS, FGTS mês, base IRRF — 12 dígitos cada
const C_TOTAIS_FIM = 1 + 12 * C_TOTAIS_CAMPOS;

function campo(linha: string, [ini, fim]: Faixa): string {
  return linha.slice(ini, fim);
}

function parseFormatoC(linhas: string[]): HoleriteParseado[] {
  const resultado: HoleriteParseado[] = [];
  let atual: HoleriteParseado | null = null;

  for (let i = 0; i < linhas.length; i++) {
    const numero = i + 1;
    const linha = linhas[i];
    if (linha.trim() === '') continue;

    const tipo = linha[0];

    if (tipo === 'C') {
      if (atual) throw new HoleriteParseError('novo colaborador começou sem fechar o anterior (faltou a linha R)', numero);
      atual = lerCabecalhoC(linha, numero);
      continue;
    }

    if (!atual) throw new HoleriteParseError(`registro tipo "${tipo}" fora de um bloco de colaborador`, numero);

    switch (tipo) {
      case 'D':
        atual.verbas.push(lerVerbaC(linha, numero));
        break;
      case 'R':
        lerTotaisC(linha, numero, atual);
        conferirBloco(atual, numero);
        resultado.push(atual);
        atual = null;
        break;
      default:
        throw new HoleriteParseError(`tipo de registro desconhecido: "${tipo}"`, numero);
    }
  }

  if (atual) throw new HoleriteParseError('arquivo terminou sem fechar o último colaborador (faltou a linha R)');
  return resultado;
}

function lerCabecalhoC(linha: string, numero: number): HoleriteParseado {
  if (linha.length < C.fim) {
    throw new HoleriteParseError(`cabeçalho do colaborador mais curto que o layout (${linha.length} < ${C.fim})`, numero);
  }

  const competencia = competenciaDeMmaaaa(campo(linha, C.competencia), numero);

  const cnpj = campo(linha, C.cnpj).trim();
  if (!/^\d{14}$/.test(cnpj)) throw new HoleriteParseError(`CNPJ inválido: "${cnpj}"`, numero);

  const codigo = campo(linha, C.codigo).trim();
  if (!/^\d{1,11}$/.test(codigo)) throw new HoleriteParseError(`código do colaborador inválido: "${codigo}"`, numero);

  const cargoESalario = campo(linha, C.cargoESalario);
  const m = cargoESalario.match(/^(.*?)\s*(-?[\d,]*\d\.\d{2})\s*$/);
  if (!m) throw new HoleriteParseError('salário base não encontrado no cabeçalho', numero);
  const [, cargo, salario] = m;

  const cpf = campo(linha, C.cpf).trim();
  if (!/^\d{11}$/.test(cpf)) throw new HoleriteParseError(`CPF inválido: "${cpf}"`, numero);

  const ctpsNumero = campo(linha, C.ctpsNumero).trim();
  const ctpsSerie = campo(linha, C.ctpsSerie).trim();
  if (!/^\d+$/.test(ctpsNumero) || !/^\d+$/.test(ctpsSerie)) {
    throw new HoleriteParseError(`CTPS inválida: "${ctpsNumero}" série "${ctpsSerie}"`, numero);
  }

  const deptoCodigo = campo(linha, C.deptoCodigo).trim();
  const cargoCodigo = campo(linha, C.cargoCodigo).trim();
  if (!/^\d+$/.test(deptoCodigo) || !/^\d+$/.test(cargoCodigo)) {
    throw new HoleriteParseError(`códigos de departamento/cargo inválidos: "${deptoCodigo}" / "${cargoCodigo}"`, numero);
  }

  const h = novoHolerite('C', {
    competencia,
    empresaNome: campo(linha, C.empresa).trim(),
    empresaCnpj: formatarCnpj(cnpj),
    colaboradorCodigo: codigoComLargura(codigo, 6),
    colaboradorNome: campo(linha, C.nome).trim().replace(/\s+/g, ' '),
    departamento: campo(linha, C.depto).trim(),
    cargo: cargo.trim(),
    salarioBase: paraCentavosUs(salario, numero),
  });
  h.cpf = /^0+$/.test(cpf) ? null : formatarCpf(cpf);
  // CTPS como o demonstrativo impresso mostra: número com 7 dígitos, série com 5.
  h.ctps = /^0+$/.test(ctpsNumero) ? null : `${codigoComLargura(ctpsNumero, 7)} / ${codigoComLargura(ctpsSerie, 5)}`;
  h.admissao = dataCompacta(campo(linha, C.admissao), 'data de admissão', numero);
  // Códigos como o demonstrativo impresso mostra: cargo com 4 dígitos, departamento com 6.
  h.cargoCodigo = codigoComLargura(cargoCodigo, 4);
  h.deptoCodigo = codigoComLargura(deptoCodigo, 6);
  return h;
}

function lerVerbaC(linha: string, numero: number): HoleriteVerba {
  if (linha.length < C_VERBA.fim) {
    throw new HoleriteParseError(`verba mais curta que o layout (${linha.length} < ${C_VERBA.fim})`, numero);
  }
  const natureza = linha[1];
  if (natureza !== 'P' && natureza !== 'D') {
    throw new HoleriteParseError(`natureza de verba desconhecida: "D${natureza}" (esperava DP ou DD)`, numero);
  }

  const codigo = campo(linha, C_VERBA.codigo).trim();
  if (!/^\d{1,5}$/.test(codigo)) throw new HoleriteParseError(`código de verba inválido: "${codigo}"`, numero);

  const valor = centavosFixo(campo(linha, C_VERBA.valor), 'valor da verba', numero);
  const referencia = centavosFixo(campo(linha, C_VERBA.referencia), 'referência da verba', numero);

  return {
    codigo: codigoComLargura(codigo, 4),
    referencia: referenciaDeCentavos(referencia),
    descricao: campo(linha, C_VERBA.descricao).trim(),
    vencimento: natureza === 'P' ? valor : null,
    desconto: natureza === 'D' ? valor : null,
  };
}

function lerTotaisC(linha: string, numero: number, h: HoleriteParseado): void {
  if (linha.length < C_TOTAIS_FIM) {
    throw new HoleriteParseError(`linha de totais mais curta que o layout (${linha.length} < ${C_TOTAIS_FIM})`, numero);
  }
  const v: number[] = [];
  for (let k = 0; k < C_TOTAIS_CAMPOS; k++) {
    v.push(centavosFixo(linha.slice(1 + 12 * k, 13 + 12 * k), `campo ${k + 1} dos totais`, numero));
  }
  // Ordem conferida contra o demonstrativo impresso de 08/2026. Base INSS e
  // base FGTS vieram iguais nas duas amostras, então a ordem entre elas segue
  // a do documento (INSS antes de FGTS) e não pôde ser distinguida pelo dado.
  [h.totalVencimentos, h.totalDescontos, h.liquido, h.baseInss, h.baseFgts, h.fgtsMes, h.baseIrrf] = v;
  h.dataGeracao = null; // o formato completo não traz a data de geração
}

// ---------- comum ----------

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
