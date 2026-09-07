# CampusOS

CampusOS is a multi-tenant college management SaaS platform. This repository currently contains the engineering foundation for a production-grade monorepo and intentionally avoids implementing business features before the architecture, tooling, and standards are in place.

## Planned Architecture

- `apps/web`: Next.js frontend for tenant-facing and staff-facing user experiences
- `apps/api`: NestJS backend for APIs, authentication, business logic, jobs, and integrations
- `packages/db`: Prisma schema, migrations, and database utilities for PostgreSQL
- `packages/types`: shared TypeScript contracts used across applications
- `packages/ui`: shared frontend components and design primitives
- `docs`: architecture, API, and database guidance

## Planned Technology Stack

- Frontend: Next.js, TypeScript, Tailwind CSS, shadcn/ui
- Backend: NestJS, TypeScript
- Database: PostgreSQL, Prisma
- Infrastructure: Redis, BullMQ, AWS S3, Docker, GitHub Actions
- Testing: Jest, Supertest, Playwright
- Tooling: pnpm workspaces, ESLint, Prettier, TypeScript strict mode

## Local Development

1. Install Node.js 24+ and pnpm 10+.
2. Copy `.env.example` to `.env` and fill in local values.
3. Install dependencies with `pnpm install`.
4. Start the workspace with `pnpm dev`.
5. Use the verification commands before opening a pull request:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`

## Repository Status

This phase establishes the repository foundation only. Business modules, user flows, domain models, and integrations should be added in later phases with tests and documentation.
