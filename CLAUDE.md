# CampusOS — Claude Code Instructions

## Project

CampusOS is a multi-tenant college management SaaS platform.

Repository structure:

- `apps/web` — Next.js frontend
- `apps/api` — NestJS backend
- `packages/*` — shared packages
- `packages/db` — Prisma/database
- `docs` — project documentation

Canonical workspace:

`C:\git_hub\xyz\CampusOS`

Do not use or modify:

`C:\Users\shrey\OneDrive\Desktop\xyz\CampusOS`

---

## Source of Truth

Use these in this order:

1. Current repository code
2. `master-plan` / project master plan
3. `CLAUDE.md`
4. Existing documentation and tests

The repository represents the current implementation state.

Before implementing a phase, inspect the relevant existing code rather than assuming it matches the master plan.

---

## Phase Execution

When the user requests a phase:

1. Identify the requested phase from the master plan.
2. Inspect the existing implementation relevant to that phase.
3. Understand existing architecture, APIs, database models, authentication, authorization, UI components, and tests.
4. Reuse existing code and patterns whenever possible.
5. Implement only the requested phase.
6. Do not implement future phases.
7. Do not perform unrelated refactors.
8. Do not add dependencies unless genuinely required.
9. Preserve existing functionality.
10. Preserve authentication, authorization, validation, and tenant isolation.
11. Prefer the smallest correct implementation.

Do not ask for information that can be determined by inspecting the repository or master plan.

---

## Reverse Questioning Protocol

Before asking the user anything:

1. Inspect the repository.
2. Inspect the relevant master-plan requirements.
3. Inspect related APIs, database models, components, utilities, and tests.
4. Infer implementation details from existing patterns.

Ask the user a question only when the answer is genuinely required to proceed or would materially change the implementation.

If multiple blocking questions exist, ask them together in one concise message.

If there are no blocking questions, begin implementation immediately.

Do not ask for confirmation at every step.

Rule:

> Never ask a question merely because you could ask it. Ask only if the answer materially affects the implementation.

---

## Architecture

Follow the existing monorepo architecture.

### Frontend

- Next.js
- TypeScript
- Existing design system and reusable UI components
- Existing API client/utilities
- Responsive and accessible UI

Do not create duplicate components when an existing component can be reused.

### Backend

- NestJS
- TypeScript strict mode
- Modular architecture
- Explicit service/controller responsibilities
- Validate external input at the boundary
- Use async/await
- Keep modules focused

### Database

- Prisma
- Versioned migrations
- Tenant-aware queries
- Preserve existing relationships and constraints
- Never modify an already-applied migration
- Seeds must remain idempotent

---

## Multi-Tenancy & Security

Multi-tenancy is a core architectural requirement.

Every relevant resource must respect the authenticated user's tenant/college boundary.

Never trust tenant, college, department, role, or permission information supplied by the client when it can be derived from authenticated server-side context.

Authorization must be enforced server-side.

Never weaken existing:

- Authentication
- Authorization
- RBAC
- Tenant isolation
- Department scoping
- Input validation
- Session security

When modifying an existing endpoint, verify that existing security boundaries remain intact.

Never introduce IDOR/cross-tenant access through new queries.

---

## TypeScript

Use strict TypeScript.

- Avoid `any`.
- Prefer explicit types.
- Use descriptive names.
- Add explicit return types to exported functions where appropriate.
- Prefer small, focused modules.
- Follow existing naming and folder conventions.

---

## Dependencies

Do not add a package simply because it is convenient.

Before adding a dependency:

1. Check whether the repository already provides the required functionality.
2. Check whether an existing dependency can solve the problem.
3. Add a new dependency only when genuinely necessary for the requested phase.

---

## Testing & Validation

Every phase must be validated before being reported as complete.

Run:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
git diff --check