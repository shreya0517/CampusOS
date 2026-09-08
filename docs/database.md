# CampusOS Database Guide

## Primary Database

- Engine: PostgreSQL
- ORM and schema management: Prisma
- Package owner: `packages/db`

## Design Principles

1. Model tenant boundaries explicitly and never assume single-tenant behavior.
2. Prefer normalized schemas first; denormalize only with measured evidence.
3. Add indexes alongside new query patterns, especially for tenant-scoped access.
4. Track audit-sensitive changes where the business domain requires traceability.

## Prisma Ownership

- `packages/db/prisma/schema.prisma` is the source of truth for the schema.
- Migrations must be generated through Prisma and committed to version control.
- Environment-specific credentials belong in environment variables only.

## Phase 01 Schema Decisions

- `College` is the tenant boundary. Every tenant-owned model stores `collegeId` and has a compound `(collegeId, id)` key.
- Tenant-to-tenant relations use compound foreign keys containing `collegeId`, so PostgreSQL rejects relations that link records across colleges.
- `User` is college-scoped. Every user relation includes `collegeId`, which prevents a profile, notification, file, announcement, or audit record from referring to a user in another college.
- `Permission` is a global catalog; `Role` is college-scoped.
- `Class` represents a section's delivery of a subject, `Timetable` its recurring slots, and `Attendance` a delivered class date.
- `ExamSubject` allows a college-wide exam subject without a section. Its migration adds a PostgreSQL expression index so only one row exists per college, exam, subject, and optional section scope.
- Finance values use fixed-point PostgreSQL decimals. Invoice and receipt numbers are unique per college.
- `File` stores only object metadata. Object bytes remain in S3-compatible storage, with `storageKey` unique per college.
- The schema protects tenant-owned foreign-key relations. API code must still scope every query by authenticated college context.

## Migration Rules

1. Update the Prisma schema first.
2. Generate a new migration instead of editing an applied one.
3. Review destructive operations carefully before merge.
4. Keep migration names descriptive and tied to the schema change.

## Local Setup

1. Start a local PostgreSQL instance.
2. Set `DATABASE_URL` in `.env`.
3. Run `pnpm --filter @campusos/db prisma:format`.
4. Run `pnpm --filter @campusos/db prisma:generate` when the client is introduced.
5. Run `pnpm --filter @campusos/db prisma:migrate:dev --name <change-name>` for schema changes.

## Planned Supporting Services

- Redis for caching and queue state
- S3-compatible object storage for documents and media
