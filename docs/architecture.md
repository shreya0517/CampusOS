# CampusOS Architecture

## Goals

- Support a multi-tenant SaaS model for colleges and educational institutions
- Keep the system modular enough for parallel feature delivery
- Optimize for maintainability, testability, and secure defaults

## Monorepo Layout

- `apps/web`: Next.js application for web experiences
- `apps/api`: NestJS application for API and server-side workflows
- `packages/db`: Prisma schema and migration ownership
- `packages/types`: shared contracts and cross-app types
- `packages/ui`: shared design system building blocks
- `packages/config-*`: shared tooling configuration

## Architectural Principles

1. Start simple and evolve only when pressure from real use cases appears.
2. Keep clear boundaries between presentation, transport, domain, and persistence concerns.
3. Ensure tenant context is explicit in backend workflows and persistence design.
4. Push shared logic into packages only when it is reused or truly cross-cutting.
5. Favor stateless application services and well-defined database transactions.

## Planned Runtime Components

- Next.js frontend deployed separately from the API
- NestJS API service exposing versioned REST endpoints
- PostgreSQL as the source of truth
- Redis for caching, queues, and job coordination
- BullMQ for background processing
- AWS S3 for object storage

## Delivery Pipeline

- Local development via pnpm workspaces
- Docker for consistent service orchestration in later phases
- GitHub Actions for lint, typecheck, test, and build automation

## Current Phase

Phase 03 adds centralized authorization after authentication. Server-side role, permission, college, and faculty-department context is loaded from the database. Tenant-scoped access requires the authenticated college; HOD access also requires the authenticated department. SUPER_ADMIN cross-tenant operations require explicit role and permission declarations. Business modules remain deferred.
