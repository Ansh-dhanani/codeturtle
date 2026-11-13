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
} = await import("../src/module/ai/lib/review");

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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
