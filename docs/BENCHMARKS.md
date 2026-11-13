# CodeTurtle - Benchmarks

This file contains ONLY two kinds of statements, clearly labelled:

- [OBSERVED] Verified by live testing against production (`codeturtle-test-repo`, GitHub PRs #74-#100) on 2026-11-13.
- [HYPOTHESIS] Written in code or in docs but never observed working end-to-end. These are claims to be tested, not truths.

Anything in neither category is omitted on purpose.

## 1. What we have actually observed

### Output & rendering

- [OBSERVED] Posted comments render `<img src=".../review-icons/*.svg">` icons correctly in a light-theme GitHub PR comment (table rows, section headers, severity badges, terminal/progress comments).
- [OBSERVED] Emoji characters do not appear in any bot-posted text. Scannable; zero matches across `src/` and `content/`.
- [OBSERVED] Progress comment is created once per run and edited to a terminal state (`Review complete`, `Review complete (no findings)`, `Review unavailable`). Not duplicated within one run.
- [OBSERVED] Re-reviews (push of a trivial commit) produce a fresh progress comment alongside the previous one; the previous one stays posted (noisy, but terminal).
- [OBSERVED] Progress comments use the same turtle icon style as the new SVG set after the 8c8e258 deploy.

### Finding quality (live 4-scenario battery, after fix)

- [OBSERVED] PR #74 (all-bad fixture): 4/10, CHANGES_REQUESTED, 4 grounded findings (eval injection, hardcoded password, mutable state, loose equality). File:Lline refs point at the planted defects.
- [OBSERVED] PR #75 (token leak helper): 6/10, warning flagged the token exposure.
- [OBSERVED] PR #77 (auth guard removed): 5/10, warning flagged both removed guard and plaintext card logging.
- [OBSERVED] PR #92 (clean refactor): 6/10 with 2 issues (BOM + API-contract change vs PR intent) + 2 suggestions (template literal, remove "Ref" comment). All grounded.
- [OBSERVED] PR #94 (test-only): 7/10, 0 findings; intent respected.
- [OBSERVED] PR #91 (probe): 7/10, 0 issues, 1 suggestion (BOM); no "unused" noise.
- [OBSERVED] PR #93 (defect fixture): 3/10, CHANGES_REQUESTED, 4 issues (hardcoded secret, path traversal, sync I/O, missing error handling). Deterministic across two runs.
- [OBSERVED] PR #96 (docs-only): 9/10, no findings; docs intent respected.
- [OBSERVED] PR #97 (`lodash@4.17.20` → outdated): flagged with security finding.
- [OBSERVED] PR #98 (generated file): flagged duplication with a suggestion; no invented defects.
- [OBSERVED] PR #100 (28-file heavy fixture, ~27 planted defects): 4/10, CHANGES_REQUESTED, 5 issues all real (hardcoded config credentials [critical], weak session randomness, unsigned JWT, SQL injection, arbitrary file read), 0 false positives. ~22 planted defects were not reported (judge/verification caps + Google quota fallback to Groq).

### Failure behaviour

- [OBSERVED] When Google hit quota mid-run, reviews failed honestly: no score, no event ("every configured provider failed"), progress comment ends `Review unavailable - no code-quality judgement was made`. PR #76 and #79 both showed this.
- [OBSERVED] Groq `openai/gpt-oss-120b` fallback succeeded after Google quota failure and produced a genuinely good review on PR #100.
- [OBSERVED] The stale pre-`8c8e258` build posted "0/10 · Changes Requested · every configured provider failed" - that behaviour no longer appears.

### Limits hit / observed bypass

- [OBSERVED] Unlimited-special account ran PR #99 (105 files) despite the text implying 100-file guard; the guard did not enforce (your account is allowlisted). Guard behaviour for normal Free users was NOT observed.
- [OBSERVED] Google AI Studio free quota for `gemini-2.5-flash` was exhausted during one afternoon of testing; no cap number can be given from here, but it is far below a full day of iteration.

### Consistency

- [OBSERVED] When findings were present, the summary and issue list were consistent after the 5b8b625 reconcile fix; when no findings, summaries were honest "no findings, retry with stronger model".
- [OBSERVED] Event mapping is consistent with the decision rules exercised: CHANGES_REQUESTED only with real findings; COMMENT otherwise; 0-finding reviews floored at 7.

### Infrastructure checks

- [OBSERVED] `gh api repos/.../commits/<sha>/check-runs` returns `[]` for every PR in the battery - the GitHub App does not report a check run. No branch protection requiring `CodeTurtle Review` exists on the test repo.
- [OBSERVED] Deployed build `5b8b625` produced new-style terminal comments within ~90-180 s of a push.

## 2. Written in code, never observed live (treat as hypotheses)

Every claim here must be verified before being relied on.

### Plan product caps (`src/lib/billing.ts`)

- [HYPOTHESIS] Free: 20 reviews/month, 5 repositories, 5 reviews per PR, 3 commits per PR, 100 files per PR, no custom rules.
- [HYPOTHESIS] Pro: 100 managed reviews/month + unlimited BYOK, 10 repositories, 10 reviews per PR, $4/mo, custom rules.
- [HYPOTHESIS] Enterprise: unlimited, $49/mo, everything in Pro.
- [HYPOTHESIS] Special-limitless users bypass all caps and the 100-file/3-commit guards. [OBSERVED only for #99 file-guard case]

### Enforced code caps (`src/module/ai/lib/review.ts`)

- [HYPOTHESIS] `MAX_DIFF_CHARS = 24000` chars of diff reach the model; above this, hunk compression is applied.
- [HYPOTHESIS] `MAX_RAG_CHARS = 8000` chars of RAG context; up to 8 file chunks + 4 architecture queries.
- [HYPOTHESIS] `REVIEW_MAX_TOKENS = 8192` output cap per pass.
- [HYPOTHESIS] Issues cap 5 (4 in short mode), suggestions 4 (3 short), positives 3 (2 short).
- [HYPOTHESIS] Score clamp to findings: 0 findings → ≥7; 1 critical → ≤4; warnings → ≤6.
- [HYPOTHESIS] Read-through cache by `headSha` means re-review of the same head costs nothing (not verified; untested).
- [HYPOTHESIS] RAG symbol call-site retrieval is actually firing and improving findings (not verified; untested).

### Vercel + Inngest free-tier capacities

- [HYPOTHESIS] Inngest free ≈ 50,000 executions/month, 5 concurrent steps; one review ≈ 15-40 steps ⇒ ≈1.5-3k managed reviews per month theoretical ceiling (not measured; the Google quota bound was observed instead).
- [HYPOTHESIS] Vercel Hobby can host the demo workload for ~10-25 light free users at the 20-review/month cap sharing one Google project, but Hobby is non-commercial and this is not tuned or measured.
- [HYPOTHESIS] `repository.connected` indexes the repo into Pinecone; after that PRs get repo-aware context; index freshness depends on reindex events that have not been observed firing on push.

### Failure & provider paths

- [HYPOTHESIS] Pinecone free tier is sufficient for the test repo and small repos (not measured).
- [HYPOTHESIS] Provider fallback chain works as coded for all non-quota failures (observed only via Groq-after-Google).
- [HYPOTHESIS] `similar patterns` path: re-running the same PR head is served from `reviewContextCacheKey` and still produces a review comment (not tested; the re-verify pushes hit new SHAs each time).

### Hygiene

- [HYPOTHESIS] Docs folder uses a `docs/` markdown layout; the new `docs/BENCHMARKS.md` is therefore discoverable in-repo.
- [HYPOTHESIS] No check run will be created for PRs until the GitHub App is granted Checks read & write - this one we know is true by consequence of `gh api` being empty on every PR.

## 3. What one afternoon of testing taught us (summary)

- The code is capable of being genuinely useful on small, contained PRs — that is what was observed.
- The code is NOT strong enough on 200+ line multi-file PRs to catch everything; it does correctly find the big, obvious, grounded problems and leaves the rest.
- Provider quota is the single binding constraint on the free path; anything else is secondary.
- Enforcement of the paid/free split works in theory; the only live enforcement observed was the special-limitless bypass. Free-plan guards (`commits`, `files`) remain untested as packaged.

## 4. What would make this a real decision document

- A scripted A/B harness: 20 PRs × 3 models × 2 contexts (RAG on/off) with seeded defects, measuring precision/recall/tokens/latency.
- Latency distribution p50/p95 per review.
- Provider cost per review.
- Google quota burn rate per managed user per month at 20-review cap.
- Pinecone index success rate + query latency.
- Real Free-to-Pro conversion: how many free users hit the cap.
- Check-run delivery success rate after enabling Checks permission.

None of these exist today. Until they do, any single number in this file is provisional.
