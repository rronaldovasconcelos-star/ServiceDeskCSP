/**
 * Importação automática: a cada N minutos olha a pasta "Holerites" do Drive e
 * importa os TXT que ainda não entraram. Desligado quando o Drive não está
 * configurado ou HOLERITE_DRIVE_INTERVAL_MIN=0.
 */
import { env } from '../../config/env.js';
import { isHoleriteDriveConfigured, importarNovosDoDrive } from './holerites.drive.js';

const ATOR_AGENDADOR = { id: null, nome: 'Importação automática (Drive)' };
let rodando = false;

export async function rodarImportacaoAgendada(): Promise<void> {
  if (rodando) return; // não sobrepõe execuções
  rodando = true;
  try {
    const r = await importarNovosDoDrive(ATOR_AGENDADOR);
    if (r.importados.length || r.erros.length) {
      console.log(`[holerites] Drive: ${r.importados.length} arquivo(s) importado(s), ${r.erros.length} com erro, ${r.ignorados} já importado(s).`);
      for (const e of r.erros) console.warn(`[holerites] ${e.arquivo}: ${e.erro}`);
    }
  } catch (err) {
    console.error('[holerites] Falha ao consultar o Drive:', err instanceof Error ? err.message : err);
  } finally {
    rodando = false;
  }
}

export function initHoleriteScheduler(): void {
  if (!isHoleriteDriveConfigured()) {
    console.log('[holerites] Importação automática desligada (Google Drive não configurado).');
    return;
  }
  const minutos = env.holeriteDriveIntervalMin;
  if (!minutos || minutos <= 0) {
    console.log('[holerites] Importação automática desligada (HOLERITE_DRIVE_INTERVAL_MIN=0).');
    return;
  }
  console.log(`[holerites] Importação automática do Drive a cada ${minutos} min (pasta "${env.holeriteDriveFolder}").`);
  // Primeira rodada 1 min após subir (dá tempo do serviço estabilizar), depois no intervalo.
  setTimeout(() => void rodarImportacaoAgendada(), 60_000);
  setInterval(() => void rodarImportacaoAgendada(), minutos * 60_000);
}
