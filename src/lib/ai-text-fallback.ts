/**
 * Small text-generation helper with the same free-provider failover chain used
 * by the review pipeline: Gemini first, then Groq's free models. Used by
 * mention replies (diagrams and grounded code questions) so a single exhausted
 * provider never silently drops a reply.
 */
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

type TextModel = NonNullable<Parameters<typeof generateText>[0]["model"]>;

export const FREE_GROQ_MODELS = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
] as const;

export async function generateTextWithFreeFallback(params: {
    system: string;
    prompt: string;
    maxOutputTokens?: number;
}): Promise<{ text: string; provider: string; model: string }> {
    const candidates: Array<{ provider: string; model: string; create: () => TextModel }> = [
        { provider: "google", model: "gemini-2.5-flash", create: () => google("gemini-2.5-flash") },
    ];

    if (process.env.GROQ_API_KEY) {
        const groq = createOpenAI({
            apiKey: process.env.GROQ_API_KEY,
            baseURL: "https://api.groq.com/openai/v1",
        });
        for (const model of FREE_GROQ_MODELS) {
            candidates.push({ provider: "groq", model, create: () => groq(model) });
        }
    }

    const errors: string[] = [];
    for (const candidate of candidates) {
        try {
            const { text } = await generateText({
                model: candidate.create(),
                system: params.system,
                prompt: params.prompt,
                maxOutputTokens: params.maxOutputTokens ?? 1200,
            });
            if (text?.trim()) {
                return { text: text.trim(), provider: candidate.provider, model: candidate.model };
            }
            errors.push(`${candidate.provider}/${candidate.model}: empty response`);
        } catch (error) {
            errors.push(`${candidate.provider}/${candidate.model}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    throw new Error(`All text models failed. ${errors.slice(0, 4).join(" | ")}`);
}
