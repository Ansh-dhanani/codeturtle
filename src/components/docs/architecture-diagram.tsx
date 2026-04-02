"use client";

import { useMemo } from "react";
import { renderMermaidSVG, THEMES } from "beautiful-mermaid";

const DIAGRAM_CODE = `
sequenceDiagram
    participant User
    participant GitHub
    participant Webhook
    participant Inngest
    participant AI
    participant Pinecone
    participant Database

    Note over User,Database: Repository Connection
    User->>GitHub: Connect Repository
    GitHub->>Webhook: Create webhook on repo
    Webhook->>Database: Store repo record + secret
    Webhook->>Inngest: repository.connected event
    Inngest->>GitHub: Fetch all files
    GitHub-->>Inngest: File contents
    Inngest->>Pinecone: Generate embeddings + upsert
    Pinecone-->>Inngest: Vectors stored
    Inngest->>Database: Update repo status

    Note over User,Database: PR Review Flow
    User->>GitHub: Open Pull Request
    GitHub->>Webhook: POST /api/webhooks/github
    Webhook->>Webhook: Verify HMAC signature
    Webhook->>Database: Lookup repo by hook_id/full_name
    Webhook->>Inngest: pull_request.opened event
    Inngest->>GitHub: Post "Review in progress" comment
    Inngest->>GitHub: Fetch PR diff
    GitHub-->>Inngest: PR diff + changed files
    Inngest->>Pinecone: Query related code context (RAG)
    Pinecone-->>Inngest: Relevant code snippets
    Inngest->>AI: Generate review (diff + context)
    AI-->>Inngest: Structured review (issues, suggestions, score)
    Inngest->>Database: Store review
    Inngest->>GitHub: Post review as PR review (REQUEST_CHANGES if score < 5)
    Inngest->>GitHub: Update "in progress" comment to "complete"
    GitHub-->>User: Bot review appears on PR

    Note over User,Database: Fix PR Generation
    User->>Database: Click "Generate Fix PR"
    Database->>GitHub: Create branch codeturtle/fix-pr-N
    Database->>GitHub: Apply suggested code changes
    Database->>GitHub: Create PR with fixes
    GitHub-->>User: New PR with automated fixes
`;

export default function ArchitectureDiagram() {
  const { svg, error } = useMemo(() => {
    try {
      return {
        svg: renderMermaidSVG(DIAGRAM_CODE, {
          bg: "var(--background)",
          fg: "var(--foreground)",
          accent: "var(--primary)",
          transparent: true,
          padding: 40,
          nodeSpacing: 40,
          layerSpacing: 60,
        }),
        error: null,
      };
    } catch (err) {
      return { svg: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }, []);

  if (error) {
    return <pre className="text-sm text-red-500">{error.message}</pre>;
  }

  return (
    <div className="w-full overflow-auto rounded-lg border bg-card p-4">
      <div
        className="min-w-[800px]"
        dangerouslySetInnerHTML={{ __html: svg || "" }}
      />
    </div>
  );
}
