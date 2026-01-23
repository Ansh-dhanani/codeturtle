<div align="center">
  <br />
  <br />

  <picture>
    <!-- Use explicit relative path so GitHub README renders correctly -->
    <img src="./public/codeturtle-logo.svg" alt="CodeTurtle logo" width="200" />
  </picture>

  <!-- Fallback for some markdown renderers: Markdown image with relative path -->
  <!-- ![CodeTurtle logo](./public/codeturtle-logo.svg) -->

  <h1 style="margin-top: 0.5rem;">Turtie AI</h1>

  <p style="margin: 0.25rem 0 0.75rem 0;"><strong>A production-ready Next.js platform with GitHub OAuth, Webhooks, and Prisma.</strong><br />
  <small>Built for teams and developers shipping GitHub-integrated products with confidence.</small></p>

  <p>
    <a href="https://github.com/Ansh-dhanani/codeturtle/stargazers"><img src="https://img.shields.io/github/stars/Ansh-dhanani/codeturtle?style=flat-square" alt="GitHub stars" /></a>
    <a href="https://github.com/Ansh-dhanani/codeturtle/actions/workflows/checks.yml"><img src="https://github.com/Ansh-dhanani/codeturtle/actions/workflows/checks.yml/badge.svg" alt="Checks status" /></a>
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

---

## GitHub Integration

### OAuth

OAuth scopes are configured in `src/lib/auth.ts`.

Recommended scopes:

* `repo`
* `admin:repo_hook`

### Webhooks

* Endpoint: `POST /api/webhooks/github`
* Supported events: `ping`, `pull_request`
* Webhook secrets are stored per repository
* Signature verification is enforced for all requests

---

## Project Structure

```text
src/
├── app/                # Next.js App Router
├── api/                # API routes (auth, webhooks)
├── lib/                # Auth, database, utilities
├── components/         # Shared UI components
├── prisma/             # Prisma schema and migrations
└── styles/             # Global styles
```

---

## Development Workflow

* Default branch: `main`
* Feature branches: `feature/<name>`
* Pull requests required for all changes
* Conventional commits recommended

Each pull request should include:

* Summary of changes
* Testing steps
* Related issue (if applicable)

---

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature or fix branch
3. Run linting and tests locally
4. Open a pull request with a clear description

Please read `CONTRIBUTING.md` before submitting changes.

---

## Contributors

<a href="https://github.com/Ansh-dhanani/codeturtle/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Ansh-dhanani/codeturtle" />
</a>

---

## Maintainer

**Ansh Dhanani**
Creator and lead maintainer

---

## Security

If you discover a security vulnerability, please report it privately to the maintainers.

Do not disclose vulnerabilities publicly until they are resolved.

---

## License

This project is licensed under the MIT License.
See the `LICENSE` file for details.
