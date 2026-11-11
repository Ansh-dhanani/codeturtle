"use client";

import { useQuery } from "@tanstack/react-query";
import { getUserSubscription } from "@/module/review/actions";
import { startCheckout, openCustomerPortal } from "@/module/billing/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS } from "@/lib/billing";
import { CreditCard, Loader2, TrendingUp, ExternalLink } from "lucide-react";
import { PricingSection } from "@/components/pricing-section";
import { toast } from "sonner";
import { useState } from "react";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";

export default function BillingPage() {
  const [processing, setProcessing] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["billing"],
    queryFn: async () => await getUserSubscription(),
  });

  const handleSubscribe = async (plan: string) => {
    setProcessing(plan);
    trackEvent(AnalyticsEvents.checkoutStarted, { plan });
    const result = await startCheckout(plan);
    if (!result.ok) {
      toast.error(result.error);
      setProcessing(null);
      return;
    }
    window.location.href = result.data.url;
  };

  const handleManage = async () => {
    setProcessing("portal");
    trackEvent(AnalyticsEvents.billingPortalOpened);
    const result = await openCustomerPortal();
    if (!result.ok) {
      toast.error(result.error);
      setProcessing(null);
      return;
    }
    window.location.href = result.data.url;
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
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center">
                <span className="text-2xl font-bold capitalize">{currentPlan}</span>
                <Badge variant={currentPlan === "free" ? "secondary" : "default"} className="ml-2">
                  {data?.status || "active"}
                </Badge>
              </div>
              {currentPlan !== "free" && (
                <Button disabled={processing === "portal"} variant="outline" onClick={handleManage}>
                  {processing === "portal" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4 mr-2" />
                  )}
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
                  : `${PLANS[currentPlan as keyof typeof PLANS]?.repoLimit || 5} max`}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plans &amp; Pricing</CardTitle>
          <CardDescription>Choose the plan that fits your review queue</CardDescription>
        </CardHeader>
        <CardContent>
          <PricingSection
            currentPlan={currentPlan}
            onSelectPlan={handleSubscribe}
            processingPlan={processing}
            heading="Choose your plan"
            subheading="Start free - 20 reviews a month, no credit card. Pro launch price $4/mo (90% off), locked in forever as long as you stay subscribed."
          />
        </CardContent>
      </Card>
    </div>
  );
}
