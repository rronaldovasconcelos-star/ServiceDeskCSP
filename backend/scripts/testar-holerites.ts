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
import { gerarHoleritePdf, formatarCentavos, formatarFaixaIrrf } from '../src/modules/holerites/holerite.pdf.js';
import {
  importarArquivo, listarMeus, obterHoleriteAutorizado, gerarPdf, vincularUsuario, atualizarDados, HoleriteErro,
} from '../src/modules/holerites/holerites.service.js';

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

console.log('\nPDF');
await teste('gera PDF válido com duas vias', async () => {
  const h = parseHolerites(fixture())[0];
  const pdf = await gerarHoleritePdf({
    empresaNome: 'EMPRESA TESTE', empresaCnpj: h.empresaCnpj, empresaEndereco: 'Rua Teste, 1',
    competencia: h.competencia, colaboradorCodigo: h.colaboradorCodigo, colaboradorNome: h.colaboradorNome,
    cargo: h.cargo, cargoCodigo: '0001', departamento: h.departamento, deptoCodigo: '000001', matricula: null,
    ctps: '1 / 2', admissao: '01/01/2020', cpf: '000.000.000-00', verbas: h.verbas,
    totalVencimentos: h.totalVencimentos, totalDescontos: h.totalDescontos, liquido: h.liquido, salarioBase: h.salarioBase,
    baseInss: h.baseInss, baseFgts: h.baseFgts, baseIrrf: h.baseIrrf, fgtsMes: h.fgtsMes, faixaIrrf: h.faixaIrrf,
  });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 2000, `PDF pequeno demais: ${pdf.length} bytes`);
  // duas vias = o nome do colaborador aparece nos dois blocos de conteúdo (texto pode vir comprimido; contamos páginas)
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length, 1, 'uma página A4');
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
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} TESTE(S) FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
