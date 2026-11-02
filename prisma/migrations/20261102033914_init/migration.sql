-- CreateTable
CREATE TABLE "PullRequestSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "pullNumber" INTEGER NOT NULL,
    "headSha" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "isBreaking" BOOLEAN NOT NULL,
    "result" JSONB NOT NULL,
    "omittedFiles" JSONB NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Analysis_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PullRequestSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PullRequestSnapshot_owner_repo_pullNumber_headSha_key" ON "PullRequestSnapshot"("owner", "repo", "pullNumber", "headSha");

-- CreateIndex
CREATE INDEX "Analysis_snapshotId_createdAt_idx" ON "Analysis"("snapshotId", "createdAt");
