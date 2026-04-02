"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Brain, Check, ChevronDown, ChevronRight, Key } from "lucide-react";
import { toast } from "sonner";
import { AI_PROVIDERS } from "@/lib/ai-providers";
import { updateUserAIModel } from "@/module/settings/actions";

export function AIModelSelector({ currentProvider, currentModel }: { currentProvider: string; currentModel: string }) {
  const [selectedProvider, setSelectedProvider] = useState(currentProvider || "google");
  const [selectedModel, setSelectedModel] = useState(currentModel || "gemini-2.5-flash");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({ google: true });

  const handleSave = async () => {
    setLoading(true);
    try {
      await updateUserAIModel(selectedProvider, selectedModel, apiKey || undefined);
      toast.success("AI model updated");
    } catch (error) {
      toast.error("Failed to update AI model");
    } finally {
      setLoading(false);
    }
  };

  const toggleProvider = (id: string) => {
    setExpandedProviders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedProviderData = AI_PROVIDERS.find((p) => p.id === selectedProvider);
  const selectedModelData = selectedProviderData?.models.find((m) => m.id === selectedModel);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          AI Review Model
        </CardTitle>
        <CardDescription>
          Choose your AI provider and model. Free models available on all plans.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {AI_PROVIDERS.map((provider) => (
          <div key={provider.id} className="space-y-2">
            <button
              onClick={() => toggleProvider(provider.id)}
              className="flex items-center gap-2 w-full text-left font-medium text-sm hover:text-primary transition-colors"
            >
              {expandedProviders[provider.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {provider.name}
              <span className="text-xs text-muted-foreground font-normal">({provider.description})</span>
            </button>

            {expandedProviders[provider.id] && (
              <div className="ml-6 space-y-2">
                {provider.models.map((model) => (
                  <div
                    key={model.id}
                    onClick={() => {
                      setSelectedProvider(provider.id);
                      setSelectedModel(model.id);
                    }}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedProvider === provider.id && selectedModel === model.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                      selectedProvider === provider.id && selectedModel === model.id
                        ? "border-primary"
                        : "border-muted-foreground/30"
                    }`}>
                      {selectedProvider === provider.id && selectedModel === model.id && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{model.name}</span>
                        <Badge variant={model.tier === "free" ? "secondary" : "default"} className="text-xs">
                          {model.tier}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{model.description}</p>
                    </div>
                  </div>
                ))}

                {provider.requiresApiKey && (
                  <div className="flex items-center gap-2 pt-2">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      placeholder={`Enter ${provider.name} API key`}
                      value={selectedProvider === provider.id ? apiKey : ""}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            Selected: <span className="font-medium text-foreground">{selectedProviderData?.name}</span> / <span className="font-medium text-foreground">{selectedModelData?.name}</span>
          </div>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Saving..." : (
              <>
                <Check className="h-4 w-4" />
                Save
              </>
            )}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
