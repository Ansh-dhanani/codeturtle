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
    description: "Ultra-fast inference (shared key supported)",
    models: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", tier: "free" as const, description: "Fast open-source" },
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant", tier: "free" as const, description: "Low-latency Groq model" },
    ],
    requiresApiKey: false,
    keyEnvVar: "GROQ_API_KEY",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "OpenCode-style access to many free models (shared key supported)",
    models: [
      { id: "openrouter/auto", name: "Auto Router", tier: "free" as const, description: "Automatically choose an available route" },
      { id: "qwen/qwen3-coder:free", name: "Qwen3 Coder 480B (free)", tier: "free" as const, description: "Strong coding-focused free model" },
      { id: "stepfun/step-3.5-flash:free", name: "Step 3.5 Flash (free)", tier: "free" as const, description: "Fast reasoning with long context" },
      { id: "nvidia/nemotron-3-nano-30b-a3b:free", name: "Nemotron 3 Nano 30B (free)", tier: "free" as const, description: "Efficient free model for agent workflows" },
      { id: "minimax/minimax-m2.5:free", name: "MiniMax M2.5 (free)", tier: "free" as const, description: "General productivity and coding" },
      { id: "openai/gpt-oss-120b:free", name: "gpt-oss-120b (free)", tier: "free" as const, description: "Open-weight high-capacity free model" },
      { id: "openai/gpt-oss-20b:free", name: "gpt-oss-20b (free)", tier: "free" as const, description: "Low-latency open-weight free model" },
      { id: "qwen/qwen3.6-plus:free", name: "Qwen3.6 Plus (free)", tier: "free" as const, description: "Reliable general free fallback" },
      { id: "arcee-ai/trinity-mini:free", name: "Trinity Mini (free)", tier: "free" as const, description: "Compact MoE free reasoning model" },
      { id: "moonshotai/kimi-k2", name: "Kimi K2", tier: "pro" as const, description: "Kimi K2 paid route" },
    ],
    requiresApiKey: false,
    keyEnvVar: "OPENROUTER_API_KEY",
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
