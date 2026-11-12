import type { NextRequest } from "next/server";

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

const body = `# CodeTurtle

> CodeTurtle is a repository-aware AI code reviewer for GitHub pull requests. It reads the diff and the code around it to post low-false-positive, actionable reviews directly on your PRs.

CodeTurtle connects to GitHub with a per-repository signed webhook. Every pull request is reviewed with full repository context (Pinecone embeddings, code-aware chunking, 1024-dimension cosine index) and a structured output: overall 0-10 score, issues, suggestions, and positives. It never pushes code, never approves or merges PRs, and never trains on your code.

Key facts:

- Free plan: 20 reviews/month, 5 repositories, 5 reviews per PR, 3 commits per PR max, all free models
- Pro ($4/mo): 100 reviews/month on managed keys, 10 repos, 10 reviews/PR, 5 commits/PR, unlimited reviews with your own API key, custom rules
- Enterprise ($49/mo launch pricing): everything in Pro plus org onboarding and dedicated support
- Default model: OpenRouter auto-router (routes to the best live model under your plan); catalog is fetched live every 30 minutes
- Reviews re-run on every push; \`@codeturtle <question>\` in a PR thread gets a grounded reply in the same thread
- Analytics: score trends, severity breakdown, per-repo insights, exportable Markdown report

## Product

- [Home](${appUrl}/): What CodeTurtle is and how it reviews your PRs
- [Features](${appUrl}/features): Repository-aware reviews, mentions, analytics, custom rules
- [Pricing](${appUrl}/pricing): Free, Pro and Enterprise plans
- [Team](${appUrl}/team): The people building CodeTurtle

## Documentation

- [Docs](${appUrl}/docs): Documentation index
- [Getting started](${appUrl}/docs/getting-started): Sign in with GitHub, connect a repository, trigger your first review
- [How it works](${appUrl}/docs/how-it-works): The review pipeline from webhook to posted review
- [Models](${appUrl}/docs/models): Live model catalog, default OpenRouter auto-router, bring-your-own keys
- [Custom rules](${appUrl}/docs/custom-rules): Repository-scoped review instructions (Pro/Enterprise)
- [Analytics & reports](${appUrl}/docs/analytics): KPIs, trends, severity breakdown, Markdown report export
- [Billing & plans](${appUrl}/docs/billing): Plans, Polar webhooks, upgrade/downgrade flow
- [Security & privacy](${appUrl}/docs/security): GitHub scopes, AES-256-GCM, retention, subprocessors
- [FAQ](${appUrl}/docs/faq): Common questions about limits, models and billing

## Optional

- [Support](${appUrl}/support): FAQs and direct email support
- [Terms of Service](${appUrl}/terms): Usage rights, billing and acceptable use
- [Privacy Policy](${appUrl}/privacy): Data collection, retention, subprocessors and your rights
- Contact: [dhananiansh01@gmail.com](mailto:dhananiansh01@gmail.com)
`;

// Cached for a day; content is effectively static per deployment.
export const revalidate = 86400;

export function GET(_request: NextRequest) {
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
