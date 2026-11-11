/**
 * Very famous, broadly trusted models that are likely to remain available.
 * Shown as a ★ "Recommended" hint in the UI. This is NOT a ranking - it's a
 * whitelist of recognizable, battle-tested families. If a model disappears
 * from the live catalog, the star simply stops rendering.
 *
 * Match by lowercase substring so version bumps don't break the list.
 */
const RECOMMENDED_SUBSTRINGS: readonly string[] = [
  // Google / Gemma
  "gemini-2.5",
  "gemini-3",
  "gemma",
  // Anthropic Claude
  "claude-",
  // OpenAI open models
  "gpt-oss",
  // Meta Llama
  "llama",
  // Qwen
  "qwen",
  // NVIDIA Nemotron
  "nemotron",
  // DeepSeek
  "deepseek",
  // Mistral / Codestral / Devstral
  "mistral",
  "codestral",
  "devstral",
  "mixtral",
  // Cohere coding model
  "north-mini-code",
  // Moonshot Kimi
  "kimi",
  // Thinking Machines Inkling
  "inkling",
] as const;

export function isRecommendedModel(id: string): boolean {
  const needle = id.toLowerCase();
  return RECOMMENDED_SUBSTRINGS.some((s) => needle.includes(s));
}
