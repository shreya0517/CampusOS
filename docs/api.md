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
- `POST /api/v1/auth/change-password`: requires a bearer access token and accepts `{ "currentPassword", "newPassword" }`. The new password needs at least 12 characters and must differ from the current one. Returns `204`, keeps the calling session and revokes every other session of the user. A wrong current password returns `400 INVALID_CURRENT_PASSWORD` (not 401, so clients don't treat it as an expired session); an invalid new password returns `400 INVALID_NEW_PASSWORD`.

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

- POST /api/v1/students: ADMIN creates a student and initial section enrollment. Body: { studentCode, firstName, lastName, dateOfBirth?, sectionId }.
- GET /api/v1/students: ADMIN/HOD/FACULTY list scoped students. Supports search, departmentId, courseId, semesterId, sectionId, page, and pageSize.
- GET /api/v1/students/me: STUDENT retrieves only its linked profile, including the college name and the account email and status.
- PUT /api/v1/students/me: STUDENT updates only their own phone and address. Body: { phone?, address? }; at least one is required, null or an empty string clears it, and every other field is ignored. Phone takes 8 to 20 digits with optional spaces, dashes and a leading +; address takes up to 300 characters.
- GET /api/v1/students/:id: scoped profile read. STUDENT can only read their own profile.
- PUT /api/v1/students/:id: ADMIN, or HOD within their department, update profile fields.
- POST /api/v1/students/:id/enrollments: ADMIN adds or updates a section enrollment (HOD decision 1: enrollment changes stay with Admin). Body: { sectionId, status? }.

FACULTY responses leave out phone and address; ADMIN and HOD receive them. HOD access is restricted to students whose enrolled section belongs to the HOD's department; a courseId filter narrows that scope and never widens it. FACULTY access is restricted further, to students actively enrolled in a section where the faculty member teaches a class. Association requests validate that the section belongs to the authenticated college and department; cross-college and cross-department IDs return 403 FORBIDDEN without resource details.

## Student Attendance

- GET /api/v1/attendance/me: STUDENT reads only their own attendance. The student is resolved from the access token; the endpoint takes no student id.
  - Query: subjectId?, from?, to? (YYYY-MM-DD, from <= to), page (default 1), pageSize (default 20, max 100). The filters apply to `days` and `records` only; `overall` and `subjects` always cover every record.
  - Response: { threshold, overall, subjects[], days[], records: { items[], total, page, pageSize } }. `overall`, each subject and each day carry { present, absent, late, excused, attended, counted, percentage, belowThreshold }.
  - LATE counts as attended. EXCUSED is left out of the percentage. `percentage` is null when nothing has been counted yet. `threshold` is 75.
  - Other roles get 403 FORBIDDEN. A STUDENT user without a linked student profile gets 404 STUDENT_NOT_FOUND. Invalid or impossible dates (for example 2026-02-31) return 400 INVALID_INPUT.

## Announcements

- GET /api/v1/announcements: any signed-in user. Returns published, unexpired announcements in the caller's college, newest first, with the author's id and display name. Query: search? (title or body), page (default 1), pageSize (default 10, max 50).
  - Audience rules: STUDENT sees ALL and STUDENTS; FACULTY and HOD see ALL, FACULTY and STAFF; ADMIN sees every audience.
- POST /api/v1/announcements: ADMIN only. Body: { title (3-160 chars), body (1-5000 chars), audience? (ALL, STUDENTS, FACULTY or STAFF; default ALL), publishedAt?, expiresAt? }. The college and author come from the access token. publishedAt defaults to now; expiresAt must be after it.

## Attendance and Marks Entry

- POST /api/v1/attendance and PUT /api/v1/attendance/:id: every record must name a different student who is actively enrolled in the class's section; otherwise 400 DUPLICATE_STUDENT or 400 STUDENT_NOT_IN_CLASS.
- GET /api/v1/attendance/:id includes `correctionWindowEndsAt`: FACULTY may correct a session for 48 hours after it was first saved; later PUTs from faculty return 403 CORRECTION_WINDOW_CLOSED. HOD and ADMIN are not limited by the window.
- Marking a session and every correction that changes a record are written to the audit log (ATTENDANCE_MARKED, ATTENDANCE_CORRECTED) with the actor and, for corrections, each student's status and note before and after; a student left out of a correction is logged with `to: null` (removed).
- GET /api/v1/attendance/:id/history: ADMIN, HOD and FACULTY who can open the session. Returns the log oldest first: { id, action, createdAt, actor, changes[] } with each change's student.
- GET and PUT /api/v1/exams/:id/subjects/:examSubjectId/marks: ADMIN reaches every paper, HOD only papers in their department, FACULTY only papers for a subject they teach in that section (or semester, when the paper covers every section); otherwise 403. Marks must name different students enrolled for the paper; otherwise 400 DUPLICATE_STUDENT or 400 STUDENT_NOT_IN_EXAM.
- Marks approval (HOD decision 4): each paper has `marksStatus` DRAFT, SUBMITTED or APPROVED.
  - PUT .../marks only works while DRAFT; otherwise 409 MARKS_LOCKED.
  - POST /api/v1/exams/:id/subjects/:examSubjectId/marks/submit: whoever can enter marks for the paper. The sheet must be complete (every active student has marks or is absent), otherwise 400 MARKS_INCOMPLETE. DRAFT becomes SUBMITTED.
  - POST /api/v1/exams/:id/subjects/:examSubjectId/marks/review: HOD of the paper's department, or ADMIN. Body { decision: APPROVED | RETURNED, comment? }. SUBMITTED becomes APPROVED, or DRAFT when returned; 409 MARKS_NOT_SUBMITTED otherwise.
  - Submissions and reviews are written to the audit log; GET .../marks returns them as `history`.
- POST /api/v1/exams/:id/calculate-results: ADMIN only, and only once every paper of the exam is APPROVED (otherwise 409 MARKS_NOT_APPROVED).
- POST /api/v1/exams/:id/subjects: the subject and the optional section must belong to the given semester; otherwise 400 INVALID_EXAM_SUBJECT. For HOD marks access, both the semester and the section of a paper must be in the HOD's department.

## My Classes

- GET /api/v1/classes/mine: ADMIN, HOD and FACULTY. The classes the caller teaches, each with `studentCount` (active enrolment in the section), `sessionsHeld`, `assignmentCount`, `pendingEvaluations` (submissions SUBMITTED or LATE that still need marks) and `attendance` (the same summary shape as the student attendance endpoint).
- GET /api/v1/classes/:id/overview: ADMIN, HOD and FACULTY, for a class they can open under the usual class scope (faculty: classes they teach; HOD: their department); otherwise 404. Returns { class, threshold, sessionsHeld, attendance, students[], assignments[] }: each student has their attendance in this class and how many of its assignments they submitted; each assignment has its submission count.

## HOD Department Boundaries

- POST /api/v1/faculty and PUT /api/v1/faculty/:id: ADMIN only (HOD decision 2). PUT /api/v1/departments/:id: ADMIN only.

- POST /api/v1/tasks/:id/assign: the assignee must be an active HOD or FACULTY account in the college (otherwise 400 INVALID_ASSIGNEE). An HOD may only assign to faculty in their own department (403), and assigning the same person twice returns 409 ALREADY_ASSIGNED.
- GET /api/v1/visitors, GET /api/v1/visitors/:id and PUT /api/v1/visitors/:id/review: an HOD only reaches visitors whose host is in their department, or, when no host is named, whose registrant is in it (404 otherwise). Only PENDING requests can be reviewed, atomically, so a second concurrent decision gets 409 VISITOR_ALREADY_REVIEWED. ADMIN reaches every visitor in the college.
- GET /api/v1/timetable: HOD lists only their department's timetable; FACULTY lists only the classes they teach; STUDENT lists only their own sections.
- GET /api/v1/timetable/me: STUDENT gets their sections; FACULTY and HOD get the classes they teach; ADMIN gets the whole college.
- POST /api/v1/timetable and DELETE /api/v1/timetable/:id: ADMIN only (HOD decision 3).

## Fees Access

- POST /api/v1/fees/structures and POST /api/v1/fees/invoices: ADMIN only.
- GET /api/v1/fees/structures, GET /api/v1/fees/invoices and GET /api/v1/fees/receipts: ADMIN (whole college) and STUDENT (only what applies to them). HOD and FACULTY get 403.
- POST /api/v1/fees/invoices/:id/create-razorpay-order and POST /api/v1/fees/payments/verify-razorpay: STUDENT only, for their own invoices (404 otherwise). Orders include `testMode`.
- GET /api/v1/fees/payment-mode: ADMIN and STUDENT. Returns { testMode, onlinePaymentsAvailable }. The web app has no Razorpay Checkout step yet, so it only offers payment when this says it can complete; this avoids creating pending payments that can never finish.
- Signature checks: a real Razorpay signature is verified against `RAZORPAY_KEY_SECRET`. The simulated `test_sig_<paymentId>` signature is accepted only in test mode, meaning outside production with no secret configured. In production, both endpoints return 503 PAYMENTS_NOT_CONFIGURED until `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are set.
