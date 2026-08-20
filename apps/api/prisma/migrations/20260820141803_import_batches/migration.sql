-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('pending', 'committed', 'cancelled');

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_by_id" TEXT,
    "file_name" TEXT NOT NULL,
    "default_group_id" TEXT,
    "create_missing_groups" BOOLEAN NOT NULL DEFAULT true,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'pending',
    "summary" JSONB NOT NULL DEFAULT '{}',
    "rows" JSONB NOT NULL DEFAULT '[]',
    "committed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_batches_organization_id_status_idx" ON "import_batches"("organization_id", "status");

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
