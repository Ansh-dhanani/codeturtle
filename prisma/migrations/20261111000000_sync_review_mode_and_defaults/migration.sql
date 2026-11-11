-- Idempotent sync: columns present in the schema but missing/drifted in migrations
ALTER TABLE "Repository" ADD COLUMN IF NOT EXISTS "aiProvider" TEXT;
ALTER TABLE "Repository" ADD COLUMN IF NOT EXISTS "aiModel" TEXT;
ALTER TABLE "Repository" ADD COLUMN IF NOT EXISTS "reviewMode" TEXT NOT NULL DEFAULT 'auto';

-- Align user AI defaults with the schema (openrouter/auto)
ALTER TABLE "user" ALTER COLUMN "aiProvider" SET DEFAULT 'openrouter';
ALTER TABLE "user" ALTER COLUMN "aiModel" SET DEFAULT 'openrouter/auto';
