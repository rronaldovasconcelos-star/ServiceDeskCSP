import { WhatsAppMessage } from './types.js';

/**
 * Catálogo das mensagens iniciadas pelo portal.
 *
 * Cada função devolve a mensagem nas duas formas: o `text` (canal Baileys, com
 * formatação livre) e o `template` equivalente aprovado na Meta (Cloud API).
 * O corpo fixo de cada template está em `docs/whatsapp-cloud-api.md` — é ele
 * que deve ser colado no WhatsApp Manager. **Ao mudar a ordem ou a quantidade
 * de variáveis aqui, o template precisa ser reenviado para aprovação.**
 *
 * Convenção de nomes: prefixo `csp_` para não colidir com templates de outros
 * projetos que venham a usar a mesma WABA.
 */

export const TEMPLATE_NAMES = {
  chamadoAberto: 'csp_chamado_aberto',
  chamadoNovoGestor: 'csp_chamado_novo_gestor',
  chamadoStatus: 'csp_chamado_status',
  chamadoAtribuido: 'csp_chamado_atribuido',
  chamadoComentario: 'csp_chamado_comentario',
  lembreteMaterial: 'csp_lembrete_material',
  codigoAcesso: 'csp_codigo_acesso',
  avisoPortal: 'csp_aviso_portal',
} as const;

/**
 * Aviso genérico do portal (assunto + detalhe). Cobre os avisos operacionais de
 * baixo volume — suprimentos, manutenção programada, cadastro pendente — sem
 * precisar de um template dedicado para cada um. `detalhe` é achatado em uma
 * linha pelo provider.
 */
export function tplAvisoPortal(text: string, assunto: string, detalhe: string): WhatsAppMessage {
  return {
    text,
    template: { name: TEMPLATE_NAMES.avisoPortal, params: [assunto, detalhe] },
  };
}

/** Confirmação de abertura para o solicitante. */
export function tplChamadoAberto(title: string, category: string, urgency: string): WhatsAppMessage {
  return {
    text:
      `📋 Seu chamado foi aberto com sucesso!\n*${title}*\n` +
      `Categoria: ${category}\nUrgência: ${urgency}\nVocê será avisado a cada atualização.`,
    template: { name: TEMPLATE_NAMES.chamadoAberto, params: [title, category, urgency] },
  };
}

/** Alerta de novo chamado para admins/gestores. */
export function tplChamadoNovoGestor(
  title: string,
  category: string,
  urgency: string,
  requesterName: string,
): WhatsAppMessage {
  return {
    text:
      `📋 Novo chamado aberto!\n*${title}*\n` +
      `Categoria: ${category}\nUrgência: ${urgency}\nSolicitante: ${requesterName}`,
    template: {
      name: TEMPLATE_NAMES.chamadoNovoGestor,
      params: [title, category, urgency, requesterName],
    },
  };
}

/** Mudança de status do chamado. */
export function tplChamadoStatus(
  title: string,
  statusLabel: string,
  icon: string,
  detail: string,
): WhatsAppMessage {
  return {
    text: `${icon} Status do seu chamado: *${statusLabel}*\n*${title}*${detail ? `\n${detail}` : ''}`,
    // O template não tem ícone (emoji varia por status e não cabe em corpo fixo
    // aprovado); o detalhe vira variável, com um fallback para não ir vazio —
    // a Meta rejeita parâmetro em branco.
    template: {
      name: TEMPLATE_NAMES.chamadoStatus,
      params: [title, statusLabel, detail || 'Acompanhe pelo portal.'],
    },
  };
}

/** Atribuição (ou remoção) de responsável. */
export function tplChamadoAtribuido(title: string, assigneeName: string | null | undefined): WhatsAppMessage {
  return {
    text: assigneeName
      ? `👤 Seu chamado foi atribuído a *${assigneeName}*.\n*${title}*`
      : `👤 O responsável pelo seu chamado foi removido.\n*${title}*`,
    template: {
      name: TEMPLATE_NAMES.chamadoAtribuido,
      params: [title, assigneeName || 'ainda não definido'],
    },
  };
}

/** Novo comentário no chamado. */
export function tplChamadoComentario(title: string, authorName: string, snippet: string): WhatsAppMessage {
  return {
    text: `💬 Nova mensagem no chamado:\n*${title}*\n${authorName}: ${snippet}`,
    template: { name: TEMPLATE_NAMES.chamadoComentario, params: [title, authorName, snippet] },
  };
}

/**
 * Lembrete de material (envio em lote). `body` é a mensagem montada pelo
 * módulo de lembretes; vira uma única variável, achatada em uma linha pelo
 * provider.
 */
export function lembreteMaterial(text: string, teacherName: string, summary: string): WhatsAppMessage {
  return {
    text,
    template: { name: TEMPLATE_NAMES.lembreteMaterial, params: [teacherName, summary] },
  };
}

/** Código de acesso (OTP de cadastro / redefinição de senha). */
export function tplCodigoAcesso(code: string, minutes: number): WhatsAppMessage {
  return {
    text: `🔐 Seu código de acesso ao Portal de Chamados é *${code}*.\nEle expira em ${minutes} minutos.`,
    // Templates de categoria AUTHENTICATION usam um formato próprio na Meta,
    // com o código no corpo e botão de copiar. Mantido como UTILITY com duas
    // variáveis para não depender da aprovação especial de autenticação.
    template: { name: TEMPLATE_NAMES.codigoAcesso, params: [code, String(minutes)] },
  };
}
