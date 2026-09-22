/**
 * Pré-visualiza um TXT de holerites sem passar pelo portal: lê o arquivo,
 * valida o layout e gera um PDF por colaborador na pasta de saída.
 *
 *   npx tsx scripts/holerite-preview.ts <arquivo.txt> [pasta-de-saida]
 *
 * Serve para conferir um arquivo novo da folha antes de importar, ou para
 * comparar o PDF gerado com o modelo da escola. Não grava nada no banco.
 * CPF/CTPS/admissão saem em branco (não vêm no TXT; no portal vêm do cadastro).
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { parseHolerites, HoleriteParseError } from '../src/modules/holerites/holerite.parser.js';
import { gerarHoleritePdf, formatarCentavos } from '../src/modules/holerites/holerite.pdf.js';
import { env } from '../src/config/env.js';

const [, , entrada, saida = 'holerites-preview'] = process.argv;
if (!entrada) {
  console.error('Uso: npx tsx scripts/holerite-preview.ts <arquivo.txt> [pasta-de-saida]');
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
    cargoCodigo: null,
    departamento: h.departamento,
    deptoCodigo: null,
    matricula: null,
    ctps: null,
    admissao: null,
    cpf: null,
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
  });
  const nome = `${h.competencia}_${h.colaboradorCodigo}.pdf`;
  fs.writeFileSync(path.join(saida, nome), pdf);
  console.log(`${nome}  ${h.colaboradorNome}  líquido ${formatarCentavos(h.liquido)}  (${h.verbas.length} verbas)`);
}

console.log(`\n${holerites.length} holerite(s) gerado(s) em ${path.resolve(saida)}`);
