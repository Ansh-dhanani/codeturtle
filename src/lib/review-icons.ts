/**
 * Shared SVG icon renderer for GitHub-flavored markdown (review comments,
 * progress comments, check summaries, etc.).
 *
 * GitHub strips inline `<svg>` from markdown, so icons are served as static
 * assets from `public/review-icons` and rendered through `<img>` tags. Using
 * SVG assets keeps review output crisp on both light and dark themes and avoids
 * emoji-encoding issues in API-posted comments.
 */
export const REVIEW_ICON_NAMES = [
    "architecture",
    "autofix",
    "bug",
    "check",
    "code-quality",
    "critical",
    "dependency",
    "diagram",
    "documentation",
    "file-changes",
    "info",
    "limit",
    "performance",
    "positive",
    "progress",
    "pull-request",
    "security",
    "severity-critical",
    "suggestion",
    "summary",
    "tests",
    "turtle",
    "warning",
] as const;

export type ReviewIconName = (typeof REVIEW_ICON_NAMES)[number];

export const getAppBaseUrl = () =>
    (
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.BETTER_AUTH_URL ||
        "https://codeturtle-ai.vercel.app"
    ).replace(/\/+$/, "");

export const reviewIcon = (name: ReviewIconName, alt: string, size = 18) =>
    `<img src="${getAppBaseUrl()}/review-icons/${name}.svg" alt="${alt}" width="${size}" height="${size}" />`;

/** Non-breaking separator used in GitHub markdown tables and metadata lines. */
export const SEP = "&nbsp;&middot;&nbsp;";

const CATEGORY_RULES: Array<{ pattern: RegExp; name: ReviewIconName; alt: string }> = [
    {
        pattern: /secret|credential|password|token|auth|security|vulnerab|xss|csrf|injection|traversal|sanitiz|permission|expos/i,
        name: "security",
        alt: "Security",
    },
    {
        pattern: /performance|memory leak|slow|latency|n\+1|optimi[sz]|complexity|expensive/i,
        name: "performance",
        alt: "Performance",
    },
    {
        pattern: /\btest|spec|fixture|coverage|assert/i,
        name: "tests",
        alt: "Tests",
    },
    {
        pattern: /dependenc|package\.json|lockfile|npm|yarn|version bump/i,
        name: "dependency",
        alt: "Dependency",
    },
    {
        pattern: /\bdoc|readme|comment|jsdoc|typo/i,
        name: "documentation",
        alt: "Documentation",
    },
    {
        pattern: /error handling|exception|crash|null|undefined|race|bug|fail|leak|unhandled/i,
        name: "bug",
        alt: "Bug",
    },
];

/** Pick a category icon (security, performance, tests, ...) from finding text. */
export const reviewCategoryIcon = (text: string, size = 16) => {
    const rule = CATEGORY_RULES.find((entry) => entry.pattern.test(text));
    return rule
        ? reviewIcon(rule.name, rule.alt, size)
        : reviewIcon("code-quality", "Code quality", size);
};
