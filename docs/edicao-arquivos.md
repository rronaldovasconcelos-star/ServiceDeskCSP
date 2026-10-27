# Edição de arquivos do repositório sem baixar e subir

Dois caminhos, lado a lado na linha do arquivo (tabela, cards e árvore):

| Botão | Ícone | Abre em | Para quem | Fidelidade |
|---|---|---|---|---|
| **Abrir no Word / Excel / PowerPoint** | arquivo com caneta | Office instalado no PC, via WebDAV do portal | dono, ADMIN, GESTOR | total (é o próprio Office) |
| **Editar no Google** | caneta | Google Docs/Planilhas/Apresentações no Drive da escola | dono, ADMIN, GESTOR, só com `STORAGE_PROVIDER=google-drive` | parcial: o Google converte e perde WordArt, caixas de texto, cabeçalhos elaborados |
| **Abrir** | olho | visualizador no portal (PDF e imagem) | quem baixa | — |

## Abrir no Office (recomendado)

1. `POST /api/files/:id/edit-local` (Bearer do portal) emite um **token JWT de
   escopo `dav`**, preso a um arquivo e a um usuário, válido por 12 h, e devolve
   `{ url: "ms-word:ofe|u|https://api.servicedeskcsp.com.br/api/dav/<token>/<nome>", app }`.
   Excel e PowerPoint usam `ms-excel:` e `ms-powerpoint:`. Log `EDIT_OFFICE`.
2. O navegador pergunta "Abrir o Word?" e o Office conversa com o **WebDAV
   mínimo** do backend (`files.dav.ts`, montado em `/api/dav` ANTES do cors e do
   `express.json`): `OPTIONS` (DAV 1,2 + `MS-Author-Via`), `PROPFIND` (pasta e
   arquivo), `HEAD`/`GET`, `LOCK`/`UNLOCK` (exclusivo, em memória, 1 h no máximo,
   outro usuário recebe **423**), `PUT` (salva), `PROPPATCH` (aceito e ignorado).
   `DELETE`/`MOVE`/`MKCOL` → 403. Nunca devolve `WWW-Authenticate` (abriria uma
   caixa de senha no Office).
3. **Ao salvar no Office**, o `PUT` grava na **mesma chave** do storage
   (`storage.overwrite`: no disco troca por rename atômico; no Drive é
   `files.update` com o mesmo id, mantendo permissões e lugar na árvore),
   atualiza tamanho e "editado por" e registra `SAVED_OFFICE`. Com Drive, a
   baseline é regravada para a sincronização do Google não contar a mesma
   gravação como `MODIFIED`.
4. A tela: ao voltar o foco, `useSyncOnFocus` chama `/sync` e troca a linha
   quando `lastEditedAt`, tamanho ou nome mudaram (o Drive não "muda" nesse
   caminho, por isso a comparação é pela marca e não só por `changed`).

**Primeira abertura: "Modo de Exibição Protegido".** O Word trata o endereço da
API como internet e abre com a barra amarela **Habilitar Edição**. Um clique e
ele reabre o arquivo em edição (LOCK + PUT) — provado no PC franc em 27/10/2026
abrindo pelo próprio Word a URL do WebDAV: `ReadOnly=false`, `Save()` gravou e
o arquivo no storage passou a conter o texto digitado. Para os PCs da escola
não mostrarem a barra, adicionar `https://api.servicedeskcsp.com.br` aos
**Sites Confiáveis** do Windows (Opções da Internet → Segurança) ou às Locais
Confiáveis do Office com "permitir locais na rede".

Sem o Office instalado, o link não faz nada; o portal mostra um aviso por 9 s.

**Variável:** `PUBLIC_API_URL` (opcional). Vazio = `protocolo://host` da
requisição, que atrás do Traefik já vem `https://api.servicedeskcsp.com.br`.

## Editar no Google

Compartilha o arquivo do Drive com o e-mail do login (`permissions.create`
writer, sem e-mail) e abre o `webViewLink`. Detalhes no `ESTADO.md` de 27/10.

Dois ajustes de 27/10 (depois da prova real do Ronaldo com um `.doc`):

- **Formato antigo avisa antes.** `.doc`/`.xls`/`.ppt` (`isLegacyOffice`) não são
  editados no lugar pelo Google: ele **converte** para `.docx`/`.xlsx`/`.pptx` e
  perde WordArt, caixas de texto e cabeçalhos. O botão mostra um `confirm` com
  o aviso e sugere "Abrir no Word"; a resposta do `edit-session` traz
  `converts: true`.
- **A extensão acompanha a conversão.** Quando a sincronização vê o mime do
  Drive diferente do gravado, `renameForMime` troca a extensão de
  `originalName` e `storedName` (`prova.doc` → `prova.docx`), e o `MODIFIED`
  registra `oldMime`/`newMime`. Antes o download entregava um `.docx` com nome
  `.doc`, que só abria porque o Word adivinha o formato.

## Provas

- `npx tsx scripts/testar-edicao-arquivos.ts` — 27 testes com Drive mock:
  mapa mime→editor, permissões, 415/409/422, sincronização, renomeação,
  `converts`, token dav (login recusado, expirado recusado), `openOfficeSession`
  (disco e Drive), `saveFromOffice` (mesma chave, baseline, 400/403).
- `npx tsx scripts/testar-dav-http.ts` — 11 testes por HTTP contra o app real
  em porta livre (storage em disco): a conversa do Word (OPTIONS → PROPFIND →
  HEAD/GET → LOCK → PUT → PROPPATCH → UNLOCK), 423 para outro usuário, 403 para
  token de login/inválido/usuário alheio, 403 em DELETE/MOVE/MKCOL, 400 em PUT
  vazio, e a rota `edit-local` do portal.
- `npx tsx scripts/provar-office-real.ts <arquivo> [baseUrl]` — registra um
  arquivo local e imprime o link `ms-word:` para provar com o Office de
  verdade contra um backend em execução (`--conferir <id>` mostra o que foi
  gravado; `--limpar` remove).
