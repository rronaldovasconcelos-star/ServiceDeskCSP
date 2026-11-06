-- CreateTable
CREATE TABLE "Beneficio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "link" TEXT,
    "logo" BLOB,
    "logoMime" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Beneficio_ativo_ordem_idx" ON "Beneficio"("ativo", "ordem");
