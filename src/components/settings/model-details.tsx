import { Badge } from "@/components/ui/badge";
import type { CatalogModel } from "@/lib/ai-catalog";
import { isRecommendedModel } from "@/lib/famous-models";

const CAPABILITY_LABELS: Record<string, string> = {
  reasoning: "reasoning",
  reasoning_effort: "effort control",
  structured_outputs: "structured output",
  tools: "tools",
  mandatory_reasoning: "always-reasoning",
  coding: "coding-native",
  json_mode: "json mode",
  code_execution: "code exec",
};

export function formatContextLength(n?: number): string | null {
  if (!n || n <= 0) return null;
  if (n >= 1_000_000) return `${Number.isInteger(n / 1_000_000) ? n / 1_000_000 : (n / 1_000_000).toFixed(1)}M ctx`;
  return `${Math.round(n / 1000)}K ctx`;
}

/**
 * Compact detail row shown under/over a model name in selectors:
 * context window, parameter scale, live capabilities and price. Informational only - no ranking.
 */
export function ModelDetailRow({ model }: { model: CatalogModel }) {
  const ctx = formatContextLength(model.contextLength);
  const recommended = isRecommendedModel(model.id);
  const hasAny =
    recommended || ctx || model.parametersLabel || model.priceLabel ||
    (model.capabilities && model.capabilities.length > 0);

  if (!hasAny) return null;

  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {recommended && (
        <Badge
          variant="outline"
          className="border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
          title="Famous, broadly trusted model family - likely to remain available. Not a ranking."
        >
          Recommended
        </Badge>
      )}
      {ctx && (
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]" title="Context window">
          {ctx}
        </Badge>
      )}
      {model.parametersLabel && (
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]" title="Parameter scale (parsed from live catalog)">
          {model.parametersLabel}
        </Badge>
      )}
      {model.priceLabel && (
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] text-muted-foreground" title="Pricing (live from provider)">
          {model.priceLabel}
        </Badge>
      )}
      {(model.capabilities ?? []).map((cap) => (
        <Badge key={cap} variant="outline" className="px-1.5 py-0 text-[10px] text-muted-foreground">
          {CAPABILITY_LABELS[cap] ?? cap}
        </Badge>
      ))}
    </span>
  );
}


