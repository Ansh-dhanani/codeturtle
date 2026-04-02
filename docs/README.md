# Documentation — CodeTurtle

This document consolidates the project's key documentation into a single reference.

## Quick Links
- Getting started: see the main `README.md`
- Contributing: `CONTRIBUTING.md`

---

## Architecture
CodeTurtle is a full-stack Next.js app (App Router) with authentication, webhook ingestion, and a Prisma-backed database. Major components:

- Client: Next.js (React) with App Router and server components
- Authentication & API: Better Auth for GitHub OAuth + API routes
- Integrations: GitHub (OAuth, webhooks), Vercel (deployment)
- Persistence: Prisma → PostgreSQL

Notes:
- Webhook ingestion endpoint: `POST /api/webhooks/github` (signature verification enforced)
- Keep `NEXT_PUBLIC_APP_URL` configured and normalized (no trailing slash)

---

## Tech Stack
- Framework: Next.js (App Router)
- Runtime: Bun (dev/CI); Node-compatible
- Auth: Better Auth (GitHub OAuth)
- DB: PostgreSQL with Prisma
- Styles: Tailwind CSS + Shadcn UI

---

## GitHub Integration
- OAuth scopes: `repo`, `admin:repo_hook` (as needed)
- Webhooks: supported events — `ping`, `pull_request` (extendable)
- Secrets: webhook secrets are stored per repository and used to validate signatures
- Local testing: use `ngrok` and set `NEXT_PUBLIC_APP_URL` to your tunnel URL

---

## Project Structure
```text
src/
├── app/                # Next.js App Router
│   ├── api/            # API routes (auth, webhooks)
├── lib/                # Auth, prisma client, utilities
├── components/         # Shared UI components
├── prisma/             # Prisma schema and migrations
└── styles/             # Global styles
```

---

## Development
- Install: `bun install`
- Generate Prisma client: `npx prisma generate`
- Apply migrations: `npx prisma migrate dev`
- Dev server: `bun dev`
- Tests: `bun run test --if-present`

---

## CI / Deployment
- Checks workflow: `.github/workflows/checks.yml` (lint, test, build)
- Deploy workflow: `.github/workflows/deploy.yml` (push to `main`, requires `VERCEL_TOKEN`)

---

## Troubleshooting
- Redirects/308: ensure webhook URL is exactly `NEXT_PUBLIC_APP_URL` + `/api/webhooks/github` (no double slashes)
- Signature failures: ensure you compute HMAC over the raw payload and compare with `X-Hub-Signature-256`

---

If you'd like, I can add a small sidebar or split docs later, but this keeps everything in one place for now.