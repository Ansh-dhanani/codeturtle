-- CreateTable
CREATE TABLE "review_context_cache" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_context_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_context_cache_key_key" ON "review_context_cache"("key");
CREATE INDEX "review_context_cache_expiresAt_idx" ON "review_context_cache"("expiresAt");
