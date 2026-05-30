/**
 * Script de autorização única para o Google Drive.
 * Execução: npx tsx scripts/google-drive-auth.ts
 *
 * Pré-requisitos:
 *   1. GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET no .env
 *   2. http://localhost:3030 adicionado como URI de redirecionamento autorizado
 *      no Google Cloud Console → Credenciais → csp-desktop → Editar
 */
import 'dotenv/config';
import http from 'node:http';
import { google } from 'googleapis';

const PORT = 3030;
const REDIRECT_URI = `http://localhost:${PORT}`;

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('❌  Defina GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET no .env antes de rodar este script.');
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/drive'],
  prompt: 'consent', // garante que o refresh_token seja retornado sempre
});

console.log('\n🔗  Abra esta URL no navegador e autorize o acesso ao Google Drive:\n');
console.log(authUrl);
console.log('\n⏳  Aguardando autorização em http://localhost:3030 ...\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>❌ Erro: ${error}</h1><p>Tente novamente.</p>`);
    server.close();
    console.error('❌  Autorização negada:', error);
    return;
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Erro: código não recebido</h1>');
    return;
  }

  try {
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>✅ Autorizado com sucesso!</h1><p>Pode fechar esta aba e voltar ao terminal.</p>');
    server.close();

    if (!tokens.refresh_token) {
      console.error('\n⚠️  Refresh token não recebido. Revogue o acesso em myaccount.google.com/permissions e execute o script novamente.');
      process.exit(1);
    }

    // Salva o token em arquivo para não perder mesmo se o terminal fechar
    const fs = await import('node:fs/promises');
    await fs.writeFile('credentials/google-oauth-token.txt', tokens.refresh_token, 'utf-8');

    console.log('\n✅  Autorização concluída! Token salvo em credentials/google-oauth-token.txt');
    console.log('\nAdicione a linha abaixo ao seu .env:\n');
    console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\n');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>❌ Erro ao obter token</h1>');
    console.error('❌  Erro ao trocar código pelo token:', err);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`[auth] Servidor rodando em ${REDIRECT_URI} — aguardando callback do Google...\n`);
});
