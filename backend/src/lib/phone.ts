/**
 * Normaliza um telefone brasileiro para o formato +55DDNNNNNNNNN.
 *
 * - Remove todos os caracteres não-dígitos.
 * - Se não começar com o DDI 55, prefixa 55.
 * - Valida o total de dígitos: 12 (fixo: 55 + DDD + 8) ou 13 (celular: 55 + DDD + 9).
 *
 * Retorna a string normalizada com "+" (ex: "+5531984367833") ou null se inválido.
 * O EvolutionProvider remove o "+" no envio, então armazenar com "+" é seguro.
 */
export function normalizeBrazilPhone(input: string | null | undefined): string | null {
  if (!input) return null;

  let digits = input.replace(/\D/g, '');
  if (!digits.startsWith('55')) {
    digits = '55' + digits;
  }

  // 55 (DDI) + 2 (DDD) + 8 ou 9 (número) = 12 ou 13 dígitos
  if (digits.length !== 12 && digits.length !== 13) {
    return null;
  }

  return '+' + digits;
}
