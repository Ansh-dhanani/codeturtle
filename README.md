# CodeTurtle

A Next.js application with GitHub OAuth authentication, built with Better Auth and Prisma.

## Features

- 🔐 GitHub OAuth authentication (GitHub-only)
- 📊 PostgreSQL database with Prisma ORM
- 🎨 Modern UI with Tailwind CSS and Shadcn UI
- ⚡ Built with Next.js 15 and React 19
- 🔄 State management with React Query and Zustand

## Prerequisites

- Node.js 18+ or Bun
- PostgreSQL database
- GitHub OAuth App credentials

## Environment Setup

1. Create a `.env` file in the root directory:

```env
DATABASE_URL="postgresql://user:password@host:port/database"
BETTER_AUTH_SECRET="your-secret-key"
BETTER_AUTH_URL="http://localhost:3000"
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"
```

2. Create a GitHub OAuth App:
   - Go to GitHub Settings → Developer settings → OAuth Apps
   - Create a new OAuth App
   - Set Authorization callback URL to: `http://localhost:3000/api/auth/callback/github`
   - Copy Client ID and Client Secret to your `.env` file

## Getting Started

1. Install dependencies:

```bash
bun install
```

2. Generate Prisma client and run migrations:

```bash
npx prisma generate
npx prisma migrate dev
```

3. Seed the database with test data (optional):

```bash
bun run db:seed
```

4. Run the development server:

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
