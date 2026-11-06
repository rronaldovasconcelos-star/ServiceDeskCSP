/**
 * Leitura mínima de PDF assinado. Aqui só se DETECTA que existe uma assinatura
 * digital no arquivo; não se valida certificado nem integridade. Quem prova que a
 * assinatura vale é a gestão, no validador oficial (validar.iti.gov.br).
 */

const DICIONARIO_DE_ASSINATURA = /\/Type\s*\/Sig\b|\/SubFilter\s*\/(adbe\.pkcs7|ETSI\.CAdES|adbe\.x509)/;

/** Há um dicionário de assinatura (com /ByteRange) no PDF? */
export function temAssinaturaDigital(pdf: Buffer): boolean {
  const txt = pdf.toString('latin1');
  return txt.includes('/ByteRange') && DICIONARIO_DE_ASSINATURA.test(txt);
}

/**
 * Data que a assinatura mais recente declara (campo /M do dicionário). É um dado
 * escrito pelo programa que assinou, dentro do próprio arquivo: serve de
 * informação, não de prova. Devolve null se não achar ou não entender.
 */
export function dataDeclaradaNaAssinatura(pdf: Buffer): Date | null {
  const txt = pdf.toString('latin1');
  const pos = txt.lastIndexOf('/ByteRange');
  if (pos < 0) return null;
  const perto = txt.slice(Math.max(0, pos - 3000), pos + 3000);
  const m = /\/M\s*\(D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:([+\-Z])(?:(\d{2})'?(\d{2})?)?)?/.exec(perto);
  if (!m) return null;
  const [, ano, mes, dia, hora, min, seg, sinal, fh, fm] = m;
  const fuso = !sinal || sinal === 'Z' || !fh ? 'Z' : `${sinal}${fh}:${fm ?? '00'}`;
  const data = new Date(`${ano}-${mes}-${dia}T${hora}:${min}:${seg}${fuso}`);
  return Number.isNaN(data.getTime()) ? null : data;
}
