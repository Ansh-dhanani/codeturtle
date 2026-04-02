export const AI_PROVIDERS = [
  {
    id: "google",
    name: "Google Gemini",
    description: "Fast, cost-effective coding models",
    models: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", tier: "free" as const, description: "Best for most reviews" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", tier: "pro" as const, description: "Deeper analysis" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", tier: "free" as const, description: "Balanced speed/quality" },
    ],
    requiresApiKey: false,
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o and o-series models",
    models: [
      { id: "gpt-4o", name: "GPT-4o", tier: "pro" as const, description: "Fast, capable general AI" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", tier: "free" as const, description: "Lightweight, fast" },
      { id: "o3-mini", name: "o3 Mini", tier: "pro" as const, description: "Reasoning-focused" },
    ],
    requiresApiKey: true,
    keyEnvVar: "OPENAI_API_KEY",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude models for coding",
    models: [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", tier: "pro" as const, description: "Best coding model" },
      { id: "claude-haiku-3-5-20241022", name: "Claude Haiku 3.5", tier: "free" as const, description: "Fast, lightweight" },
    ],
    requiresApiKey: true,
    keyEnvVar: "ANTHROPIC_API_KEY",
  },
  {
    id: "groq",
    name: "Groq",
    description: "Ultra-fast inference",
    models: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", tier: "free" as const, description: "Fast open-source" },
      { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", tier: "free" as const, description: "Efficient MoE model" },
    ],
    requiresApiKey: true,
    keyEnvVar: "GROQ_API_KEY",
  },
] as const;

export type ProviderId = typeof AI_PROVIDERS[number]["id"];
export type ModelTier = "free" | "pro";

export function getModelConfig(providerId: ProviderId, modelId: string) {
  const provider = AI_PROVIDERS.find((p) => p.id === providerId);
  if (!provider) return null;
  const model = provider.models.find((m) => m.id === modelId);
  if (!model) return null;
  return { provider, model };
}

export function getFreeModels() {
  return AI_PROVIDERS.flatMap((p) =>
    p.models.filter((m) => m.tier === "free").map((m) => ({ ...m, providerId: p.id, providerName: p.name }))
  );
}
