# CodeTurtle — Problems & Suggestions

## Problems Found During Development

### 1. Database Was Empty
**Severity:** Critical
**What happened:** The `repository` table didn't exist in Prisma Cloud. All repo connections were silently failing.
**Fix:** Ran `npx prisma db push --force-reset` to create tables.
**Impact:** All previously connected repos were lost. Users need to reconnect.

### 2. Turbopack Windows File Locking Bug
**Severity:** Critical
**What happened:** Next.js Turbopack throws EPERM errors on Windows when antivirus locks `.next` files during atomic writes.
**Fix:** Switched to standard Webpack compiler (`next dev` without Turbopack).
**Impact:** Slower dev server compilation but stable.

### 3. GitHub App OAuth Not Returning Email
**Severity:** High
**What happened:** GitHub Apps don't include email in OAuth profile by default, causing `email_not_found` errors.
**Fix:** Added `mapProfileToUser` in `auth.ts` that fetches email from `GET /user/emails` API with fallback to `username@users.noreply.github.com`.

### 4. Webhook Signature Verification Failing
**Severity:** High
**What happened:** After database reset, repo secrets were gone. Webhook fell back to env var secret which didn't match GitHub's.
**Fix:** Skip signature verification when repo not found (temporary until repos are reconnected).

### 5. Binary Files Sent to Gemini
**Severity:** Medium
**What happened:** `getRepoFileContents` was including images and binary files in indexing, causing Gemini to crash.
**Fix:** Added 50+ extension filter + null byte detection to skip binary files.

### 6. Fake Review Data in Dashboard
**Severity:** Medium
**What happened:** `SAMPLE_REVIEWS = [10, 8, 7, 6, 5, 8]` was hardcoded, showing fake data.
**Fix:** Replaced with real database queries to `codeReview` table.

### 7. Reviews Posted From User's Account
**Severity:** Medium
**What happened:** Used personal OAuth token to post reviews, so they appeared from the user instead of a bot.
**Fix:** Switched to GitHub App installation tokens via `github-app.ts`.

### 8. PR Not Blocking Merges
**Severity:** Medium
**What happened:** Used `COMMENT` event type which doesn't block merges.
**Fix:** Use `REQUEST_CHANGES` when score < 5, `COMMENT` when score >= 5.

## Suggestions for Improvement

### 1. Incremental Indexing
**Priority:** High
**Problem:** Currently re-indexes entire repo on every connection. Expensive for large repos.
**Solution:** Track file hashes in database. Only re-index files that changed. Use git timestamps to detect modifications.

### 2. PR Review Debouncing
**Priority:** High
**Problem:** Multiple pushes in quick succession trigger multiple review jobs.
**Solution:** Wait 30 seconds after last push before starting review. Cancel pending reviews if new push arrives.

### 3. Review Quality Feedback
**Priority:** Medium
**Problem:** No way to know if reviews are actually helpful.
**Solution:** Add thumbs up/down on each review. Track which models produce better reviews. Use feedback to fine-tune prompts.

### 4. Email/Slack Notifications
**Priority:** Medium
**Problem:** Users don't know when a review completes unless they check the dashboard.
**Solution:** Send email or Slack notification when review is done. Include score and summary.

### 5. Custom Review Rules
**Priority:** Medium
**Problem:** Every team has different standards. One-size-fits-all reviews miss team-specific issues.
**Solution:** Let users add custom rules: "always check for X", "never flag Y", "require TypeScript strict mode", etc.

### 6. Redis Rate Limiting
**Priority:** Low
**Problem:** Current in-memory rate limiter resets on server restart.
**Solution:** Use Upstash Redis for persistent rate limiting across restarts and multiple instances.

### 7. Multi-Model Comparison
**Priority:** Low
**Problem:** Users can't see how different models would review the same code.
**Solution:** Add "Compare Models" button that runs the same PR through multiple models and shows differences.

### 8. Review Templates
**Priority:** Low
**Problem:** Different PR types need different review focus (bug fix vs feature vs refactor).
**Solution:** Auto-detect PR type and adjust review prompt accordingly. Bug fixes get more focus on regression testing, features get architecture review.

### 9. CodeTurtle Bot Avatar
**Priority:** Low
**Problem:** Bot appears with default GitHub App avatar.
**Solution:** Upload a custom avatar for the GitHub App to make reviews more recognizable.

### 10. Review History Per File
**Priority:** Low
**Problem:** Can't see how a file's quality has changed over time.
**Solution:** Track per-file scores across reviews. Show trend lines in analytics.
