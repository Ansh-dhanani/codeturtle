-- AlterTable
ALTER TABLE "user" ADD COLUMN     "aiApiKey" TEXT,
ADD COLUMN     "aiModel" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
ADD COLUMN     "aiProvider" TEXT NOT NULL DEFAULT 'google';

-- CreateTable
CREATE TABLE "subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "polarCustomerId" TEXT,
    "polarSubscriptionId" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "usageLimit" INTEGER NOT NULL DEFAULT 10,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "usageResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_review" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "prTitle" TEXT,
    "prUrl" TEXT,
    "sha" TEXT,
    "summary" TEXT,
    "files" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "code_review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_userId_key" ON "subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_polarCustomerId_key" ON "subscription"("polarCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_polarSubscriptionId_key" ON "subscription"("polarSubscriptionId");

-- CreateIndex
CREATE INDEX "subscription_userId_idx" ON "subscription"("userId");

-- CreateIndex
CREATE INDEX "subscription_polarCustomerId_idx" ON "subscription"("polarCustomerId");

-- CreateIndex
CREATE INDEX "subscription_status_idx" ON "subscription"("status");

-- CreateIndex
CREATE INDEX "usage_userId_period_idx" ON "usage"("userId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "usage_userId_type_period_key" ON "usage"("userId", "type", "period");

-- CreateIndex
CREATE INDEX "code_review_userId_idx" ON "code_review"("userId");

-- CreateIndex
CREATE INDEX "code_review_repositoryId_idx" ON "code_review"("repositoryId");

-- CreateIndex
CREATE INDEX "code_review_owner_repo_prNumber_idx" ON "code_review"("owner", "repo", "prNumber");

-- CreateIndex
CREATE INDEX "code_review_status_idx" ON "code_review"("status");

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage" ADD CONSTRAINT "usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_review" ADD CONSTRAINT "code_review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_review" ADD CONSTRAINT "code_review_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
