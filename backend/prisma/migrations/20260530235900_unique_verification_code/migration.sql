-- AlterTable: garante um código de verificação ativo por usuário no nível do banco
-- (a lógica de deleteMany+create já garante isso, mas a constraint evita race conditions)
CREATE UNIQUE INDEX IF NOT EXISTS "VerificationCode_userId_key" ON "VerificationCode"("userId");
