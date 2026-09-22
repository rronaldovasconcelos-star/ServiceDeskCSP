/**
 * Regras do módulo de holerites: importação do TXT, vínculo colaborador ↔ login,
 * consulta do próprio holerite e geração do PDF.
 *
 * Princípio: o TXT da folha é a fonte. Reimportar a mesma competência substitui
 * o holerite; o parser recusa o arquivo inteiro se algum bloco não fechar.
 */
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import type { AuthPayload } from '../../middlewares/authenticate.js';
import { parseHolerites, type HoleriteParseado, type HoleriteVerba } from './holerite.parser.js';
import { gerarHoleritePdf, formatarCompetencia, type DadosHoleritePdf } from './holerite.pdf.js';

export const MODULO_RH = 'rh';

/** Erro de negócio com status HTTP (o controller devolve a mensagem ao cliente). */
export class HoleriteErro extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'HoleriteErro';
  }
}

export interface Ator {
  id: string | null;
  nome: string;
}

export interface ResultadoImportacao {
  importacaoId: string;
  arquivo: string;
  origem: 'UPLOAD' | 'DRIVE';
  competencias: string[];
  totalHolerites: number;
  novosColaboradores: number;
  /** Colaboradores do arquivo que ainda não têm login vinculado (o RH precisa vincular). */
  semVinculo: Array<{ codigo: string; nome: string }>;
}

// ---------- importação ----------

export async function importarArquivo(
  buffer: Buffer,
  opts: { arquivo: string; origem: 'UPLOAD' | 'DRIVE'; driveFileId?: string; ator: Ator },
): Promise<ResultadoImportacao> {
  const holerites = parseHolerites(buffer); // lança HoleriteParseError

  // Um colaborador não pode aparecer duas vezes na mesma competência dentro do arquivo.
  const vistos = new Set<string>();
  for (const h of holerites) {
    const chave = `${h.colaboradorCodigo}|${h.competencia}`;
    if (vistos.has(chave)) {
      throw new HoleriteErro(`O arquivo traz o colaborador ${h.colaboradorCodigo} (${h.colaboradorNome}) duas vezes na competência ${formatarCompetencia(h.competencia)}.`);
    }
    vistos.add(chave);
  }

  if (opts.driveFileId) {
    const repetido = await prisma.holeriteImportacao.findUnique({ where: { driveFileId: opts.driveFileId } });
    if (repetido) throw new HoleriteErro(`O arquivo "${opts.arquivo}" já foi importado em ${repetido.createdAt.toLocaleString('pt-BR')}.`, 409);
  }

  const codigos = [...new Set(holerites.map((h) => h.colaboradorCodigo))];
  const existentes = await prisma.colaborador.findMany({ where: { codigo: { in: codigos } }, select: { codigo: true } });
  const jaExistiam = new Set(existentes.map((c) => c.codigo));
  const competencias = [...new Set(holerites.map((h) => h.competencia))].sort();

  const importacao = await prisma.$transaction(async (tx) => {
    const imp = await tx.holeriteImportacao.create({
      data: {
        arquivo: opts.arquivo,
        origem: opts.origem,
        driveFileId: opts.driveFileId ?? null,
        competencias: JSON.stringify(competencias),
        totalHolerites: holerites.length,
        novosColaboradores: codigos.length - jaExistiam.size,
        atorId: opts.ator.id,
        atorNome: opts.ator.nome,
      },
    });

    for (const h of holerites) {
      const colaborador = await tx.colaborador.upsert({
        where: { codigo: h.colaboradorCodigo },
        create: { codigo: h.colaboradorCodigo, nome: h.colaboradorNome },
        update: { nome: h.colaboradorNome },
      });

      const dados = paraRegistro(h, colaborador.id, imp.id);
      await tx.holerite.upsert({
        where: { colaboradorId_competencia: { colaboradorId: colaborador.id, competencia: h.competencia } },
        create: dados,
        update: dados,
      });
    }

    return imp;
  });

  const semVinculo = await prisma.colaborador.findMany({
    where: { codigo: { in: codigos }, userId: null },
    select: { codigo: true, nome: true },
    orderBy: { nome: 'asc' },
  });

  return {
    importacaoId: importacao.id,
    arquivo: opts.arquivo,
    origem: opts.origem,
    competencias,
    totalHolerites: holerites.length,
    novosColaboradores: importacao.novosColaboradores,
    semVinculo,
  };
}

function paraRegistro(h: HoleriteParseado, colaboradorId: string, importacaoId: string) {
  return {
    colaboradorId,
    competencia: h.competencia,
    empresaNome: h.empresaNome,
    empresaCnpj: h.empresaCnpj,
    departamento: h.departamento,
    cargo: h.cargo,
    salarioBase: h.salarioBase,
    verbas: JSON.stringify(h.verbas),
    totalVencimentos: h.totalVencimentos,
    totalDescontos: h.totalDescontos,
    liquido: h.liquido,
    dataGeracao: h.dataGeracao,
    baseInss: h.baseInss,
    baseFgts: h.baseFgts,
    baseIrrf: h.baseIrrf,
    fgtsMes: h.fgtsMes,
    faixaIrrf: h.faixaIrrf,
    importacaoId,
  };
}

// ---------- consulta do colaborador ----------

const resumoHolerite = {
  id: true,
  competencia: true,
  totalVencimentos: true,
  totalDescontos: true,
  liquido: true,
  dataGeracao: true,
  createdAt: true,
} as const;

export async function listarMeus(userId: string) {
  const colaborador = await prisma.colaborador.findUnique({
    where: { userId },
    select: {
      id: true,
      codigo: true,
      nome: true,
      holerites: { select: resumoHolerite, orderBy: { competencia: 'desc' } },
    },
  });
  if (!colaborador) return { vinculado: false as const, colaborador: null, holerites: [] };
  const { holerites, ...dados } = colaborador;
  return { vinculado: true as const, colaborador: dados, holerites };
}

/**
 * Carrega o holerite garantindo que quem pede pode vê-lo: o próprio colaborador
 * (login vinculado), um ADMIN ou quem tem o módulo RH liberado.
 */
export async function obterHoleriteAutorizado(id: string, user: AuthPayload) {
  const h = await prisma.holerite.findUnique({ where: { id }, include: { colaborador: true } });
  if (!h) throw new HoleriteErro('Holerite não encontrado.', 404);
  const ehRh = user.role === 'ADMIN' || (user.modules ?? []).includes(MODULO_RH);
  if (!ehRh && h.colaborador.userId !== user.sub) {
    throw new HoleriteErro('Acesso negado.', 403);
  }
  return h;
}

type HoleriteComColaborador = Awaited<ReturnType<typeof obterHoleriteAutorizado>>;

export function nomeArquivoPdf(h: HoleriteComColaborador): string {
  const nome = h.colaborador.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_');
  return `holerite_${h.competencia}_${nome}.pdf`;
}

export function gerarPdf(h: HoleriteComColaborador): Promise<Buffer> {
  const dados: DadosHoleritePdf = {
    empresaNome: env.holeriteEmpresaNome,
    empresaCnpj: h.empresaCnpj,
    empresaEndereco: env.holeriteEmpresaEndereco,
    competencia: h.competencia,
    colaboradorCodigo: h.colaborador.codigo,
    colaboradorNome: h.colaborador.nome,
    cargo: h.cargo,
    cargoCodigo: h.colaborador.cargoCodigo,
    departamento: h.departamento,
    deptoCodigo: h.colaborador.deptoCodigo,
    matricula: null,
    ctps: h.colaborador.ctps,
    admissao: h.colaborador.admissao,
    cpf: h.colaborador.cpf,
    verbas: JSON.parse(h.verbas) as HoleriteVerba[],
    totalVencimentos: h.totalVencimentos,
    totalDescontos: h.totalDescontos,
    liquido: h.liquido,
    salarioBase: h.salarioBase,
    baseInss: h.baseInss,
    baseFgts: h.baseFgts,
    baseIrrf: h.baseIrrf,
    fgtsMes: h.fgtsMes,
    faixaIrrf: h.faixaIrrf,
  };
  return gerarHoleritePdf(dados);
}

// ---------- RH ----------

export async function listarColaboradores() {
  const lista = await prisma.colaborador.findMany({
    orderBy: { nome: 'asc' },
    include: {
      user: { select: { id: true, name: true, email: true, isActive: true } },
      _count: { select: { holerites: true } },
      holerites: { select: { competencia: true }, orderBy: { competencia: 'desc' }, take: 1 },
    },
  });
  return lista.map(({ _count, holerites, ...c }) => ({
    ...c,
    totalHolerites: _count.holerites,
    ultimaCompetencia: holerites[0]?.competencia ?? null,
  }));
}

export async function vincularUsuario(colaboradorId: string, userId: string | null) {
  const colaborador = await prisma.colaborador.findUnique({ where: { id: colaboradorId } });
  if (!colaborador) throw new HoleriteErro('Colaborador não encontrado.', 404);

  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, colaborador: { select: { id: true, nome: true } } } });
    if (!user) throw new HoleriteErro('Usuário não encontrado.', 404);
    if (user.colaborador && user.colaborador.id !== colaboradorId) {
      throw new HoleriteErro(`O usuário ${user.name} já está vinculado ao colaborador ${user.colaborador.nome}. Desfaça esse vínculo primeiro.`, 409);
    }
  }

  return prisma.colaborador.update({
    where: { id: colaboradorId },
    data: { userId },
    include: { user: { select: { id: true, name: true, email: true, isActive: true } } },
  });
}

export interface DadosColaborador {
  cpf?: string | null;
  ctps?: string | null;
  admissao?: string | null;
  cargoCodigo?: string | null;
  deptoCodigo?: string | null;
}

export async function atualizarDados(colaboradorId: string, dados: DadosColaborador) {
  const existe = await prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { id: true } });
  if (!existe) throw new HoleriteErro('Colaborador não encontrado.', 404);
  const limpo = Object.fromEntries(
    Object.entries(dados).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() || null) : v]),
  );
  return prisma.colaborador.update({ where: { id: colaboradorId }, data: limpo });
}

export async function listarHoleritesDoColaborador(colaboradorId: string) {
  const c = await prisma.colaborador.findUnique({
    where: { id: colaboradorId },
    select: { id: true, codigo: true, nome: true, holerites: { select: resumoHolerite, orderBy: { competencia: 'desc' } } },
  });
  if (!c) throw new HoleriteErro('Colaborador não encontrado.', 404);
  return c;
}

export async function listarImportacoes(limite = 50) {
  const lista = await prisma.holeriteImportacao.findMany({ orderBy: { createdAt: 'desc' }, take: limite });
  return lista.map((i) => ({ ...i, competencias: JSON.parse(i.competencias) as string[] }));
}

/** Usuários ativos para o seletor de vínculo, com o colaborador já ligado (se houver). */
export async function listarUsuariosParaVinculo() {
  return prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, colaborador: { select: { id: true, codigo: true, nome: true } } },
    orderBy: { name: 'asc' },
  });
}
