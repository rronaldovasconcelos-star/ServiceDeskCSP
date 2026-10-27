import { useEffect, useRef } from 'react';
import { openedForEdit, syncFile, type FileRecord } from '../lib/files';

const INTERVALO_MIN_MS = 5_000;

/**
 * Quando a janela do portal recupera o foco (o usuário voltou da aba do Google),
 * sincroniza cada arquivo aberto para edição nesta sessão e avisa quem mudou.
 */
export function useSyncOnFocus(onUpdated: (f: FileRecord) => void): void {
  const cb = useRef(onUpdated);
  useEffect(() => { cb.current = onUpdated; }, [onUpdated]);
  const ultimaSync = useRef(new Map<string, number>());

  useEffect(() => {
    let cancelado = false;
    async function sincronizar() {
      const agora = Date.now();
      for (const id of openedForEdit()) {
        if (agora - (ultimaSync.current.get(id) ?? 0) < INTERVALO_MIN_MS) continue;
        ultimaSync.current.set(id, agora);
        try {
          const r = await syncFile(id);
          if (!cancelado && r.changed) cb.current(r.file);
        } catch {
          // silencioso: o próximo foco tenta de novo
        }
      }
    }
    const onVisibilidade = () => { if (document.visibilityState === 'visible') void sincronizar(); };
    window.addEventListener('focus', sincronizar);
    document.addEventListener('visibilitychange', onVisibilidade);
    return () => {
      cancelado = true;
      window.removeEventListener('focus', sincronizar);
      document.removeEventListener('visibilitychange', onVisibilidade);
    };
  }, []);
}
