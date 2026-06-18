/**
 * Armazenamento do token de sessão do portal.
 *
 * Usa `sessionStorage` (não `localStorage`) de propósito: a sessão morre ao
 * fechar a aba/o navegador. Isso é essencial em computadores compartilhados
 * (escola), evitando que a próxima pessoa que abrir o navegador caia já logada
 * na conta do usuário anterior.
 */
const KEY = 'token';

export function getToken(): string | null {
  return sessionStorage.getItem(KEY);
}

export function setToken(token: string): void {
  sessionStorage.setItem(KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(KEY);
  // Resquício de versões antigas que gravavam em localStorage: limpa também,
  // senão um token antigo persistente continuaria "vazando" a sessão.
  localStorage.removeItem(KEY);
}
