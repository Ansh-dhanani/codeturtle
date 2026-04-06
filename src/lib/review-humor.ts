import configuredMemes from "../../public/memes";

type HumorTopic =
  | "celebrate"
  | "warning"
  | "critical"
  | "auth"
  | "model"
  | "rateLimit"
  | "inProgress"
  | "quota";

type HumorScenario =
  | "success-clean"
  | "success-warning"
  | "success-critical"
  | "failure-auth"
  | "failure-model"
  | "failure-rate-limit"
  | "failure-generic"
  | "in-progress"
  | "quota-limit";

type HumorContext = {
  score?: number;
  issuesCount?: number;
  used?: number;
  limit?: number;
};

type HumorOptions = {
  enabled?: boolean;
  dedupeKey?: string;
};

type MemeCandidate = {
  url: string;
  useWhen?: string;
};

const EMPTY_MEMES: Record<HumorTopic, MemeCandidate[]> = {
  celebrate: [],
  warning: [],
  critical: [],
  auth: [],
  model: [],
  rateLimit: [],
  inProgress: [],
  quota: [],
};

const QUIPS: Record<HumorScenario, string[]> = {
  "success-clean": [
    "No fires. No sirens. This PR is suspiciously healthy.",
    "Ship-it energy detected. QA is smiling today.",
  ],
  "success-warning": [
    "Looks good overall, but a few gremlins are still in the basement.",
    "Strong PR, minor papercuts. Easy win after cleanup.",
  ],
  "success-critical": [
    "Code has main-character energy; production is not ready for this drama.",
    "This PR needs a plot rewrite before release night.",
  ],
  "failure-auth": [
    "GitHub said 'who are you again?'. Reconnect and we roll.",
    "Token forgot its identity. Quick reconnect should fix it.",
  ],
  "failure-model": [
    "Model routing did a disappearing act. Switching models usually saves the day.",
    "That model endpoint ghosted us. Try a fresh free model.",
  ],
  "failure-rate-limit": [
    "Provider asked for a coffee break. Retry in a bit.",
    "Rate limit tapped out. Cooldown mode activated.",
  ],
  "failure-generic": [
    "Unexpected boss fight unlocked. Retry and we go again.",
    "The pipeline tripped, not your PR. Another run should help.",
  ],
  "in-progress": [
    "Review bot is stretching before the code gymnastics.",
    "Analyzing changes with maximum detective energy.",
  ],
  "quota-limit": [
    "Quota reached. Wallet-kun or calendar-kun can unlock the next arc.",
    "Limit hit. Time to recharge plan points and continue.",
  ],
};

let customMemesCache: Partial<Record<HumorTopic, MemeCandidate[]>> | null = null;
const resolvedMemeUrlCache = new Map<string, string | null>();
const recentMemeByKey = new Map<string, string>();
const recentQuipByKey = new Map<string, string>();

type ConfiguredMemeItem = string | { url?: string; useWhen?: string; description?: string };

function extractMemesFromConfiguredEntry(entry: unknown): MemeCandidate[] {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];

  const record = entry as { memes?: ConfiguredMemeItem[]; url?: ConfiguredMemeItem[]; description?: string };
  const rawItems = Array.isArray(record.memes)
    ? record.memes
    : Array.isArray(record.url)
      ? record.url
      : [];
  const extracted: MemeCandidate[] = [];

  for (const item of rawItems) {
    if (typeof item === "string") {
      if (isHttpUrl(item)) {
        extracted.push({ url: item, useWhen: record.description });
      }
      continue;
    }

    if (!item || typeof item !== "object") continue;
    const url = typeof item.url === "string" ? item.url : "";
    if (!url || !isHttpUrl(url)) continue;

    const useWhen =
      typeof item.useWhen === "string"
        ? item.useWhen
        : typeof item.description === "string"
          ? item.description
          : record.description;

    extracted.push({ url, useWhen });
  }

  return extracted;
}

function normalizeCategory(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isDirectImageUrl(value: string): boolean {
  return /\.(gif|png|jpe?g|webp)(\?.*)?$/i.test(value);
}

function isDirectTenorMediaUrl(value: string): boolean {
  return /^https?:\/\/media\d*\.tenor\.com\//i.test(value) || /^https?:\/\/media\.tenor\.com\//i.test(value);
}

function extractMetaImageUrl(html: string): string | null {
  const match =
    html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i) ||
    html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["'][^>]*>/i);

  if (!match?.[1]) return null;
  return match[1];
}

async function resolveRenderableMemeUrl(url: string): Promise<string | undefined> {
  if (!isHttpUrl(url)) return undefined;

  if (resolvedMemeUrlCache.has(url)) {
    const cached = resolvedMemeUrlCache.get(url);
    return cached ?? undefined;
  }

  if (isDirectImageUrl(url) || isDirectTenorMediaUrl(url)) {
    resolvedMemeUrlCache.set(url, url);
    return url;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(encodeURI(url), { redirect: "follow", signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      resolvedMemeUrlCache.set(url, null);
      return undefined;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.startsWith("image/")) {
      resolvedMemeUrlCache.set(url, response.url);
      return response.url;
    }

    const html = await response.text();
    const candidate = extractMetaImageUrl(html);
    if (candidate && isHttpUrl(candidate)) {
      resolvedMemeUrlCache.set(url, candidate);
      return candidate;
    }
  } catch {
    // Fall through to unresolved cache write.
  }

  resolvedMemeUrlCache.set(url, null);
  return undefined;
}

function mapCategoryToTopics(category: string): HumorTopic[] {
  const normalized = normalizeCategory(category);

  if (normalized.includes("auth")) return ["auth"];
  if (normalized.includes("quota")) return ["quota", "rateLimit"];
  if (normalized.includes("in progress") || normalized === "start") return ["inProgress"];
  if (normalized.includes("high score") || normalized.includes("8 10") || normalized.includes("9 10") || normalized.includes("10 10")) return ["celebrate"];
  if (normalized.includes("low score") || normalized.includes("1 10") || normalized.includes("2 10") || normalized.includes("3 10")) return ["critical"];
  if (normalized.includes("success") || normalized.includes("compliment") || normalized.includes("love you")) return ["celebrate"];
  if (normalized.includes("model")) return ["model"];
  if (normalized.includes("didn t understand user input") || normalized.includes("didnt understand user input")) return ["warning"];
  if (normalized.includes("failure")) return ["warning"];
  if (normalized.includes("useful")) return ["celebrate"];
  if (normalized.includes("funny")) return ["warning"];
  if (normalized.includes("rude") || normalized.includes("insult")) return ["critical"];

  return [];
}

function loadConfiguredMemes(): Partial<Record<HumorTopic, MemeCandidate[]>> {
  const accepted: Partial<Record<HumorTopic, MemeCandidate[]>> = {};

  for (const entry of configuredMemes) {
    if (!entry || typeof entry.category !== "string") continue;

    const topics = mapCategoryToTopics(entry.category);
    if (topics.length === 0) continue;

    const memes = extractMemesFromConfiguredEntry(entry);
    if (memes.length === 0) continue;

    for (const topic of topics) {
      accepted[topic] = [...(accepted[topic] ?? []), ...memes];
    }
  }

  return accepted;
}

function loadCustomMemes(): Partial<Record<HumorTopic, MemeCandidate[]>> {
  if (customMemesCache) return customMemesCache;

  const accepted: Partial<Record<HumorTopic, MemeCandidate[]>> = loadConfiguredMemes();
  const raw = process.env.CODETURTLE_MEME_GIFS;
  if (!raw) {
    customMemesCache = accepted;
    return customMemesCache;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, string | string[]>;
    for (const [topic, value] of Object.entries(parsed)) {
      if (!(topic in EMPTY_MEMES)) continue;

      const topicKey = topic as HumorTopic;
      const urls = Array.isArray(value)
        ? value.filter((candidate): candidate is string => typeof candidate === "string" && isHttpUrl(candidate))
        : (typeof value === "string" && isHttpUrl(value) ? [value] : []);

      if (urls.length > 0) {
        accepted[topicKey] = urls.map((url) => ({ url, useWhen: "Custom override meme" }));
      }
    }
    customMemesCache = accepted;
    return accepted;
  } catch {
    customMemesCache = accepted;
    return customMemesCache;
  }
}

function getScenarioKeywords(scenario: HumorScenario): string[] {
  if (scenario === "success-clean") return ["approve", "success", "happy", "clean", "celebrat"];
  if (scenario === "success-warning") return ["warning", "minor", "cleanup", "interesting", "funny"];
  if (scenario === "success-critical") return ["critical", "low", "bad", "poor", "rework", "sad"];
  if (scenario === "failure-auth") return ["auth", "token", "credential"];
  if (scenario === "failure-model") return ["model", "provider", "endpoint"];
  if (scenario === "failure-rate-limit") return ["quota", "limit", "rate", "wallet"];
  if (scenario === "failure-generic") return ["fail", "error", "retry"];
  if (scenario === "in-progress") return ["start", "progress", "review", "analyz"];
  if (scenario === "quota-limit") return ["quota", "limit", "wallet", "plan", "rate"];
  return [];
}

function isRelevantCandidate(candidate: MemeCandidate, scenario: HumorScenario): boolean {
  const note = (candidate.useWhen || "").toLowerCase();
  if (!note) return false;
  const keywords = getScenarioKeywords(scenario);
  return keywords.some((keyword) => note.includes(keyword));
}

async function pickMemeUrl(
  memes: Record<HumorTopic, MemeCandidate[]>,
  topic: HumorTopic,
  scenario: HumorScenario,
  options?: HumorOptions,
): Promise<string | undefined> {
  const configured = memes[topic];
  if (!configured || configured.length === 0) return undefined;

  const relevant = configured.filter((candidate) => isRelevantCandidate(candidate, scenario));
  const basePool = relevant.length > 0 ? relevant : configured;
  const recentUrl = options?.dedupeKey ? recentMemeByKey.get(options.dedupeKey) : undefined;
  const pool =
    recentUrl && basePool.length > 1
      ? basePool.filter((candidate) => candidate.url !== recentUrl)
      : basePool;

  const candidates = [...pool];
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  for (const candidate of candidates) {
    const resolved = await resolveRenderableMemeUrl(candidate.url);
    if (resolved) {
      if (options?.dedupeKey) {
        recentMemeByKey.set(options.dedupeKey, candidate.url);
      }
      return resolved;
    }
  }

  return undefined;
}

function getTopicForScenario(scenario: HumorScenario): HumorTopic {
  if (scenario === "success-clean") return "celebrate";
  if (scenario === "success-warning") return "warning";
  if (scenario === "success-critical") return "critical";
  if (scenario === "failure-auth") return "auth";
  if (scenario === "failure-model") return "model";
  if (scenario === "failure-rate-limit") return "rateLimit";
  if (scenario === "in-progress") return "inProgress";
  if (scenario === "quota-limit") return "quota";
  return "warning";
}

function pickQuip(scenario: HumorScenario, context?: HumorContext, options?: HumorOptions): string {
  const lines = QUIPS[scenario];
  if (!lines || lines.length === 0) return "CodeTurtle is reviewing with extra vibes.";

  const lastQuip = options?.dedupeKey ? recentQuipByKey.get(options.dedupeKey) : undefined;
  const candidateLines =
    lastQuip && lines.length > 1
      ? lines.filter((line) => line !== lastQuip)
      : lines;
  const selected = candidateLines[Math.floor(Math.random() * candidateLines.length)] || lines[0];

  if (options?.dedupeKey) {
    recentQuipByKey.set(options.dedupeKey, selected);
  }

  if (scenario === "success-critical" && typeof context?.score === "number") {
    return `${selected} (Score: ${context.score}/10)`;
  }

  if (scenario === "quota-limit" && typeof context?.used === "number" && typeof context?.limit === "number") {
    return `${selected} (${context.used}/${context.limit})`;
  }

  return selected;
}

function isHumorEnabled(): boolean {
  const value = (process.env.CODETURTLE_HUMOR_MODE || "on").toLowerCase();
  return value !== "off" && value !== "false" && value !== "0";
}

export async function getHumorLines(
  scenario: HumorScenario,
  context?: HumorContext,
  options?: HumorOptions,
): Promise<string[]> {
  if (options?.enabled === false) return [];
  if (!isHumorEnabled()) return [];

  const topic = getTopicForScenario(scenario);
  const memes = { ...EMPTY_MEMES, ...loadCustomMemes() };
  const gifUrl = await pickMemeUrl(memes, topic, scenario, options);
  const quip = pickQuip(scenario, context, options);

  const lines = [
    "",
    "### Vibe Check",
    quip,
  ];

  if (gifUrl) {
    lines.push(`![meme-${topic}](${gifUrl})`);
  }

  return lines;
}

export function getSuccessHumorScenario(score: number, issuesCount: number): HumorScenario {
  if (score < 5) return "success-critical";
  if (issuesCount === 0 && score >= 8) return "success-clean";
  return "success-warning";
}

export function getFailureHumorScenario(errorMessage: string): HumorScenario {
  if (/bad credentials|401|unauthorized|authentication expired/i.test(errorMessage)) return "failure-auth";
  if (/rate limit|429|too many requests/i.test(errorMessage)) return "failure-rate-limit";
  if (/decommissioned|unsupported model|no endpoints found|provider returned error|api key is missing|loadapikeyerror/i.test(errorMessage)) return "failure-model";
  return "failure-generic";
}
