-- Partial unique index to prevent duplicate review locks per head SHA
CREATE UNIQUE INDEX IF NOT EXISTS code_review_user_owner_repo_pr_sha_unique
ON code_review ("userId", "owner", "repo", "prNumber", "sha")
WHERE "sha" IS NOT NULL;
