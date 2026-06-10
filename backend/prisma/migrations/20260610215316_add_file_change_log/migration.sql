-- CreateTable
CREATE TABLE "FileChangeLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileId" TEXT,
    "fileName" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'REPLACE',
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "oldSize" INTEGER,
    "newSize" INTEGER,
    "oldMime" TEXT,
    "newMime" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "FileChangeLog_fileId_idx" ON "FileChangeLog"("fileId");

-- CreateIndex
CREATE INDEX "FileChangeLog_createdAt_idx" ON "FileChangeLog"("createdAt");
