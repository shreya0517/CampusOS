# CampusOS Engineering Guide

## Project Purpose

CampusOS is a multi-tenant college management SaaS platform. The repository foundation exists to support secure, testable, and maintainable delivery of academic, administrative, and operational workflows without coupling tenant-specific behavior to the core platform.

## Architecture Rules

1. Preserve the monorepo split between `apps`, `packages`, and `docs`.
2. Keep frontend concerns in `apps/web`, backend concerns in `apps/api`, and reusable code in `packages/*`.
3. Prefer composition over deep inheritance and avoid introducing abstractions until two concrete use cases exist.
4. Treat multi-tenancy as a first-class requirement in API design, data modeling, background jobs, and storage paths.
5. Shared packages must remain framework-light unless they are explicitly UI-focused.
6. Cross-package imports must flow through public package entrypoints, not deep internal file paths.

## Coding Conventions

1. TypeScript strict mode is mandatory across all apps and packages.
2. Favor small modules, explicit return types on exported functions, and descriptive names over comments.
3. Use async/await instead of raw promise chains for application code.
4. Validate all external input at the boundary layer.
5. Keep environment access centralized and typed.
6. Do not add dependencies without a concrete need in the current phase.

## Naming Conventions

1. Use `kebab-case` for folders and file names unless the framework requires otherwise.
2. Use `PascalCase` for React components, classes, DTOs, and types intended to model domain concepts.
3. Use `camelCase` for variables, functions, hooks, and object properties.
4. Use `SCREAMING_SNAKE_CASE` for environment variable names and shared constants.
5. Prefix shared workspace packages with `@campusos/`.

## Folder Structure

- `apps/web`: Next.js frontend application
- `apps/api`: NestJS backend application
- `packages/db`: Prisma schema, migrations, and database utilities
- `packages/types`: shared TypeScript types and contracts
- `packages/ui`: shared UI primitives for the frontend
- `packages/config-typescript`: shared TypeScript configuration
- `packages/config-eslint`: shared ESLint configuration assets
- `docs`: architecture, API, and database decisions

## Testing Requirements

1. Use Jest for unit and integration tests in backend and shared packages.
2. Use Supertest for HTTP endpoint coverage in the API application.
3. Use Playwright for critical end-to-end frontend flows.
4. Every feature must include tests where practical before merge.
5. New endpoints, validation rules, and data access logic require automated coverage unless explicitly exempted in review.

## Commands

- `pnpm install`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

## Security Rules

1. Never commit secrets, credentials, tokens, or production data.
2. Never hardcode credentials in source, tests, fixtures, or documentation.
3. Store configuration in environment variables and document every required key in `.env.example`.
4. Sanitize logs to avoid exposing PII, tokens, or tenant-sensitive metadata.
5. Enforce authorization checks server-side even if the frontend hides actions.
6. Review third-party dependencies before adoption and keep the dependency surface minimal.

## Database Migration Rules

1. All schema changes must go through Prisma schema updates and versioned migrations.
2. Never edit an applied migration in place.
3. Keep destructive migration steps explicit and reviewed.
4. Seed scripts must be idempotent and safe for local development.
5. Tenant isolation requirements must be reflected in schema design, indexes, and query patterns.

## API Conventions

1. Version HTTP APIs under `/api/v1`.
2. Use resource-oriented routes and consistent plural nouns.
3. Return structured error payloads with machine-readable codes.
4. Validate request bodies, params, and query values at the controller boundary.
5. Keep DTOs separate from persistence models.
6. Document externally consumed endpoints in `docs/api.md`.

## Definition Of Done

1. Code builds, lints, and typechecks successfully.
2. Relevant automated tests pass locally.
3. Documentation and environment variables are updated when behavior changes.
4. No secrets or debug artifacts are introduced.
5. Changes stay within the scope of the current phase and do not pre-implement future features.
