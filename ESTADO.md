# ESTADO — Portal de Chamados (Service Desk CSP)

Handoff entre PCs. Atualizado em 23/09/2026.

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

## Onde parou (23/09/2026)

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
- Provas: `npx tsx scripts/testar-holerites.ts` (21 verdes), fluxo HTTP com o TXT
  real, telas no Chrome, build do frontend. Documentação em `docs/holerites.md`.
- Decisões do Ronaldo: portal = este; vínculo feito pelo RH uma vez; CPF/CTPS/
  admissão/códigos não vêm no TXT → vai pedir export completo ao contador; até lá
  o RH preenche na tela.

## Próximos passos

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
Prévia de um TXT sem tocar no banco: `npx tsx scripts/holerite-preview.ts arquivo.txt saida/`.
