# CodeTurtle Architecture

## System Flow

```mermaid
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
```

## Components

| Component | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 16 + React | Dashboard, settings, review display |
| Auth | Better Auth + GitHub OAuth | User authentication |
| Database | PostgreSQL + Prisma | User data, repos, reviews, subscriptions |
| Vector DB | Pinecone | Code embeddings for RAG |
| Background Jobs | Inngest | Async indexing and review generation |
| AI | Vercel AI SDK + Google Gemini | Code review generation |
| GitHub API | Octokit | Repo access, webhook management, PR comments |
| Billing | Polar | Subscription management |
| Rate Limiting | In-memory sliding window | Per-tier API limits |

## Key Design Decisions

1. **Inngest over cron**: Event-driven with retries and step-based execution for reliability
2. **RAG before review**: Queries Pinecone for related code context to give the AI full picture
3. **REQUEST_CHANGES for low scores**: Blocks merge when score < 5, forces attention to issues
4. **Two-step comment**: Posts "in progress" immediately, then overwrites with final review
5. **GitHub App for bot comments**: Uses installation tokens so reviews appear from the bot, not user's account
