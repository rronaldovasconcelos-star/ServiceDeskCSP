# Portal de Chamados — Colégio Santa Paula

Sistema de gestão de chamados de suporte (TI) e compra de suprimentos.

## Stack

| Camada    | Tecnologia                          |
|-----------|-------------------------------------|
| Backend   | Node.js + TypeScript + Express      |
| Banco     | SQLite via Prisma 7 + libsql adapter|
| Frontend  | React + Vite + Tailwind CSS         |
| Auth      | JWT (8h de validade)                |
| WhatsApp  | Cloud API (Meta) ou Evolution — plugável via .env |

---

## Início rápido

### 1. Backend

```bash
cd backend
npm install
npx prisma migrate dev --name init   # cria o banco
npm run seed                          # cria usuário admin padrão
npm run dev                           # inicia em http://localhost:3001
```

**Admin padrão:**
- Email: `admin@santiagopaula.com.br`
- Senha: `Admin@123`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev    # inicia em http://localhost:5173
```

Acesse http://localhost:5173 e faça login com as credenciais acima.

---

## Holerites

O colaborador baixa o próprio demonstrativo de pagamento em **Meus Holerites**.
O RH salva o TXT exportado da folha na pasta `Holerites` do Google Drive do
portal (ou envia em **RH · Holerites**), o portal importa conferindo as somas,
o RH vincula cada colaborador ao login uma única vez, e o PDF sai no formato
da escola. Detalhes, layout do TXT, API e testes: [docs/holerites.md](docs/holerites.md).

## Variáveis de ambiente

### backend/.env

| Variável             | Descrição                                   |
|----------------------|---------------------------------------------|
| `DATABASE_URL`       | Caminho absoluto `file:///...` para o SQLite|
| `PORT`               | Porta do servidor (padrão: 3001)            |
| `JWT_SECRET`         | Chave secreta para assinar tokens JWT       |
| `JWT_EXPIRES_IN`     | Duração do token (padrão: 8h)               |
| `SEED_ADMIN_EMAIL`   | Email do admin criado pelo seed             |
| `SEED_ADMIN_PASSWORD`| Senha do admin criado pelo seed             |
| `WHATSAPP_PROVIDER`  | `mock` (log), `evolution` ou `cloud`        |
| `EVOLUTION_API_URL`  | URL da sua instância Evolution API          |
| `EVOLUTION_API_KEY`  | Chave da Evolution API                      |
| `EVOLUTION_INSTANCE` | Nome da instância conectada                 |
| `WHATSAPP_CLOUD_PHONE_NUMBER_ID` | Phone Number ID da WABA (provider `cloud`) |
| `WHATSAPP_CLOUD_TOKEN` | Token permanente do system user (provider `cloud`) |

### frontend/.env

| Variável      | Descrição                           |
|---------------|-------------------------------------|
| `VITE_API_URL`| URL base da API (ex: `/api` em dev) |

---

## Rotas da API

| Método | Rota                        | Acesso | Descrição                      |
|--------|-----------------------------|--------|--------------------------------|
| GET    | /api/health                 | Livre  | Health check                   |
| POST   | /api/auth/login             | Livre  | Login (retorna JWT)            |
| GET    | /api/auth/me                | Auth   | Dados do usuário logado        |
| GET    | /api/users                  | Admin  | Listar usuários                |
| POST   | /api/users                  | Admin  | Criar usuário                  |
| PUT    | /api/users/:id              | Admin  | Editar usuário                 |
| PATCH  | /api/users/:id/toggle-active| Admin  | Ativar/desativar usuário       |
| GET    | /api/tickets                | Auth   | Listar chamados                |
| POST   | /api/tickets                | Auth   | Abrir chamado                  |
| GET    | /api/tickets/:id            | Auth   | Detalhe + histórico            |
| PATCH  | /api/tickets/:id/status     | Auth   | Mudar status                   |
| PATCH  | /api/tickets/:id/assign     | Admin  | Atribuir responsável           |
| POST   | /api/tickets/:id/comments   | Auth   | Adicionar comentário           |
| GET    | /api/reports/metrics        | Admin  | Métricas do dashboard          |
| GET    | /api/reports/export/csv     | Admin  | Exportar chamados (CSV)        |
| GET    | /api/reports/export/pdf     | Admin  | Exportar chamados (PDF)        |

---

## Ciclo de vida do chamado

```
ABERTO → EM_ANDAMENTO → CONCLUIDO
   ↓            ↓
CANCELADO   CANCELADO
```

## Notificações WhatsApp

- **Chamado aberto**: todos os admins com `phone` cadastrado recebem aviso.
- **Chamado concluído**: o solicitante recebe aviso (se tiver `phone`).
- Com `WHATSAPP_PROVIDER=mock`, as mensagens são apenas logadas no console.
- Com `WHATSAPP_PROVIDER=cloud`, cada aviso sai por um **template aprovado na Meta** —
  ver [`docs/whatsapp-cloud-api.md`](docs/whatsapp-cloud-api.md) para o texto de cada
  template e o passo a passo da implantação.
