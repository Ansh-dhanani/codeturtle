/**
 * Deterministic static-leaning checks over the raw diff (docs/REVIEW_ENGINE.md, stage 2).
 *
 * These are HINTS for the analyzer, not findings. They surface high-signal
 * patterns deterministically so a small model is far more likely to catch the
 * bug - but the model still has to verify them against the actual code, and
 * the judge still has to filter them. Never publish these without verification.
 */
export type StaticHint = {
  pattern: string;
  file: string;
  line: number | null;
  note: string;
};

type HintRule = {
  id: string;
  /** Regex applied to a single added line (without the leading "+"). */
  regex: RegExp;
  note: string;
  /** Only fire for files matching this pattern. */
  filePattern?: RegExp;
};

const RULES: HintRule[] = [
  {
    id: "eval-usage",
    regex: /\beval\s*\(|new\s+Function\s*\(/,
    note: "dynamic code execution (eval/new Function) - check for injection",
    filePattern: /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|php)$/i,
  },
  {
    id: "hardcoded-credential",
    regex: /(api[-_]?key|password|passwd|secret|token|client[-_]?secret)\s*[:=]\s*["'`][^"'`\s]{8,}["'`]/i,
    note: "looks like a hardcoded credential - verify it is not a real secret",
  },
  {
    id: "sql-concatenation",
    regex: /(SELECT|INSERT|UPDATE|DELETE)\s.{0,120}(\+|\$\{|`)/i,
    note: "SQL string built with concatenation/template - check for SQL injection",
  },
  {
    id: "weak-randomness-security",
    regex: /Math\.random\s*\(/,
    filePattern: /(auth|token|secret|password|reset|session|otp|verify|permission)/i,
    note: "Math.random in a security-sensitive path - check if it feeds tokens/secrets",
  },
  {
    id: "command-injection",
    regex: /(exec|execSync|spawn|popen|system|child_process)\s*\(/,
    note: "process execution - check whether any argument is user-controlled",
  },
  {
    id: "inner-html",
    regex: /(dangerouslySetInnerHTML|innerHTML\s*=)/,
    filePattern: /\.(tsx|jsx|html|vue|svelte)$/i,
    note: "raw HTML injection sink - check whether input is sanitized",
  },
  {
    id: "swallowed-error",
    regex: /catch\s*\([^)]*\)\s*\{\s*\}/,
    note: "empty catch block - errors silently swallowed",
  },
  {
    id: "missing-await",
    regex: /\.(then|catch)\s*\(\s*(async\s*)?\(/,
    note: "promise chain possibly missing await/catch handling - verify error flow",
  },
];

const MAX_HINTS = 5;

export function extractStaticHints(diff: string): StaticHint[] {
  const hints: StaticHint[] = [];
  let currentFile = "unknown";
  let addedLineNo = 0;

  for (const rawLine of diff.split("\n")) {
    const diffHeader = /^\+\+\+ b\/(.*)$/.exec(rawLine) || /^\+\+\+ (.*)$/.exec(rawLine);
    if (diffHeader) {
      currentFile = diffHeader[1].replace(/^\.\//, "").trim();
      addedLineNo = 0;
      continue;
    }
    if (rawLine.startsWith("+++") || rawLine.startsWith("---")) continue;

    if (rawLine.startsWith("+")) {
      addedLineNo += 1;
      const line = rawLine.slice(1);
      for (const rule of RULES) {
        if (hints.length >= MAX_HINTS) return hints;
        if (rule.filePattern && !rule.filePattern.test(currentFile)) continue;
        if (rule.regex.test(line)) {
          hints.push({ pattern: rule.id, file: currentFile, line: addedLineNo, note: rule.note });
        }
      }
    } else if (!rawLine.startsWith("-")) {
      addedLineNo += 1;
    }
  }

  return hints;
}

export function formatStaticHintsForPrompt(hints: StaticHint[]): string {
  if (hints.length === 0) return "";
  const lines = hints.map((hint) => `- ${hint.file}:L${hint.line ?? "?"} [${hint.pattern}] ${hint.note}`);
  return [
    "",
    "Deterministic static-scan hints (VERIFY each against the code before reporting; many are benign):",
    ...lines,
  ].join("\n");
}
