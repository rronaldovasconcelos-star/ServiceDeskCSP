-- CreateTable
CREATE TABLE "Sala" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "ReservaSala" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "salaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "usuarioNome" TEXT NOT NULL,
    "usuarioEmail" TEXT NOT NULL,
    "inicio" DATETIME NOT NULL,
    "fim" DATETIME NOT NULL,
    "finalidade" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMADA',
    "canceladaEm" DATETIME,
    "canceladaPorNome" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReservaSala_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Sala_nome_key" ON "Sala"("nome");

-- CreateIndex
CREATE INDEX "ReservaSala_salaId_inicio_idx" ON "ReservaSala"("salaId", "inicio");

-- CreateIndex
CREATE INDEX "ReservaSala_usuarioId_idx" ON "ReservaSala"("usuarioId");

-- Salas do pedido (06/11/2026).
INSERT INTO "Sala" ("id", "nome", "ativa", "ordem") VALUES
    ('sala_maker', 'Sala Maker', true, 1),
    ('sala_laboratorio_ciencias', 'Laboratório de Ciências', true, 2),
    ('sala_biblioteca', 'Biblioteca', true, 3),
    ('sala_reunioes', 'Sala de Reuniões', true, 4);

-- Trava contra horários sobrepostos, no próprio banco: duas reservas CONFIRMADAS
-- da mesma sala nunca se cruzam, mesmo com pedidos simultâneos. Encostar vale
-- (10h–11h e 11h–12h). As datas são texto ISO de formato fixo, então a comparação
-- direta ordena certo. O Prisma não conhece gatilhos: se esta tabela for recriada
-- numa migration futura, recrie os dois.
CREATE TRIGGER "ReservaSala_sem_sobreposicao_insert"
BEFORE INSERT ON "ReservaSala"
WHEN NEW."status" = 'CONFIRMADA'
BEGIN
    SELECT RAISE(ABORT, 'RESERVA_CONFLITO')
    WHERE EXISTS (
        SELECT 1 FROM "ReservaSala" r
        WHERE r."salaId" = NEW."salaId"
          AND r."status" = 'CONFIRMADA'
          AND r."inicio" < NEW."fim"
          AND r."fim" > NEW."inicio"
    );
END;

CREATE TRIGGER "ReservaSala_sem_sobreposicao_update"
BEFORE UPDATE OF "salaId", "inicio", "fim", "status" ON "ReservaSala"
WHEN NEW."status" = 'CONFIRMADA'
BEGIN
    SELECT RAISE(ABORT, 'RESERVA_CONFLITO')
    WHERE EXISTS (
        SELECT 1 FROM "ReservaSala" r
        WHERE r."id" <> NEW."id"
          AND r."salaId" = NEW."salaId"
          AND r."status" = 'CONFIRMADA'
          AND r."inicio" < NEW."fim"
          AND r."fim" > NEW."inicio"
    );
END;
