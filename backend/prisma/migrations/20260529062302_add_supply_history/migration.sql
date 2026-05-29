-- CreateTable
CREATE TABLE "SupplyRequestHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplyRequestHistory_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SupplyRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplyRequestHistory_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
