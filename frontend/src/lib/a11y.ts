import type { KeyboardEvent } from 'react';

/**
 * Navegação por teclado em abas de ativação automática (padrão WAI-ARIA "Tabs").
 *
 * Use no container `role="tablist"`: `<div role="tablist" onKeyDown={onTabsKeyDown}>`.
 * Setas ← / → movem o foco entre os `[role="tab"]` irmãos (circular);
 * Home / End vão para a primeira / última aba. Como as abas são de ativação
 * automática, o alvo recebe `click()` e a página troca o painel na hora.
 * Só a aba ativa fica com `tabIndex=0`; as demais usam `-1` — por isso
 * a troca de foco precisa ser feita aqui, e não pelo Tab do navegador.
 */
export function onTabsKeyDown(e: KeyboardEvent<HTMLElement>) {
  const teclas = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!teclas.includes(e.key)) return;

  const lista = (e.target as HTMLElement).closest('[role="tablist"]');
  if (!lista) return;
  const abas = Array.from(lista.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])'));
  if (abas.length === 0) return;

  const atual = abas.indexOf(e.target as HTMLElement);
  let alvo: number;
  if (e.key === 'Home') alvo = 0;
  else if (e.key === 'End') alvo = abas.length - 1;
  else if (e.key === 'ArrowLeft') alvo = atual <= 0 ? abas.length - 1 : atual - 1;
  else alvo = atual >= abas.length - 1 ? 0 : atual + 1;

  e.preventDefault();
  abas[alvo].focus();
  abas[alvo].click();
}
