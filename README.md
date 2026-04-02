<div align="center">
  <br />
  <br />

  <picture>
    <!-- Use explicit relative path so GitHub README renders correctly -->
    <img src="./public/codeturtle-logo.svg" alt="CodeTurtle logo" width="200" />
  </picture>

  <!-- Fallback for some markdown renderers: Markdown image with relative path -->
  <!-- ![CodeTurtle logo](./public/codeturtle-logo.svg) -->

  <h1 style="margin-top: 0.5rem;">CoderTurtle</h1>

  <p style="margin: 0.25rem 0 0.75rem 0;"><strong>A production-ready Next.js platform with GitHub OAuth, Webhooks, and Prisma.</strong><br />
  <small>Built for teams and developers shipping GitHub-integrated products with confidence.</small></p>

  <p>
    <a href="https://github.com/Ansh-dhanani/codeturtle/stargazers"><img src="https://img.shields.io/github/stars/Ansh-dhanani/codeturtle?style=flat-square" alt="GitHub stars" /></a>
    </a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License" /></a>
    <a href="https://github.com/Ansh-dhanani/codeturtle/issues"><img src="https://img.shields.io/github/issues/Ansh-dhanani/codeturtle?style=flat-square" alt="Open issues" /></a>
  </p>

  <p style="margin-top: 0.5rem;">
    <a href="./docs/README.md">Documentation</a> · <a href="#installation">Quick Start</a> · <a href="./CONTRIBUTING.md">Contributing</a>
  </p>
</div>




<br />

---

## Why CodeTurtle?

A concise, production-ready Next.js starter with GitHub OAuth, webhook handling, and a Prisma-backed database. Designed for developers and teams building GitHub-integrated products.

For detailed architecture, tech stack, project structure, and integration details, see `./docs/README.md`.

---

## Features (short)

* GitHub OAuth authentication
* Secure GitHub webhook handling
* PostgreSQL + Prisma
* Next.js App Router, Tailwind CSS

---

## Getting Started

### Prerequisites

* Node.js 18+ or Bun
* PostgreSQL 12+
* GitHub OAuth App

---

### Environment Variables

Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://user:password@host:port/database"

BETTER_AUTH_SECRET="your-better-auth-secret"
BETTER_AUTH_URL="http://localhost:3000"

NEXT_PUBLIC_APP_URL="http://localhost:3000"

GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

GITHUB_WEBHOOK_SECRET="optional-fallback-secret"
```

---

## Installation

Install dependencies:

```bash
bun install
```

Generate Prisma client and run migrations:

```bash
npx prisma generate
npx prisma migrate dev --name init
```

Optional seed:

```bash
bun run db:seed
```

Start the development server:

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Database Scripts

- `bun run db:clear` - Clear all data from database
- `bun run db:seed` - Clear all data (users are created automatically via GitHub OAuth on first login)
- `bun run db:reset` - Clear database (runs db:clear and db:seed)

## Tech Stack

- **Framework:** Next.js 15 with App Router
- **Language:** TypeScript
- **Authentication:** Better Auth with GitHub OAuth
- **Database:** PostgreSQL with Prisma ORM
- **Styling:** Tailwind CSS
- **UI Components:** Shadcn UI
- **State Management:** React Query + Zustand
- **Runtime:** Bun

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Contributors

<a href="https://github.com/Ansh-dhanani/codeturtle/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Ansh-dhanani/codeturtle" alt="CodeTurtle contributors" />
</a>

<br/>
