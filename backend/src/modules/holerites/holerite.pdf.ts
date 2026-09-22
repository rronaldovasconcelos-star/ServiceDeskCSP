/**
 * Gera o PDF do holerite no mesmo formato do "Demonstrativo de Pagamento" que a
 * escola já entrega (duas vias iguais por página A4: uma fica com o
 * colaborador, a outra assinada volta para o RH).
 *
 * Desenhado com primitivas do pdfkit em coordenadas fixas — o layout foi
 * medido no PDF de referência de 08/2026 (ver docs/holerites.md).
 */
import PDFDocument from 'pdfkit';
import type { HoleriteVerba } from './holerite.parser.js';

export interface DadosHoleritePdf {
  empresaNome: string;
  empresaCnpj: string;
  empresaEndereco: string;
  competencia: string;           // "2026-08"
  colaboradorCodigo: string;     // "000285"
  colaboradorNome: string;
  cargo: string;
  cargoCodigo: string | null;
  departamento: string;
  deptoCodigo: string | null;
  matricula: string | null;      // se nulo, usa o código com 10 dígitos
  ctps: string | null;
  admissao: string | null;       // "dd/mm/aaaa"
  cpf: string | null;
  verbas: HoleriteVerba[];
  totalVencimentos: number;
  totalDescontos: number;
  liquido: number;
  salarioBase: number;
  baseInss: number | null;
  baseFgts: number | null;
  baseIrrf: number | null;
  fgtsMes: number | null;
  faixaIrrf: string | null;      // "27,50"
}

type Doc = InstanceType<typeof PDFDocument>;

// ---------- formatação ----------

/** 545830 → "5.458,30" */
export function formatarCentavos(v: number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const negativo = v < 0;
  const abs = Math.abs(v);
  const inteiro = Math.floor(abs / 100).toString();
  const cents = (abs % 100).toString().padStart(2, '0');
  const comPontos = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}${comPontos},${cents}`;
}

/** "27,50" → "27,5%"; "2,00" → "2%". Vazio se não houver. */
export function formatarFaixaIrrf(ref: string | null): string {
  if (!ref) return '';
  const n = parseFloat(ref.replace(',', '.'));
  if (isNaN(n)) return ref;
  const texto = n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
  return `${texto}%`;
}

/** "2026-08" → "08/2026" */
export function formatarCompetencia(c: string): string {
  const [ano, mes] = c.split('-');
  return `${mes}/${ano}`;
}

// ---------- layout ----------

const X0 = 28;
const LARGURA = 539;
const ALTURA_VIA = 364;
const ESPACO_ENTRE_VIAS = 40;
const CINZA = '#d9d9d9';

// colunas da tabela de verbas
const COL_VERBAS = 235;
const COL_REF = 60;
const COL_VENC = 122;
const COL_DESC = LARGURA - COL_VERBAS - COL_REF - COL_VENC; // 122

const ALTURA_ITENS = 160;

function linha(doc: Doc, x1: number, y1: number, x2: number, y2: number, espessura = 0.8): void {
  doc.lineWidth(espessura).moveTo(x1, y1).lineTo(x2, y2).stroke('#000');
}

function rotuloValor(doc: Doc, rotulo: string, valor: string, x: number, y: number, largura: number): void {
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#000')
    .text(rotulo, x, y, { width: largura, lineBreak: false, continued: true })
    .font('Helvetica')
    .text(` ${valor}`, { lineBreak: false });
}

function desenharVia(doc: Doc, d: DadosHoleritePdf, y0: number): void {
  const xFim = X0 + LARGURA;

  // Moldura
  doc.rect(X0, y0, LARGURA, ALTURA_VIA).lineWidth(0.8).stroke('#000');

  // Cabeçalho da empresa
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#000')
    .text(d.empresaNome, X0, y0 + 6, { width: LARGURA, align: 'center', lineBreak: false });
  doc.fontSize(9)
    .text(d.empresaCnpj, X0, y0 + 22, { width: LARGURA, align: 'center', lineBreak: false })
    .text(d.empresaEndereco, X0, y0 + 36, { width: LARGURA, align: 'center', lineBreak: false })
    .text('Demonstrativo de Pagamento', X0, y0 + 50, { width: LARGURA, align: 'center', lineBreak: false });

  // Linhas de identificação
  const yA = y0 + 64;
  const yB = yA + 15;
  const yC = yB + 15;
  const yTab = yC + 15;
  const xDireita = X0 + 430; // coluna Período / CTPS / CPF
  const xMeio = X0 + 325;    // coluna Matrícula / Admissão

  linha(doc, X0, yA, xFim, yA);
  linha(doc, X0, yB, xFim, yB);
  linha(doc, X0, yC, xFim, yC);
  linha(doc, xDireita, yA, xDireita, yTab);
  linha(doc, xMeio, yB, xMeio, yTab);

  rotuloValor(doc, 'Func.:', `${d.colaboradorCodigo} - ${d.colaboradorNome}`, X0 + 4, yA + 4, xDireita - X0 - 8);
  rotuloValor(doc, 'Período:', formatarCompetencia(d.competencia), xDireita + 4, yA + 4, xFim - xDireita - 8);

  const cargo = d.cargoCodigo ? `${d.cargoCodigo} - ${d.cargo}` : d.cargo;
  const depto = d.deptoCodigo ? `${d.deptoCodigo} - ${d.departamento}` : d.departamento;
  const matricula = d.matricula ?? d.colaboradorCodigo.padStart(10, '0');

  rotuloValor(doc, 'Cargo:', cargo, X0 + 4, yB + 4, xMeio - X0 - 8);
  rotuloValor(doc, 'Matrícula:', matricula, xMeio + 4, yB + 4, xDireita - xMeio - 8);
  rotuloValor(doc, 'CTPS:', d.ctps ?? '', xDireita + 4, yB + 4, xFim - xDireita - 8);

  rotuloValor(doc, 'Depto.:', depto, X0 + 4, yC + 4, xMeio - X0 - 8);
  rotuloValor(doc, 'Admissão:', d.admissao ?? '', xMeio + 4, yC + 4, xDireita - xMeio - 8);
  rotuloValor(doc, 'CPF:', d.cpf ?? '', xDireita + 4, yC + 4, xFim - xDireita - 8);

  // Cabeçalho da tabela de verbas
  const xRef = X0 + COL_VERBAS;
  const xVenc = xRef + COL_REF;
  const xDesc = xVenc + COL_VENC;
  const yItens = yTab + 15;

  doc.rect(X0, yTab, LARGURA, 15).fill(CINZA);
  linha(doc, X0, yTab, xFim, yTab);
  linha(doc, X0, yItens, xFim, yItens);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#000')
    .text('Verbas', X0, yTab + 4, { width: COL_VERBAS, align: 'center', lineBreak: false })
    .text('Referência', xRef, yTab + 4, { width: COL_REF, align: 'center', lineBreak: false })
    .text('Vencimentos', xVenc, yTab + 4, { width: COL_VENC, align: 'center', lineBreak: false })
    .text('Descontos', xDesc, yTab + 4, { width: COL_DESC, align: 'center', lineBreak: false });

  // Corpo das verbas
  const yTotais = yItens + ALTURA_ITENS;
  linha(doc, xRef, yTab, xRef, yItens);
  linha(doc, xVenc, yTab, xVenc, yTotais);
  linha(doc, xDesc, yTab, xDesc, yTotais);

  doc.font('Helvetica').fontSize(8);
  const alturaLinha = 11;
  const maxLinhas = Math.floor((ALTURA_ITENS - 6) / alturaLinha);
  d.verbas.slice(0, maxLinhas).forEach((v, i) => {
    const y = yItens + 4 + i * alturaLinha;
    doc.text(`${v.codigo} - ${v.descricao}`, X0 + 4, y, { width: COL_VERBAS - 8, lineBreak: false });
    doc.text(v.referencia, xRef, y, { width: COL_REF - 6, align: 'right', lineBreak: false });
    if (v.vencimento !== null) {
      doc.text(formatarCentavos(v.vencimento), xVenc, y, { width: COL_VENC - 6, align: 'right', lineBreak: false });
    }
    if (v.desconto !== null) {
      doc.text(formatarCentavos(v.desconto), xDesc, y, { width: COL_DESC - 6, align: 'right', lineBreak: false });
    }
  });

  // Totais
  const yLiquido = yTotais + 15;
  const yAssinatura = yLiquido + 15;
  doc.rect(xVenc, yTotais, xFim - xVenc, 30).fill(CINZA);
  linha(doc, xVenc, yTotais, xFim, yTotais);
  linha(doc, xVenc, yLiquido, xFim, yLiquido);
  linha(doc, xVenc, yTotais, xVenc, yAssinatura);
  linha(doc, xDesc, yTotais, xDesc, yLiquido);

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
  doc.text('Total:', xVenc + 4, yTotais + 4, { lineBreak: false });
  doc.text(formatarCentavos(d.totalVencimentos), xVenc, yTotais + 4, { width: COL_VENC - 6, align: 'right', lineBreak: false });
  doc.text('Total:', xDesc + 4, yTotais + 4, { lineBreak: false });
  doc.text(formatarCentavos(d.totalDescontos), xDesc, yTotais + 4, { width: COL_DESC - 6, align: 'right', lineBreak: false });
  doc.text('Valor Líquido', xVenc + 4, yLiquido + 4, { lineBreak: false });
  doc.text(formatarCentavos(d.liquido), xDesc, yLiquido + 4, { width: COL_DESC - 6, align: 'right', lineBreak: false });

  // Recibo / assinatura
  linha(doc, X0, yAssinatura, xFim, yAssinatura);
  const yRodape = yAssinatura + 20;
  doc.font('Helvetica').fontSize(8)
    .text('Recebi o valor líquido descrito neste recibo em', X0 + 4, yAssinatura + 7, { lineBreak: false });
  linha(doc, X0 + 178, yAssinatura + 16, X0 + 250, yAssinatura + 16, 0.6);
  doc.text('/', X0 + 200, yAssinatura + 7, { lineBreak: false });
  doc.text('/', X0 + 224, yAssinatura + 7, { lineBreak: false });
  doc.text('Assinatura:', X0 + 268, yAssinatura + 7, { lineBreak: false });
  linha(doc, X0 + 312, yAssinatura + 16, xFim - 6, yAssinatura + 16, 0.6);

  // Bases de cálculo
  linha(doc, X0, yRodape, xFim, yRodape, 1.2);
  const colunas: Array<[string, string]> = [
    ['Salário Base', formatarCentavos(d.salarioBase)],
    ['Sal. Contr. INSS', formatarCentavos(d.baseInss)],
    ['Base Cálc. FGTS', formatarCentavos(d.baseFgts)],
    ['FGTS do Mês', formatarCentavos(d.fgtsMes)],
    ['Base Cálc. IRRF', formatarCentavos(d.baseIrrf)],
    ['Faixa IRRF', formatarFaixaIrrf(d.faixaIrrf)],
  ];
  const larguraCol = LARGURA / colunas.length;
  colunas.forEach(([rotulo, valor], i) => {
    const x = X0 + i * larguraCol;
    doc.font('Helvetica-Bold').fontSize(8)
      .text(rotulo, x, yRodape + 5, { width: larguraCol, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8)
      .text(valor, x, yRodape + 17, { width: larguraCol, align: 'center', lineBreak: false });
  });
}

/** Gera o PDF (duas vias por página) e devolve os bytes. */
export function gerarHoleritePdf(d: DadosHoleritePdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      info: {
        Title: `Holerite ${formatarCompetencia(d.competencia)} - ${d.colaboradorNome}`,
        Author: d.empresaNome,
      },
    });
    const partes: Buffer[] = [];
    doc.on('data', (c: Buffer) => partes.push(c));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    desenharVia(doc, d, 36);
    desenharVia(doc, d, 36 + ALTURA_VIA + ESPACO_ENTRE_VIAS);

    doc.end();
  });
}
