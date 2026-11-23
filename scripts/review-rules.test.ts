/**
 * Deterministic regression tests for the review post-processing rules.
 * These cover the audit failures that must never regress:
 *  - provider failure must not become a score/event
 *  - a summary must not claim defects that were not published
 *  - no-op suggested patches are rejected
 *  - probe/test PRs do not get "unused file" findings
 *  - score, findings, and event cannot contradict each other
 *
 * Run with: bun scripts/review-rules.test.ts
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://user:pass@localhost:5432/codeturtle_test";

export {};

const {
  classifyPrIntent,
  isNoOpCodeChange,
  reconcileSummaryWithFindings,
  clampScoreToFindings,
  deriveReviewDecision,
  resolveReviewEvent,
  stripEmojis,
  applySeverityPolicy,
} = await import("../src/module/ai/lib/review");
const { extractStaticHints, formatStaticHintsAsCandidates } = await import("../src/module/ai/lib/static-hints");
const { reviewIcon, reviewCategoryIcon } = await import("../src/lib/review-icons");
const { classifyMentionIntent } = await import("../src/lib/mention-intent");
const { sanitizeMermaidDiagram } = await import("../src/lib/mermaid");
const { isCodeSuggestion, findCodeFix } = await import("../src/lib/suggestion");
const {
  buildReviewDescriptionReport,
  upsertReviewDescription,
  REVIEW_REPORT_START,
  REVIEW_REPORT_END,
} = await import("../src/lib/review-description");

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}`, detail ?? "");
  }
}

// --- PR intent -------------------------------------------------------------
check(
  "pipeline probe PR is classified as such",
  classifyPrIntent("test: pipeline probe", "Intentionally trivial - exists only so the bot runs once").kind ===
    "pipeline-probe",
);
check(
  "test-only PR is classified as such",
  classifyPrIntent("tests: add fixtures", "Adds test coverage for the refund service").kind === "test-only",
);
check(
  "normal feature PR stays production",
  classifyPrIntent("feat: refund pipeline", "Implements refund policy and gateway routing").kind ===
    "production",
);

// --- No-op patch detection -------------------------------------------------
check(
  "identical before/after is a no-op",
  isNoOpCodeChange("console.assert(add(2, 3) === 5);", "console.assert(add(2, 3) === 5);"),
);
check(
  "trailing-whitespace-only difference is still a no-op",
  isNoOpCodeChange("const x = 1;  \n", "const x = 1;\n"),
);
check("real change is not a no-op", !isNoOpCodeChange("let total = 0;", "let total = 0.0;"));

// --- Summary / findings consistency ---------------------------------------
const reconciled = reconcileSummaryWithFindings(
  "This PR introduces critical security vulnerabilities and logs card numbers.",
  [],
  [],
);
check(
  "summary claiming defects with zero issues is replaced",
  !/critical security vulnerabilities/i.test(reconciled) && /No validated findings/i.test(reconciled),
  reconciled,
);

const cleanSummary = reconcileSummaryWithFindings("Looks good, ready to merge.", [
  { title: "Missing auth", description: "No guard", file: "a.ts", severity: "critical", suggestion: "add guard" },
] as never, []);
check(
  "clean summary with findings is corrected",
  /Validated findings: 1/i.test(cleanSummary),
  cleanSummary,
);

const honestClean = reconcileSummaryWithFindings("No critical issues found; minor naming follows.", [], []);
check("honest clean summary is preserved", /No critical issues found/i.test(honestClean), honestClean);

const defectNarrative = reconcileSummaryWithFindings(
  "However, a Byte Order Mark (BOM) character was inadvertently added to server.js, which can cause subtle issues. The endpoint's API contract changed, which contradicts the stated intent.",
  [],
  [],
);
check(
  "defect narrative with zero findings is replaced by the honest fallback",
  /No validated findings/i.test(defectNarrative) && !/Byte Order Mark \(BOM\)/i.test(defectNarrative),
  defectNarrative,
);

// --- Score calibration -----------------------------------------------------
const criticalIssues = [
  { title: "x", description: "x", file: "a.ts", severity: "critical" as const, suggestion: "x" },
];
const warningIssues = [
  { title: "x", description: "x", file: "a.ts", severity: "warning" as const, suggestion: "x" },
];
check("critical finding caps score at 4", clampScoreToFindings(9, criticalIssues as never) === 4);
check("warning finding caps score at 6", clampScoreToFindings(9, warningIssues as never) === 6);
check("zero findings floors score at 7", clampScoreToFindings(2, [] as never) === 7);

// --- Event derivation ------------------------------------------------------
check(
  "critical finding requests changes",
  deriveReviewDecision({ issues: criticalIssues, overallScore: 4 }).event === "REQUEST_CHANGES",
);
check(
  "zero issues never requests changes",
  deriveReviewDecision({ issues: [], overallScore: 1 }).event === "COMMENT",
);
check(
  "warning-only review comments unless score is low",
  deriveReviewDecision({ issues: warningIssues, overallScore: 6 }).event === "COMMENT",
);
check(
  "low score with findings requests changes",
  deriveReviewDecision({ issues: warningIssues, overallScore: 3 }).event === "REQUEST_CHANGES",
);

// --- Emoji stripping --------------------------------------------------------
check(
  "emoji and variation selectors are removed from model output",
  stripEmojis("Looks good \u{1F389} but check this \u{2600}\u{FE0F} carefully") === "Looks good but check this carefully",
);
check(
  "normal ASCII text is preserved untouched",
  stripEmojis("No issues found in src/index.ts") === "No issues found in src/index.ts",
);

// --- Severity policy -------------------------------------------------------
check(
  "hardcoded secret upgrades to critical",
  applySeverityPolicy({ title: "Hardcoded credential", description: "STRIPE_SECRET is hardcoded", evidence: ["STRIPE_SECRET = sk_live_..."], severity: "warning" }).severity === "critical",
);
check(
  "auth guard removal upgrades to critical",
  applySeverityPolicy({ title: "Removed auth guard", description: "requireAdmin no longer checks role", evidence: ["return;"], severity: "info" }).severity === "critical",
);
check(
  "SQL injection upgrades to critical",
  applySeverityPolicy({ title: "SQL injection", description: "SQL string built with concatenation", evidence: ["SELECT * FROM users WHERE id = '${id}'"], severity: "warning" }).severity === "critical",
);
check(
  "path traversal upgrades to critical",
  applySeverityPolicy({ title: "Path traversal", description: "Path traversal vulnerability", evidence: ["path.join(base, userId)"], severity: "warning" }).severity === "critical",
);
check(
  "weak randomness in security context upgrades to critical",
  applySeverityPolicy({ title: "Weak random", description: "Math.random in session token", evidence: ["Math.random()"], severity: "info" }).severity === "critical",
);
check(
  "unsigned JWT upgrades to critical",
  applySeverityPolicy({ title: "Unsigned JWT", description: "JWT uses alg none", evidence: ["alg: 'none'"], severity: "warning" }).severity === "critical",
);
check(
  "non-security finding keeps model severity",
  applySeverityPolicy({ title: "Naming", description: "Variable should be renamed", evidence: [], severity: "info" }).severity === "info",
);
check(
  "critical stays critical",
  applySeverityPolicy({ title: "Hardcoded secret", description: "password hardcoded", evidence: ["password = 'x'"], severity: "critical" }).severity === "critical",
);

check("own PR cannot request changes", resolveReviewEvent("REQUEST_CHANGES", "codeturtle-bot[bot]") === "COMMENT");
check("other authors still get REQUEST_CHANGES", resolveReviewEvent("REQUEST_CHANGES", "octocat") === "REQUEST_CHANGES");
check("own PR with COMMENT stays COMMENT", resolveReviewEvent("COMMENT", "codeturtle-bot[bot]") === "COMMENT");

// --- Static hint candidates ------------------------------------------------
const candidateHints = extractStaticHints([
  "diff --git a/src/auth/login.ts b/src/auth/login.ts",
  "--- a/src/auth/login.ts",
  "+++ b/src/auth/login.ts",
  "@@ -1,2 +1,3 @@",
  "+const password = \"hunter2\";",
  "+eval(userInput);",
].join("\n"));
const candidates = formatStaticHintsAsCandidates(candidateHints);
check(
  "candidates format includes must-verify header",
  candidates.includes("MUST verify or dismiss each"),
);
check(
  "candidates format lists detected patterns",
  candidates.includes("hardcoded-credential") || candidates.includes("eval-usage"),
);
check(
  "empty hints produce empty candidates",
  formatStaticHintsAsCandidates([]) === "",
);

// --- Static hint line numbers ----------------------------------------------
const hintDiff = [
  "diff --git a/src/eval/session.ts b/src/eval/session.ts",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/src/eval/session.ts",
  "@@ -0,0 +1,2 @@",
  "+const first = 1;",
  "+const second = 2;",
  "@@ -10,4 +20,4 @@",
  " context line",
  "-const oldToken = Math.random();",
  "+const newToken = Math.random();",
  " context line",
].join("\n");
const hints = extractStaticHints(hintDiff);
const randomHint = hints.find((hint) => hint.pattern === "weak-randomness-security");
check(
  "static hint uses the new-file hunk start line",
  randomHint?.file === "src/eval/session.ts" && randomHint.line === 21,
  randomHint,
);

// --- Review icon rendering ------------------------------------------------
check(
  "review icon is vertically centered in GitHub markdown",
  reviewIcon("turtle", "CodeTurtle").includes('align="absmiddle"'),
);
check(
  "review icon defaults to 20px",
  reviewIcon("turtle", "CodeTurtle").includes('width="20" height="20"'),
);
check(
  "review icon accepts a custom size",
  reviewIcon("bug", "Issues", 16).includes('width="16" height="16"'),
);
check(
  "category icon accepts a custom size",
  reviewCategoryIcon("security vulnerability", 18).includes('width="18" height="18"'),
);

// --- PR description report ------------------------------------------------
const reportInput = {
  overallScore: 4,
  event: "REQUEST_CHANGES" as const,
  reviewerProvider: "google",
  reviewerModel: "gemini-2.5-flash",
  summary: "Found a hardcoded secret in the billing helper.",
  issues: [{ title: "Hardcoded credential", description: "STRIPE_SECRET is committed", severity: "critical", file: "src/billing.ts", line: 4 }],
  suggestions: [{ title: "Use an environment variable", description: "Read from process.env", file: "src/billing.ts" }],
  positives: ["Clear naming"],
  runId: "review_test_1",
};
const report = buildReviewDescriptionReport(reportInput);
check("description report includes verdict and summary", report.includes("**4/10**") && report.includes("Changes requested") && report.includes("hardcoded secret"));
check("description report includes issue evidence", report.includes("[critical] Hardcoded credential") && report.includes("src/billing.ts"));
check("description report explains what was checked", report.includes("What this review checked") && report.includes("severity policy"));

const authorBody = "# My PR\n\nOriginal author description.";
const updated = upsertReviewDescription(authorBody, report);
check("description update preserves author text", updated.startsWith(authorBody));
check("description update adds managed markers", updated.includes(REVIEW_REPORT_START) && updated.includes(REVIEW_REPORT_END));

const secondReport = buildReviewDescriptionReport({ ...reportInput, overallScore: 9, summary: "Clean." });
const refreshed = upsertReviewDescription(updated, secondReport);
check("description refresh replaces old report only", refreshed.includes("Clean.") && !refreshed.includes("Found a hardcoded secret in the billing helper.") && refreshed.startsWith(authorBody));
check("description markers appear exactly once", (refreshed.match(/codeturtle-review-report:start/g) ?? []).length === 1);
check("description update works with empty body", upsertReviewDescription(null, report).startsWith(REVIEW_REPORT_START));
check("description report is length-bounded", buildReviewDescriptionReport({ ...reportInput, summary: "x".repeat(100000) }).length < 20000);

// --- Mention intent routing ------------------------------------------------
check("re-review with bug wording routes to re-review", classifyMentionIntent("re-review this PR and check for bugs") === "rereview");
check("re-check routes to re-review", classifyMentionIntent("please re-check this PR") === "rereview");
check("explicit review request routes to re-review", classifyMentionIntent("review this PR") === "rereview");
check("fix PR command still wins", classifyMentionIntent("create a PR from the suggestions") === "create_fix_pr");
check("diagram command", classifyMentionIntent("show me a diagram") === "diagram");
check("issues command", classifyMentionIntent("any bugs here?") === "issues");
check("summary command", classifyMentionIntent("give me a summary") === "summary");
check("code question is not a greeting", classifyMentionIntent("why is the webhook scope so broad in this repo?") === "question");
check("bare greeting", classifyMentionIntent("hi") === "greeting");
check("bare mention", classifyMentionIntent("") === "empty");

// --- Mermaid diagram sanitising -------------------------------------------
const diagram = sanitizeMermaidDiagram(
  "```mermaid\nflowchart TD\n    B[billing-check.js] --> S[STRIPE_SECRET]\n    B --> C[charge(amount)]\n```",
);
check("mermaid fences are stripped", !diagram.includes("```"));
check("parenthesised node labels are quoted", diagram.includes('C["charge(amount)"]'));
check("plain node labels are quoted too", diagram.includes('B["billing-check.js"]'));
check("already quoted labels are preserved", sanitizeMermaidDiagram('flowchart TD\n A["x(y)"]') === 'flowchart TD\n A["x(y)"]');
check("truncated diagrams are rejected", sanitizeMermaidDiagram('flowchart TD\n A["Auth Guard"]\n E["') === "");

// --- Suggestion rendering --------------------------------------------------
check(
  "prose advice is never a GitHub suggestion block",
  isCodeSuggestion('Never use "alg: none" for JWTs in production. Always use a strong cryptographic algorithm (e.g., HS256, RS256) and ensure tokens are signed.') === false,
);
check(
  "short prose advice is not code",
  isCodeSuggestion("Use parameterized queries.") === false,
);
check(
  "real one-line code fix is accepted",
  isCodeSuggestion('return role === "admin";') === true,
);
check(
  "multi-token code fix is accepted",
  isCodeSuggestion('const token = crypto.randomBytes(16).toString("hex");') === true,
);
check(
  "code-looking prose with e.g. is rejected",
  isCodeSuggestion("Use crypto.randomBytes (e.g., 16 bytes) for the token.") === false,
);

check(
  "exact code patch is preferred over prose advice",
  findCodeFix([{ file: "src/auth/session.ts", codeBefore: "Math.random()", codeAfter: "crypto.randomBytes(16).toString('hex')" }], "src/auth/session.ts") === "crypto.randomBytes(16).toString('hex')",
);
check(
  "no patch for unrelated file",
  findCodeFix([{ file: "src/other.ts", codeAfter: "x" }], "src/auth/session.ts") === null,
);
check(
  "no-op patch is not a fix",
  findCodeFix([{ file: "a.ts", codeBefore: "same", codeAfter: "same" }], "a.ts") === null,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
