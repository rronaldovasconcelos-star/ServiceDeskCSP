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
import { gerarHoleritePdf, formatarCompetencia, caberObservacoes, type DadosHoleritePdf } from './holerite.pdf.js';

export const MODULO_RH = 'rh';

/**
 * Máximo de caracteres por mensagem do RH. A caixa de observações do PDF é fixa
 * (30 pt de altura, ~270 caracteres corridos em 6 pt); uma geral + uma
 * individual neste limite cabem. Além do limite, `garantirQueCabe` mede o texto
 * final de cada holerite afetado e recusa a mensagem que não couber.
 */
export const LIMITE_MENSAGEM = 120;
/** Separa as mensagens dentro da caixa (texto corrido, para não desperdiçar linha). */
export const SEPARADOR_OBSERVACOES = ' · ';

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
      // Dados do colaborador que o export completo traz (CPF, CTPS, admissão,
      // códigos). Só entram quando vêm preenchidos: o formato antigo não os tem
      // e não pode apagar o que um arquivo completo (ou o RH) já gravou.
      const dadosColaborador = Object.fromEntries(
        Object.entries({ cpf: h.cpf, ctps: h.ctps, admissao: h.admissao, cargoCodigo: h.cargoCodigo, deptoCodigo: h.deptoCodigo })
          .filter(([, v]) => v !== null),
      ) as Partial<Record<'cpf' | 'ctps' | 'admissao' | 'cargoCodigo' | 'deptoCodigo', string>>;

      const colaborador = await tx.colaborador.upsert({
        where: { codigo: h.colaboradorCodigo },
        create: { codigo: h.colaboradorCodigo, nome: h.colaboradorNome, ...dadosColaborador },
        update: { nome: h.colaboradorNome, ...dadosColaborador },
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

export async function gerarPdf(h: HoleriteComColaborador): Promise<Buffer> {
  const dados: DadosHoleritePdf = {
    observacoes: await montarObservacoes(h.colaboradorId, h.competencia),
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

// ---------- mensagens do RH (campo "Observações" do PDF) ----------

export type EscopoMensagem = 'GERAL' | 'INDIVIDUAL';

export interface DadosMensagem {
  escopo: EscopoMensagem;
  colaboradorId: string | null;
  competencia: string | null; // "2026-08" ou null = todos os meses
  texto: string;
}

const mensagemComColaborador = {
  include: { colaborador: { select: { id: true, codigo: true, nome: true } } },
} as const;

function validarTexto(texto: string): string {
  const limpo = texto.trim();
  if (!limpo) throw new HoleriteErro('Escreva a mensagem.');
  if (limpo.length > LIMITE_MENSAGEM) throw new HoleriteErro(`A mensagem pode ter no máximo ${LIMITE_MENSAGEM} caracteres.`);
  return limpo;
}

function validarCompetencia(competencia: string | null | undefined): string | null {
  const c = competencia?.trim() || null;
  if (c !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(c)) throw new HoleriteErro('Competência inválida (use aaaa-mm).');
  return c;
}

export async function listarMensagens() {
  return prisma.holeriteMensagem.findMany({ ...mensagemComColaborador, orderBy: { createdAt: 'desc' } });
}

/** Competências que já têm holerite importado, da mais recente para a mais antiga. */
export async function listarCompetencias(): Promise<string[]> {
  const linhas = await prisma.holerite.findMany({ distinct: ['competencia'], select: { competencia: true }, orderBy: { competencia: 'desc' } });
  return linhas.map((l) => l.competencia);
}

interface MensagemBase {
  id: string;
  escopo: string;
  colaboradorId: string | null;
  competencia: string | null;
  texto: string;
}

/** Une, em ordem, as mensagens que valem para um colaborador numa competência (pura). */
export function juntarObservacoes(mensagens: MensagemBase[], colaboradorId: string, competencia: string): string | null {
  const valem = mensagens.filter((m) =>
    (m.competencia === null || m.competencia === competencia)
    && (m.escopo === 'GERAL' || (m.escopo === 'INDIVIDUAL' && m.colaboradorId === colaboradorId)));
  if (valem.length === 0) return null;
  const gerais = valem.filter((m) => m.escopo === 'GERAL').map((m) => m.texto);
  const individuais = valem.filter((m) => m.escopo === 'INDIVIDUAL').map((m) => m.texto);
  return [...gerais, ...individuais].join(SEPARADOR_OBSERVACOES);
}

/**
 * Guarda determinística: mede o texto final de cada holerite que a mensagem
 * alcança (com as mensagens já cadastradas) e recusa se em algum deles a caixa
 * do PDF não comportar tudo. Assim nenhuma observação sai cortada.
 */
async function garantirQueCabe(candidata: MensagemBase): Promise<void> {
  const existentes = await prisma.holeriteMensagem.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, escopo: true, colaboradorId: true, competencia: true, texto: true },
  });
  // edição mantém a posição original; criação entra por último
  const posicao = existentes.findIndex((m) => m.id === candidata.id);
  const todas = posicao >= 0
    ? existentes.map((m, i) => (i === posicao ? candidata : m))
    : [...existentes, candidata];

  const competencias = candidata.competencia ? [candidata.competencia] : await listarCompetencias();
  if (competencias.length === 0) competencias.push('0000-00'); // ainda sem holerite: confere só as mensagens sem mês
  const colaboradores = candidata.escopo === 'INDIVIDUAL'
    ? await prisma.colaborador.findMany({ where: { id: candidata.colaboradorId! }, select: { id: true, nome: true } })
    : await prisma.colaborador.findMany({ select: { id: true, nome: true } });
  if (colaboradores.length === 0) colaboradores.push({ id: '-', nome: 'qualquer colaborador' });

  for (const c of colaboradores) {
    for (const comp of competencias) {
      const texto = juntarObservacoes(todas, c.id, comp);
      if (texto && !caberObservacoes(texto)) {
        const quando = comp === '0000-00' ? '' : ` (${formatarCompetencia(comp)})`;
        throw new HoleriteErro(`Não cabe: junto com as mensagens já cadastradas, o holerite de ${c.nome}${quando} ficaria sem espaço na caixa de observações. Encurte o texto ou exclua outra mensagem.`, 422);
      }
    }
  }
}

export async function criarMensagem(d: DadosMensagem, ator: Ator) {
  const texto = validarTexto(d.texto);
  const competencia = validarCompetencia(d.competencia);

  let colaboradorId: string | null = null;
  if (d.escopo === 'INDIVIDUAL') {
    if (!d.colaboradorId) throw new HoleriteErro('Escolha o colaborador da mensagem individual.');
    const existe = await prisma.colaborador.findUnique({ where: { id: d.colaboradorId }, select: { id: true } });
    if (!existe) throw new HoleriteErro('Colaborador não encontrado.', 404);
    colaboradorId = existe.id;
  } else if (d.escopo !== 'GERAL') {
    throw new HoleriteErro('Escopo inválido.');
  }

  await garantirQueCabe({ id: '', escopo: d.escopo, colaboradorId, competencia, texto });

  return prisma.holeriteMensagem.create({
    data: { escopo: d.escopo, colaboradorId, competencia, texto, atorId: ator.id, atorNome: ator.nome },
    ...mensagemComColaborador,
  });
}

export async function atualizarMensagem(id: string, d: { texto: string; competencia: string | null }) {
  const atual = await prisma.holeriteMensagem.findUnique({ where: { id }, select: { id: true, escopo: true, colaboradorId: true } });
  if (!atual) throw new HoleriteErro('Mensagem não encontrada.', 404);
  const texto = validarTexto(d.texto);
  const competencia = validarCompetencia(d.competencia);

  await garantirQueCabe({ ...atual, competencia, texto });

  return prisma.holeriteMensagem.update({
    where: { id },
    data: { texto, competencia },
    ...mensagemComColaborador,
  });
}

export async function excluirMensagem(id: string) {
  const existe = await prisma.holeriteMensagem.findUnique({ where: { id }, select: { id: true } });
  if (!existe) throw new HoleriteErro('Mensagem não encontrada.', 404);
  await prisma.holeriteMensagem.delete({ where: { id } });
}

/**
 * Texto que vai na caixa "Observações" do holerite de um colaborador numa
 * competência: as gerais (do mês ou sem mês) e depois as individuais dele,
 * cada grupo da mais antiga para a mais nova. Null se não há nenhuma.
 */
export async function montarObservacoes(colaboradorId: string, competencia: string): Promise<string | null> {
  const mensagens = await prisma.holeriteMensagem.findMany({
    where: {
      AND: [
        { OR: [{ competencia }, { competencia: null }] },
        { OR: [{ escopo: 'GERAL' }, { escopo: 'INDIVIDUAL', colaboradorId }] },
      ],
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, escopo: true, colaboradorId: true, competencia: true, texto: true },
  });
  return juntarObservacoes(mensagens, colaboradorId, competencia);
}
