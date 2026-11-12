/**
 * Conditional specialized analysis passes (docs/REVIEW_ENGINE.md, stage 4).
 *
 * Runs AFTER the main analysis, BEFORE the judge pass. Only fires for diffs
 * that touch risky surface area. Each pass is scoped to one defect class so
 * small free-tier models do a small, well-defined job - not a monolithic
 * "find everything" prompt.
 *
 * Findings use the v2 evidence contract and flow into sanitizeReviewOutput,
 * so the same deterministic verification + caps apply to them.
 */
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { logger } from "@/lib/logger";

const SPECIALIST_MODEL = "gemini-2.5-flash";

export type RiskPass = "security" | "data-integrity" | "concurrency";

const SpecialistFindingSchema = z.object({
  title: z.string().min(1).default("Finding"),
  description: z.string().default(""),
  file: z.string().default("unknown"),
  severity: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  category: z.enum([
    "logic", "runtime", "security", "data-integrity", "api-contract",
    "concurrency", "performance", "error-handling", "testing", "maintainability",
  ]).default("logic"),
  confidence: z.number().min(0).max(1).default(0.7),
  trigger: z.string().default(""),
  impact: z.string().default(""),
  evidence: z.array(z.string()).default([]),
  suggestion: z.string().default("No suggestion provided."),
  line: z.union([z.number(), z.string()]).optional().transform((v) =>
    typeof v === "string" ? parseInt(v, 10) || 0 : v,
  ),
});

const SpecialistReportSchema = z.object({
  findings: z.array(SpecialistFindingSchema).default([]),
});

export type SpecialistFinding = z.infer<typeof SpecialistFindingSchema>;

const EVIDENCE_CONTRACT = `Output rules: report at most 3 findings. Each finding MUST include "severity" (critical|high|medium|low), "category", "confidence" (0-1; below 0.5 is useless - don't report), "trigger" (conditions under which it fires), "impact" (concrete consequence), and "evidence" (1-3 VERBATIM strings from the diff/context that prove it - exact identifiers, not paraphrase). If you cannot fill trigger + impact + evidence, omit the finding. Return an empty findings array if nothing is provably wrong - silence is correct.`;

const PASS_PROMPTS: Record<RiskPass, string> = {
  security: `You are a security code reviewer. The PR diff and repository context are provided. Report ONLY genuine security defects introduced by this change: broken authentication/authorization, injection (SQL/command/template/HTML), secret or credential exposure, IDOR/missing ownership checks, signature verification bypasses, unsafe deserialization. Ignore style, tests, and generic advice.`,
  "data-integrity": `You are a data-integrity reviewer. Report ONLY defects that can corrupt or lose data: non-atomic multi-step writes that can leave inconsistent state, missing transactions around related writes, destructive operations without guards, incorrect upsert/idempotency logic, migration files that drop or rewrite data unsafely. Ignore style and generic advice.`,
  concurrency: `You are a concurrency reviewer. Report ONLY defects involving async/concurrent behavior: unawaited promises, races on shared mutable state, read-modify-write sequences without locking or atomic operations, retries of non-idempotent operations, lost updates between concurrent requests, ordering bugs in streams/queues. Ignore style and generic advice.`,
};

export function detectRiskPasses(changedFiles: string[], diffText: string): RiskPass[] {
  if (process.env.CODETURTLE_SPECIALIST_PASSES === "off") return [];
  const files = changedFiles.join(" ");
  const passes: RiskPass[] = [];

  const securityHit =
    /(auth|crypto|secret|password|token|api[-_]?key|oauth|jwt|session|permission|webhook|signature|login|reset)/i.test(files) ||
    /(password|secret|api[-_]?key|eval\s*\(|innerHTML|dangerouslySetInnerHTML|executeRaw|\bexec\s*\(|\bsystem\s*\()/i.test(diffText);
  if (securityHit) passes.push("security");

  const dataHit =
    /(migration|schema\.prisma|\/db\/|\/database\/|repository|prisma)/i.test(files) ||
    /(ALTER TABLE|DROP TABLE|DELETE FROM|INSERT INTO|UPDATE\s+\w+|\.transaction\s*\(|\.delete\s*Many\s*\(|raw\s*\()/i.test(diffText);
  if (dataHit) passes.push("data-integrity");

  const asyncHits =
    (diffText.match(/\b(await|Promise\.[a-z]+|Promise<|async\s|setInterval|setTimeout|mutex|lock\s*\(|retry|atomic)\b/g) || [])
      .length;
  if (asyncHits >= 5) passes.push("concurrency");

  return passes;
}

export async function runSpecialistPasses(params: {
  owner: string;
  repo: string;
  prNumber: number;
  changedFiles: string[];
  diffText: string;
  contextText: string;
  prTitle?: string;
}): Promise<SpecialistFinding[]> {
  const { owner, repo, prNumber, changedFiles, diffText, contextText, prTitle } = params;

  if (changedFiles.length === 0) return [];
  const passes = detectRiskPasses(changedFiles, diffText);
  if (passes.length === 0) return [];

  const findings: SpecialistFinding[] = [];

  for (const pass of passes) {
    try {
      const { object } = await generateObject({
        model: google(SPECIALIST_MODEL),
        schema: SpecialistReportSchema,
        system: `${PASS_PROMPTS[pass]}\n\n${EVIDENCE_CONTRACT}`,
        prompt: [
          prTitle ? `PR title: ${prTitle}` : "",
          "",
          "## Pull Request Diff (truncated):",
          "```diff",
          diffText.slice(0, 16000),
          "```",
          "",
          "## Repository Context (retrieved):",
          contextText.slice(0, 4000) || "(none)",
        ].join("\n"),
        maxOutputTokens: 1500,
      });

      for (const finding of object.findings.slice(0, 3)) {
        findings.push(finding);
      }
      logger.info("Specialist pass completed", { owner, repo, prNumber, pass, findings: object.findings.length });
    } catch (err) {
      // A failed specialist must never fail the review - log and continue with fewer findings.
      logger.warn("Specialist pass failed; continuing without it", {
        owner,
        repo,
        prNumber,
        pass,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return findings;
}
