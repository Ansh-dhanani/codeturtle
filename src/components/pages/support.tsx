"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import Link from "next/link";
import {
  LifeBuoy,
  BookOpen,
  CreditCard,
  Mail,
  ArrowRight,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";

const SUPPORT_EMAIL = "dhananiansh01@gmail.com";

export default function SupportPageContent() {

  return (
    <div className="space-y-8">
      {/* ── Big hero ── */}
      <div className="space-y-3 pb-2">
        <Link href="/docs" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition">
          <Sparkles className="h-3 w-3" /> Documentation answers 80% of questions
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h1 className="font-heading text-4xl font-extrabold leading-[0.95] tracking-tight text-foreground md:text-6xl">
              Need<br />help?
            </h1>
            <p className="max-w-sm text-sm text-muted-foreground">
              Fast answers, real humans, no ticket queue. Most people are sorted in under 10 minutes.
            </p>
          </div>
          <a href={`mailto:${SUPPORT_EMAIL}`} onClick={() => trackEvent(AnalyticsEvents.supportEmailClicked, { location: "hero" })} className="flex shrink-0 items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-xs font-semibold text-background transition hover:opacity-90">
            <Mail className="h-4 w-4" />
            Email us
          </a>
        </div>
      </div>

      {/* ── Three large links ── */}
      <div className="grid gap-3 md:grid-cols-3">
        <Link href="/docs" className="group relative flex flex-col gap-6 overflow-hidden rounded-2xl border bg-card p-5 transition hover:border-primary/30 hover:bg-muted/30">
          <BookOpen className="h-6 w-6 text-primary" />
          <div>
            <h3 className="font-semibold text-foreground">Docs</h3>
            <p className="mt-1 text-xs text-muted-foreground">Setup, models, webhooks, custom rules — step-by-step.</p>
          </div>
          <ArrowRight className="absolute right-4 top-4 h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
        </Link>
        <a href={`mailto:${SUPPORT_EMAIL}?subject=Bug report`} onClick={() => trackEvent(AnalyticsEvents.supportEmailClicked, { location: "bug-report-tile" })} className="group relative flex flex-col gap-6 overflow-hidden rounded-2xl border bg-card p-5 transition hover:border-primary/30 hover:bg-muted/30">
          <Mail className="h-6 w-6 text-primary" />
          <div>
            <h3 className="font-semibold text-foreground">Report a bug</h3>
            <p className="mt-1 text-xs text-muted-foreground">Email with the PR or repo link — we read it end-to-end.</p>
          </div>
          <ArrowRight className="absolute right-4 top-4 h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
        </a>
        <a href="/billing" className="group relative flex flex-col gap-6 overflow-hidden rounded-2xl border bg-card p-5 transition hover:border-primary/30 hover:bg-muted/30">
          <CreditCard className="h-6 w-6 text-primary" />
          <div>
            <h3 className="font-semibold text-foreground">Billing</h3>
            <p className="mt-1 text-xs text-muted-foreground">How much in reviews this month, upgrade, invoices, cancel.</p>
          </div>
          <ArrowRight className="absolute right-4 top-4 h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
        </a>
      </div>

      {/* ── FAQ accordion ── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="font-heading text-lg font-bold tracking-tight">Common questions</h2>
          <Accordion type="single" collapsible className="mt-3">
            <Faq q="What does CodeTurtle actually do?" a="Reads your PR diff, retrieves context from your codebase, then posts an AI-generated review with issues, suggestions, and a 0-10 score — all with your repo's conventions in mind." />
            <Faq q="How long does a review take?" a="60-180 seconds. We clone, index, retrieve context and generate in stages — the PR comment updates live as stages finish." />
            <Faq q="Can I use my own AI model?" a="Yes. Free: Google Gemini + OpenRouter free models. Pro: bring your own keys for Anthropic, Google or any OpenAI-compatible provider." />
            <Faq q="Why is my favorite free model missing?" a="OpenRouter rotates free slugs. We refresh the catalog live on every connect, so retired slugs disappear and new ones show up — no action needed by you." />
            <Faq q="Why does it say 'not a fork'?" a="Connections are restricted to repositories you own or can admin. Check the GitHub App OAuth scope in Settings and reconnect if it's missing admin:repo_hook." />
            <Faq q="How are reviews priced on the free plan?" a="Free = 20 reviews/mo, 5 repos, 5 reviews per PR, 3 commits per PR. Bring your own provider key and you get unlimited reviews on Pro." />
            <Faq q="Is my API key safe?" a="AES-256-GCM at rest, derived from AUTH_SECRET. We never log it, never expose it, never send it anywhere else. You can rotate it instantly in Settings." />
            <Faq q="How do I cancel?" a="Billing → Manage → the Polar portal opens. Cancel any time — access continues until the end of the month, then drops to Free automatically." />
          </Accordion>
        </div>

        {/* ── Contact — single-tap, no form ── */}
        <aside className="h-fit space-y-4 rounded-2xl border bg-card p-5">
          <h3 className="font-heading text-base font-bold tracking-tight">Still stuck?</h3>
          <p className="text-xs text-muted-foreground">
            Send a one-line mail with the PR or repo link and we&apos;ll take a look.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=CodeTurtle support`}
            onClick={() => trackEvent(AnalyticsEvents.supportEmailClicked, { location: "sidebar" })}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-semibold text-background transition hover:opacity-90"
          >
            <Mail className="h-4 w-4" />
            Email support
          </a>
          <p className="text-[10px] text-muted-foreground">
            Response time: &lt;24h. For security reports use the same email; coordinated disclosure.
          </p>
        </aside>
      </div>

      {/* ── Security row ── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> AES-256-GCM at rest</span>
        <span>Keys never leave your control</span>
        <span>GitHub scope: <code className="rounded bg-muted px-1">repo</code> + <code className="rounded bg-muted px-1">admin:repo_hook</code></span>
        <span>Security report: <a href={`mailto:${SUPPORT_EMAIL}`} className="underline hover:text-foreground">{SUPPORT_EMAIL}</a></span>
      </div>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <AccordionItem value={q} className="border-border">
      <AccordionTrigger className="py-3 text-[13px] font-medium hover:no-underline">
        {q}
      </AccordionTrigger>
      <AccordionContent className="pb-3 text-xs leading-relaxed text-muted-foreground">
        {a}
      </AccordionContent>
    </AccordionItem>
  );
}
