import "server-only";

export type CatalogModel = {
  id: string;
  name: string;
  tier: "free" | "pro";
  description: string;
  /** Live context window in tokens, when the provider reports it. */
  contextLength?: number;
  /** Human-readable parameter scale, e.g. "550B total · 55B active". Informational only. */
  parametersLabel?: string;
  /** Notable live-detected capabilities, e.g. "reasoning", "structured_outputs", "tools". */
  capabilities?: string[];
  /** Price summary, e.g. "$0.15/M in · $0.60/M out", "free tier", "free". */
  priceLabel?: string;
  /** True when the signed-in user's plan can't select this model (paywall). */
  locked?: boolean;
};

export type CatalogProvider = {
  id: string;
  name: string;
  description: string;
  requiresApiKey: boolean;
  keyEnvVar?: string;
  models: CatalogModel[];
  live: boolean;
};

const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

/** Default review model when the user/repo hasn't picked one.
 * Pinned to a model we've verified end-to-end (Google Gemini 2.5 Flash) —
 * NOT `openrouter/auto`, whose free pool can silently route to weak/broken models. */
const DEFAULT_REVIEW_MODEL = { provider: "google", model: "gemini-2.5-flash" } as const;

export function getDefaultReviewModel(): { provider: string; model: string } {
  return { ...DEFAULT_REVIEW_MODEL };
}

type CacheEntryBox = {
  at: number;
  providers: CatalogProvider[];
};

// Module-scope cache; survives between server requests in the same process.
declare global {
  var __aiCatalogCache: CacheEntryBox | undefined;
}

/** Parse all "<number>B" parameter figures from live name/description text (display only). */
function parseParamBillions(text: string): number[] {
  const matches = text.match(/(\d+(?:\.\d+)?)\s*b\b/gi) ?? [];
  return matches.map((s) => parseFloat(s)).filter((n) => Number.isFinite(n) && n > 0 && n < 10000);
}

/** Capabilities + parameter label straight from live text, no scoring. */
function describeModel(m: {
  id: string; name?: string; description?: string; context_length?: number;
  supported_parameters?: string[]; reasoning?: { mandatory?: boolean };
}): { parametersLabel?: string; capabilities: string[]; description?: string } {
  const text = `${m.name ?? m.id} ${m.description ?? ""}`.toLowerCase();
  const supported = m.supported_parameters ?? [];
  const capabilities: string[] = [];
  if (supported.includes("reasoning")) capabilities.push("reasoning");
  if (supported.includes("reasoning_effort")) capabilities.push("reasoning_effort");
  if (supported.includes("structured_outputs")) capabilities.push("structured_outputs");
  if (supported.includes("tools")) capabilities.push("tools");
  if (supported.includes("json_mode")) capabilities.push("json_mode");
  if (supported.includes("code_execution")) capabilities.push("code_execution");
  if (m.reasoning?.mandatory) capabilities.push("mandatory_reasoning");
  if (/coder|coding agent|code review|code-focused|agentic coding|software engineering/.test(text)) {
    capabilities.push("coding");
  }

  const figures = parseParamBillions(text);
  const total = figures.length ? Math.max(...figures) : 0;
  const active = figures.length ? Math.min(...figures) : 0;

  let parametersLabel: string | undefined;
  if (figures.length >= 2) {
    parametersLabel = `${total}B total · ${active}B active`;
  } else if (figures.length === 1) {
    parametersLabel = `${total}B parameters`;
  }

  return { parametersLabel, capabilities, description: m.description };
}

async function fetchOpenRouter(): Promise<CatalogProvider | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      next: { revalidate: CACHE_TTL_MS },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: Array<{ id: string; name: string; description?: string; context_length?: number; supported_parameters?: string[]; reasoning?: { mandatory?: boolean } }>;
    };
    const models = (json.data || [])
      .filter((m) => m.id.endsWith(":free") || m.id === "openrouter/auto")
      .map((m) => {
        const d = describeModel(m);
        return {
          id: m.id,
          name: m.name || m.id,
          tier: "free" as const,
          description: m.description ? (m.description.length > 320 ? `${m.description.slice(0, 317)}…` : m.description) : "Free via OpenRouter",
          contextLength: m.context_length,
          parametersLabel: d.parametersLabel,
          capabilities: d.capabilities,
          priceLabel: m.id === "openrouter/auto" ? "varies by route" : "free",
        };
      });
    if (models.length === 0) return null;
    return {
      id: "openrouter",
      name: "OpenRouter",
      description: "Free models via OpenRouter auto-router",
      requiresApiKey: false,
      keyEnvVar: "OPENROUTER_API_KEY",
      models,
      live: true,
    };
  } catch (err) {
    console.warn("[ai-catalog] OpenRouter live fetch failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function fetchGoogle(): Promise<CatalogProvider | null> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { next: { revalidate: CACHE_TTL_MS }, signal: AbortSignal.timeout(30_000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      models?: Array<{ name: string; displayName?: string; description?: string; supportedGenerationMethods?: string[]; inputTokenLimit?: number; thinking?: boolean }>;
    };
    const models = (json.models || [])
      .filter((m) => /gemini|gemma/i.test(m.name || ""))
      .filter((m) => (m.supportedGenerationMethods || ["generateContent"]).includes("generateContent"))
      .filter((m) => !/tts|embedding|imagen|veo|image|audio|live|robotics/i.test(m.name || ""))
      .map((m) => ({
        id: (m.name || "").replace("models/", ""),
        name: m.displayName || (m.name || "").replace("models/", ""),
        tier: "free" as const,
        description: m.description || "Google model",
        contextLength: m.inputTokenLimit,
        capabilities: m.thinking ? ["reasoning", "tools"] : ["tools"],
        priceLabel: "free tier",
      }));
    if (models.length === 0) return null;
    return {
      id: "google",
      name: "Google Gemini",
      description: "Gemini models with free quota",
      requiresApiKey: false,
      keyEnvVar: "GOOGLE_GENERATIVE_AI_API_KEY",
      models,
      live: true,
    };
  } catch (err) {
    console.warn("[ai-catalog] Google live fetch failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function fetchGroq(): Promise<CatalogProvider | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      next: { revalidate: CACHE_TTL_MS },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: Array<{
        id: string; name?: string; owned_by?: string; active?: boolean;
        context_window?: number; context_length?: number;
        output_modalities?: string[]; supported_features?: string[];
        pricing?: { prompt?: string; completion?: string }; description?: string;
      }>;
    };
    const models = (json.data || [])
      .filter((m) => m.active !== false)
      .filter((m) => !m.output_modalities || m.output_modalities.includes("text"))
      .filter((m) => !/whisper|orpheus|prompt-guard|guard|safeguard|tts|embedding/i.test(m.id))
      .map((m) => {
        const d = describeModel({
          id: m.id,
          name: m.name,
          description: m.description,
          supported_parameters: m.supported_features ?? [],
        });
        const promptPrice = m.pricing?.prompt;
        const completionPrice = m.pricing?.completion;
        return {
          id: m.id,
          name: m.name || m.id,
          tier: "free" as const,
          description: m.owned_by ? `${m.owned_by} model · fast inference` : "Groq model · fast inference",
          contextLength: m.context_length ?? m.context_window,
          parametersLabel: d.parametersLabel,
          capabilities: d.capabilities,
          priceLabel: promptPrice && completionPrice
            ? `$${(parseFloat(promptPrice) * 1e6).toFixed(2)}/M in · $${(parseFloat(completionPrice) * 1e6).toFixed(2)}/M out`
            : undefined,
        };
      });
    if (models.length === 0) return null;
    return {
      id: "groq",
      name: "Groq",
      description: "Fast open models on Groq",
      requiresApiKey: false,
      keyEnvVar: "GROQ_API_KEY",
      models,
      live: true,
    };
  } catch (err) {
    console.warn("[ai-catalog] Groq live fetch failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function fetchAnthropic(): Promise<CatalogProvider | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      next: { revalidate: CACHE_TTL_MS },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: Array<{
        id: string; display_name?: string; lifecycle?: string | null;
        max_input_tokens?: number;
        capabilities?: {
          thinking?: { supported?: boolean };
          effort?: { supported?: boolean };
          structured_outputs?: { supported?: boolean };
          code_execution?: { supported?: boolean };
        };
      }>;
    };
    const models = (json.data || [])
      .filter((m) => !m.lifecycle || m.lifecycle === "active")
      .map((m) => ({
        id: m.id,
        name: m.display_name || m.id,
        tier: "pro" as const,
        description: "Anthropic Claude model",
        contextLength: m.max_input_tokens,
        capabilities: [
          ...(m.capabilities?.thinking?.supported ? ["reasoning"] : []),
          ...(m.capabilities?.effort?.supported ? ["reasoning_effort"] : []),
          ...(m.capabilities?.structured_outputs?.supported ? ["structured_outputs"] : []),
          ...(m.capabilities?.code_execution?.supported ? ["code_execution"] : []),
        ],
      }));
    if (models.length === 0) return null;
    return {
      id: "anthropic",
      name: "Anthropic",
      description: "Claude models for coding",
      requiresApiKey: true,
      keyEnvVar: "ANTHROPIC_API_KEY",
      models,
      live: true,
    };
  } catch (err) {
    console.warn("[ai-catalog] Anthropic live fetch failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** True when a free-tier model selector may choose this provider/model. */
export function isFreeProviderModel(providerId: string, modelId: string): boolean {
  if (providerId === "anthropic") return false; // all Anthropic models are paid
  if (providerId === "openrouter") {
    // openrouter/auto routes to paid models by default - gated behind paid plans
    if (modelId === "openrouter/auto") return false;
    // All *:free slugs are free to use
    return modelId.endsWith(":free");
  }
  // Google and Groq lists are already free-tier models
  return true;
}

/**
 * Marks models that the user's plan can't select as `locked: true` in place
 * and returns the filtered provider list (all entries kept for upsell display).
 * Callers should validate server-side via `isFreeProviderModel` as well.
 */
export function applyPlanGate(providers: CatalogProvider[], isPaidPlan: boolean): CatalogProvider[] {
  if (isPaidPlan) return providers;
  return providers.map((p) => ({
    ...p,
    models: p.models.map((m) => ({
      ...m,
      locked: !isFreeProviderModel(p.id, m.id),
    })),
  }));
}

const FALLBACK_PROVIDERS: CatalogProvider[] = [
  {
    id: "google",
    name: "Google Gemini",
    description: "Gemini models",
    requiresApiKey: false,
    keyEnvVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    models: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", tier: "free", description: "Fast, cost-effective" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", tier: "pro", description: "Deeper analysis" },
    ],
    live: false,
  },
];

export async function getLiveCatalog(forceRefresh = false): Promise<CatalogProvider[]> {
  if (!forceRefresh && globalThis.__aiCatalogCache && Date.now() - globalThis.__aiCatalogCache.at < CACHE_TTL_MS) {
    return globalThis.__aiCatalogCache.providers;
  }
  const [openrouter, google, groq, anthropic] = await Promise.all([
    fetchOpenRouter(),
    fetchGoogle(),
    fetchGroq(),
    fetchAnthropic(),
  ]);
  const providers = [openrouter, google, groq, anthropic].filter((p): p is CatalogProvider => p !== null);
  const finalProviders = providers.length > 0 ? providers : FALLBACK_PROVIDERS;
  globalThis.__aiCatalogCache = { at: Date.now(), providers: finalProviders };
  return finalProviders;
}
