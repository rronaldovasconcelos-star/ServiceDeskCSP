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

## Onde parou (27/10/2026, noite) — "Abrir no Word" + ajustes do Google

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

**Falta (ele faz, em produção):** num `.docx` real, clicar "Abrir no Word" →
"Habilitar Edição" → digitar → Ctrl+S → voltar ao portal: linha mostra a caneta
e o tamanho novo; Baixar traz a edição; Histórico mostra "Aberto no Word…" e
"Salvo pelo Word…". Repetir num `.doc` (abre no Word em formato antigo, sem
conversão). Depois disso, decidir se o "Editar no Google" continua visível.

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
