/**
 * Decide whether a model-produced `suggestion` string is actually code that
 * can be placed in a GitHub ```suggestion block.
 *
 * A false positive is expensive: GitHub renders the text as a replacement
 * diff, so prose advice ("Never use alg: none...") would appear as proposed
 * code. When in doubt, render the advice as a blockquote instead.
 */
/**
 * Find the exact replacement snippet recorded for a finding's file.
 * `suggestions[].codeAfter` is the structured code patch; `issue.suggestion`
 * is only prose advice and must never be passed off as a GitHub diff.
 */
export function findCodeFix(
    suggestions: Array<{ file?: string; codeBefore?: string; codeAfter?: string }>,
    file: string,
): string | null {
    const match = suggestions.find((suggestion) => {
        const after = suggestion.codeAfter?.trim();
        return suggestion.file === file && Boolean(after) && after !== suggestion.codeBefore?.trim();
    });
    return match?.codeAfter?.trim() || null;
}

export function isCodeSuggestion(raw: string): boolean {
    const text = (raw || "")
        .trim()
        .replace(/^```(?:suggestion|js|jsx|ts|tsx|javascript|typescript)?\s*\n?/i, "")
        .replace(/```\s*$/, "")
        .trim();

    if (!text || text.length > 400) return false;
    if (text.split("\n").length > 12) return false;

    // Prose instructions are never safe as a replacement snippet.
    if (
        /\b(you should|you must|always|never|consider|recommended|instead|for example|e\.g\.|i\.e\.|this means|in production|rather than|make sure|be sure|ensure that|use a|do not)\b/i.test(
            text,
        )
    ) {
        return false;
    }

    // A sentence with a period is advice unless the snippet is clearly code.
    const sentenceLike = /\.\s+[A-Z]/.test(text) || (text.match(/\.\s/g) || []).length >= 2;
    const strongCode =
        /=([^=]|$)|;|=>|(^|\n)\s*(return|import|export|const|let|var|function|await|throw|if)\b|\.\w+\(/m.test(text);
    if (sentenceLike && !strongCode) return false;

    return strongCode;
}
