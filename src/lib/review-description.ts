/**
 * Builds the managed "CodeTurtle Review Report" section that is appended to a
 * pull request description after a review completes.
 *
 * The section is delimited by HTML comments so the original author-written
 * description is never overwritten: subsequent reviews replace only the
 * managed block between the markers.
 */

export const REVIEW_REPORT_START = "<!-- codeturtle-review-report:start -->";
export const REVIEW_REPORT_END = "<!-- codeturtle-review-report:end -->";

export interface ReviewReportInput {
    overallScore: number;
    event: "REQUEST_CHANGES" | "COMMENT";
    reviewerProvider?: string;
    reviewerModel?: string;
    summary: string;
    issues: Array<{
        title: string;
        description: string;
        suggestion?: string;
        severity: string;
        file?: string;
        line?: number;
    }>;
    suggestions: Array<{
        title: string;
        description?: string;
        suggestion?: string;
        file?: string;
    }>;
    positives: string[];
    architectureNotes?: string;
    diagram?: string;
    runId?: string;
}

const clamp = (value: string, max: number) => {
    const text = (value || "").trim();
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

const location = (file?: string, line?: number) =>
    file ? `\`${file}${typeof line === "number" ? `:L${line}` : ""}\`` : "";

/** Render a detailed, human-readable review report for the PR description. */
export function buildReviewDescriptionReport(input: ReviewReportInput): string {
    const issueLines: string[] = [];
    input.issues.slice(0, 5).forEach((issue, index) => {
        const where = location(issue.file, issue.line);
        issueLines.push(
            [
                `#### ${index + 1}. [${issue.severity}] ${clamp(issue.title, 180)}${where ? ` — ${where}` : ""}`,
                clamp(issue.description, 1600),
                issue.suggestion && issue.suggestion !== "No suggestion provided."
                    ? `**Suggested fix:** ${clamp(issue.suggestion, 700)}`
                    : "",
            ]
                .filter(Boolean)
                .join("\n"),
        );
    });
    if (input.issues.length > 5) {
        issueLines.push(`_…and ${input.issues.length - 5} more issue(s) in the full review comment._`);
    }

    const suggestionLines: string[] = [];
    input.suggestions.slice(0, 5).forEach((suggestion, index) => {
        const where = location(suggestion.file);
        suggestionLines.push(
            [
                `#### ${index + 1}. ${clamp(suggestion.title, 180)}${where ? ` — ${where}` : ""}`,
                clamp(suggestion.description || suggestion.suggestion || "", 1000),
            ]
                .filter(Boolean)
                .join("\n"),
        );
    });
    if (input.suggestions.length > 5) {
        suggestionLines.push(`_…and ${input.suggestions.length - 5} more suggestion(s) in the full review comment._`);
    }

    const positiveLines = input.positives
        .slice(0, 5)
        .map((positive) => `- ${clamp(positive, 300)}`);

    const lines = [
        "## CodeTurtle Review Report",
        "",
        input.runId ? `_Run \`${clamp(input.runId, 120)}\`_  ` : "",
        "",
        "| | |",
        "| :- | :- |",
        `| **Score** | **${input.overallScore}/10** |`,
        `| **Decision** | **${input.event === "REQUEST_CHANGES" ? "Changes requested" : "Comment"}** |`,
        `| **Reviewer** | \`${clamp([input.reviewerProvider, input.reviewerModel].filter(Boolean).join("/"), 120)}\` |`,
        `| **Issues** | ${input.issues.length} |`,
        `| **Suggestions** | ${input.suggestions.length} |`,
        `| **Positives** | ${input.positives.length} |`,
        "",
        "### Summary",
        "",
        clamp(input.summary, 4000) || "_No summary was produced for this review._",
        "",
        "### What this review checked",
        "",
        "CodeTurtle reviewed the changed diff against surrounding repository context. It verifies each finding against the changed code, runs deterministic candidate checks (hardcoded secrets, `eval`/command/SQL injection, path traversal, weak randomness in security contexts, unsafe HTML, swallowed errors, missing `await`), applies a severity policy for clear security defects, collapses duplicate findings by file/line/category, and derives the review decision from the validated findings. Findings are limited to changed code; clean changes are reported honestly as clean.",
        "",
    ];

    if (issueLines.length > 0) {
        lines.push("### Issues", "", ...issueLines, "");
    }
    if (suggestionLines.length > 0) {
        lines.push("### Suggestions", "", ...suggestionLines, "");
    }
    if (positiveLines.length > 0) {
        lines.push("### Positives", "", ...positiveLines, "");
    }
    if (input.architectureNotes?.trim()) {
        lines.push("### Architecture notes", "", clamp(input.architectureNotes, 1800), "");
    }
    if (input.diagram?.trim()) {
        lines.push("### Data-flow diagram", "", "```mermaid", clamp(input.diagram, 2000), "```", "");
    }

    lines.push(
        "---",
        "",
        "Reply with `@codeturtle` in this PR to ask for a summary, the issue list, a diagram, or to create a fix PR from the suggestions.",
    );

    return clamp(lines.filter((line) => line !== undefined).join("\n"), 18000);
}

/**
 * Replace a previously generated report (if any) and append the current one.
 * Everything outside the managed markers is preserved byte-for-byte.
 */
export function upsertReviewDescription(body: string | null | undefined, report: string): string {
    const original = (body || "").replace(/\s+$/, "");
    const managed = `${REVIEW_REPORT_START}\n${report}\n${REVIEW_REPORT_END}`;
    const withoutOld = original.replace(
        new RegExp(`${escapeRegExp(REVIEW_REPORT_START)}[\\s\\S]*?${escapeRegExp(REVIEW_REPORT_END)}`, "g"),
        "",
    ).replace(/\s+$/, "");
    return withoutOld ? `${withoutOld}\n\n${managed}` : managed;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
