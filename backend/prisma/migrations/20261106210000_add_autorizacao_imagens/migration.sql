-- CreateTable
CREATE TABLE "AutorizacaoDocumento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "arquivoNome" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "publicadoPorId" TEXT,
    "publicadoPorNome" TEXT NOT NULL,
    "encerrado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AutorizacaoEnvio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentoId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "usuarioNome" TEXT NOT NULL,
    "usuarioEmail" TEXT NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "dataDeclaradaPdf" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO',
    "conferidoPorNome" TEXT,
    "conferidoEm" DATETIME,
    "motivoRecusa" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutorizacaoEnvio_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "AutorizacaoDocumento" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutorizacaoEvento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentoId" TEXT NOT NULL,
    "envioId" TEXT,
    "tipo" TEXT NOT NULL,
    "atorId" TEXT,
    "atorNome" TEXT NOT NULL,
    "atorEmail" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutorizacaoEvento_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "AutorizacaoDocumento" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AutorizacaoEnvio_documentoId_usuarioId_idx" ON "AutorizacaoEnvio"("documentoId", "usuarioId");

-- CreateIndex
CREATE INDEX "AutorizacaoEvento_documentoId_atorId_idx" ON "AutorizacaoEvento"("documentoId", "atorId");

-- CreateIndex
CREATE INDEX "AutorizacaoEvento_createdAt_idx" ON "AutorizacaoEvento"("createdAt");
