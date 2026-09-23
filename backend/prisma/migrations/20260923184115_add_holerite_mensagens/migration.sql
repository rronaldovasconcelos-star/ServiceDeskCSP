-- CreateTable
CREATE TABLE "HoleriteMensagem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "escopo" TEXT NOT NULL,
    "colaboradorId" TEXT,
    "competencia" TEXT,
    "texto" TEXT NOT NULL,
    "atorId" TEXT,
    "atorNome" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HoleriteMensagem_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HoleriteMensagem_atorId_fkey" FOREIGN KEY ("atorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "HoleriteMensagem_competencia_idx" ON "HoleriteMensagem"("competencia");

-- CreateIndex
CREATE INDEX "HoleriteMensagem_colaboradorId_idx" ON "HoleriteMensagem"("colaboradorId");
