-- Backfill: gestores existentes mantêm acesso ao Repositório
-- (único módulo extra que viam por role antes das permissões por módulo).
-- Só ajusta quem ainda está com a lista vazia, para não sobrescrever ajustes manuais.
UPDATE "User" SET "modules" = '["repositorio"]' WHERE "role" = 'GESTOR' AND "modules" = '[]';
