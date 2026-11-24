-- Reserva recorrente: ocorrências da mesma série compartilham o `serieId`.
-- ⚠️ ADD COLUMN de propósito: recriar a tabela "ReservaSala" apagaria os dois
-- gatilhos anti-conflito criados em `add_agendamento_salas`.
ALTER TABLE "ReservaSala" ADD COLUMN "serieId" TEXT;

-- CreateIndex
CREATE INDEX "ReservaSala_serieId_idx" ON "ReservaSala"("serieId");
