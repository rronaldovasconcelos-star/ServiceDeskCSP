-- CreateTable
CREATE TABLE "MaterialReminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "messageExtra" TEXT,
    "recurrence" TEXT NOT NULL DEFAULT 'MONTHLY',
    "nextRunAt" DATETIME NOT NULL,
    "lastRunAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "anoLetivo" TEXT,
    "segmento" TEXT,
    "serie" TEXT,
    "etapa" TEXT,
    "disciplina" TEXT,
    "tipoMaterial" TEXT,
    "audience" TEXT NOT NULL DEFAULT 'ALL',
    "recipientIds" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaterialReminder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MaterialReminder_status_nextRunAt_idx" ON "MaterialReminder"("status", "nextRunAt");
