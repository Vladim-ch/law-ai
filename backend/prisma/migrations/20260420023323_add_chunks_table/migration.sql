-- CreateTable
CREATE TABLE "chunks" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(768),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chunks_source_type_source_id_idx" ON "chunks"("source_type", "source_id");
