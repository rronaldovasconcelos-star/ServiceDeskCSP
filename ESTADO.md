# ESTADO — Portal de Chamados (Service Desk CSP)

Handoff entre PCs. Atualizado em 22/09/2026.

## O que é

Portal de Chamados do Colégio Santa Paula (servicedeskcsp.com.br): chamados,
suprimentos, repositório de arquivos, lembretes, bot de WhatsApp e, desde
22/09/2026, **holerites** (o colaborador baixa o próprio demonstrativo de
pagamento). Backend Node/Express + Prisma/SQLite no VPS; frontend React/Vite na
hospedagem Hostinger.

## Onde está

- Repositório privado: `rronaldovasconcelos-star/ServiceDeskCSP`, branch `main`.
- PC rrona: `Desktop\CSP - Colégio Santa Paula\ATENDIMENTO CSP` (tem o `.deploy.env`).
- PC franc: `Desktop\ServiceDeskCSP` (clone de 22/09/2026, sem `.deploy.env`).

## Onde parou (22/09/2026)

Módulo de holerites **pronto, testado e commitado** (`da8b0e9`), **não implantado**.

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

1. **Deploy (só do PC rrona)**:
   ```
   git pull
   python update.py              # backend no VPS; a migration roda no start.sh
   python deploy_hostinger.py    # frontend na Hostinger
   ```
2. Em produção: confirmar `STORAGE_PROVIDER=google-drive`; liberar o módulo `rh`
   em Usuários para quem faz a folha; importar o primeiro TXT; vincular os
   colaboradores na aba "Colaboradores e vínculos".
3. Quando o export completo da folha chegar: ajustar `lerCabecalho` em
   `backend/src/modules/holerites/holerite.parser.ts` e gravar CPF/CTPS/admissão/
   códigos nos campos do `Colaborador`.

## Rodar local

```
cd backend && npm ci && npx prisma generate && npx prisma migrate dev && npm run seed
PORT=3199 MAINTENANCE_SCHEDULER_ENABLED=false REMINDER_SCHEDULER_ENABLED=false BACKUP_SCHEDULER_ENABLED=false npx tsx src/server.ts
cd frontend && npm ci && VITE_API_URL=http://localhost:3199/api npx vite --port 5199
```

Admin de desenvolvimento: `admin@santapaula.com.br` / `Admin@123` (só local).
Arquivo de amostra da folha (dados reais, fora do git): `C:\Users\franc\Desktop\Nova pasta (4)`.
Prévia de um TXT sem tocar no banco: `npx tsx scripts/holerite-preview.ts arquivo.txt saida/`.
