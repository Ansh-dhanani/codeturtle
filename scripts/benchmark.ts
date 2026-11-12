/**
 * Benchmark harness for the CodeTurtle review engine.
 *
 * Usage:
 *   bun scripts/benchmark.ts                # dry run: print corpus + scoring plan
 *   bun scripts/benchmark.ts --run          # actually run generateCodeReview per PR (needs env + GitHub access)
 *
 * NOT wired into CI. NOT a quality guarantee. This exists so precision/recall can be
 * measured instead of asserted. See docs/REVIEW_ENGINE.md ("Metrics & benchmark").
 *
 * Scoring (per docs/REVIEW_ENGINE.md):
 *   precision          = matched_findings / total_reported_findings
 *   recall             = matched_findings / known_defects
 *   localization       = % of matched findings whose reported line is within ±3 of truth
 *   unverified         = % of reported findings failing the deterministic evidence check
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Defect = {
  id: string;
  file: string;
  line: number;
  category: string;
  severity: string;
  description: string;
};

type CorpusEntry = {
  pr: number;
  title: string;
  family: string;
  defects: Defect[];
};

const corpusPath = join(process.cwd(), "scripts", "benchmark-corpus.json");
const corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as { entries: CorpusEntry[] };
const run = process.argv.includes("--run");

console.log(`Loaded ${corpus.entries.length} labeled benchmark PRs from ${corpusPath}\n`);

if (!run) {
  for (const entry of corpus.entries) {
    console.log(`#${entry.pr}\t${entry.family.padEnd(10)}\t${entry.defects.length} seeded defect(s)\t${entry.title}`);
  }
  console.log(
    "\nDry run only. Re-run with --run to execute generateCodeReview per PR and score it (requires GITHUB_TOKEN / local env + database access).",
  );
  console.log("TODO before trusting any number out of this harness:");
  console.log("  - hold out at least 1/3 of the corpus from prompt/behavior tuning");
  console.log("  - add held-out non-seeded PRs with human-verified defect labels");
  process.exit(0);
}

// --- --run path ---
// Deliberately not executed during development: it performs live model calls and
// live GitHub fetches. Wire it up carefully when the environment is ready:
//
//   1. Resolve each corpus PR's diff via gh (`gh pr diff <pr> --repo ...`) into a context.
//   2. Call generateCodeReview({ owner, repo, prNumber, userId }) per PR.
//   3. Match findings to labels on (normalized file, |line - defect.line| <= 3, category family).
//   4. Emit JSON report: per-PR precision/recall + aggregate.
//
// The matching + scoring primitives below are the honest core; the model-call
// wiring above is the intentionally unfinished part (P0 ships the harness, not the claims).

const LINE_TOLERANCE = 3;

function normalizeFilePath(file: string): string {
  return (file || "").replace(/^\.\//, "").replace(/^\/+/, "").toLowerCase();
}

export function matchDefects(reported: Array<{ file: string; line?: number; title?: string }>, known: Defect[]) {
  const matched = new Set<string>();
  for (const finding of reported) {
    const fFile = normalizeFilePath(finding.file || "");
    for (const defect of known) {
      if (matched.has(defect.id)) continue;
      if (normalizeFilePath(defect.file) !== fFile) continue;
      const lineOk =
        typeof finding.line === "number" &&
        Number.isFinite(finding.line) &&
        Math.abs(finding.line - defect.line) <= LINE_TOLERANCE;
      if (lineOk) matched.add(defect.id);
    }
  }
  return { matchedIds: [...matched], recall: known.length === 0 ? 1 : matched.size / known.length };
}

console.log("matchDefects scoring primitives loaded. Live run wiring is intentionally unimplemented (see comments above).");
