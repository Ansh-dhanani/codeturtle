export const AI_MODELS = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (Default)", description: "Fast, cost-effective. Best for most reviews.", tier: "free" as const },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Deeper analysis, better for complex code.", tier: "pro" as const },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", description: "Balanced speed and quality.", tier: "free" as const },
] as const;

export type AIModelId = typeof AI_MODELS[number]["id"];
