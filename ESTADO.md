# ESTADO — Portal de Chamados (Service Desk CSP)

Handoff entre PCs. Atualizado em 27/10/2026 (noite).

## O que é

Portal de Chamados do Colégio Santa Paula (servicedeskcsp.com.br): chamados,
suprimentos, repositório de arquivos, lembretes, bot de WhatsApp e, desde
22/09/2026, **holerites** (o colaborador baixa o próprio demonstrativo de
pagamento). Backend Node/Express + Prisma/SQLite no VPS; frontend React/Vite na
hospedagem Hostinger.

## Onde está

- Repositório privado: `rronaldovasconcelos-star/ServiceDeskCSP`, branch `main`.
- PC rrona: `Desktop\CSP - Colégio Santa Paula\ATENDIMENTO CSP` (tem o `.deploy.env`).
- PC franc: `Desktop\ServiceDeskCSP` (clone de 22/09/2026; `.deploy.env` criado em
  23/09 com o token da Hostinger).
- **27/10/2026 (noite, rrona): clone sincronizado com o GitHub.** O rrona tinha 3 commits
  da migração para a Cloud API (30/07/2026: `CloudApiProvider`, `templates.ts`,
  `bot.cloudWebhook.ts`, `docs/whatsapp-cloud-api.md`, ~1.400 linhas) que NUNCA haviam
  subido — o histórico reescrito em 23/09 no franc nasceu sem eles. Foram rebaseados em
  cima do `main` atual sem conflito e enviados (`4af4c9e`, `8c20543`, `4a85486`); backup
  local em `backup/cloud-api-local-20261027`. Guardas no rrona depois disso: `tsc` do
  backend (após `prisma generate`) e do frontend em 0 erros, eslint nos 37 de baseline,
  `vite build` OK. No franc: `git pull` antes de continuar.

## 30/10/2026 (franc) — conferências OK e auditoria de segurança (aguardando decisão)

Ronaldo confirmou: visual no celular OK e edição de arquivos OK. Auditoria do backend:
já corrigidos no código (JWT_SECRET obrigatório em prod, CORS por allowlist — provado em
produção, rate-limit 20/15 min no `/auth`, seed recusa `Admin@123` em prod, OTP com 5
tentativas). Achados (decisão dele 30/10: corrigir TODOS; dono do chamado SÓ cancela) — **CORRIGIDOS no commit `9018993`, DEPLOY PENDENTE** (auto mode barrou; ele roda `update.py` e `deploy_hostinger.py` com `!`). Teste `backend/scripts/testar-seguranca-http.ts` (19 casos, vermelho antes / verde depois, mutação de cada guarda sozinha volta a vermelho; rodar também com `NODE_ENV=production` p/ o caso de CORS). Frontend ganhou o botão "Cancelar chamado" para o dono. `update.py` agora usa `--remove-orphans` (derruba o csp-frontend). Limite que ficou: o link do Word (token DAV de 12 h por arquivo) não reconfere se a conta foi desativada. Achados:
- A. `PATCH /tickets/:id/status` não confere o dono do chamado (só aprovar/rejeitar exige ADMIN/GESTOR).
- B. Quem tem o módulo `users` sem ser ADMIN pode trocar e-mail/senha, desativar ou apagar um ADMIN.
- C. `authenticate` confia só no JWT: desativado/apagado/módulo retirado segue com acesso até 8 h.
- D. `start.sh` cria `admin@santiagopaula.com.br` / `Admin@123` se o banco estiver vazio.
- E. API sem cabeçalhos de segurança (`X-Powered-By` exposto), site sem HSTS; CORS recusado vira 500.
- F. Container `csp-frontend` antigo ainda roda no VPS.
Provado em produção (30/10): `Admin@123` NÃO entra em `admin@santiagopaula.com.br` nem em `admin@santapaula.com.br` (401 nos dois).
## Onde parou (28/10/2026, 14h40, franc) — "CENTRAL DE SUPORTE" EM PRODUÇÃO

**Publicado em 28/10/2026 ~14h35 com autorização dele ("pode por em produção"), provado pelo que o
site serve:** `index.html` referencia `index-B0HRTood.js` + `index-BuVvYvcB.css` (= build local) e
carrega Montserrat + Open Sans; o JS tem "Orbit Lab", "Suporte para quem faz a escola acontecer",
"Como podemos ajudar", a URL da API e o Client ID do Google, e NÃO tem "Agente IA", "Bot de
suporte" nem `whatsapp-suporte`; o CSS tem `#001d7e`; `login-foto{,-m}.webp/.jpg` 200; `/login`
200 (SPA); `api/health` 200. Backend atualizado pelo `update.py` (chave SSH, containers
`csp-backend`/`csp-frontend` rebuildados) com o catálogo de módulos sem `agente` e `bot`.
`main` = `95a2104` (merge de `visual-central-suporte`); tag de rollback do visual anterior:
`visual-telehap-final`; tag deste: `visual-central-suporte-v1`. Quem vir o visual antigo:
Ctrl+Shift+R. O token da Hostinger no `.deploy.env` do franc está VÁLIDO (o do rrona, não).

**28/10 ~15h (franc) — bot e agente APAGADOS do backend (commit `fb7a12b`, NO GITHUB, FALTA O
`update.py`):** saíram `modules/bot`, `modules/bot-bridge`, `modules/agent`, `services/ai/claude.ts`,
os scripts `setup-bot-webhook.ts`/`test-bot-local.ts`, as variáveis `BOT_*`, `AGENT_ADMIN_*`, `LIZ_*`,
`SUPPORT_EVOLUTION_INSTANCE`, `ANTHROPIC_*` (env.ts, .env.example, docker-compose) e a rede
`agente-pessoal-net` do compose; `express.json()` voltou a ser simples (o rawBody era só para o HMAC
da Meta). Migration `20261028150000_drop_bot_session` apaga a tabela `BotSession` (o `start.sh` roda
`migrate deploy` ao subir). Guardas: tsc 0; testes DAV (HTTP), edição de arquivos e holerites todos
verdes; migration aplicada no dev.db local. **EM PRODUÇÃO desde 28/10 ~15h20** (ele rodou o `update.py` com `!`; a 1ª rodada FALHOU porque o
script enviava por cima e as pastas apagadas continuavam no VPS → `update.py` agora apaga
`backend/src`, `backend/scripts`, `frontend/src`, `frontend/public` antes de extrair e sai com erro
se o servidor devolver ≠ 0, commit `8559a68`). Provado por HTTP: `api/health` 200;
`/api/bot/webhook/x`, `/api/bot-bridge/x/ping`, `/api/agent/config` 404; `/api/whatsapp/status`
401 (segue exigindo token). O build no VPS passou, logo as pastas antigas foram embora; a
migration roda no `start.sh` e o container está saudável (leitura do log por SSH foi barrada
pelo auto mode, então isso é inferido, não lido).

**Próximos passos possíveis:** avisar os usuários do visual novo; conferir no celular dele.

## Estado anterior (28/10/2026, 00h10, rrona) — REDESENHO VISUAL "Telehap" EM PRODUÇÃO

**Publicado em 28/10/2026 ~00h05, provado pelo que o site serve:** `index.html` referencia
`index-DFb6NHg5.js` + `index-8bZfXKiw.css` (= build local); o CSS tem Poppins, `--navy`,
`page-hero` e `.tabs`; o JS tem a URL da API, o Client ID do Google, "Nova manutenção",
"RH · Holerites" e "Abrir no"; `blob.svg` 200; `/repositorio` 200 (SPA); `api/health` 200.
Backend não mudou. Quem vir o visual antigo: Ctrl+Shift+R.
**Como saiu:** `deploy_hostinger.py` fez o build e o zip, mas o `HOSTINGER_API_TOKEN` do
`.deploy.env` do rrona está EXPIRADO (401 Unauthenticated) → o mesmo zip foi publicado pelo
MCP da Hostinger (`hosting_deployStaticWebsite`, credencial própria). Para voltar a usar o
script: gerar token novo no hpanel e trocar no `.deploy.env`. O script só precisa da
biblioteca padrão (qualquer Python serve); o Client ID vem de `frontend/.env` neste PC
(exportar `VITE_GOOGLE_CLIENT_ID` antes de rodar, ou copiá-lo para o `.deploy.env`).

## Estado anterior (27/10/2026, noite, rrona) — REDESENHO VISUAL "Telehap" COMPLETO NO GIT

Pedido do Ronaldo: trocar a cara do portal pelo estilo do kit **Telehap – Call Center &
Customer Support** (TemplateMonster 568094). Plano aprovado e salvo em
`C:/Users/franc/.claude/plans/https-demo-templatemonster-com-pt-br-dem-cozy-bee.md`
(direção "moldura Telehap, miolo claro": sidebar/topo/login/faixa de cabeçalho em
azul-marinho com forma orgânica azul-elétrica e botões-pílula; áreas de dados claras;
fonte Poppins; tokens em `frontend/src/index.css`). **O visual novo está SÓ no git; o site
em produção continua com o visual antigo até o próximo `deploy_hostinger.py`.**

**Feito (commits `294cfbc`, `6bc4892` e o da fase 4 final):**
- Fase 1 — tokens novos no `index.css` (nomes antigos viraram aliases), Poppins no
  `index.html`, tema persistido no `localStorage` (`ThemeContext`), `App.css` morto apagado.
- Fase 2 — `Layout.tsx` (sidebar navy 232 px com tiles de ícone, item ativo em pílula),
  `components/PageHeader.tsx` (faixa navy + `public/blob.svg`), `components/ui/`
  (`Button`, `Card`, `IconTile`, `Modal`, `Table`), `StatusBadge` por classes `.pill-*`.
- Fase 3 — `components/AuthShell.tsx` (casca dividida) + Login/Register/Reset;
  Dashboard com tiles e paleta nos gráficos. Conferido no Chrome local nos dois temas.
- Fase 4 (COMPLETA em 27/10 à noite, no rrona) — TODAS as páginas em
  `PageHeader`/`Card`/`Table`/`Button`/`Modal`, abas em `.tabs/.tab` (classe nova no
  `index.css`), KPIs em `.kpi-card` + `IconTile`, pílulas `.pill-*`; **zero hex em
  `frontend/src/*.ts(x)`** (`grep -rn "#[0-9a-fA-F]\{3,6\}" src --include=*.tsx` vazio).
  Nesta rodada: Repositório, Usuários, Manutenções, Lembretes, Relatórios, RH · Holerites,
  WhatsApp, Agente; componentes KanbanBoard, FileUploader, FilePreviewModal (segue modal
  próprio de 90vh), FileActionButtons, FilesTreeView, MapaBairros (cor do Leaflet lida de
  `--violet` por `getComputedStyle`), DevCredit, AuthShell. Modais à mão viraram `<Modal>`
  (Esc e scroll-lock pelo componente). Lógica, rotas e API intocadas.

**Guardas depois da fase 4:** `npx tsc --noEmit -p tsconfig.app.json` 0 erros; `npx eslint
src` nos **37 problemas de baseline** (nenhum novo); `npx vite build` OK.
**Conferido no Chrome local em 27/10 à noite (rrona), as 8 páginas da fase 4:** Repositório,
Usuários, Manutenções, Lembretes, Relatórios, RH · Holerites, WhatsApp e Agente. Em cada uma,
auditoria por DOM (faixa navy presente, 0 tabela fora do `.table-wrap`, 0 botão sem `.btn/.tab`,
0 hex inline, 0 input sem `.field`, sem estouro horizontal) + recorte visual nos dois temas;
modal "Nova manutenção" aberto e fechado por Esc; console sem erro. Largura de celular (414 px)
simulada por iframe na mesma aba: Manutenções vira cards; Repositório e Relatórios rolam a
tabela dentro do card, página sem estouro. Nada precisou de ajuste.
Armadilhas da conferência: o Chrome do rrona estava minimizado → `Page.captureScreenshot`
estoura o tempo (restaurar a janela por `ShowWindow`); o monitor é 2560 px e a janela ignora
`resize_window` (por isso o iframe); o admin do dev.db é `admin@santiagopaula.com.br` (typo
histórico do `.env`) e a senha teve de ser regravada com bcrypt antes do login.

**Próximos passos:**
1. (Feito) conferência visual local, ver acima. Receita para repetir: backend
   `PORT=3199 WHATSAPP_PROVIDER=mock REMINDER_SCHEDULER_ENABLED=false STORAGE_PROVIDER=local
   npx tsx src/server.ts` + `VITE_API_URL=http://localhost:3199/api npx vite --port 5199`.
2. Publicar: `python deploy_hostinger.py` (só frontend; o backend não mudou nesta fase).
   Provar pelo bundle servido (hash + "Poppins"/`page-hero` no JS/CSS).
3. Avisar os usuários do visual novo (hard refresh Ctrl+Shift+R se virem o antigo).

## Estado anterior (27/10/2026, noite) — "Abrir no Word" + ajustes do Google

**EM PRODUÇÃO desde 27/10 ~17h50** (deploy do franc pelos dois scripts com `!`, Python 3.12).
Provado: `/api/health` 200; `edit-local` 401 sem token; `OPTIONS /api/dav/...` devolve
`DAV: 1,2` e `MS-Author-Via: DAV`; token inválido → 403 sem `WWW-Authenticate`; site serve
`index-DjFRqlcA.js` com "Abrir no", "salva direto no portal", o aviso do formato antigo,
a URL da API e o Client ID. **Provado pelo Ronaldo em 27/10 ~18h com o Word real em produção: "funcionou".**

**O que o Ronaldo viu:** editou um `.doc` pelo "Editar no Google" e o arquivo
baixado veio desconfigurado (WordArt do cabeçalho sumiu, linha atravessando as
fotos, 1 → 2 páginas). Diagnóstico: o Google **converte** `.doc` em `.docx` ao
abrir (o arquivo baixado era um `.docx` com nome `.doc`) e não tem WordArt nem
respeita formas ancoradas. Limite do editor, não defeito do portal. Decisão dele:
fazer os dois ajustes do portal **e** seguir com o Word direto.

**Feito nesta sessão (documentação completa em `docs/edicao-arquivos.md`):**
- **Abrir no Word/Excel/PowerPoint**: `POST /files/:id/edit-local` → link
  `ms-word:ofe|u|https://api…/api/dav/<token>/<nome>`; WebDAV mínimo em
  `backend/src/modules/files/files.dav.ts` (OPTIONS/PROPFIND/HEAD/GET/LOCK/PUT/
  UNLOCK/PROPPATCH), token JWT escopo `dav` por arquivo+usuário (12 h), lock
  exclusivo (outro usuário → 423), `storage.overwrite` grava na MESMA chave
  (Drive: `files.update`, mesmo id). Logs `EDIT_OFFICE` e `SAVED_OFFICE`.
  Funciona com storage em disco e com Drive.
- **Ajuste 1**: a sincronização renomeia a extensão quando o Drive converteu
  (`.doc` → `.docx`), em `originalName` e `storedName`.
- **Ajuste 2**: `confirm` antes de mandar `.doc/.xls/.ppt` para o Google, com
  sugestão de "Abrir no Word"; `edit-session` devolve `converts`.
- Provas: 27 testes unitários (mock) + 11 por HTTP contra o app real, todos
  verdes; tsc dos dois lados; lint com os mesmos 37 problemas antigos; build.
  **Word de verdade (franc, 27/10):** abrindo a URL do WebDAV pelo próprio Word,
  `ReadOnly=false`, `Save()` gravou, o arquivo no storage passou a ter o texto
  digitado, `SAVED_OFFICE` registrado com o nome do usuário. O link
  `ms-word:ofe|u|…` pelo protocolo abriu o Word com o documento, em **Modo de
  Exibição Protegido** (barra "Habilitar Edição") — o clique nessa barra não foi
  automatizado (o classificador de segurança barrou); é o mesmo caminho do
  `Open` provado acima. Para sumir com a barra na escola: API nos Sites
  Confiáveis do Windows.

**Prova feita por ele em 27/10 (~18h): funcionou.** Roteiro que ele seguiu: num `.docx` real, clicar "Abrir no Word" →
"Habilitar Edição" → digitar → Ctrl+S → voltar ao portal: linha mostra a caneta
e o tamanho novo; Baixar traz a edição; Histórico mostra "Aberto no Word…" e
"Salvo pelo Word…". Repetir num `.doc` (abre no Word em formato antigo, sem
conversão). **Decisão dele (27/10, noite): "Editar no Google" SAIU da tela.** Só o botão do Office fica. O backend continua com a rota `edit-session` e os testes (sem botão que a chame); `canEditOnline` removido do front. **Publicado 27/10 ~17h55** (bundle `index-C16p4G1T.js`, provado: sem "Editar no Google", com "salva direto no portal", URL da API e Client ID).

## Estado anterior (27/10/2026, tarde) — editar arquivos no próprio portal

**Pedido do Ronaldo (print de 27/10):** no Repositório de Arquivos, parar de "baixar,
editar fora e subir de novo". Decisões dele: editor = **Google Docs/Planilhas/
Apresentações no próprio Drive** (os arquivos de produção já moram no Drive da conta
da escola; todos os logins são contas Google); quem edita = dono + ADMIN/GESTOR;
PDF e imagem ganham **"Abrir"** (visualizador na tela, sem baixar); OnlyOffice
descartado (2–4 GB de RAM no VPS do PDI).

**EM PRODUÇÃO desde 27/10 ~17h** (deploy do franc: backend `update.py` com o Python
3.12 — o `python` do PATH virou 3.14 sem paramiko; frontend `deploy_hostinger.py` após
trocar o `HOSTINGER_API_TOKEN` do `.deploy.env`, que tinha expirado). Provas: `/api/health`
200; `POST /api/files/x/edit-session` → 401 sem token; site serve `index-Fi1EWJ1O.js`
(= build) com "Editar no Google", URL da API e Client ID. **Falta a prova com o Drive
real pelo Ronaldo** (passos no fim desta seção).

**Como ficou:**
- Backend: `files.service.ts` novo (`openEditSession`, `syncFileMetadata`,
  `editorKindFor`, `canAccessFile`, `FileErro`); `GoogleDriveProvider` implementa
  `EditableStorageProvider` (`shareForEdit` = `permissions.list` + `permissions.create`
  writer sem e-mail de notificação + `webViewLink`; `getInfo` = size/mime/modifiedTime/
  lastModifyingUser). Rotas: `GET /files/capabilities` → `{editInDrive}`,
  `POST /files/:id/edit-session` → `{url, editor}`, `POST /files/:id/sync` →
  `{changed, file}`. Recusas: 403 (USER alheio), 415 (pdf/zip/mp4/imagem), 409 (storage
  em disco), 422 (e-mail sem conta Google), 410/502 (Drive).
- Sincronização: baseline `File.driveModifiedTime`; ao voltar o foco da aba o front
  chama `/sync` para cada arquivo aberto; o **download também sincroniza antes dos
  headers** (senão o `Content-Length` velho truncaria o arquivo editado). Log
  `FileChangeLog` ganhou `EDIT` (abriu o editor) e `MODIFIED` (mudança detectada, ator =
  `lastModifyingUser` do Drive ou quem abriu por último). `replace` zera a baseline.
- Migration `20261027170000_add_file_edit_tracking` (3 colunas em `File`); o
  `start.sh` aplica no deploy.
- Frontend: `FileActionButtons` (Abrir · Editar no Google X · Baixar · Substituir ·
  Excluir) nas duas páginas e na árvore; `FilePreviewModal` (PDF em iframe por blob,
  imagem em img); `useSyncOnFocus`; coluna Data mostra ícone de caneta com "Editado por X
  em Y"; Histórico de alterações rotula EDIT/MODIFIED. O botão Editar abre a aba
  **síncrona no clique** (bloqueador de pop-up) e some quando `editInDrive` é false.
- Provas: `npx tsx scripts/testar-edicao-arquivos.ts` → **13 verdes** com Drive mock
  (guardas 403 e 415 provadas vermelhas por mutação); `tsc` nos dois lados; lint sem
  problema novo (37 antes e depois, todos antigos); `vite build`; local com storage em
  disco: rotas 401 sem token, `capabilities` false, edit-session 409/415, sync false,
  visualizador de PDF aberto no Chrome sem erro de console.
- **NÃO provado ainda:** o caminho real do Drive (`permissions.create` + Google abrindo
  o .docx em modo Office) — as credenciais do Drive só existem no VPS. Provar em
  produção com a conta do Ronaldo (GESTOR) num .docx: editar, voltar, ver o tamanho
  mudar, baixar o arquivo editado, conferir o Histórico.

**Prova com o Drive real (ele faz):** como GESTOR, caneta num .docx de professor → abre
o Google Documentos; digita, espera "Salvo", volta à aba do portal → tamanho muda e
aparece a caneta na data; Baixar traz a edição; Histórico mostra EDIT e MODIFIED.
Deploy de qualquer PC: usar o Python que tem paramiko (no franc, o 3.12).

## Estado anterior (23/09/2026, fim da tarde)

**EM PRODUÇÃO desde 23/09 ~16h (deploy do franc, os dois scripts com `!`):
campo "Observações" no PDF + aba "Mensagens" em RH · Holerites.** Provado:
`/api/health` 200, rotas de mensagens 401 sem token, bundle `index-B4YGixZH.js`
servido com a aba nova, a URL da API e o Client ID. Falta o Ronaldo cadastrar a
primeira mensagem real e conferir o PDF. Pedido do Ronaldo por print (caixa em branco à
esquerda de "Total / Valor Líquido" no papel): o RH escreve mensagens **gerais**
(todos) ou **individuais** (um colaborador), com ou sem competência, e elas saem
nessa caixa nas duas vias do PDF. Decisões dele: só no PDF (não na tela Meus
Holerites) e o menu continua "RH · Holerites" com a aba nova.

- Tabela `HoleriteMensagem` (migration `20260923184115_add_holerite_mensagens`;
  o `start.sh` aplica no deploy). Rotas `/api/holerites/rh/mensagens` (GET, POST,
  PUT/:id, DELETE/:id) e `/rh/competencias`. Tudo em `docs/holerites.md`.
- Limite **120 caracteres** por mensagem e **guarda de espaço**: o serviço mede o
  texto final de cada holerite alcançado com as fontes do pdfkit (7 pt → 6 pt) e
  recusa com 422 o que não couber; nada sai cortado. Medido, não estimado: a
  caixa tem 30 pt e cabem ~270 caracteres corridos em 6 pt.
- Provas: suíte com **46 testes verdes** (16 novos, vermelhos antes; a guarda foi
  provada vermelha desligando-a), PDF sem observação com o mesmo tamanho em bytes
  de antes (layout intacto), prévias com o TXT real conferidas visualmente
  (`holerite-preview.ts --observacoes`), `tsc` do backend e do frontend, `vite
  build`. A tela **não foi exercitada no Chrome** nesta sessão.
- Publicado às ~16h de 23/09; resta cadastrar uma mensagem real e baixar o PDF.
- Lint: `HoleritesRhPage.tsx` tem 2 erros `react-hooks/set-state-in-effect`
  **anteriores** (abas Importar e Colaboradores); a aba nova não acrescenta nenhum.

### Estado anterior (23/09, tarde)

Módulo de holerites **EM PRODUÇÃO** desde 23/09/2026, deploy feito do PC franc.

- Backend no VPS: `/api/holerites/meus` passou de 404 para 401 (existe, exige
  login); a migration rodou (o `start.sh` tem `set -e` e o servidor subiu).
- Frontend na Hostinger: o HTML de produção serve o bundle novo e ele contém a
  tela de holerites.
- **Primeiro uso real em 23/09 às 15h11**: o Ronaldo liberou o módulo `rh`,
  importou o `Holerite23092026.txt` (formato completo) em *RH · Holerites*,
  vinculou o colaborador 000285 ao próprio login e baixou o PDF em *Meus
  Holerites*. PDF conferido campo a campo contra o demonstrativo impresso do
  Folpag (08/2026): idêntico, com CPF, CTPS, admissão e códigos vindos do TXT.
  **O módulo está validado de ponta a ponta em produção.**

### 23/09 à tarde: chegou o export completo da folha

O contador mandou o `Holerite23092026.txt` num **layout novo** (registros `C`,
`DP`/`DD`, `R`) que traz **CPF, CTPS, admissão e códigos de cargo e depto** — tudo
que o RH teria de digitar. O parser passou a aceitar os dois formatos (decide
pelo primeiro caractere) e grava esses dados no `Colaborador` a cada importação;
o formato antigo continua entrando e não apaga o que o completo gravou. Prova:
suíte com 30 testes verdes (9 novos, vermelhos antes do parser) e prévia dos
dois colaboradores do arquivo real comparada com o demonstrativo impresso:
idêntica. Layout coluna a coluna em `docs/holerites.md`. Texto da tela do RH
ajustado. Arquivo real fora do git, em `Desktop\PROJETO OLERITE CSP` do PC franc.

**Deploy do parser novo feito às 15h10 de 23/09** (os dois scripts, disparados
com `!`): backend reconstruído no VPS (`/api/health` ok, rota de holerites 401),
frontend na Hostinger servindo `index-BydJeUnk.js` com URL da API, Client ID e o
texto novo. Parser provado em produção às 15h11 com o TXT real (ver acima).

### Deploy: o que mudou em 23/09

- O VPS (2.24.115.74) **só aceita chave SSH** (`publickey`); a senha não serve
  mais. `update.py` usa `CSP_VPS_KEY` do `.deploy.env` ou, por padrão,
  `~/.ssh/pdi_vps_ed25519` (a chave do PDI, que é o mesmo servidor). Cada PC
  precisa ter essa chave.
- `update.py` gravava o pacote num caminho fixo do PC rrona; agora usa a pasta
  temporária do PC em uso.
- **O build do frontend embute duas variáveis**: `VITE_API_URL` (URL absoluta do
  backend; o `.htaccess` da Hostinger NÃO encaminha `/api`) e
  `VITE_GOOGLE_CLIENT_ID` (sem ele o botão "Entrar com Google" some). Elas vinham
  de um `frontend/.env.production` que só existia no rrona; o primeiro build do
  franc saiu sem as duas e **o site ficou ~40 min sem API e sem login** (23/09,
  10h28 a 11h10). Agora as duas moram no `.deploy.env` de cada PC e o
  `deploy_hostinger.py` **recusa o build** sem elas (guardas provadas vermelhas).
  O Client ID é público e pode ser recuperado do bundle do container de frontend
  do VPS (`curl -k --resolve servicedeskcsp.com.br:443:2.24.115.74 ...`).
- **Histórico reescrito**: três commits antigos tinham `Co-Authored-By`; as
  linhas foram removidas (conteúdo idêntico; tag local
  `backup-antes-limpeza-coautor` no franc). **No PC rrona, antes de qualquer
  coisa** (com `git stash` antes, se houver alteração local):
  ```
  git fetch origin
  git reset --hard origin/main
  ```

### O módulo (feito em 22/09)

- TXT da folha (Folpag) → parser posicional que recusa arquivo com soma errada →
  colaborador vinculado ao login pelo RH → PDF igual ao papel (duas vias).
- Importação pela pasta `Holerites` do Google Drive (automática a cada 30 min) ou
  por upload na tela "RH · Holerites". Tela "Meus Holerites" para o colaborador.
- Provas: `npx tsx scripts/testar-holerites.ts` (46 verdes em 23/09), fluxo HTTP com o TXT
  real, telas no Chrome, build do frontend. Documentação em `docs/holerites.md`.
- Decisões do Ronaldo: portal = este; vínculo feito pelo RH uma vez; CPF/CTPS/
  admissão/códigos não vêm no TXT → vai pedir export completo ao contador; até lá
  o RH preenche na tela.

## Próximos passos

0. Linha de corte acima dos totais (`0b41463`) **em produção desde 23/09 ~16h20**;
   a primeira mensagem individual real (000285, 08/2026) já saiu no PDF. Resta ele
   baixar o PDF de novo e confirmar a linha.
1. Uso mensal: o RH salva o TXT completo de cada mês na pasta `Holerites` do
   Drive (ou faz upload) e vincula os colaboradores novos. Confirmar
   `STORAGE_PROVIDER=google-drive` no VPS antes de contar com a importação
   automática; o upload manual já funciona.
2. Liberar o módulo `rh` para quem realmente faz a folha na escola.
3. Vincular os demais colaboradores conforme forem ganhando login no portal.
4. Se algum mês vier com base INSS ≠ base FGTS, conferir a ordem dos dois campos
   da linha `R` contra o papel (ver `docs/holerites.md`).

## Rodar local

```
cd backend && npm ci && npx prisma generate && npx prisma migrate dev && npm run seed
PORT=3199 MAINTENANCE_SCHEDULER_ENABLED=false REMINDER_SCHEDULER_ENABLED=false BACKUP_SCHEDULER_ENABLED=false npx tsx src/server.ts
cd frontend && npm ci && VITE_API_URL=http://localhost:3199/api npx vite --port 5199
```

Admin de desenvolvimento: `admin@santapaula.com.br` / `Admin@123` (só local).
Arquivo de amostra da folha (dados reais, fora do git): existia em
`C:\Users\franc\Desktop\Nova pasta (4)`, apagado em 23/09; buscar no PC rrona ou na
pasta `Holerites` do Drive. Deploy: `python update.py` (backend) e
`python deploy_hostinger.py` (frontend), com `.deploy.env` preenchido.
Prévia de um TXT sem tocar no banco: `npx tsx scripts/holerite-preview.ts arquivo.txt saida/`
(com `--observacoes "texto"` para ver a caixa de observações preenchida).

## Estado atual (28/10/2026) — REDESENHO "Central de Suporte" (Jira/Zendesk) NO GIT, NÃO PUBLICADO

Branch `visual-central-suporte` (enviada; não mesclada em main). Rollback do Telehap: tag
`visual-telehap-final` (058edd1). Produção segue com o Telehap. Doc: `docs/visual-central-suporte.md`.
Plano aprovado: `~/.claude/plans/vou-soltar-um-prompt-federated-piglet.md` (PC rrona).

Feito (fases 1–4): tokens Inter/#14243B/#2563EB em `index.css` (em `@layer components`, senão as
utilities do Tailwind perdem p/ o CSS do sistema), sidebar navy agrupada + topbar branca com "Abrir
chamado", PageHeader plano, login sem blob, `Field/Modal/Notice/EmptyState/Table loading`, inicial para
TODOS em `/` (HomePage: serviços reais, meus chamados, fila da equipe p/ quem tem `dashboard`), Painel
em `/dashboard` (avisa sem módulo `relatorios`), chamados (form em grupos + validação no campo, lista
com `?status=` e busca local, detalhe com linha do tempo e faixa pós-abertura, responsável só ADMIN),
todas as páginas em Field/Notice/EmptyState, abas com role, zero hex em src, `style={{}}` 762 → ~45.
Guardas: tsc 0; eslint 31 (baseline 37, nenhum novo); build OK.

**28/10 tarde (franc), pedidos dele ao ver o local:** crédito "Desenvolvido por Orbit Lab"; foto do
colégio em alta no login (duas colunas ≥1024 px); paleta e fontes do site colegiosantapaula.com.br
nos tokens (ver `docs/visual-central-suporte.md`); **"Agente IA" (painel da Liz) REMOVIDO do portal** —
a Liz roda em outro lugar; ficam só as automações do próprio portal (WhatsApp e Bot de suporte).
Saíram `pages/AgentePage.tsx`, `lib/lizApi.ts`, a rota `/agente`, o item do menu, o serviço da
inicial e o módulo `agente` (front e back); o router `backend/src/modules/agent` continua montado
mas sem tela. eslint caiu para 18 (a página levou 13 problemas antigos). Em seguida, pedido dele, **"Bot de suporte" também REMOVIDO** (tela `/whatsapp-suporte`, item do menu, serviço da inicial e módulo `bot` nos dois `modules.ts`): em Automação fica SÓ "WhatsApp" (conexão + envio de códigos e avisos). O backend do bot (`modules/bot`, webhook) continua no ar; `BOT_ENABLED` decide se ele responde.

Conferido no Chrome local (rrona 28/10: claro/escuro 1568 px — login, inicial USER e GESTOR, Painel
sem módulo, lista de chamados; **franc 28/10 tarde: TODAS as telas da fase 3** — login/cadastro/
redefinição, inicial, abrir chamado, lista, detalhe, suprimentos (lista e novo), manutenções, agente,
meus holerites, RH·Holerites, repositório, relatórios, usuários — nos dois temas, console limpo;
**celular 414 e 360 px por iframe de mesma origem em 9 rotas + auditoria DOM**: inputs sem label 0,
botões sem nome 0, imagens sem alt 0). **Defeito achado e corrigido (franc):** a topbar estourava a
largura do celular (32 px em 414, 15 px em 360 → rolagem horizontal): o `.user-chip` encolhia e o
botão Sair saía da tela. Correção: `.user-chip { flex: none }`, texto da marca só a partir de 400 px,
rótulo "Abrir chamado" só a partir de 520 px (ícone antes). Depois da correção: overflow 0 nas 18
molduras. Guardas após a correção: tsc 0, eslint 31 (baseline da branch), build OK.
**FALTA**: o Ronaldo ver o visual novo (local ou prévia) e autorizar; mesclar `visual-central-suporte`
em `main`; publicar (`deploy_hostinger.py` com `VITE_GOOGLE_CLIENT_ID` exportado; token Hostinger
expirado → MCP `hosting_deployStaticWebsite`); avisar usuários (Ctrl+Shift+R).
Local: backend `PORT=3199 WHATSAPP_PROVIDER=mock REMINDER_SCHEDULER_ENABLED=false STORAGE_PROVIDER=local
npx tsx src/server.ts`, Vite 5199; contas de teste via `scripts/create-test-user.ts` (ADMIN
teste@csp.local, USER usuario.teste@csp.local, GESTOR gestor.teste@csp.local c/ módulo dashboard).


