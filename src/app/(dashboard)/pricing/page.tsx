"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2 } from "lucide-react";
import { PLANS, type PlanName } from "@/lib/billing";
import { useQuery } from "@tanstack/react-query";
import { getUserSubscription } from "@/module/review/actions";

const planOrder: PlanName[] = ["free", "pro", "team", "enterprise"];

function PlanCard({ plan, name, isCurrent, isPopular }: { plan: PlanName; name: string; isCurrent: boolean; isPopular: boolean }) {
  const [loading, setLoading] = useState(false);
  const config = PLANS[plan];

  const handleSubscribe = async () => {
    if (plan === "free") return;
    setLoading(true);
    try {
      const polarCheckoutUrl = process.env.NEXT_PUBLIC_POLAR_CHECKOUT_URL;
      if (polarCheckoutUrl) {
        window.location.href = `${polarCheckoutUrl}?metadata[plan]=${plan}`;
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className={`relative flex flex-col ${isPopular ? "border-primary shadow-lg" : ""} ${isCurrent ? "ring-2 ring-primary" : ""}`}>
      {isPopular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
          Most Popular
        </Badge>
      )}
      {isCurrent && (
        <Badge variant="secondary" className="absolute -top-3 left-1/2 -translate-x-1/2">
          Current Plan
        </Badge>
      )}
      <CardHeader>
        <CardTitle className="text-2xl">{name}</CardTitle>
        <CardDescription>
          {config.price === 0 ? "Free forever" : `$${config.price}/month`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="space-y-3">
          {config.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          variant={isCurrent ? "secondary" : isPopular ? "default" : "outline"}
          disabled={isCurrent || loading}
          onClick={handleSubscribe}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : isCurrent ? "Current Plan" : plan === "free" ? "Downgrade" : "Upgrade"}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function PricingPage() {
  const { data: subscription } = useQuery({
    queryKey: ["subscription"],
    queryFn: async () => await getUserSubscription(),
  });

  const currentPlan = (subscription?.plan as PlanName) || "free";

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Pricing</h1>
        <p className="text-muted-foreground">
          Choose the plan that best fits your needs. Upgrade or downgrade at any time.
        </p>
      </div>

      {subscription && (
        <div className="rounded-lg border bg-muted/50 p-4 text-center text-sm">
          Current plan: <strong>{subscription.planName}</strong>
          {" · "}
          Usage: {subscription.usage.used}/{subscription.usage.limit === -1 ? "∞" : subscription.usage.limit} reviews this month
          {subscription.cancelAtPeriodEnd && (
            <span className="ml-2 text-yellow-600 dark:text-yellow-400">(cancels at period end)</span>
          )}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {planOrder.map((plan) => (
          <PlanCard
            key={plan}
            plan={plan}
            name={PLANS[plan].name}
            isCurrent={plan === currentPlan}
            isPopular={plan === "pro"}
          />
        ))}
      </div>
    </div>
  );
}
