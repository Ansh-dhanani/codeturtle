import type { Metadata } from "next";
import Link from "next/link";
import { LandingHeader } from "@/components/landing/landing-header";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "CodeTurtle Privacy Policy - what data we collect, how we use it, how it is protected.",
};

export default function PrivacyPage() {
  return (
    <>
      <LandingHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 text-foreground prose prose-neutral dark:prose-invert">
        <h1 className="font-heading text-4xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-xs text-muted-foreground">Last updated: November 2026</p>

        <h2>1. What we collect</h2>
        <ul>
          <li>Account: GitHub username, email, avatar, and OAuth token if you connect GitHub</li>
          <li>Repository metadata: name, owner, branch, commits, diffs of PRs you opt to review</li>
          <li>Usage: review counts, scores, comments, and feature flags</li>
          <li>Billing: managed by Polar; we never see your card details</li>
        </ul>

        <h2>2. How we use it</h2>
        <ul>
          <li>Run the review pipeline on your repositories</li>
          <li>Index your codebase into a private Pinecone vector store for retrieval</li>
          <li>Send prompts to your configured AI provider (Google, Anthropic, OpenAI, Groq, OpenRouter)</li>
          <li>Post results back to GitHub</li>
          <li>Track feature usage and error rates (crash monitoring)</li>
        </ul>

        <h2>3. API keys we store</h2>
        <p>If you bring your own API key, it is encrypted at rest with AES-256-GCM (key derived from the app&apos;s AUTH_SECRET) before hitting the database. We cannot read it in plaintext; only the review worker can decrypt it.</p>

        <h2>4. Third-party processors</h2>
        <ul>
          <li>GitHub (OAuth and webhooks) - your pull request content is processed when you request a review</li>
          <li>Google AI, Anthropic, OpenAI, Groq, OpenRouter - LLM inference</li>
          <li>Pinecone - vector database</li>
          <li>Polar - billing</li>
          <li>Umami (cookieless, privacy-friendly analytics) - anonymous usage statistics and funnel events; no cookies, no cross-site tracking, no personal profiles</li>
          <li>Sentry / analytics (if configured) - error and performance telemetry</li>
        </ul>

        <h2>5. Data retention</h2>
        <p>Reviews are retained indefinitely unless you delete them from the dashboard. Deleting a repository removes the associated review records and embeddings within 30 days. You can request full account deletion by emailing <a href="mailto:dhananiansh01@gmail.com" className="underline">dhananiansh01@gmail.com</a>.</p>

        <h2>6. Your rights</h2>
        <p>You may request access, correction, export, or deletion of your personal data at any time by email. We will respond within 30 days. We do not sell personal data.</p>

        <h2>7. Cookies</h2>
        <p>We use cookies only for session authentication and theme preference. No advertising or cross-site tracking cookies.</p>

        <h2>8. Security</h2>
        <p>We use HTTPS everywhere, AES-256-GCM at rest for secrets, and least-privilege scopes on your GitHub app (<code>repo</code>, <code>admin:repo_hook</code>). No system is perfectly secure; if we become aware of an incident we will notify affected customers within 72 hours.</p>

        <h2>9. Children</h2>
        <p>The Service is not directed at children under 13, and we do not knowingly collect their data.</p>

        <p className="mt-8 text-xs text-muted-foreground">
          Questions? <Link href="/support" className="underline hover:text-foreground">Contact us</Link> or email <a href="mailto:dhananiansh01@gmail.com" className="underline hover:text-foreground">dhananiansh01@gmail.com</a>.
        </p>
      </main>
      <Footer />
    </>
  );
}
