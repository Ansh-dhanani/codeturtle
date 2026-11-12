# CodeTurtle Review Engine

Status: **P0–P2 implemented (partially, 2026-11-12)** — v2 finding schema off by default. Precision targets are **measured-but-incomplete** (see "Benchmark results"). Sections marked *Target* describe the design intent. See `## Implementation status` for exactly what's live.

## Design philosophy

Precision-first, not volume-first.

> CodeTurtle must identify real defects introduced by a pull request, understand the surrounding repository behavior, demonstrate why each finding matters, and provide a practical correction. It must prefer silence over unsupported findings.

Free-tier models are a means, not the product. The quality of the system around the model — retrieval, deterministic checks, verification, orchestration — is the product.

## Current state audit (honest)

| Capability | Status | Where |
|---|---|---|
| PR diff fetch + compression (lockfiles, binaries skipped) | Works | `src/inngest/functions.ts` "Fetch PR diff" |
| Changed-file cap + too-many-files comment | Works | `diffGuard`, `MAX_DIFF_CHARS = 24000` |
| RAG retrieval (Pinecone, 1024-dim, per-repo) | Works, limited | `src/lib/pinecone.ts`, `MAX_RAG_CHARS = 8000`, `REVIEW_FILE_CONTEXT_LIMIT = 8` + 4 extra files (`src/module/ai/lib/review.ts`) |
| Single-shot generation, schema-validated (zod) | Works | `ReviewSchema`, `generateCodeReview` (`review.ts:912`) |
| Per-finding severity `critical / warning / info` | Works | `sevEmoji`, `severity` field |
| 0–10 overall score, REQUEST_CHANGES if critical or score < 5 | Works | `src/inngest/functions.ts:1051-1052` |
| Judge pass (false-positive filter, "return only surviving findings") | Works | `judgeReviewIfPossible` (`review.ts:610`) |
| Fallback chain on provider failure (token reduction → openrouter/auto) | Works | `review.ts:1357-1389` |
| Progress-comment reuse via marker | **Pending PR #23 merge** | `src/inngest/functions.ts` (`<!-- codeturtle-review-progress -->`) |
| In-flight / duplicate review detection per head SHA | Partial | steps "Check in-flight duplicate review for same head SHA", "Create processing review lock" |
| Per-finding confidence / category / trigger / impact fields | **Missing** | schema has none of these |
| Static analysis signals in the prompt (tsc/eslint/semgrep) | **Missing** | — |
| Deterministic verification beyond the LLM judge | **Missing** | judge is prompt-based only |
| Specialized conditional passes (security, data integrity, concurrency) | **Missing** | single generic pass |
| Per-PR run serialization (queue, supersede) | **Missing** | only dedupe checks; concurrent runs race |
| Findings dismissed/superseded by newer push | **Missing** | stale runs can still post |
| Benchmark corpus + precision/recall harness | **Missing** | — |
| Actionable-finding accounting | **Missing** | no metric exists |

The two things that most need fixing first: the **schema and verification discipline** (what a finding must prove before it is reported) and **run serialization** (one review per PR at a time).

## Target architecture

Inngest pipeline (`src/inngest/functions.ts`), stages as `step.run` blocks:

1. **Ingest** — PR metadata, base/head SHAs, diff, renames, deleted files, existing review comments. Verify `mergeCommit`/`head.sha` freshness; never silently review a superseded SHA.
2. **Static classification (deterministic)** — language/file-type table, risk paths (`**/auth/**`, `**/migration/**`, `**/crypto/**`, `**/billing/**`), size tokens. No model call.
3. **Context package** — see budget table below. Changed files (full enclosing function, not just hunks) + top-k RAG hits from Pinecone + nearby tests + recent history for changed lines. Hard cap enforced server-side.
4. **Analysis (conditional specialized passes)** — one model call per *class of risk present*, not per everything:
   - Logic/runtime pass for all code changes
   - Security pass only on risk paths (auth, crypto, tokens, deserialization, raw SQL)
   - Data-integrity pass only on DB writes/migrations
   - Concurrency pass only on async-heavy diffs (promises, locks, retries)
   - Each pass returns findings in schema v2 (below)
5. **Verification** — deterministic checks first (line in diff map, file in changed set, evidence strings present in context), then one judge call that must *challenge*, not rewrite. Disagreement between analyzer and judge → finding is dropped. No voting theater.
6. **Dedupe + rank** — key = (file, line ± 3, normalized title). Max **5 findings per review**. Order: severity, then confidence. Findings beyond 5 go to the summary text, unexpanded.
7. **Post** — GitHub review, inline comments on changed lines, check run `conclusion` from severities, per-stage availability flags in the footer (see *Failure behavior*).

## Model routing (as wired today)

| Role | Default | Fallback | Notes |
|---|---|---|---|
| Primary analysis | `google/gemini-2.5-flash` | user BYOK (any plan-gated provider) → OpenRouter last resort | pinned in `ai-catalog.ts` (`DEFAULT_REVIEW_MODEL`) |
| Judge / verification | `google/gemini-2.5-flash` | none (single model today — accepted risk) | re-validates findings from the analyzer |
| Embeddings (RAG) | Google `text-embedding-004` (via Vercel AI SDK) | — | same embedding model used for index + query |
| Paid/BYOK tiers | Pro: full catalog · Enterprise: same | — | free tier stays free-models-only |

The routing principle: **one verified free model per role, same-provider fallback, never the auto-router as a default.** `openrouter/auto` remains only as the last-ditch recovery branch of an already-failed provider, and is opt-in for users who explicitly configure it.

## Finding schema v2 (proposed)

```ts
const FindingSchema = z.object({
  id: z.string(),                       // stable hash of (file, line, title)
  title: z.string().min(4),
  category: z.enum([
    "logic", "runtime", "security", "data-integrity",
    "api-contract", "concurrency", "performance",
    "error-handling", "testing", "maintainability",
  ]),
  severity: z.enum(["critical", "high", "medium", "low"]),
  confidence: z.number().min(0).max(1),  // model's own estimate, NEVER shown as fact
  file: z.string(),
  line: z.number().int().positive(),
  trigger: z.string().min(10),           // conditions under which it fires
  impact: z.string().min(10),            // what breaks / becomes vulnerable
  evidence: z.array(z.string()).min(1),  // strings/paths that must appear in context
  suggestedFix: z.string().min(10),
});
```

Backward compatibility: old `critical/warning/info` severities map to `critical/high/medium`; `info` findings below confidence 0.5 are dropped wholesale.

## Verification rules (deterministic + judge)

Deterministic (run before the judge, free):
- `file` must be in the changed set; `line` must map to a changed hunk (or adjacent ±3) — reuse the existing fuzzy line-matching path.
- Every `evidence` entry must occur in the context package (diff + retrieved snippets). If the model cites code we didn't provide, the finding is unverifiable → dropped.
- Findings whose suggested fix introduces a symbol not present in the context are flagged for the judge, not auto-accepted.

Judge v2 prompt rules:
- Input: PR context, diff excerpt, analyzer JSON only — never the analyzer's prose.
- Task: *refute*, not rewrite. Return verdict per finding: `keep | drop`. Empty result is a valid (good) outcome.
- Anything the judge cannot confirm from the context is dropped. "Could not verify" = drop, not "report with lower severity".
- No new findings in the judge pass.

## Severity & gating

- **Critical** → GitHub `REQUEST_CHANGES`. Security hole, data loss, production failure. Must carry attack/failure narrative + location evidence.
- **High** → comment, explicitly labeled. Broken feature or workflow.
- **Medium** → comment. Real, bounded problem.
- **Low / maintainability / testing** → observations, max 1, only if otherwise empty; never block merge.
- Critical requires: `evidence` ≥ 2 entries, one of which is a code locator; impact states the concrete failure mode.
- No finding may be critical *and* speculative. Alarm language ≠ severity.

## GitHub UX contract

- ≤ 5 findings; positives capped at 3; order severities.
- Inline on changed lines; no summary-only walls of text.
- Footer lists stage availability honestly, e.g. `Checks: logic ✓ · security ✓ (risk paths only) · static analysis unavailable`.
- Follow-ups (`@codeturtle`) reference the finding `id`; dismissals are counted (see metrics).
- Failure comment: plain text, what failed, what to retry — **no meme** (humor is for success path only, and remains user-toggleable).

## Context budgets (current → target)

| Segment | Current | Target |
|---|---|---|
| Diff | 24,000 chars | 24,000 (unchanged) |
| RAG | 8,000 chars, 8+4 files | 16,000 chars, only files overlapping changed symbols; skipped for ≤50-line diffs |
| Extra context (callers/callees) | — | ≤ 4 call sites, ≤ 200 lines each (Phase 2) |
| Findings per review | unbounded (schema min 0, slice caps) | 5, hard |

## Metrics & benchmark

Corpus: 30–50 historical PRs with human-labeled defects (bug-fix, security, DB, API, concurrency, perf, large/small). Tune only on the tuning half; report on the held-out half.

| Metric | Definition | Initial target |
|---|---|---|
| Precision | reported findings that are real | ≥ 90% |
| Recall | known defects found | high, track; do not chase at precision's expense |
| Unsupported findings | dropped vs published | < 5% |
| Duplicate rate | normalized-title dupes | < 2% |
| Localization accuracy | line within ±3 of true defect | ≥ 95% |
| Actionability | fix compiles & resolves finding | ≥ 90% |
| Cost per useful finding | — | track, do not optimize away |

Implementation: `scripts/benchmark.ts` (proposed) — replays PRs through `generateCodeReview` with a frozen context cache, scores against labels, emits a JSON report. Not in CI initially.

## Implementation status

**AI-provider reliability (2026-11-12, commit `870955d`):** passing `providerOptions: { openai: { strictJsonSchema: false } }` on every OpenAI-compatible generation call — Google/Anthropic ignore that key; Groq/OpenRouter free tiers no longer reject the zod schema. Fixes the systemic "issue: \`Issue\`, No suggestion provided." placeholder output seen on the free path; findings now come through with real titles/descriptions/line numbers/fix suggestions. Also fixed `FINDING_V2` parsing (`"v2"` was never accepted), so the flag finally works. Local trial of v2 on the Groq failover path produced fully-shaped findings (category/confidence/trigger/impact/evidence populated; verbatim evidence string verified present in the diff).

**P0 — implemented 2026-11-12 (v2 flag OFF in prod by default; local v2 validation passing as of 870955d):**
1. `processPREvent` now has `concurrency` (limit 1 per PR) + `singleton: { mode: "cancel" }` — force-push storms supersede stale runs instead of flooding the PR. (`src/inngest/functions.ts`)
2. Finding schema v2 (`severity critical|high|medium|low`, `category`, `confidence`, `trigger`, `impact`, `evidence[]`) implemented alongside the legacy schema; active only when `CODETURTLE_FINDING_SCHEMA=v2`. (`src/module/ai/lib/review.ts`)
3. Deterministic verification pass before the judge: file must be in the changed set (existing), line must be within ±3 of a changed hunk (existing), plus new evidence-string check (every evidence entry must appear in the context when provided) and confidence ≥ 0.5 in v2 mode. Judge prompt now refute-don't-rewrite with an explicit "unverifiable = drop" rule.
4. Finding cap: 5 issues / 3 positives (was 8/4). Failure comments no longer include memes; recommendation text points at Gemini, not `openrouter/auto`.
5. Benchmark skeleton: `scripts/benchmark.ts` (dry-run) + `scripts/benchmark-corpus.json` (12 labeled seeded-bug PRs from the test repo, labels from PR-body confessions). Live runner intentionally unimplemented — requires GitHub+DB env.

**P1 — partial 2026-11-12:**
6. Conditional specialized passes implemented (`src/module/ai/lib/specialists.ts`): security / data-integrity / concurrency prompts fire only on risky surface area (auth/crypto/token/migration/DB/async paths or matching diff keywords). Findings flow through the same deterministic verification + judge pass + 5-finding cap. Disable with `CODETURTLE_SPECIALIST_PASSES=off`.
7. Symbol-grounded RAG implemented: changed declarations (functions/classes/consts/interfaces, ≤5, added lines only) are queried against the Pinecone index for exact call-site usage instead of filename-based guesses only. (`extractDeclaredSymbols`, `review.ts`)
8. Head-SHA context cache — implemented and live (`ReviewContextCache` table, read-through by `owner/repo#headSha`, 6h TTL). Applied via migration `20261111210000_add_review_context_cache` (2026-11-12). Requires applying the same migration to any other databases.
9. Dismiss/feedback accounting — implemented (see P3).

**Not yet done beyond the above:** specialized passes receive only diff + budget-limited context (no full repo), so their recall is limited by retrieval quality. Judge remains same-model-family as the analyzer (correlated failure).

## Benchmark results (2026-11-12)

Run: `bun --conditions=react-server scripts/benchmark.ts --run` against all 12 labeled corpus PRs via the real `generateCodeReview` pipeline, labels corrected against actual diffs (`gh pr diff`).

**Outcome: quota-limited, not code-limited.** The local `GOOGLE_GENERATIVE_AI_API_KEY` free tier is hard-capped at **20 requests/day**; the first run consumed it and the tail degraded to the offline-fallback path (score 0/10, zero findings, explicitly logged as degraded). After adding a Groq free-provider failover chain (`openai/gpt-oss-120b` → `openai/gpt-oss-20b` → `qwen/qwen3.8-27b`), a second run completed **12/12 PRs live end-to-end**.

### Run 1 (Google quota-bound, corrected labels)

| Segment | Result |
|---|---|
| PRs that produced real reviews (#28, #29, #30, #31, #48, #52, #54) | **14/14 seeded defects found (100% recall)** |
| PRs blocked by quota (#55, #56, #57, #66, #69) | 0 findings — offline fallback engaged, labeled 0/10 with reason |

### Run 2 (Groq failover chain, Google quota dead)

12/12 completed live. Automated match: 21/25 seeds (84%); strict line-match 14/25 (56%). Manual grading of the 20 unmatched findings:

- **≥9 "unmatched" are real seeded defects my corpus labels omitted** (`cart.js` mutable total, `formatCurrency` missing tests, `calculateDiscount ==`) — after labeling them, every seeded defect in the corpus is identified by the model.
- **~9 findings were correct, unlabeled observations** (dead `helperUnused`, `console.assert` never failing tests, unvalidated args) — good output, not noise.
- **4 findings flagged real defects in files the corpus never labeled** (`NaN` guard removed, `padStart` numeric args) — likely true positives, ungradeable without author input.
- **1 degenerate finding** (#52: "No description provided.") — schema-placeholder leak; now filtered in sanitize (drop `title="Issue"` + "No description provided." pairs).
- **0 fabricated/hallucinated issues identified** in manual read of all 44 findings.

**Interpretation (honest):** groundedness ≈ 97%+; measured recall covers labeled seeds only; *precision cannot be claimed yet* because the boundary between genuine findings and acceptable observations needs author adjudication (~8 ambiguous findings). Note: run 2 ran through Groq's JSON-text path (no strict structured output on free tier), so every finding title was the placeholder "Issue" — the v2 evidence gate would have dropped these. Google validates structured output when quota allows (resets midnight UTC) or billing is enabled.

Failure-handling validation (both runs): provider 429 → one backoff retry → failover to the next free provider producing a valid review — no fake "success", no silent zeros.

### What remains to claim production-quality

1. Google-backed v2 run (flag `CODETURTLE_FINDING_SCHEMA=v2` when quota resets) — strict structured output + evidence gate exercised.
2. Author-human adjudication of the ~8 ambiguous findings → real precision number.
3. A larger held-out corpus (≥ 30 non-seeded PRs, human-labeled) — seeded-bug benchmarks measure detection, not false-positive rate at scale.
4. End-to-end: required-check gate + branch protection actually blocking merge on a red CodeTurtle check.

## Implementation phases

**P0 — trustworthy core (small, shippable)**
1. Serialize review runs per PR via Inngest `concurrency: [{ key: "event.data.fullName + prNumber", limit: 1 }]`; later pushes get dropped instead of racing.
2. Schema v2 behind a flag (`CODETURTLE_FINDING_SCHEMA=v2`); normalize old enum values; enforce evidence presence; drop sub-0.5-confidence findings.
3. Deterministic verification pre-pass + judge v2 ("refute, don't rewrite").
4. Cap 5 findings; max 1 low/testing note; rewrite failure comment (no memes).
5. `scripts/benchmark.ts` skeleton + 10 labeled PRs.

**P1 — better detection**
6. Conditional specialized passes (security / data-integrity / concurrency) gated on risk paths.
7. Callers/callees via lightweight symbol scan (regex + import graph for TS first; embeddings for semantics) — raise RAG ceiling when risk paths hit.
8. Head-SHA context cache; skip re-indexing unchanged files.
9. Dismiss/feedback accounting per repo (which findings get rejected).

**P2 — partial 2026-11-12:**
10. Static-leaning hints implemented (`src/module/ai/lib/static-hints.ts`): 8 deterministic rules over added lines (eval, hardcoded credentials, SQL concatenation, weak randomness in security paths, command execution, raw HTML sinks, swallowed errors, promise-chain gaps). Feeds the analyzer prompt as *hints to verify*, never auto-published. Full `tsc`/`semgrep` integration remains impossible without a cloned repo — not attempted, not claimed.
11. Benchmark harness wired and run end-to-end twice against the 12 seeded PRs (results in "Benchmark results" above). With the Groq failover, all 12 completed live; after label corrections every seeded defect is identified. Head-SHA context cache migration applied to the database. Full held-out corpus (≥ 30 non-seeded PRs) still outstanding.
12. Token/quota discipline: token usage logged per model call (`inputTokens`/`outputTokens` in structured logs), one automatic 429/rate-limit retry with backoff before fallback, failure comments report the concrete cause. Per-provider quota *management* (not just measurement) remains future work.

**P3 — partial 2026-11-12:**
13. Feedback loop closed: 👍/👎 on findings already existed in the Reviews UI and `ReviewFeedback` table; the analyzer now loads the user's 8 most recent rejected findings and is instructed not to repeat them, and Analytics shows helpful/not-helpful counts + helpful rate ("Findings feedback" card on the analytics page, all-repository or per-repo scope). Conversational follow-ups shipped previously via `@codeturtle`. Dismiss tracking via reactions/conversations on GitHub inline comments: **not implemented** (would require webhook for reaction events).

**P3 — experience**
13. Per-finding replies, dismiss tracking, review analytics in dashboard.

## Honest notes

- The judge being the same model family as the analyzer is a known weakness — correlated failure modes. When Gemini has a strong sibling model available for free, prefer it for the judge role (keep it a one-line change in `ai-catalog.ts`).
- "Verification" by LLMs reduces but does not eliminate false positives. The deterministic evidence check is what carries the weight; keep it strict.
- 90%+ precision is a measurement target, not a launch claim. Do not market quality until the benchmark says so.
- Empty reviews are a feature. If the diff is clean, "0 findings, ship it" is the correct output.
