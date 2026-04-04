# Contributing to CodeTurtle

Thank you for considering contributing — we welcome and appreciate your help!

Please read these guidelines before opening issues or PRs to make the process fast and friendly for everyone.

## Code of Conduct
Read and follow `CODE_OF_CONDUCT.md`. Be respectful and constructive.

## How to Contribute
- For bugs: open an issue with a reproducible example, environment, and expected vs actual behavior.
- For feature ideas: open an issue describing the problem, the proposed solution, and any alternatives.
- For quick fixes and docs: open a PR directly against `main` from a feature branch.

## Development Workflow
1. Fork the repo and create a branch: `feature/<short-desc>` or `fix/<short-desc>`.
2. Keep changes small and focused.
3. Add tests when fixing bugs or adding features.
4. Run linting and tests locally before opening a PR:

```bash
bun install
bun run lint --if-present
bun run test --if-present
```

5. Open a PR and include:
   - Summary of changes
   - Testing steps
   - Related issues

## Pull Request Checklist
- [ ] Branch off `main` and keep PR small
- [ ] Updated/added tests where applicable
- [ ] Linting passes locally
- [ ] Descriptive PR title and body
- [ ] Linked to an issue when appropriate

## Commit Messages
Use short, present-tense messages. Prefer conventional commits (e.g., `feat:`, `fix:`, `chore:`).

## Review & Merging
- At least one approving review required for changes to `main`.
- Maintainers may squash or rebase when merging.

## Local Environment & Secrets
Follow `.env.example` instructions in `README.md`. Do not commit credentials or tokens.

## Reporting Security Issues
If you find a security vulnerability, please report it privately via GitHub Security Advisories or by contacting the maintainer directly. Please do not open a public issue.

---
Thanks again — we look forward to your contribution!