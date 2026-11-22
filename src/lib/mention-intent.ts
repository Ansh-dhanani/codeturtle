/**
 * Deterministic intent routing for `@codeturtle` mentions.
 *
 * Re-review is checked before issues/summary so a prompt like
 * "re-review this PR and check for bugs" does not collapse into the issues
 * command. Greetings must be the entire message so `hi` inside `this` is not
 * mistaken for a greeting.
 */
export type MentionIntent =
    | "create_fix_pr"
    | "rereview"
    | "diagram"
    | "meme"
    | "issues"
    | "summary"
    | "greeting"
    | "empty"
    | "question";

export function classifyMentionIntent(prompt: string): MentionIntent {
    const text = (prompt || "").trim();
    if (!text) return "empty";
    const lower = text.toLowerCase();

    if (
        /(make|create|open|raise)\s+(a\s+)?pr\b/.test(lower) &&
        /(suggestion|suggestions|fix|fixes|changes)/.test(lower)
    ) {
        return "create_fix_pr";
    }

    if (
        /\bre-?(review|check|run)\b/.test(lower) ||
        /\breview (this|the) (pr|pull request)\b/.test(lower) ||
        /\b(run|trigger|start|do) (a |the )?review\b/.test(lower) ||
        /\b(review|check|analyze) (it|this|that) again\b/.test(lower) ||
        /\bplease review\b/.test(lower)
    ) {
        return "rereview";
    }

    if (/\b(diagram|mermaid|flowchart|visuali[sz](e|ed|ation)|sequence diagram|chart)\b/.test(lower)) {
        return "diagram";
    }

    if (/\b(meme|gif|haha|lol|funny)\b/.test(lower)) {
        return "meme";
    }

    if (
        /\b(issues?|bugs?|problems?|errors?)\b/.test(lower) ||
        /\bwhat(?:'s| is| are)?\s+wrong\b/.test(lower) ||
        /\blist\s+(all\s+)?issues\b/.test(lower)
    ) {
        return "issues";
    }

    if (
        /\b(summary|summarize|summarise|overview)\b/.test(lower) ||
        /\bwhat (does|did) (this|the) pr do\b/.test(lower) ||
        /\bexplain (this|the) pr\b/.test(lower)
    ) {
        return "summary";
    }

    if (/^(hi|hello|hey|sup|yo|thanks|thank you|ty)[!.\s]*$/i.test(text)) {
        return "greeting";
    }

    return "question";
}
