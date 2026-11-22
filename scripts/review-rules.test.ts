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
  stripEmojis,
  applySeverityPolicy,
} = await import("../src/module/ai/lib/review");
const { extractStaticHints, formatStaticHintsAsCandidates } = await import("../src/module/ai/lib/static-hints");
const { reviewIcon, reviewCategoryIcon } = await import("../src/lib/review-icons");

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
  "review icon defaults to 18px",
  reviewIcon("turtle", "CodeTurtle").includes('width="18" height="18"'),
);
check(
  "review icon accepts a custom size",
  reviewIcon("bug", "Issues", 16).includes('width="16" height="16"'),
);
check(
  "category icon accepts a custom size",
  reviewCategoryIcon("security vulnerability", 18).includes('width="18" height="18"'),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
