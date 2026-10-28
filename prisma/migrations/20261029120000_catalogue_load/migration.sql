-- ADR-0038 S3: the catalogue load — runs, folder state, the problem list, Undo.

ALTER TABLE "PersonRef" ADD COLUMN "catalogueRunId" TEXT;
CREATE INDEX "PersonRef_catalogueRunId_idx" ON "PersonRef"("catalogueRunId");

ALTER TABLE "catalogue_set" ADD COLUMN "sourceDate" DATE, ADD COLUMN "createdRunId" TEXT;
CREATE INDEX "catalogue_set_createdRunId_idx" ON "catalogue_set"("createdRunId");

CREATE TYPE "CatalogueRunStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED', 'UNDONE');

CREATE TABLE "catalogue_run" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "CatalogueRunStatus" NOT NULL DEFAULT 'RUNNING',
    "mode" TEXT NOT NULL,
    "counts" JSONB NOT NULL DEFAULT '{}',
    "undoneAt" TIMESTAMP(3),
    CONSTRAINT "catalogue_run_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "catalogue_run_status_idx" ON "catalogue_run"("status");

CREATE TABLE "catalogue_folder" (
    "path" TEXT NOT NULL,
    "icgId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "newestFile" TEXT,
    "newestDate" DATE,
    "fileKey" TEXT,
    "firstRunId" TEXT NOT NULL,
    "lastRunId" TEXT NOT NULL,
    "goneAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "catalogue_folder_pkey" PRIMARY KEY ("path")
);
CREATE INDEX "catalogue_folder_icgId_idx" ON "catalogue_folder"("icgId");
CREATE INDEX "catalogue_folder_firstRunId_idx" ON "catalogue_folder"("firstRunId");

CREATE TABLE "catalogue_problem" (
    "id" TEXT NOT NULL,
    "folderPath" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "line" INTEGER,
    "example" TEXT,
    CONSTRAINT "catalogue_problem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "catalogue_problem_code_idx" ON "catalogue_problem"("code");
CREATE INDEX "catalogue_problem_folderPath_idx" ON "catalogue_problem"("folderPath");
ALTER TABLE "catalogue_problem" ADD CONSTRAINT "catalogue_problem_folderPath_fkey"
  FOREIGN KEY ("folderPath") REFERENCES "catalogue_folder"("path") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "catalogue_run_change" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    CONSTRAINT "catalogue_run_change_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "catalogue_run_change_runId_entity_key_key" ON "catalogue_run_change"("runId", "entity", "key");
ALTER TABLE "catalogue_run_change" ADD CONSTRAINT "catalogue_run_change_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "catalogue_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
