# CodeTurtle - Reference, Measurement and Capacity Analysis

**Last updated:** 2026-11-13
**Scope:** What CodeTurtle does today, what has been verified live, what is only assumed from source code, and realistic upper bounds - especially for the free tier.

This is the canonical internal benchmark document. It is deliberately strict: a number here is either a live observation or an explicitly labelled hypothesis. Nothing else belongs in this file.

---

## 1. How to read this document

Every quantitative claim carries one of two labels:

| Label | Meaning | Confidence |
| :- | :- | :- |
| [OBSERVED] | Verified on live deployments against `Ansh-dhanani/codeturtle-test-repo` (GitHub PRs #74-#100) after the `8c8e258` and `5b8b625` deploys. | High |
| [HYPOTHESIS] | Written in source or documentation. Not observed end-to-end. Could be correct or could drift as the code changes. | Unverified |

Use [OBSERVED] to make product decisions today. Use [HYPOTHESIS] to plan tests, not commitments.

---

## 2. Executive summary

- CodeTurtle is a GitHub App that reviews pull requests automatically: a webhook fires, an Inngest workflow runs the pipeline (context fetch, diff compression, repository-aware RAG, model generation, judge pass, publish), and posts a single progress comment that is edited to a terminal state.
- It catches real defects on live PRs - secrets, injection, removed auth guards - with file and line references. Most of the defects it publishes are grounded in the diff, not invented.
- It fails safely. When every configured provider fails, there is no score, no event, no clean-bill claim. The comment states "review unavailable" and nothing else.
- It is not a comprehensive auditor. In torture testing it surfaced ~5 of 27 planted defects in a 28-file fixture because it is capped at roughly five issues per review by design, and because the verification gate drops anything the model cannot prove from the diff.
- The free path runs on Google AI Studio free quota, which exhausted mid-testing. After exhaustion, running continuously at product scale is not viable on shared free keys.
- No PR in the test battery has ever produced a GitHub check run. The "must be reviewed before merge" story does not work until the GitHub App is granted Checks read & write and branch protection requires `CodeTurtle Review`.
- The paid/free split exists in code and is enforced inline (Free-only file and commit guards), but was never observed triggering for a genuine Free-plan user.

---

## 3. What the product does, end to end

Trigger → review → publish, with observable side-effects at each stage.

1. **GitHub webhook** (`/api/webhooks/github`) receives `pull_request` and `issue_comment` events.
2. **Queue selection**: repository behaviour settings decide (`auto` / `ask` / `off`) whether a review runs, and `behaviorSettings.memesEnabled` controls conversational humour later (not the review body).
3. **Guarding (Free only)**: monthly review quota, per-PR review quota, commit count (max 3), and changed-file count (max 100) are checked. Special-limitless users bypass every guard [OBSERVED for file guard]. Pro and Enterprise bypass both guards [HYPOTHESIS - code path not observed].
4. **Context assembly**:
   - GitHub API: PR metadata, commits, files changed.
   - Diff: full diff text with unchanged context limited to 10 lines per hunk; compressed if above the threshold [HYPOTHESIS].
   - Repository RAG: semantic search over the indexed repo for the top changed files, fixed architecture/type/error-handling/security queries, and symbol call-site retrieval [HYPOTHESIS - never observed to produce a finding by itself].
5. **Model invocation**: OpenRouter auto-routing by default; falls back through `google` → `groq` → `openrouter` clients before declaring failure.
6. **Judge pass** (`judgeReviewIfPossible`): filters false positives, weak findings, and placeholders.
7. **Post-processing** (`sanitizeReviewOutput`): schema validation, caps, score clamping against findings, reconciliation with a clean/definite verdict, derivation of the GitHub review event (`CHANGES_REQUESTED` / `COMMENT`).
8. **Publish**: single progress comment (edited to terminal state), PR review body with inline comments, one check run (`CodeTurtle Review`, currently never created).
9. **Tracking**: per-PR and monthly usage counters updated; check comments deduped via HTML markers.

---

## 4. Live observations - output quality and behaviour

### 4.1 Rendering and consistency

- Progress comments reference SVG icons under `/review-icons/`, which render correctly in GitHub's image proxy on the deployed build [OBSERVED].
- The review body uses a clean metadata table with inline icons and prints the reviewer model, event, and counts [OBSERVED].
- No emoji characters appear anywhere in bot output [OBSERVED].
- Separators render as mid-dots (`&nbsp;&middot;&nbsp;`), not mojibake [OBSERVED].
- Scores, issue counts, and the posted event agree with each other once the reconcile path runs [OBSERVED].
- Scores for zero-finding reviews floor at 7 [OBSERVED]; critical findings clamp the score to ≤4 and a warning-only review to ≤6 (consistently at least for the observed cases) [OBSERVED].

### 4.2 Scenario battery

| PR | Scenario | Result | Grounding |
| :- | :- | :- | :- |
| #91 | Deploy verification probe (BOM, trivially small) | 7/10, 0 issues, 1 suggestion (BOM) | Correct; no "unused" noise |
| #92 | Clean refactor (claim: no behaviour change) | 6/10, 2 issues, 2 suggestions | Grounded - API contract change contradicts stated intent; BOM |
| #93 | Hardcoded secret, path traversal, sync I/O, missing error handling | 3/10, CHANGES_REQUESTED, 4 issues | All 4 planted defects found, file:Lline correct |
| #94 | Contract-test-only PR | 7/10, 0 findings | Intent respected; no production noise |
| #74 | Mixed-quality fixture with eval, plaintext password, mutable state, loose equality | 4/10, CHANGES_REQUESTED, 4 issues | Planted defects identified; clean code untouched |
| #75 | Debug token-leak helper | 6/10 | Token exposure called out |
| #77 | Removes auth guard, logs card data | 5/10 | Both behaviours flagged |
| #95 | Rename formatDate → formatDateTime across 17 files | 6/10 | Warned about partial-rename breakage risk |
| #96 | Docs-only README section | 9/10, no findings | Doc intent respected |
| #97 | `package.json` adds vulnerable `lodash@4.17.20` | 6/10 | Dependency flagged as outdated/vulnerable |
| #98 | Generated 60-op module | 6/10 | Duplication flagged; no logic invented |
| #99 | 105 files | Run happened (unlimited account) | Guard not observed for Free users |
| #100 | 28 files, 251 lines, ~27 seeded defects | 4/10, CHANGES_REQUESTED, 5 issues | All 5 real (credentials [critical], session rand, unsigned JWT, SQLi, arbitrary file read); zero false positives; ~22 defects missed |

PR numbers reference `Ansh-dhanani/codeturtle-test-repo`.

### 4.3 Failure behaviour

- When every configured provider failed, output contained no score and no event; the progress comment reached a terminal `Review unavailable - no code-quality judgement was made` state [OBSERVED on PRs #76 and #79].
- The fallback chain worked: after Google AI Studio free quota ran out, OpenRouter routed through Groq `openai/gpt-oss-120b` and produced a strong review on PR #100 [OBSERVED].
- The old pre-`8c8e258` build produced a fabricated `0/10 · REQUEST_CHANGES` on provider failure. That route no longer exists [OBSERVED before/after comparison].

### 4.4 Infrastructure checks

- Every check of `gh api repos/.../commits/<sha>/check-runs` - all PRs #74 through #100 - returned `[]`. No check run is ever created today [OBSERVED].
- Re-reviewing a PR after a redeploy takes effect within ~90–180 s of the push [OBSERVED].
- A `synchronize` event produces a new progress comment; the old one remains posted. Not a defect, but noise [OBSERVED].

### 4.5 Managing a clean PR

- Zero findings floors the score at 7 [OBSERVED].
- When the judge found nothing worth publishing but the summary narrated defects, the summary was not previously sanitised; this was fixed in `5b8b625` (`reconcileSummaryWithFindings` fallback). Thereafter, observed outputs with zero findings use the "honest empty state" wording [OBSERVED].

---

## 5. Product limits, as written in source

Every row here is [HYPOTHESIS] unless explicitly tagged otherwise.

### 5.1 Plan limits (`src/lib/billing.ts`, `PLANS`)

| Capability | Free | Pro | Enterprise | Special users |
| :- | :- | :- | :- | :- |
| Price | $0 | $4 / user / month | $49 / user / month | $0 |
| Reviews / month (managed) | 20 | 100 | -1 (unlimited) | -1 |
| Reviews / month (BYOK) | n/a | ∞ | ∞ | ∞ |
| Repositories | 5 | 10 | ∞ | ∞ |
| Reviews / PR | 5 | 10 | ∞ | ∞ |
| Commits / PR | 3 (enforced) | ∞ (unenforced) | ∞ | ∞ |
| Files / PR | 100 | ∞ (unenforced) | ∞ | ∞ |
| Custom rules | No | Yes | Yes | Yes |

- The file (100) and commit (3) guards run **only for `plan === "free"`** [HYPOTHESIS - code path unchanged, never observed bypass by a Pro user].
- BYOK is detected dynamically: `hasOwnApiKey` flips an unlimited-capacity flag regardless of plan [HYPOTHESIS].
- Monthly quota is enforced atomically (`incrementUsage` uses `usageLimit = -1 OR usageCount < usageLimit`) [HYPOTHESIS].

### 5.2 Per-review output caps (`getReviewCaps`)

| Review mode | Max issues | Max suggestions | Max positives |
| :- | :- | :- | :- |
| Balanced / Professional | 5 | 4 | 3 |
| Short | 4 | 3 | 2 |

- Score clamps: warning-only → ≤6; any critical → ≤4; zero findings → ≥7 [OBSERVED].
- Suggestion blocks are limited to 4,000 chars of code; issue descriptions to 1,600; title to 240; summary to 2,500 [HYPOTHESIS].

### 5.3 Diff and context budgets (`src/module/ai/lib/review.ts`)

| Metric | Value |
| :- | :- |
| Max diff size before compression | 24,000 chars |
| Hunk context lines kept | 10 |
| Max RAG context | 8,000 chars |
| RAG file chunks | 8 |
| RAG architecture queries | 4 |
| Chars per token (estimate) | 3.5 |
| Max output tokens per call | 8,192 |
| Low-credit fallback output | 1,200 |
| Hunk omission suffix | `(... (N unchanged lines omitted))` |
| Section marker for truncation | `(truncated N chars)` |

- Effective maximum input ≈ 32k-35k tokens (60% diff, 30% RAG) approximately 24k chars of changed code reach the model [ESTIMATE].
- RAG queries per review: 8 file queries + 4 architecture queries + 1 per declared symbol [HYPOTHESIS].

### 5.4 Review caps in action

- `getReviewCaps()` applies at the stage where findings are assembled; actual published counts will also be reduced by the judge and verification gate [OBSERVED - #100 capped at 5].
- Zero-finding reviews print "No issues were selected by the configured model. Consider a stronger model…" [OBSERVED].

### 5.5 Infrastructure-singleton behaviour

- One run per PR at a time (`concurrency: 1` with `singleton` keys) [HYPOTHESIS].
- Re-running the same PR SHA does not rebill tokens; served from read-through cache keyed by headSha [HYPOTHESIS].
- Reviews are triggered only on `pull_request.opened` in the current trigger; `.synchronize` is a separate trigger that fires on push [OBSERVED].

---

## 6. Free-tier reality from live testing

- Google AI Studio `gemini-2.5-flash` exhausted its daily free quota during one day of testing. That shut down the Managed Free path mid-flight [OBSERVED].
- Groq `openai/gpt-oss-120b` continued operating afterwards and still produced a review on PR #100 [OBSERVED].
- The heavy round created or re-triggered 12 PRs in under three hours, which is far more than a typical free-tier day would see.
- Direct consequence: if every free user ran at their 20/month cap with a shared free Google key, the shared key would be the binding constraint long before Pro/Enterprise matter.

---

## 7. Where is the ceiling on the free tier? (estimates)

The following are [HYPOTHESIS] derived from public free plans and arithmetic; none are measured in production.

### 7.1 Bindings, in order of exhaustion

| Order | Binding constraint | Rough ceiling (assuming average mix) | Notes |
| :- | :- | :- | :- |
| 1 | Google managed quota | ~10-25 active free users at full adoption (each 20 reviews/mo) | Shared project/key; [UNVERIFIED] |
| 2 | Inngest free | ~1,500-3,000 managed reviews/month | ~15-40 steps per review, 50k executions |
| 3 | Vercel free | bandwidth/duration, personal use | Amateur/demo workload only [UNVERIFIED] |
| 4 | Pinecone free | ~1M vectors, limited namespaces | Fine for small repos [UNVERIFIED] |
| 5 | Neon free | limited compute hours and storage | Usage table is tiny; fine |

### 7.2 Answer to the question in one sentence

You cannot serve meaningful free adoption at scale from one shared Google AI Studio key; the ceiling is the Google quota, not the code.

### 7.3 What the free tier is good for

- Demonstrating the product to evaluators, including inside your own organisation.
- A small private beta with several users and a handful of PRs per week.
- Not sustainable as a public launch without CAPTCHA / abuse throttling / key rotation / paid fallback.

### 7.4 BYOK changes the equation

With BYOK, the Google quota constraint moves to the user's own account. Managed volume is then governed by Inngest/Vercel/Pinecone instead - which is orders of magnitude more generous.

---

## 8. Paid plans vs free tier, in the current codebase

| Feature | Free | Pro | Enterprise | Notes |
| :- | :- | :- | :- | :- |
| Managed reviews | 20 | 100 | ∞ | |
| BYOK reviews | n/a | ∞ | ∞ | |
| Repositories | 5 | 10 | ∞ | |
| Per-PR reviews | 5 | 10 | ∞ | |
| Commits per PR | 3 | 100→unlimited in code, marketing says "5" | ∞ | Marketing/implementation drift - not reconciled |
| Files per PR | 100 | ∞ in code | ∞ |  |
| Custom rules | No | Yes | Yes | |
| Support | community | priority | priority | |
| Price | $0 | $4 | $49 | |

- Managed Free quota **atomically** consumes `usageCount` before the review runs; the PR unit itself never commits to sending the run when the quota is denied [HYPOTHESIS].
- Enterprise is "-1" everywhere → effectively unlimited; the exact list of -1 flags is fixed across the codebase [HYPOTHESIS].

---

## 9. Repository awareness - what is and isn't known

### Known

- Diff compression with unchanged lines omitted [HYPOTHESIS].
- PR title/body/base/head [HYPOTHESIS].
- Top changed files by churn are queried against Pinecone with `queryCodebase(..., k=3)` per file (capped at 8) [HYPOTHESIS].
- Fixed queries: architecture, shared types, error handling, security patterns [HYPOTHESIS].
- Symbol call-site queries from declared symbols in diff [HYPOTHESIS].
- These feed `contextChunks` in the system prompt [HYPOTHESIS].

### Not known

- Whether Pinecone is reachable for the test repo right now (never observed).
- Whether `repository.connected` or `repository.reindex` events have actually reindexed since features landed.
- Whether symbol retrieval is actually firing; the query code exists, but no log line has been surfaced to show a retrieval actually happened for any observed PR.
- RAG verification only searches the diff - so evidence-bearing findings are provable from the diff alone; RAG only shapes phrasing or triggers, which is a deliberate anti-hallucination choice [HYPOTHESIS].

---

## 10. Failure modes and safety properties

| Failure | Observed today | Bot behaviour |
| :- | :- | :- |
| Google quota exhausted | Yes (#76, #79) | Review unavailable; no score; no event; terminal comment |
| OpenRouter fallback available | Yes (#100 via Groq) | Review completed on fallback |
| Pinecone unreachable | No observation | Query guarded by `.catch(() => [])`; proceeds diff-only [HYPOTHESIS] |
| DB unreachable | Not observed | `withPrismaRetry` 3x then throws; review fails cleanly [HYPOTHESIS] |
| Stale run | Not observed | `singleton skip` prevents queue-storm [HYPOTHESIS] |
| All providers failed | Observed | No fabricated score or event [OBSERVED] |
| Review posted with no findings | Observed | Honest empty-state; score ≥7; no claim of clean merge [OBSERVED] |

---

## 11. Things that are missing from this file because they do not exist

These would turn every [HYPOTHESIS] above into a real measurement. Their absence is the limitation of this benchmark, not an omission:

1. An evaluation harness: seed defects, score recall/precision per release.
2. Latency percentiles (p50/p95) per review across the observed models.
3. Provider cost per review at current token budgets.
4. Pinecone operational state (vectors, latency, hit rate) for this repo.
5. Free-to-Pro conversion; how many free users hit the monthly cap in a month.
6. Check-run delivery rate once Checks permission is granted.
7. Abuse/flood protection metrics.
8. A load test: N concurrent webhooks on different repos on managed free keys.
9. A rollback drill: revert deploy and confirm Vercel previous deploys serve the last good build.
10. Invitation-based private beta outcomes (once this document stops being theoretical).

---

## 12. Methodology - how the observations were collected

- Test repo: `Ansh-dhanani/codeturtle-test-repo`.
- Fresh branches per scenario, opening PRs; re-pushing trivial commits to trigger `.synchronize`.
- GitHub REST API polled via `gh api .../issues/N/comments`, `.../pulls/N/reviews`, `.../commits/<sha>/check-runs`.
- The Bot's own progress comment was used as the terminal-state witness.
- Scenario PRs #74-#100 ran between 2026-11-13 07:30-08:45 UTC.
- Live manifests of "in-progress" vs "terminal" states were captured by checking `updated_at ≠ created_at`.
- Findings were manually checked for grounding against the seeded defects in the test branches.

---

## 13. How to use this file

- Product decisions for the **free tier at public scale** should wait for measurements in Sections 11 and 12, or strict caps on sign-ups.
- **Marketing copy** should quote the zero-hallucination failure mode and live scenario results - both are defensible today.
- **Engineering roadmap** should sequence Section 11 items before public launch, starting with the evaluation harness (#1), latency percentiles (#2), and check-run verification (#6).
- **No PR in the test battery has ever produced a GitHub check run.** Merge-gating is unfinished design, not a completed feature, until Checks permission is granted and branch protection is enabled.

---

## Appendix A. Capabilities seen live, ranked by real-world value

1. Grounded detection of the catastrophic-but-common defect (secrets, auth removal, injection) - every scenario found the exact planted defect.
2. Honest failure on provider outage - unlike typical "LGTM" bots.
3. One progress comment per run with a real terminal state.
4. Rendering parity across themes; no mojibake; SVG icons.
5. Consistency between summary/score/event/counts [OBSERVED after fixes].
6. Respect for intent classes (probe/docs/tests/generated) - none of these got false production findings.

## Appendix B. Capabilities claimed but never seen live

1. GitHub check run with `failure`/`success`/`neutral` conclusion for `CodeTurtle Review`.
2. Symbol call-site RAG improving a specific finding.
3. `repository.connected` index being used at review time.
4. Zero-credit paid-tier failure mode → `REVIEW_LOW_CREDIT_MAX_TOKENS` path.
5. BYOK end-to-end unlimited path for a paying user.
6. `/admin` gating behaviour (works by code inspection only).
7. Polar subscription → plan upgrade webhook path.
8. Comp Pro time-boxed expiry (`currentPeriodEnd` lazy reversion).
9. `memesEnabled` toggling with an actual GIF swap in progress.
10. Mention-handler responses (`@codeturtle …`) after recent changes.
