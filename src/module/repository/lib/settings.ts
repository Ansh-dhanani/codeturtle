export const REPO_REVIEW_STYLE_OPTIONS = [
  "balanced",
  "professional",
  "short",
  "funny",
  "diagram",
] as const;

export type RepoReviewStyle = (typeof REPO_REVIEW_STYLE_OPTIONS)[number];

export type RepoBehaviorSettings = {
  reviewModes: RepoReviewStyle[];
  reviewStyle: RepoReviewStyle;
  memesEnabled: boolean;
  customPrompt: string | null;
};

export const DEFAULT_REPO_BEHAVIOR_SETTINGS: RepoBehaviorSettings = {
  reviewModes: ["balanced", "diagram"],
  reviewStyle: "balanced",
  memesEnabled: true,
  customPrompt: null,
};

const STYLE_SET = new Set<string>(REPO_REVIEW_STYLE_OPTIONS);

export function normalizeRepoReviewModes(value?: string | string[] | null): RepoReviewStyle[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const normalized = rawValues
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is RepoReviewStyle => STYLE_SET.has(item));

  const deduped: RepoReviewStyle[] = [];
  for (const mode of normalized) {
    if (!deduped.includes(mode)) deduped.push(mode);
  }

  if (deduped.length === 0) {
    return ["balanced", "diagram"];
  }

  // Strip "balanced" only when combined with actual style modes (not diagram)
  const styleModes = deduped.filter((m) => m !== "balanced" && m !== "diagram");
  if (deduped.includes("balanced") && styleModes.length > 0) {
    return deduped.filter((mode) => mode !== "balanced");
  }

  // Always inject diagram if not already present
  if (!deduped.includes("diagram")) {
    deduped.push("diagram");
  }

  return deduped;
}

export function serializeRepoReviewModes(modes: RepoReviewStyle[]): string {
  return normalizeRepoReviewModes(modes).join(",");
}

export function normalizeRepoReviewStyle(value?: string | string[] | null): RepoReviewStyle {
  const modes = normalizeRepoReviewModes(value);
  return modes[0] || DEFAULT_REPO_BEHAVIOR_SETTINGS.reviewStyle;
}

function getSingleReviewStyleInstruction(style: RepoReviewStyle): string {
  if (style === "balanced") {
    return "Use a balanced tone: practical, direct, and constructive.";
  }
  if (style === "professional") {
    return "Use a formal, concise, objective review tone. Keep humor out of the review narrative.";
  }
  if (style === "short") {
    return "Keep the review compact and high-signal. Focus on the top issues and avoid long prose.";
  }
  if (style === "funny") {
    return "Use a light, playful tone while preserving technical accuracy and clear action items.";
  }
  return "Include a Mermaid diagram in ```mermaid``` fences only when it clarifies architecture, data flow, or control flow. Keep it small (max 10 nodes) and avoid overusing diagrams.";
}

function getSingleMentionStyleInstruction(style: RepoReviewStyle): string {
  if (style === "balanced") {
    return "Reply in a friendly, helpful, concise style.";
  }
  if (style === "professional") {
    return "Reply in a professional, straightforward voice.";
  }
  if (style === "short") {
    return "Reply in 1-2 short lines with direct next steps.";
  }
  if (style === "funny") {
    return "Reply in a playful but respectful style, keeping it actionable.";
  }
  return "Reply clearly and include tiny ASCII flow hints only when helpful.";
}

export function getReviewModesInstruction(modes: RepoReviewStyle[]): string {
  const normalizedModes = normalizeRepoReviewModes(modes);
  return normalizedModes.map((mode) => getSingleReviewStyleInstruction(mode)).join(" ");
}

export function getMentionModesInstruction(modes: RepoReviewStyle[]): string {
  const normalizedModes = normalizeRepoReviewModes(modes);
  return normalizedModes.map((mode) => getSingleMentionStyleInstruction(mode)).join(" ");
}

export function getReviewStyleInstruction(style: RepoReviewStyle): string {
  return getSingleReviewStyleInstruction(style);
}

export function getMentionStyleInstruction(style: RepoReviewStyle): string {
  return getSingleMentionStyleInstruction(style);
}

export function normalizeCustomPrompt(value?: string | null, maxLen = 2000): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen);
}
