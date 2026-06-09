-- AlterTable
ALTER TABLE "File" ADD COLUMN "anoLetivo" TEXT;
ALTER TABLE "File" ADD COLUMN "disciplina" TEXT;
ALTER TABLE "File" ADD COLUMN "etapa" TEXT;
ALTER TABLE "File" ADD COLUMN "segmento" TEXT;
ALTER TABLE "File" ADD COLUMN "serie" TEXT;
ALTER TABLE "File" ADD COLUMN "tipoMaterial" TEXT;

-- CreateIndex
CREATE INDEX "File_anoLetivo_segmento_serie_etapa_idx" ON "File"("anoLetivo", "segmento", "serie", "etapa");

-- CreateIndex
CREATE INDEX "File_disciplina_idx" ON "File"("disciplina");

-- CreateIndex
CREATE INDEX "File_tipoMaterial_idx" ON "File"("tipoMaterial");
