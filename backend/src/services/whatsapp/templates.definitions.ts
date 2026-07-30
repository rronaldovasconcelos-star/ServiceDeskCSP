import { TEMPLATE_NAMES } from './templates.js';

/**
 * Definição dos templates como a Meta os recebe — **fonte única da verdade**.
 *
 * O script `npm run whatsapp:templates` cria/confere estes templates na WABA, e
 * `docs/whatsapp-cloud-api.md` reproduz os mesmos corpos para quem preferir
 * cadastrar pelo WhatsApp Manager. Ao mudar um corpo aqui, o template precisa ser
 * recriado na Meta (o texto de um template aprovado não é editável livremente) e
 * o construtor correspondente em `templates.ts` deve continuar mandando os
 * parâmetros na mesma ordem.
 *
 * Regras da Meta que os corpos abaixo respeitam:
 * - o texto não pode começar nem terminar com uma variável;
 * - as variáveis são numeradas em sequência a partir de {{1}};
 * - todo template com variável precisa de `example` para ser revisado.
 */

export interface TemplateDefinition {
  name: string;
  /** Corpo com as variáveis {{n}}. */
  body: string;
  /** Um exemplo por variável, na ordem — exigido pela Meta na revisão. */
  example: string[];
}

export const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    name: TEMPLATE_NAMES.chamadoAberto,
    body:
      'Seu chamado foi aberto com sucesso no Portal de Chamados.\n\n' +
      'Chamado: {{1}}\nCategoria: {{2}}\nUrgência: {{3}}\n\n' +
      'Você será avisado a cada atualização.',
    example: ['Impressora da secretaria travando', 'TI', 'ALTA'],
  },
  {
    name: TEMPLATE_NAMES.chamadoNovoGestor,
    body:
      'Um novo chamado foi aberto no Portal de Chamados.\n\n' +
      'Chamado: {{1}}\nCategoria: {{2}}\nUrgência: {{3}}\nSolicitante: {{4}}\n\n' +
      'Acesse o portal para atribuir um responsável.',
    example: ['Impressora da secretaria travando', 'TI', 'ALTA', 'Maria Silva'],
  },
  {
    name: TEMPLATE_NAMES.chamadoStatus,
    body: 'Houve uma atualização no seu chamado.\n\nChamado: {{1}}\nStatus: {{2}}\n\n{{3}}',
    example: ['Impressora da secretaria travando', 'Concluído', 'Qualquer dúvida, abra um novo chamado.'],
  },
  {
    name: TEMPLATE_NAMES.chamadoAtribuido,
    body:
      'Seu chamado teve o responsável atualizado.\n\n' +
      'Chamado: {{1}}\nResponsável: {{2}}\n\n' +
      'Acompanhe o andamento pelo portal.',
    example: ['Impressora da secretaria travando', 'Carlos Souza'],
  },
  {
    name: TEMPLATE_NAMES.chamadoComentario,
    body:
      'Há uma nova mensagem no seu chamado.\n\n' +
      'Chamado: {{1}}\nDe: {{2}}\nMensagem: {{3}}\n\n' +
      'Responda pelo portal.',
    example: ['Impressora da secretaria travando', 'Carlos Souza', 'Passamos aí ainda hoje.'],
  },
  {
    name: TEMPLATE_NAMES.lembreteMaterial,
    body:
      'Olá, {{1}}! Este é um lembrete do Portal de Chamados.\n\n' +
      'Consta que ainda não recebemos: {{2}}\n\n' +
      'Envie pelo portal, em "Meus Arquivos".',
    example: ['Maria', 'Plano de aula de Matemática — Fundamental I / 3º ano'],
  },
  {
    name: TEMPLATE_NAMES.codigoAcesso,
    body:
      'Seu código de acesso ao Portal de Chamados é {{1}}.\n\n' +
      'Ele expira em {{2}} minutos. Se você não solicitou, ignore esta mensagem.',
    example: ['123456', '10'],
  },
  {
    name: TEMPLATE_NAMES.avisoPortal,
    body:
      'Aviso do Portal de Chamados.\n\n' +
      'Assunto: {{1}}\nDetalhe: {{2}}\n\n' +
      'Acesse o portal para mais informações.',
    example: [
      'Novo pedido de suprimento',
      'Papel A4 (10 resmas) — urgência ALTA, solicitado por Maria Silva',
    ],
  },
];
