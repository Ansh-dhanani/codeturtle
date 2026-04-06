-- AlterTable
ALTER TABLE "Repository"
ADD COLUMN "reviewStyle" TEXT NOT NULL DEFAULT 'balanced',
ADD COLUMN "memesEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "customPrompt" TEXT;
