"use client";

import { useMemo, useState } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Brain,
  Check,
  Key,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";
import { updateUserAIModel } from "@/module/settings/actions";
import { useAvailableProviders } from "@/hooks/use-available-providers";
import { ModelDetailRow } from "@/components/settings/model-details";

function RadioDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
        active ? "border-primary" : "border-muted-foreground/30"
      }`}
    >
      {active && <span className="h-2 w-2 rounded-full bg-primary" />}
    </span>
  );
}

export function AIModelSelector({
  currentProvider,
  currentModel,
  hasSavedApiKey = false,
}: {
  currentProvider: string;
  currentModel: string;
  hasSavedApiKey?: boolean;
}) {
  const { data: AI_PROVIDERS = [], forceRefresh } = useAvailableProviders();
  const [selectedProvider, setSelectedProvider] = useState(currentProvider || "openrouter");
  const [selectedModel, setSelectedModel] = useState(currentModel || "openrouter/auto");
  const [apiKey, setApiKey] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const selectedProviderData = useMemo(
    () => AI_PROVIDERS.find((p) => p.id === selectedProvider),
    [AI_PROVIDERS, selectedProvider],
  );
  const selectedModelData = selectedProviderData?.models.find((m) => m.id === selectedModel);

  const visibleModels = useMemo(() => {
    const models = selectedProviderData?.models ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
    );
  }, [selectedProviderData, query]);

  // Stale-detection - saved model is no longer in the live catalog
  const isModelStale = selectedProviderData
    ? !selectedProviderData.models.find((m) => m.id === selectedModel)
    : true;

  const keyNeeded = selectedProviderData?.requiresApiKey;
  const showKeySection = Boolean(selectedProviderData);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await forceRefresh();
      toast.success("Live catalog refreshed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to refresh catalog");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await updateUserAIModel(selectedProvider, selectedModel, apiKey || undefined);
      trackEvent(AnalyticsEvents.aiModelSaved, { provider: selectedProvider, model: selectedModel });
      setApiKey("");
      toast.success("AI model updated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update AI model";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────── */}
      <CardHeader className="flex-row items-start justify-between gap-4 border-b pb-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Brain className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-lg">AI Review Model</CardTitle>
            <CardDescription>
              The provider and model used to review your pull requests. Free models work on all plans.
            </CardDescription>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Refresh live catalog"
          title="Refresh live catalog"
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </CardHeader>

      {isModelStale && (
        <div className="border-b border-amber-500/20 bg-amber-500/5 px-6 py-3 text-xs text-amber-700 dark:text-amber-400">
          <p className="font-semibold">Your saved model is stale</p>
          <p className="mt-0.5">
            <code className="rounded bg-amber-500/10 px-1">{selectedModel}</code> is no longer available on{" "}
            {selectedProviderData?.name || selectedProvider}. Pick a live model below to replace it.
          </p>
        </div>
      )}

      {/* ── Provider pills ─────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto px-6 pt-5 pb-1">
        {AI_PROVIDERS.map((provider) => {
          const active = provider.id === selectedProvider;
          return (
            <button
              key={provider.id}
              onClick={() => {
                setSelectedProvider(provider.id);
                setQuery("");
                // Keep the current model if it exists on the new provider, else select the top (live-scored) one.
                const keep = provider.models.find((m) => m.id === selectedModel);
                if (!keep) setSelectedModel(provider.models[0]?.id ?? "");
              }}
              className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                active
                  ? "border-primary/60 bg-primary/10 text-primary shadow-sm"
                  : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
            >
              {provider.name}
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                {provider.models.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Search ─────────────────────────────────────────────── */}
      <div className="px-6 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${selectedProviderData?.name ?? "models"}…`}
            className="h-9 border-border/60 bg-muted/30 pl-9 focus-visible:bg-background"
            aria-label="Search models"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Model list ─────────────────────────────────────────── */}
      <div className="max-h-[26rem] space-y-2 overflow-y-auto px-4 py-3">
        {visibleModels.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No models match “{query}”.
          </p>
        )}
        {visibleModels.map((model) => {
          const active = selectedModel === model.id;
          return (
            <button
              key={model.id}
              onClick={() => {
                setSelectedProvider(selectedProvider);
                setSelectedModel(model.id);
              }}
              aria-pressed={active}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                active
                  ? "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/20"
                  : "border-border/60 hover:border-primary/30 hover:bg-muted/40"
              }`}
            >
              <RadioDot active={active} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium leading-tight">{model.name}</span>
                  {model.tier === "pro" && (
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-muted-foreground">
                      pro
                    </Badge>
                  )}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground/70">
                  {model.id}
                </span>
                <ModelDetailRow model={model} />
                {model.description && (
                  <span className="mt-1 line-clamp-2 block text-[11px] leading-snug text-muted-foreground">
                    {model.description}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Custom API key ─────────────────────────────────────── */}
      {showKeySection && (
        <div className="border-t bg-muted/20 px-6 py-4">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="custom-api-key"
              className="flex items-center gap-2 text-xs font-medium text-muted-foreground"
            >
              <Key className="h-3.5 w-3.5" />
              {keyNeeded ? "API key (required)" : "Custom API key"}
              {!keyNeeded && (
                <span className="font-normal text-muted-foreground/70">- optional, uses shared server key</span>
              )}
            </label>
            {hasSavedApiKey && !apiKey && (
              <span className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                <ShieldCheck className="h-3 w-3" />
                Saved · encrypted
              </span>
            )}
          </div>

          <Input
            id="custom-api-key"
            type="password"
            placeholder={
              hasSavedApiKey && !apiKey
                ? "Enter a new key to replace the saved one…"
                : `sk-… paste your ${selectedProviderData?.name} key`
            }
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="mt-2 h-9 font-mono text-xs"
          />
          <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground/80">
            <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
            Your key is encrypted at rest with AES-256-GCM and never shown again - it is never sent to
            the browser, logged, or shared. No one can see it, not even us. It is used only to call
            your chosen provider.
          </p>
        </div>
      )}

      {/* ── Footer / save ──────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-t bg-background px-6 py-3.5">
        <p className="min-w-0 text-xs text-muted-foreground">
          Selected{" "}
          <span className="font-medium text-foreground">
            {selectedProviderData?.name ?? selectedProvider} / {selectedModelData?.name ?? selectedModel}
          </span>
        </p>
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? (
            "Saving…"
          ) : (
            <>
              <Check className="h-4 w-4" />
              Save model
            </>
          )}
        </button>
      </div>
    </Card>
  );
}
