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
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Defect = {
  id: string;
  file: string;
  line: number;
  category: string;
  severity: string;
  description: string;
  matchHints?: string[];
};

type CorpusEntry = {
  pr: number;
  title: string;
  family: string;
  defects: Defect[];
};

const corpusPath = join(process.cwd(), "scripts", "benchmark-corpus.json");
const LINE_TOLERANCE = 3;

function normalizeFilePath(file: string): string {
  return (file || "").replace(/^\.\//, "").replace(/^\/+/, "").toLowerCase();
}
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
// Runs the real review pipeline (generateCodeReview) per corpus PR and scores
// findings against human labels from the PR-body confessions.
// Requires: local .env (GOOGLE_GENERATIVE_AI_API_KEY), DATABASE_URL, and a
// user in the DB with a linked GitHub account (used for the diff fallback).
import { prisma } from "@/lib/prisma";
import { generateCodeReview } from "../src/module/ai/lib/review";

function findingKeyMatch(finding: { file: string; line?: number; title: string; description: string }, defect: Defect): "line" | "hint" | null {
  if (normalizeFilePath(finding.file) !== normalizeFilePath(defect.file)) return null;
  if (typeof finding.line === "number" && Number.isFinite(finding.line) && Math.abs(finding.line - defect.line) <= LINE_TOLERANCE) return "line";
  const haystack = `${finding.title} ${finding.description}`.toLowerCase();
  const hints = (defect.matchHints ?? []).filter((hint) => hint.length > 0);
  if (hints.some((hint) => haystack.includes(hint.toLowerCase()))) return "hint";
  return null;
}

async function findBenchmarkUserId(): Promise<string> {
  if (process.env.BENCHMARK_USER_ID) return process.env.BENCHMARK_USER_ID;
  const candidate = await prisma.user.findFirst({
    where: { OR: [{ email: { contains: "dhanani" } }, { name: { contains: "Ansh" } }] },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (candidate) {
    console.log(`Using benchmark user: ${candidate.name} (${candidate.id})`);
    return candidate.id;
  }
  const anyUser = await prisma.user.findFirst({ select: { id: true, name: true } });
  if (!anyUser) throw new Error("No users in the database; set BENCHMARK_USER_ID");
  console.log(`Falling back to first user: ${anyUser.name} (${anyUser.id})`);
  return anyUser.id;
}

const userId = await findBenchmarkUserId();
const results: Array<Record<string, unknown>> = [];
let totalKnown = 0;
let totalReported = 0;
let totalLineMatches = 0;
let totalKeywordMatches = 0;

for (const entry of corpus.entries) {
  const started = Date.now();
  process.stdout.write(`\n#${entry.pr} ${entry.title.slice(0, 60)}\n`);
  try {
    const review = await generateCodeReview({
      owner: "Ansh-dhanani",
      repo: "codeturtle-test-repo",
      prNumber: entry.pr,
      userId,
    });
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const findings = review.issues.map((i) => ({
      file: i.file,
      line: typeof i.line === "number" ? i.line : undefined,
      title: i.title,
      description: i.description,
      severity: i.severity,
    }));

    const matched = new Set<string>();
    let lineMatches = 0;
    let keywordMatches = 0;
    for (const finding of findings) {
      for (const defect of entry.defects) {
        if (matched.has(defect.id)) continue;
        const how = findingKeyMatch(finding, defect);
        if (how) {
          matched.add(defect.id);
          if (how === "line") lineMatches++;
          else keywordMatches++;
        }
      }
    }

    totalKnown += entry.defects.length;
    totalReported += findings.length;
    totalLineMatches += lineMatches;
    totalKeywordMatches += keywordMatches;

    console.log(
      `  ${elapsed}s · score ${review.overallScore}/10 · ${findings.length} findings · seeded recall ${matched.size}/${entry.defects.length} (line ${lineMatches}, keyword ${keywordMatches})`,
    );
    results.push({ pr: entry.pr, elapsedSeconds: Number(elapsed), score: review.overallScore, findings, matched: [...matched], known: entry.defects.map((d) => d.id) });
  } catch (err) {
    console.log(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
    results.push({ pr: entry.pr, error: err instanceof Error ? err.message : String(err) });
  }
}

const lineRecall = totalKnown === 0 ? 1 : totalLineMatches / totalKnown;
const keywordRecall = totalKnown === 0 ? 1 : (totalLineMatches + totalKeywordMatches) / totalKnown;
const precisionProxy = totalReported === 0 ? null : "unverifiable without human grading of each finding - see per-PR output";

const report = {
  generatedAt: new Date().toISOString(),
  prs: results.length,
  knownDefects: totalKnown,
  reportedFindings: totalReported,
  lineMatches: totalLineMatches,
  keywordMatches: totalKeywordMatches,
  recallLine: Number(lineRecall.toFixed(3)),
  recallKeyword: Number(keywordRecall.toFixed(3)),
  precisionProxy,
  entries: results,
};
const reportPath = join(process.cwd(), "scripts", "benchmark-report.json");
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log("\n========== BENCHMARK SUMMARY (seeded PRs, labels from PR-body confessions) ==========");
console.log(`PRs: ${results.length} | seeded defects: ${totalKnown} | findings reported: ${totalReported}`);
console.log(`Recall (strict line ±${LINE_TOLERANCE}): ${(lineRecall * 100).toFixed(1)}%  (${totalLineMatches}/${totalKnown})`);
console.log(`Recall (line + keyword):            ${(keywordRecall * 100).toFixed(1)}%  (${totalLineMatches + totalKeywordMatches}/${totalKnown})`);
console.log("Precision: NOT auto-graded here - see scripts/benchmark-report.json for per-PR findings to grade by hand.");
console.log(`Report written to ${reportPath}`);
process.exit(0);

