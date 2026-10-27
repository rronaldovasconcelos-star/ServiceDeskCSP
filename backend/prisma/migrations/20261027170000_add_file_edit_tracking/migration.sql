-- Rastreamento de edicao on-line (Google Drive) no repositorio de arquivos
ALTER TABLE "File" ADD COLUMN "driveModifiedTime" DATETIME;
ALTER TABLE "File" ADD COLUMN "lastEditedAt" DATETIME;
ALTER TABLE "File" ADD COLUMN "lastEditedByName" TEXT;
