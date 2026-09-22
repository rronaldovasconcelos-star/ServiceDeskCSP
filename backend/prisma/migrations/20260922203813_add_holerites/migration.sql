-- CreateTable
CREATE TABLE "Colaborador" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "userId" TEXT,
    "cpf" TEXT,
    "ctps" TEXT,
    "admissao" TEXT,
    "cargoCodigo" TEXT,
    "deptoCodigo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Colaborador_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Holerite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "colaboradorId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "empresaNome" TEXT NOT NULL,
    "empresaCnpj" TEXT NOT NULL,
    "departamento" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "salarioBase" INTEGER NOT NULL,
    "verbas" TEXT NOT NULL,
    "totalVencimentos" INTEGER NOT NULL,
    "totalDescontos" INTEGER NOT NULL,
    "liquido" INTEGER NOT NULL,
    "dataGeracao" DATETIME,
    "baseInss" INTEGER,
    "baseFgts" INTEGER,
    "baseIrrf" INTEGER,
    "fgtsMes" INTEGER,
    "faixaIrrf" TEXT,
    "importacaoId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Holerite_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Holerite_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "HoleriteImportacao" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HoleriteImportacao" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "arquivo" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "driveFileId" TEXT,
    "competencias" TEXT NOT NULL,
    "totalHolerites" INTEGER NOT NULL,
    "novosColaboradores" INTEGER NOT NULL,
    "atorId" TEXT,
    "atorNome" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HoleriteImportacao_atorId_fkey" FOREIGN KEY ("atorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Colaborador_codigo_key" ON "Colaborador"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Colaborador_userId_key" ON "Colaborador"("userId");

-- CreateIndex
CREATE INDEX "Holerite_competencia_idx" ON "Holerite"("competencia");

-- CreateIndex
CREATE UNIQUE INDEX "Holerite_colaboradorId_competencia_key" ON "Holerite"("colaboradorId", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "HoleriteImportacao_driveFileId_key" ON "HoleriteImportacao"("driveFileId");

-- CreateIndex
CREATE INDEX "HoleriteImportacao_createdAt_idx" ON "HoleriteImportacao"("createdAt");
