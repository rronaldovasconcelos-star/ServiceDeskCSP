/**
 * Pré-visualiza um TXT de holerites sem passar pelo portal: lê o arquivo,
 * valida o layout e gera um PDF por colaborador na pasta de saída.
 *
 *   npx tsx scripts/holerite-preview.ts <arquivo.txt> [pasta-de-saida] [--observacoes "texto"]
 *
 * Serve para conferir um arquivo novo da folha antes de importar, ou para
 * comparar o PDF gerado com o modelo da escola. Não grava nada no banco.
 * CPF/CTPS/admissão/códigos saem preenchidos se o TXT for do formato completo
 * (registros C/DP/DD/R); no formato antigo saem em branco (no portal vêm do cadastro).
 * `--observacoes` preenche a caixa de observações (no portal vem das mensagens do RH);
 * use "\n" no texto para separar mais de uma mensagem.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { parseHolerites, HoleriteParseError } from '../src/modules/holerites/holerite.parser.js';
import { gerarHoleritePdf, formatarCentavos } from '../src/modules/holerites/holerite.pdf.js';
import { env } from '../src/config/env.js';

const args = process.argv.slice(2);
const iObs = args.indexOf('--observacoes');
const observacoes = iObs >= 0 ? (args[iObs + 1] ?? '').replace(/\\n/g, '\n') : null;
if (iObs >= 0) args.splice(iObs, 2);
const [entrada, saida = 'holerites-preview'] = args;
if (!entrada) {
  console.error('Uso: npx tsx scripts/holerite-preview.ts <arquivo.txt> [pasta-de-saida] [--observacoes "texto"]');
  process.exit(2);
}

let holerites;
try {
  holerites = parseHolerites(fs.readFileSync(entrada));
} catch (err) {
  if (err instanceof HoleriteParseError) {
    console.error(`Arquivo recusado: ${err.message}`);
    process.exit(1);
  }
  throw err;
}

fs.mkdirSync(saida, { recursive: true });

for (const h of holerites) {
  const pdf = await gerarHoleritePdf({
    empresaNome: env.holeriteEmpresaNome,
    empresaCnpj: h.empresaCnpj,
    empresaEndereco: env.holeriteEmpresaEndereco,
    competencia: h.competencia,
    colaboradorCodigo: h.colaboradorCodigo,
    colaboradorNome: h.colaboradorNome,
    cargo: h.cargo,
    cargoCodigo: h.cargoCodigo,
    departamento: h.departamento,
    deptoCodigo: h.deptoCodigo,
    matricula: null,
    ctps: h.ctps,
    admissao: h.admissao,
    cpf: h.cpf,
    verbas: h.verbas,
    totalVencimentos: h.totalVencimentos,
    totalDescontos: h.totalDescontos,
    liquido: h.liquido,
    salarioBase: h.salarioBase,
    baseInss: h.baseInss,
    baseFgts: h.baseFgts,
    baseIrrf: h.baseIrrf,
    fgtsMes: h.fgtsMes,
    faixaIrrf: h.faixaIrrf,
    observacoes,
  });
  const nome = `${h.competencia}_${h.colaboradorCodigo}.pdf`;
  fs.writeFileSync(path.join(saida, nome), pdf);
  const extras = h.formato === 'C'
    ? `  CPF ${h.cpf ?? '-'}  CTPS ${h.ctps ?? '-'}  admissão ${h.admissao ?? '-'}  cargo ${h.cargoCodigo}  depto ${h.deptoCodigo}`
    : '  (formato antigo: sem CPF/CTPS/admissão)';
  console.log(`${nome}  ${h.colaboradorNome}  líquido ${formatarCentavos(h.liquido)}  (${h.verbas.length} verbas)${extras}`);
}

console.log(`\n${holerites.length} holerite(s) gerado(s) em ${path.resolve(saida)}`);
