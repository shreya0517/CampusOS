# CampusOS API Guide

## Scope

The backend will expose versioned REST APIs from the NestJS application in `apps/api`. This document defines the baseline conventions before feature endpoints are added.

## Base Conventions

- Base path: `/api/v1`
- Content type: `application/json`
- Route style: plural resource names
- Time format: ISO 8601 strings in UTC

## Request Standards

1. Validate body, query, and route params at the boundary.
2. Treat tenant context as mandatory for tenant-owned resources.
3. Keep DTOs separate from Prisma models and internal entities.

## Response Standards

Success responses should be predictable and typed. Error responses should include:

- `code`: stable machine-readable identifier
- `message`: human-readable summary
- `details`: optional structured validation or domain metadata

## Versioning

- Introduce breaking changes through a new API version.
- Keep additive changes backward compatible within a version whenever possible.

## Authentication

All authentication endpoints are under `/api/v1/auth`. Registration and login require `collegeCode` because users are college-scoped.

- `POST /api/v1/auth/register`: accepts `{ "collegeCode", "email", "displayName", "password" }`; the password must have at least 12 characters. Returns `201 { "user": { ... } }`, creates an unverified account and an email-verification token record, and never returns that token.
- `POST /api/v1/auth/login`: accepts `{ "collegeCode", "email", "password" }`. Returns `200 { "accessToken", "user" }` and writes a rotating `campusos_refresh` cookie with `HttpOnly`, `SameSite=Lax`, scoped to `/api/v1/auth`, and `Secure` in production.
- `POST /api/v1/auth/refresh`: uses the refresh cookie, rotates it, and returns `200 { "accessToken", "user" }`. Expired or revoked sessions return `401 SESSION_EXPIRED`.
- `POST /api/v1/auth/logout`: uses the refresh cookie, revokes its session, clears the cookie, and returns `204`. Access tokens for that session fail immediately.
- `GET /api/v1/auth/me`: requires `Authorization: Bearer <access-token>` and returns `200 { "user": { "id", "collegeId", "email", "displayName", "emailVerified" } }`.
- `POST /api/v1/auth/verify-email`: accepts `{ "token" }`, consumes an opaque email-verification token, and returns `204`.
- `POST /api/v1/auth/forgot-password`: accepts `{ "collegeCode", "email" }`, always returns `204`, and creates a reset-token record only for an existing account.
- `POST /api/v1/auth/reset-password`: accepts `{ "token", "password" }` with a password of at least 12 characters, returns `204`, and invalidates all existing sessions for the account.

Malformed authentication request bodies return `400 { "code": "INVALID_INPUT", "message": "Request body is invalid." }`. Invalid login credentials return `401 INVALID_CREDENTIALS`; expired, revoked, or missing sessions return `401 SESSION_EXPIRED` (or `401 UNAUTHORIZED` when a bearer token is absent).

Passwords are stored only as salted scrypt hashes. Refresh, verification, and reset tokens are random opaque values; only HMAC hashes are persisted. Every protected request checks the signed access token and its referenced session; revoked or expired sessions cannot use an otherwise valid access token.

In local development only (`NODE_ENV` is not `production`), registration writes a verification instruction containing the raw token to the API process console. Copy its token and call:

```http
POST /api/v1/auth/verify-email
Content-Type: application/json

{ "token": "<token from the local API console>" }
```

Production never logs or returns raw verification tokens. An email delivery provider remains the future production delivery mechanism.

For local password recovery, `POST /api/v1/auth/forgot-password` writes a reset instruction with its opaque token to the API console under the same non-production rule. Use that token with `POST /api/v1/auth/reset-password`. Production never logs or returns reset tokens.

API integration tests use the actual Nest controller, guard, service, and token logic with an in-memory Prisma-compatible persistence boundary. They do not claim PostgreSQL integration coverage.

Example login request:

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "collegeCode": "DEMO", "email": "user@example.edu", "password": "a-strong-password" }
```

Successful login returns `{ "accessToken": "...", "user": { ... } }` and sets the refresh cookie. Send the access token as `Authorization: Bearer <accessToken>` to `GET /api/v1/auth/me`.

Set `AUTH_ACCESS_TOKEN_SECRET` to a random value of at least 32 characters before starting the API. The local API development command loads the root `.env` file.

## Authorization

Authorization runs after access-token authentication. The API derives role, permission, college, and department context from server-side records; request-supplied tenant, role, and department values never grant access. Reusable guards return `403 FORBIDDEN` for insufficient role, permission, tenant, or department scope. Phase 03 exposes only isolated authorization probes under `/api/v1/authorization/probes` to validate this infrastructure; they are not business APIs.

## Testing Expectations

- Unit test service logic with Jest
- Validate HTTP behavior with Supertest
- Cover critical user journeys end-to-end with Playwright once frontend flows exist

## Students (Phase 05)

All student endpoints require a bearer access token and derive tenant, role, and department from that authenticated identity. Client-supplied tenant and role values are ignored.

- POST /api/v1/students: ADMIN/HOD creates a student and initial section enrollment. Body: { studentCode, firstName, lastName, dateOfBirth?, sectionId }.
- GET /api/v1/students: ADMIN/HOD/FACULTY list scoped students. Supports search, departmentId, courseId, semesterId, sectionId, page, and pageSize.
- GET /api/v1/students/me: STUDENT retrieves only its linked profile.
- GET /api/v1/students/:id: scoped profile read. STUDENT can only read their own profile.
- PUT /api/v1/students/:id: ADMIN/HOD update profile fields.
- POST /api/v1/students/:id/enrollments: ADMIN/HOD add or update a section enrollment. Body: { sectionId, status? }.

HOD and FACULTY access is restricted to students whose enrolled section belongs to their authenticated faculty department. Association requests validate that the section belongs to the authenticated college and department; cross-college and cross-department IDs return 403 FORBIDDEN without resource details.
