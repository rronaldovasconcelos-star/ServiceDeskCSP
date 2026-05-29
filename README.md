# Portal de Chamados — Colégio Santa Paula

Sistema de gestão de chamados de suporte (TI) e compra de suprimentos.

## Stack

| Camada    | Tecnologia                          |
|-----------|-------------------------------------|
| Backend   | Node.js + TypeScript + Express      |
| Banco     | SQLite via Prisma 7 + libsql adapter|
| Frontend  | React + Vite + Tailwind CSS         |
| Auth      | JWT (8h de validade)                |
| WhatsApp  | Evolution API (plugável via .env)   |

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
| `WHATSAPP_PROVIDER`  | `mock` (log) ou `evolution`                 |
| `EVOLUTION_API_URL`  | URL da sua instância Evolution API          |
| `EVOLUTION_API_KEY`  | Chave da Evolution API                      |
| `EVOLUTION_INSTANCE` | Nome da instância conectada                 |

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
