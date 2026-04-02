"use client";

import { useQuery } from "@tanstack/react-query";
import { getUserSubscription } from "@/module/review/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS } from "@/lib/billing";
import { Check, CreditCard, ExternalLink, Loader2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import Link from "next/link";

export default function BillingPage() {
  const [processing, setProcessing] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["billing"],
    queryFn: async () => await getUserSubscription(),
  });

  const handleSubscribe = async (plan: string) => {
    setProcessing(plan);
    try {
      const polarCheckoutUrl = process.env.NEXT_PUBLIC_POLAR_CHECKOUT_URL;
      if (polarCheckoutUrl) {
        window.location.href = `${polarCheckoutUrl}?metadata[plan]=${plan}`;
      } else {
        toast.error("Checkout not configured");
      }
    } catch {
      toast.error("Failed to start checkout");
    } finally {
      setProcessing(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const currentPlan = data?.plan || "free";
  const usage = data?.usage;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="text-muted-foreground">Manage your subscription and usage</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Current Plan</CardTitle>
            <CardDescription>Your active subscription</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-2xl font-bold capitalize">{currentPlan}</span>
                <Badge variant={currentPlan === "free" ? "secondary" : "default"} className="ml-2">
                  {data?.status || "active"}
                </Badge>
              </div>
              {currentPlan !== "free" && (
                <Button disabled={processing === "portal"} variant="outline">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Manage
                </Button>
              )}
            </div>
            {data?.currentPeriodEnd && (
              <p className="text-sm text-muted-foreground">
                Renews on {new Date(data.currentPeriodEnd).toLocaleDateString()}
                {data.cancelAtPeriodEnd && (
                  <span className="text-amber-600 ml-2">(cancels at period end)</span>
                )}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage This Month</CardTitle>
            <CardDescription>Your current usage against limits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">AI Reviews</span>
              </div>
              <span className="text-sm font-medium">
                {usage?.used || 0} / {usage?.limit === -1 ? "Unlimited" : usage?.limit || 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Repositories</span>
              </div>
              <span className="text-sm font-medium">
                {PLANS[currentPlan as keyof typeof PLANS]?.repoLimit === -1
                  ? "Unlimited"
                  : `${PLANS[currentPlan as keyof typeof PLANS]?.repoLimit || 2} max`}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {currentPlan === "free" && (
        <Card>
          <CardHeader>
            <CardTitle>Upgrade Your Plan</CardTitle>
            <CardDescription>Get more reviews and repositories</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {(["pro", "team"] as const).map((plan) => {
                const info = PLANS[plan];
                return (
                  <Card key={plan} className="border-2 hover:border-primary transition-colors">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        {info.name}
                        <span className="text-2xl font-bold">${info.price}/mo</span>
                      </CardTitle>
                      <CardDescription>{info.features.length} features included</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ul className="space-y-2">
                        {info.features.map((feature) => (
                          <li key={feature} className="flex items-center gap-2 text-sm">
                            <Check className="h-4 w-4 text-green-500 shrink-0" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                      <Button
                        className="w-full"
                        onClick={() => handleSubscribe(plan)}
                        disabled={processing === plan}
                      >
                        {processing === plan ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Upgrade to {info.name}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="text-center">
        <Link href="/pricing" className="text-primary hover:underline text-sm">
          View all plans and features
        </Link>
      </div>
    </div>
  );
}
