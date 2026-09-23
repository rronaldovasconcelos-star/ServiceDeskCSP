/**
 * Testes do módulo de holerites — roda contra o banco local (prisma/dev.db).
 *
 *   npx tsx scripts/testar-holerites.ts
 *
 * Cobre: parser (layout posicional, centavos, bases, faixa IRRF), recusas do
 * parser (soma que não bate, bloco sem fechar, colaborador repetido), PDF
 * (bytes válidos, duas vias), importação (cria colaborador, substitui a mesma
 * competência, registra a importação), vínculo (usuário só pode estar em um
 * colaborador) e autorização (dono vê, outro usuário não, RH vê).
 *
 * Os dados são FICTÍCIOS e ficam com prefixo "TESTE-HOLERITE"; tudo é removido
 * ao final, inclusive quando um teste falha. Sai com código ≠ 0 se algo falhar.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma.js';
import { parseHolerites, HoleriteParseError, paraCentavos } from '../src/modules/holerites/holerite.parser.js';
import { gerarHoleritePdf, formatarCentavos, formatarFaixaIrrf, ajustarObservacoes, LARGURA_OBSERVACOES, ALTURA_OBSERVACOES } from '../src/modules/holerites/holerite.pdf.js';
import {
  importarArquivo, listarMeus, obterHoleriteAutorizado, gerarPdf, vincularUsuario, atualizarDados, HoleriteErro,
  criarMensagem, atualizarMensagem, excluirMensagem, listarMensagens, listarCompetencias, montarObservacoes, juntarObservacoes,
  LIMITE_MENSAGEM, SEPARADOR_OBSERVACOES,
} from '../src/modules/holerites/holerites.service.js';
import { mensagemSchema } from '../src/modules/holerites/holerites.controller.js';
import PDFDocument from 'pdfkit';

// ---------- fixture sintética (mesmo layout do Folpag) ----------

function cabecalho(comp: string, codigo: string, nome: string, depto: string, cargo: string, salario: string): string {
  return '1' + comp + 'EMPRESA TESTE HOLERITE LTDA - UNIDADE'.padEnd(42) + '00.000.000/0001-00'
    + codigo.padStart(6, '0') + nome.padEnd(40) + depto.padEnd(30) + cargo.padEnd(42)
    + salario + '0000' + depto.padEnd(30) + '00000';
}
function verba(codigo: string, ref: string, desc: string, venc: string, descto: string): string {
  return '2' + codigo.padStart(4, '0') + ref.padStart(8) + desc.padEnd(45) + venc.padEnd(10) + descto.padEnd(10);
}
function totais(venc: string, desc: string, liq: string, data: string): string {
  return '3' + ' '.repeat(5) + '0'.repeat(18) + venc.padEnd(10) + desc.padEnd(10) + liq.padEnd(10) + data;
}
function bases(inss: string, fgts: string, irrf: string, fgtsMes: string): string {
  const b = (r: string, v: string) => r.padEnd(18) + ':' + v.padEnd(23);
  return '4' + b('BASE INSS', inss) + b('BASE FGTS', fgts) + b('BASE IRRF', irrf) + b('FGTS MÊS', fgtsMes);
}

const COD_A = '990001';
const COD_B = '990002';

// ---------- fixture sintética do formato completo (registros C / DP / DD / R, 23/09/2026) ----------

function centavos12(v: number): string {
  return String(v).padStart(12, '0');
}
interface CabC {
  comp: string; codigo: string; nome: string; deptoCod: string; depto: string; cargoCod: string; cargo: string;
  salarioUs: string; admissao: string; ctpsNum: string; cpf: string; serie: string;
}
function cabecalhoC(c: CabC): string {
  const l = 'C' + '   ' + 'EMPRESA TESTE HOLERITE LTDA - UNIDADE'.padEnd(44) + ' ' + '00000000000100' + c.comp
    + c.codigo.padStart(11, '0') + c.nome.padEnd(45) + c.deptoCod.padStart(20, '0') + c.depto.padEnd(45)
    + c.cargoCod.padStart(6, '0') + c.cargo.padEnd(34) + c.salarioUs.padStart(13) + c.admissao + '00000000'
    + ' '.repeat(15) + '31082026' + ' '.repeat(115) + c.ctpsNum.padStart(20, '0') + c.cpf + c.serie.padStart(5, '0') + 'MG';
  assert.equal(l.length, 435, 'fixture C fora do layout');
  return l;
}
/** tipo 'P' (provento) ou 'D' (desconto); referência e valor em centavos. */
function verbaC(tipo: 'P' | 'D', codigo: string, ref: number, desc: string, valor: number): string {
  return 'D' + tipo + codigo.padStart(5, '0') + desc.padEnd(50) + centavos12(ref) + centavos12(valor);
}
function totaisR(venc: number, desc: number, liq: number, inss: number, fgts: number, fgtsMes: number, irrf: number): string {
  return 'R' + [venc, desc, liq, inss, fgts, fgtsMes, irrf].map(centavos12).join('');
}

function fixtureC(comp = '082026'): string {
  return [
    cabecalhoC({
      comp, codigo: COD_A, nome: 'TESTE-HOLERITE ANA FICTICIA', deptoCod: '5', depto: 'Administração Escolar',
      cargoCod: '22', cargo: 'Assistente Teste', salarioUs: '3,000.00', admissao: '02052001', ctpsNum: '60810', cpf: '00000000191', serie: '125',
    }),
    verbaC('P', '1', 3000, 'Salário Contratual', 300000),
    verbaC('D', '520', 900, 'Desconto INSS', 27000),
    verbaC('D', '530', 750, 'Desconto IRRF', 5000),
    verbaC('D', '1006', 200, 'Mensalidade Sindical', 2000),
    totaisR(300000, 34000, 266000, 300000, 300000, 24000, 273000),
    cabecalhoC({
      comp, codigo: COD_B, nome: 'TESTE-HOLERITE BRUNO FICTICIO', deptoCod: '5', depto: 'Administração Escolar',
      cargoCod: '5', cargo: 'Auxiliar Teste', salarioUs: '1,500.00', admissao: '01042025', ctpsNum: '923499', cpf: '00000000272', serie: '757',
    }),
    verbaC('P', '1', 3000, 'Salário Contratual', 150000),
    verbaC('D', '520', 750, 'Desconto INSS', 11250),
    totaisR(150000, 11250, 138750, 150000, 150000, 12000, 138750),
  ].join('\r\n') + '\r\n';
}

function fixture(comp = '082026'): string {
  return [
    cabecalho(comp, COD_A, 'TESTE-HOLERITE ANA FICTICIA', 'Administração Escolar', 'Assistente Teste', '3.000,00'),
    verba('0001', '30.00', 'Salário Contratual', '3.000,00', ''),
    verba('0520', '09.00', 'Desconto INSS', '', '270,00'),
    verba('0530', '07.50', 'Desconto IRRF', '', '50,00'),
    totais('3.000,00', '320,00', '2680,00', '22/09/2026'),
    bases('3.000,00', '3.000,00', '2.730,00', '240,00'),
    '5',
    cabecalho(comp, COD_B, 'TESTE-HOLERITE BRUNO FICTICIO', 'Administração Escolar', 'Auxiliar Teste', '1.500,00'),
    verba('0001', '30.00', 'Salário Contratual', '1.500,00', ''),
    verba('0520', '07.50', 'Desconto INSS', '', '112,50'),
    totais('1.500,00', '112,50', '1387,50', '22/09/2026'),
    bases('1.500,00', '1.500,00', '1.387,50', '120,00'),
    '5',
  ].join('\r\n') + '\r\n';
}

// ---------- infra de teste ----------

let falhas = 0;
async function teste(nome: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${nome}`);
  } catch (err) {
    falhas++;
    console.log(`  ✗ ${nome}`);
    console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function esperaErro(fn: () => Promise<unknown> | unknown, tipo: new (...a: never[]) => Error, trecho: string) {
  try {
    await fn();
  } catch (err) {
    assert.ok(err instanceof tipo, `esperava ${tipo.name}, veio ${(err as Error)?.constructor?.name}: ${(err as Error)?.message}`);
    assert.ok((err as Error).message.includes(trecho), `mensagem "${(err as Error).message}" não contém "${trecho}"`);
    return;
  }
  assert.fail(`esperava ${tipo.name} com "${trecho}", mas não lançou`);
}

const PREFIXO_EMAIL = 'teste-holerite-';
async function limpar() {
  await prisma.holeriteMensagem.deleteMany({ where: { OR: [{ texto: { startsWith: 'TESTE-HOLERITE' } }, { colaborador: { codigo: { in: [COD_A, COD_B] } } }] } });
  await prisma.holerite.deleteMany({ where: { colaborador: { codigo: { in: [COD_A, COD_B] } } } });
  await prisma.colaborador.deleteMany({ where: { codigo: { in: [COD_A, COD_B] } } });
  await prisma.holeriteImportacao.deleteMany({ where: { arquivo: { startsWith: 'TESTE-HOLERITE' } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIXO_EMAIL } } });
}

async function criarUsuario(sufixo: string, role = 'USER', modules: string[] = []) {
  return prisma.user.create({
    data: { name: `Teste Holerite ${sufixo}`, email: `${PREFIXO_EMAIL}${sufixo}@exemplo.local`, passwordHash: 'x', role, modules: JSON.stringify(modules) },
  });
}

// ---------- testes ----------

console.log('\nParser');
await teste('lê os dois blocos com valores em centavos', () => {
  const hs = parseHolerites(Buffer.from(fixture(), 'latin1'));
  assert.equal(hs.length, 2);
  const a = hs[0];
  assert.equal(a.competencia, '2026-08');
  assert.equal(a.colaboradorCodigo, COD_A);
  assert.equal(a.colaboradorNome, 'TESTE-HOLERITE ANA FICTICIA');
  assert.equal(a.cargo, 'Assistente Teste');
  assert.equal(a.salarioBase, 300000);
  assert.equal(a.totalVencimentos, 300000);
  assert.equal(a.totalDescontos, 32000);
  assert.equal(a.liquido, 268000);
  assert.equal(a.verbas.length, 3);
  assert.deepEqual(a.verbas[1], { codigo: '0520', descricao: 'Desconto INSS', referencia: '9,00', vencimento: null, desconto: 27000 });
  assert.equal(a.baseInss, 300000);
  assert.equal(a.baseIrrf, 273000);
  assert.equal(a.fgtsMes, 24000);
  assert.equal(a.faixaIrrf, '7,50');
  assert.equal(a.dataGeracao?.toISOString(), '2026-09-22T00:00:00.000Z');
  assert.equal(hs[1].faixaIrrf, null, 'sem verba de IRRF → sem faixa');
});

await teste('decodifica Windows-1252 (acentos do Folpag)', () => {
  const hs = parseHolerites(Buffer.from(fixture(), 'latin1'));
  assert.equal(hs[0].departamento, 'Administração Escolar');
  assert.equal(hs[0].verbas[0].descricao, 'Salário Contratual');
});

await teste('paraCentavos aceita com e sem separador de milhar', () => {
  assert.equal(paraCentavos('8.501,58'), 850158);
  assert.equal(paraCentavos('6321,85'), 632185);
  assert.equal(paraCentavos('34,17'), 3417);
  assert.throws(() => paraCentavos('abc'), HoleriteParseError);
});

await teste('recusa o arquivo quando a soma das verbas não bate com o total', async () => {
  const quebrado = fixture().replace("Desconto INSS".padEnd(45) + ''.padEnd(10) + '270,00'.padEnd(10), "Desconto INSS".padEnd(45) + ''.padEnd(10) + '271,00'.padEnd(10));
  assert.notEqual(quebrado, fixture(), 'a substituição precisa ter acontecido');
  await esperaErro(() => parseHolerites(quebrado), HoleriteParseError, 'soma dos descontos');
});

await teste('recusa líquido diferente de vencimentos − descontos', async () => {
  const quebrado = fixture().replace('2680,00'.padEnd(10), '2681,00'.padEnd(10));
  await esperaErro(() => parseHolerites(quebrado), HoleriteParseError, 'líquido');
});

await teste('recusa bloco sem a linha 5', async () => {
  const semFim = fixture().replace(/\r\n5\r\n$/, '\r\n');
  await esperaErro(() => parseHolerites(semFim), HoleriteParseError, 'faltou a linha 5');
});

await teste('recusa arquivo vazio', async () => {
  await esperaErro(() => parseHolerites('\r\n\r\n'), HoleriteParseError, 'nenhum holerite');
});

console.log('\nParser — formato completo (C / DP / DD / R)');
await teste('lê os dois blocos com CPF, CTPS, admissão e códigos', () => {
  const hs = parseHolerites(Buffer.from(fixtureC(), 'latin1'));
  assert.equal(hs.length, 2);
  const a = hs[0];
  assert.equal(a.formato, 'C');
  assert.equal(a.competencia, '2026-08');
  assert.equal(a.empresaNome, 'EMPRESA TESTE HOLERITE LTDA - UNIDADE');
  assert.equal(a.empresaCnpj, '00.000.000/0001-00');
  assert.equal(a.colaboradorCodigo, COD_A);
  assert.equal(a.colaboradorNome, 'TESTE-HOLERITE ANA FICTICIA');
  assert.equal(a.departamento, 'Administração Escolar');
  assert.equal(a.deptoCodigo, '000005');
  assert.equal(a.cargo, 'Assistente Teste');
  assert.equal(a.cargoCodigo, '0022');
  assert.equal(a.salarioBase, 300000, 'salário no formato americano 3,000.00');
  assert.equal(a.admissao, '02/05/2001');
  assert.equal(a.cpf, '000.000.001-91');
  assert.equal(a.ctps, '0060810 / 00125');
  assert.equal(a.verbas.length, 4);
  assert.deepEqual(a.verbas[0], { codigo: '0001', descricao: 'Salário Contratual', referencia: '30,00', vencimento: 300000, desconto: null });
  assert.deepEqual(a.verbas[1], { codigo: '0520', descricao: 'Desconto INSS', referencia: '9,00', vencimento: null, desconto: 27000 });
  assert.equal(a.verbas[3].referencia, '2,00');
  assert.equal(a.totalVencimentos, 300000);
  assert.equal(a.totalDescontos, 34000);
  assert.equal(a.liquido, 266000);
  assert.equal(a.baseInss, 300000);
  assert.equal(a.baseFgts, 300000);
  assert.equal(a.fgtsMes, 24000);
  assert.equal(a.baseIrrf, 273000);
  assert.equal(a.faixaIrrf, '7,50');
  assert.equal(a.dataGeracao, null, 'o formato completo não traz data de geração');
  const b = hs[1];
  assert.equal(b.ctps, '0923499 / 00757');
  assert.equal(b.cargoCodigo, '0005');
  assert.equal(b.faixaIrrf, null);
});

await teste('formato antigo continua sem os dados extras', () => {
  const a = parseHolerites(fixture())[0];
  assert.equal(a.formato, '1');
  assert.equal(a.cpf, null);
  assert.equal(a.ctps, null);
  assert.equal(a.admissao, null);
});

await teste('formato completo: recusa soma das verbas diferente do total', async () => {
  const quebrado = fixtureC().replace(verbaC('D', '520', 900, 'Desconto INSS', 27000), verbaC('D', '520', 900, 'Desconto INSS', 27100));
  assert.notEqual(quebrado, fixtureC());
  await esperaErro(() => parseHolerites(quebrado), HoleriteParseError, 'soma dos descontos');
});

await teste('formato completo: recusa líquido diferente de vencimentos − descontos', async () => {
  const quebrado = fixtureC().replace(totaisR(150000, 11250, 138750, 150000, 150000, 12000, 138750), totaisR(150000, 11250, 138760, 150000, 150000, 12000, 138750));
  await esperaErro(() => parseHolerites(quebrado), HoleriteParseError, 'líquido');
});

await teste('formato completo: recusa cabeçalho seguido de outro sem a linha R', async () => {
  const semR = fixtureC().replace(totaisR(300000, 34000, 266000, 300000, 300000, 24000, 273000) + '\r\n', '');
  await esperaErro(() => parseHolerites(semR), HoleriteParseError, 'sem fechar');
});

await teste('formato completo: recusa arquivo que termina sem a linha R', async () => {
  const semFim = fixtureC().replace(totaisR(150000, 11250, 138750, 150000, 150000, 12000, 138750) + '\r\n', '');
  await esperaErro(() => parseHolerites(semFim), HoleriteParseError, 'sem fechar');
});

await teste('formato completo: recusa CPF fora do padrão', async () => {
  const ruim = fixtureC().replace('00000000191' + '00125MG', 'ABCDEFGHIJK' + '00125MG');
  assert.notEqual(ruim, fixtureC());
  await esperaErro(() => parseHolerites(ruim), HoleriteParseError, 'CPF');
});

console.log('\nPDF');
function dadosPdf(observacoes: string | null = null) {
  const h = parseHolerites(fixture())[0];
  return {
    empresaNome: 'EMPRESA TESTE', empresaCnpj: h.empresaCnpj, empresaEndereco: 'Rua Teste, 1',
    competencia: h.competencia, colaboradorCodigo: h.colaboradorCodigo, colaboradorNome: h.colaboradorNome,
    cargo: h.cargo, cargoCodigo: '0001', departamento: h.departamento, deptoCodigo: '000001', matricula: null,
    ctps: '1 / 2', admissao: '01/01/2020', cpf: '000.000.000-00', verbas: h.verbas,
    totalVencimentos: h.totalVencimentos, totalDescontos: h.totalDescontos, liquido: h.liquido, salarioBase: h.salarioBase,
    baseInss: h.baseInss, baseFgts: h.baseFgts, baseIrrf: h.baseIrrf, fgtsMes: h.fgtsMes, faixaIrrf: h.faixaIrrf,
    observacoes,
  };
}
// Tamanho do PDF sem observações, medido em 23/09/2026 (após a linha de corte
// acima dos totais passar a atravessar a largura toda, como no papel): a caixa
// vazia não pode mudar um byte do layout.
const TAMANHO_PDF_SEM_OBSERVACOES = 3246;

await teste('gera PDF válido com duas vias', async () => {
  const pdf = await gerarHoleritePdf(dadosPdf());
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 2000, `PDF pequeno demais: ${pdf.length} bytes`);
  // duas vias = o nome do colaborador aparece nos dois blocos de conteúdo (texto pode vir comprimido; contamos páginas)
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length, 1, 'uma página A4');
});

await teste('sem observações o PDF continua idêntico em tamanho (layout intacto)', async () => {
  const pdf = await gerarHoleritePdf(dadosPdf(null));
  assert.equal(pdf.length, TAMANHO_PDF_SEM_OBSERVACOES);
});

await teste('com observações o PDF gera e fica maior', async () => {
  const pdf = await gerarHoleritePdf(dadosPdf('TESTE-HOLERITE aviso geral' + SEPARADOR_OBSERVACOES + 'TESTE-HOLERITE aviso individual'));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > TAMANHO_PDF_SEM_OBSERVACOES + 40, `esperava mais bytes com o texto: ${pdf.length}`);
});

await teste('duas mensagens no limite cabem na caixa sem corte; texto curto fica em 7 pt', () => {
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const curto = ajustarObservacoes(doc, 'Aviso curto.', LARGURA_OBSERVACOES, ALTURA_OBSERVACOES);
  assert.deepEqual(curto, { fontSize: 7, cabe: true });
  // texto corrido em português, esticado até o limite de cada mensagem
  const frase = 'Lembramos que o recesso escolar começa em 15/10 e o adiantamento sai no dia 20. Dúvidas, procure o RH na secretaria. ';
  const noLimite = frase.repeat(3).slice(0, LIMITE_MENSAGEM);
  const cheio = ajustarObservacoes(doc, noLimite + SEPARADOR_OBSERVACOES + noLimite, LARGURA_OBSERVACOES, ALTURA_OBSERVACOES);
  assert.equal(cheio.cabe, true, `geral + individual no limite (${LIMITE_MENSAGEM} cada) precisam caber (fonte ${cheio.fontSize})`);
  const estourado = ajustarObservacoes(doc, frase.repeat(6), LARGURA_OBSERVACOES, ALTURA_OBSERVACOES);
  assert.equal(estourado.cabe, false, 'acima do limite o gerador sabe que vai cortar');
  doc.end();
});

console.log('\nValidação das mensagens (schema do controller)');
await teste('recusa texto vazio, acima do limite, competência inválida e escopo desconhecido', () => {
  assert.equal(mensagemSchema.safeParse({ escopo: 'GERAL', texto: '   ' }).success, false, 'texto vazio');
  assert.equal(mensagemSchema.safeParse({ escopo: 'GERAL', texto: 'x'.repeat(LIMITE_MENSAGEM + 1) }).success, false, 'acima do limite');
  assert.equal(mensagemSchema.safeParse({ escopo: 'GERAL', texto: 'ok', competencia: '2026-13' }).success, false, 'mês 13');
  assert.equal(mensagemSchema.safeParse({ escopo: 'TODOS', texto: 'ok' }).success, false, 'escopo inválido');
  const ok = mensagemSchema.parse({ escopo: 'GERAL', texto: '  ok  ', competencia: '' });
  assert.equal(ok.texto, 'ok', 'texto sai sem espaços nas pontas');
  assert.equal(ok.competencia, null, 'competência vazia vira null');
  assert.equal(mensagemSchema.parse({ escopo: 'GERAL', texto: 'x'.repeat(LIMITE_MENSAGEM) }).texto.length, LIMITE_MENSAGEM);
});

await teste('formata centavos e faixa IRRF como no modelo', () => {
  assert.equal(formatarCentavos(545830), '5.458,30');
  assert.equal(formatarCentavos(3417), '34,17');
  assert.equal(formatarCentavos(0), '0,00');
  assert.equal(formatarCentavos(null), '');
  assert.equal(formatarFaixaIrrf('27,50'), '27,5%');
  assert.equal(formatarFaixaIrrf('7,50'), '7,5%');
  assert.equal(formatarFaixaIrrf(null), '');
});

console.log('\nImportação, vínculo e autorização (banco local)');
await limpar();
try {
  const ator = { id: null, nome: 'teste' };
  let idHoleriteAna = '';

  await teste('importa e cria os colaboradores', async () => {
    const r = await importarArquivo(Buffer.from(fixture(), 'latin1'), { arquivo: 'TESTE-HOLERITE-1.txt', origem: 'UPLOAD', ator });
    assert.equal(r.totalHolerites, 2);
    assert.equal(r.novosColaboradores, 2);
    assert.deepEqual(r.competencias, ['2026-08']);
    assert.equal(r.semVinculo.length, 2);
    const ana = await prisma.colaborador.findUnique({ where: { codigo: COD_A }, include: { holerites: true } });
    assert.ok(ana);
    assert.equal(ana.holerites.length, 1);
    assert.equal(ana.holerites[0].liquido, 268000);
    idHoleriteAna = ana.holerites[0].id;
  });

  await teste('reimportar a mesma competência substitui, não duplica', async () => {
    const corrigido = fixture()
      .replace('3.000,00'.padEnd(10) + ''.padEnd(10), '3.100,00'.padEnd(10) + ''.padEnd(10)) // verba salário
      .replace(totais('3.000,00', '320,00', '2680,00', '22/09/2026'), totais('3.100,00', '320,00', '2780,00', '23/09/2026'));
    const r = await importarArquivo(Buffer.from(corrigido, 'latin1'), { arquivo: 'TESTE-HOLERITE-2.txt', origem: 'UPLOAD', ator });
    assert.equal(r.novosColaboradores, 0);
    const ana = await prisma.colaborador.findUnique({ where: { codigo: COD_A }, include: { holerites: true } });
    assert.equal(ana!.holerites.length, 1, 'continua um holerite');
    assert.equal(ana!.holerites[0].liquido, 278000, 'com o valor novo');
    assert.equal(ana!.holerites[0].id, idHoleriteAna, 'mesmo registro');
  });

  await teste('competência nova soma, não substitui', async () => {
    await importarArquivo(Buffer.from(fixture('092026'), 'latin1'), { arquivo: 'TESTE-HOLERITE-3.txt', origem: 'UPLOAD', ator });
    const ana = await prisma.colaborador.findUnique({ where: { codigo: COD_A }, include: { holerites: true } });
    assert.equal(ana!.holerites.length, 2);
  });

  await teste('arquivo com o mesmo colaborador duas vezes na competência é recusado', async () => {
    const dobrado = fixture() + fixture();
    await esperaErro(
      () => importarArquivo(Buffer.from(dobrado, 'latin1'), { arquivo: 'TESTE-HOLERITE-4.txt', origem: 'UPLOAD', ator }),
      HoleriteErro, 'duas vezes',
    );
  });

  await teste('mesmo fileId do Drive não entra duas vezes', async () => {
    await importarArquivo(Buffer.from(fixture('072026'), 'latin1'), { arquivo: 'TESTE-HOLERITE-5.txt', origem: 'DRIVE', driveFileId: 'drive-teste-holerite-1', ator });
    await esperaErro(
      () => importarArquivo(Buffer.from(fixture('072026'), 'latin1'), { arquivo: 'TESTE-HOLERITE-5.txt', origem: 'DRIVE', driveFileId: 'drive-teste-holerite-1', ator }),
      HoleriteErro, 'já foi importado',
    );
  });

  const ana = await criarUsuario('ana');
  const outro = await criarUsuario('outro');
  const rh = await criarUsuario('rh', 'USER', ['rh']);
  const admin = await criarUsuario('admin', 'ADMIN');
  const colabAna = (await prisma.colaborador.findUnique({ where: { codigo: COD_A } }))!;
  const colabBruno = (await prisma.colaborador.findUnique({ where: { codigo: COD_B } }))!;

  await teste('sem vínculo, o usuário não vê nada', async () => {
    const r = await listarMeus(ana.id);
    assert.equal(r.vinculado, false);
    assert.equal(r.holerites.length, 0);
  });

  await teste('vínculo dá acesso aos próprios holerites', async () => {
    await vincularUsuario(colabAna.id, ana.id);
    const r = await listarMeus(ana.id);
    assert.equal(r.vinculado, true);
    assert.equal(r.colaborador?.codigo, COD_A);
    assert.equal(r.holerites.length, 3);
    assert.equal(r.holerites[0].competencia, '2026-09', 'mais recente primeiro');
  });

  await teste('um usuário não pode estar em dois colaboradores', async () => {
    await esperaErro(() => vincularUsuario(colabBruno.id, ana.id), HoleriteErro, 'já está vinculado');
  });

  await teste('desfazer o vínculo', async () => {
    await vincularUsuario(colabBruno.id, outro.id);
    await vincularUsuario(colabBruno.id, null);
    const r = await listarMeus(outro.id);
    assert.equal(r.vinculado, false);
  });

  const payload = (u: { id: string; email: string; role: string; name: string }, modules: string[] = []) =>
    ({ sub: u.id, email: u.email, role: u.role, name: u.name, modules });

  await teste('dono baixa o PDF; outro usuário recebe 403; RH e ADMIN podem', async () => {
    const h = await obterHoleriteAutorizado(idHoleriteAna, payload(ana));
    const pdf = await gerarPdf(h);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');

    await esperaErro(() => obterHoleriteAutorizado(idHoleriteAna, payload(outro)), HoleriteErro, 'Acesso negado');
    await obterHoleriteAutorizado(idHoleriteAna, payload(rh, ['rh']));
    await obterHoleriteAutorizado(idHoleriteAna, payload(admin));
    await esperaErro(() => obterHoleriteAutorizado('nao-existe', payload(admin)), HoleriteErro, 'não encontrado');
  });

  await teste('dados extras (CPF, CTPS, admissão) entram no PDF', async () => {
    await atualizarDados(colabAna.id, { cpf: '000.000.000-00', ctps: '1234567 / 00001', admissao: '01/02/2024', cargoCodigo: '0009', deptoCodigo: '' });
    const c = await prisma.colaborador.findUnique({ where: { id: colabAna.id } });
    assert.equal(c!.cpf, '000.000.000-00');
    assert.equal(c!.deptoCodigo, null, 'string vazia vira null');
    const h = await obterHoleriteAutorizado(idHoleriteAna, payload(ana));
    assert.equal(h.colaborador.admissao, '01/02/2024');
  });

  await teste('histórico registra as importações', async () => {
    const imps = await prisma.holeriteImportacao.findMany({ where: { arquivo: { startsWith: 'TESTE-HOLERITE' } } });
    assert.equal(imps.length, 4, 'quatro importações válidas (a recusada não registra)');
  });

  await teste('formato completo grava CPF, CTPS, admissão e códigos no colaborador', async () => {
    const r = await importarArquivo(Buffer.from(fixtureC('062026'), 'latin1'), { arquivo: 'TESTE-HOLERITE-6.txt', origem: 'UPLOAD', ator });
    assert.equal(r.totalHolerites, 2);
    const c = await prisma.colaborador.findUnique({ where: { id: colabAna.id } });
    assert.equal(c!.cpf, '000.000.001-91', 'o TXT sobrepõe o que o RH digitou');
    assert.equal(c!.ctps, '0060810 / 00125');
    assert.equal(c!.admissao, '02/05/2001');
    assert.equal(c!.cargoCodigo, '0022');
    assert.equal(c!.deptoCodigo, '000005');
    const h = await obterHoleriteAutorizado(idHoleriteAna, payload(ana));
    assert.equal(h.colaborador.cpf, '000.000.001-91', 'o PDF de qualquer competência usa o cadastro atualizado');
  });

  await teste('reimportar o formato antigo não apaga os dados vindos do completo', async () => {
    await importarArquivo(Buffer.from(fixture('052026'), 'latin1'), { arquivo: 'TESTE-HOLERITE-7.txt', origem: 'UPLOAD', ator });
    const c = await prisma.colaborador.findUnique({ where: { id: colabAna.id } });
    assert.equal(c!.cpf, '000.000.001-91');
    assert.equal(c!.admissao, '02/05/2001');
  });

  console.log('\nMensagens do RH (campo Observações do PDF)');
  const atorRh = { id: rh.id, nome: rh.name };
  let idGeral = '';
  let idIndividual = '';

  await teste('sem mensagem, o holerite sai sem observações', async () => {
    assert.equal(await montarObservacoes(colabAna.id, '2026-08'), null);
  });

  await teste('geral sem competência sai para qualquer colaborador em qualquer mês', async () => {
    const m = await criarMensagem({ escopo: 'GERAL', colaboradorId: null, competencia: null, texto: 'TESTE-HOLERITE aviso geral' }, atorRh);
    idGeral = m.id;
    assert.equal(m.atorNome, rh.name);
    assert.equal(await montarObservacoes(colabAna.id, '2026-08'), 'TESTE-HOLERITE aviso geral');
    assert.equal(await montarObservacoes(colabBruno.id, '2026-09'), 'TESTE-HOLERITE aviso geral');
  });

  await teste('geral com competência sai só naquele mês', async () => {
    await criarMensagem({ escopo: 'GERAL', colaboradorId: null, competencia: '2026-09', texto: 'TESTE-HOLERITE só setembro' }, atorRh);
    assert.equal(await montarObservacoes(colabAna.id, '2026-09'), 'TESTE-HOLERITE aviso geral' + SEPARADOR_OBSERVACOES + 'TESTE-HOLERITE só setembro');
    assert.equal(await montarObservacoes(colabAna.id, '2026-08'), 'TESTE-HOLERITE aviso geral');
  });

  await teste('individual sai só para o colaborador escolhido, depois da geral', async () => {
    const m = await criarMensagem({ escopo: 'INDIVIDUAL', colaboradorId: colabAna.id, competencia: null, texto: 'TESTE-HOLERITE só Ana' }, atorRh);
    idIndividual = m.id;
    assert.equal(await montarObservacoes(colabAna.id, '2026-08'), 'TESTE-HOLERITE aviso geral' + SEPARADOR_OBSERVACOES + 'TESTE-HOLERITE só Ana');
    assert.equal(await montarObservacoes(colabBruno.id, '2026-08'), 'TESTE-HOLERITE aviso geral');
  });

  await teste('juntarObservacoes é pura: geral antes de individual, cada grupo na ordem de cadastro', () => {
    const base = { colaboradorId: null, competencia: null };
    const texto = juntarObservacoes([
      { id: '1', escopo: 'INDIVIDUAL', colaboradorId: 'ana', competencia: null, texto: 'ind1' },
      { id: '2', escopo: 'GERAL', ...base, texto: 'ger1' },
      { id: '3', escopo: 'GERAL', colaboradorId: null, competencia: '2026-01', texto: 'outro mês' },
      { id: '4', escopo: 'INDIVIDUAL', colaboradorId: 'bruno', competencia: null, texto: 'de outro' },
      { id: '5', escopo: 'GERAL', ...base, texto: 'ger2' },
    ], 'ana', '2026-08');
    assert.equal(texto, ['ger1', 'ger2', 'ind1'].join(SEPARADOR_OBSERVACOES));
    assert.equal(juntarObservacoes([], 'ana', '2026-08'), null);
  });

  await teste('o PDF do colaborador leva as observações dele', async () => {
    const h = await obterHoleriteAutorizado(idHoleriteAna, payload(ana));
    const com = await gerarPdf(h);
    assert.equal(com.subarray(0, 5).toString(), '%PDF-');
    await excluirMensagem(idIndividual);
    const sem = await gerarPdf(h);
    assert.ok(com.length > sem.length, 'com a mensagem individual o PDF é maior');
  });

  await teste('individual sem colaborador e colaborador inexistente são recusados', async () => {
    await esperaErro(() => criarMensagem({ escopo: 'INDIVIDUAL', colaboradorId: null, competencia: null, texto: 'TESTE-HOLERITE x' }, atorRh), HoleriteErro, 'colaborador');
    await esperaErro(() => criarMensagem({ escopo: 'INDIVIDUAL', colaboradorId: 'nao-existe', competencia: null, texto: 'TESTE-HOLERITE x' }, atorRh), HoleriteErro, 'não encontrado');
  });

  await teste('geral ignora colaborador informado por engano', async () => {
    const m = await criarMensagem({ escopo: 'GERAL', colaboradorId: colabBruno.id, competencia: '2026-07', texto: 'TESTE-HOLERITE julho' }, atorRh);
    assert.equal(m.colaboradorId, null);
  });

  await teste('editar troca texto e competência; excluir some; id inexistente dá 404', async () => {
    await atualizarMensagem(idGeral, { texto: 'TESTE-HOLERITE aviso geral editado', competencia: '2026-08' });
    assert.equal(await montarObservacoes(colabBruno.id, '2026-08'), 'TESTE-HOLERITE aviso geral editado');
    assert.equal(await montarObservacoes(colabBruno.id, '2026-09'), 'TESTE-HOLERITE só setembro');
    await excluirMensagem(idGeral);
    assert.equal(await montarObservacoes(colabBruno.id, '2026-08'), null);
    await esperaErro(() => excluirMensagem(idGeral), HoleriteErro, 'não encontrada');
    await esperaErro(() => atualizarMensagem('nao-existe', { texto: 'x', competencia: null }), HoleriteErro, 'não encontrada');
  });

  await teste('lista traz o colaborador e as competências vêm dos holerites importados', async () => {
    const lista = await listarMensagens();
    const minhas = lista.filter((m) => m.texto.startsWith('TESTE-HOLERITE'));
    assert.equal(minhas.length, 2, 'setembro e julho');
    assert.ok(minhas.every((m) => m.escopo === 'GERAL' && m.colaborador === null));
    const comps = await listarCompetencias();
    for (const c of ['2026-09', '2026-08', '2026-07', '2026-06', '2026-05']) assert.ok(comps.includes(c), `faltou ${c}`);
    assert.deepEqual([...comps].sort().reverse(), comps, 'mais recente primeiro');
  });

  await teste('reimportar a competência não apaga a mensagem', async () => {
    await importarArquivo(Buffer.from(fixture('092026'), 'latin1'), { arquivo: 'TESTE-HOLERITE-8.txt', origem: 'UPLOAD', ator });
    assert.equal(await montarObservacoes(colabAna.id, '2026-09'), 'TESTE-HOLERITE só setembro');
  });

  await teste('guarda de espaço: recusa a mensagem que não caberia na caixa de algum holerite', async () => {
    await prisma.holeriteMensagem.deleteMany({ where: { texto: { startsWith: 'TESTE-HOLERITE' } } });
    const frase = 'TESTE-HOLERITE lembramos que o recesso escolar começa em 15/10 e o adiantamento sai no dia 20. Dúvidas, procure o RH na secretaria. ';
    const cheia = frase.slice(0, LIMITE_MENSAGEM);
    assert.equal(cheia.length, LIMITE_MENSAGEM);
    await criarMensagem({ escopo: 'GERAL', colaboradorId: null, competencia: null, texto: cheia }, atorRh);
    await criarMensagem({ escopo: 'GERAL', colaboradorId: null, competencia: null, texto: cheia }, atorRh); // 2 × limite cabem
    await esperaErro(
      () => criarMensagem({ escopo: 'GERAL', colaboradorId: null, competencia: null, texto: cheia }, atorRh),
      HoleriteErro, 'Não cabe',
    );
    await esperaErro(
      () => criarMensagem({ escopo: 'INDIVIDUAL', colaboradorId: colabAna.id, competencia: '2026-08', texto: cheia }, atorRh),
      HoleriteErro, 'ficaria sem espaço',
    );
    // uma individual curta ainda entra; editá-la para o limite estoura e é recusada, e a original fica intacta
    const curta = await criarMensagem({ escopo: 'INDIVIDUAL', colaboradorId: colabAna.id, competencia: '2026-08', texto: 'TESTE-HOLERITE ok' }, atorRh);
    await esperaErro(() => atualizarMensagem(curta.id, { texto: cheia, competencia: '2026-08' }), HoleriteErro, 'Não cabe');
    const m = await prisma.holeriteMensagem.findUnique({ where: { id: curta.id } });
    assert.equal(m!.texto, 'TESTE-HOLERITE ok');
    // e o que está gravado sempre cabe no PDF real
    const h = await obterHoleriteAutorizado(idHoleriteAna, payload(ana));
    const pdf = await gerarPdf(h);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  });
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} TESTE(S) FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
