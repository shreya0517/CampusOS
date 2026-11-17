# CampusOS Phase 1 — Technical Design and Architecture

**Status:** Design proposal; not implemented

**Scope:** Central administrator analytics, administrator-to-faculty operational tasks, validated data collection, review history, and real-time monitoring
**Baseline inspected:** Current repository working tree on 2026-11-01

> This document describes the repository as inspected and separates verified current behavior from proposed behavior. No application source, Prisma schema, migration, configuration, or existing documentation was changed for this design. The working tree contained unrelated modified and untracked application files during inspection; this design is based on the visible working-tree state, not a clean-branch comparison. No separate master-plan file was present under the repository when searched.

## Executive summary

CampusOS is a pnpm monorepo with a Next.js web app, a NestJS REST API, Prisma/PostgreSQL persistence, and shared UI/types/config packages. The current domain schema already models core college administration and academic workflows. Authentication and database-derived authorization context are present. The web dashboard already links to detailed module pages.

The requested capability is not present as a coherent feature today:

- The dashboard is a role-aware module landing page; it does not display aggregated campus metrics or charts.
- Existing `Assignment` and `Submission` are student coursework entities. They must not be extended or repurposed for administrator operational requests.
- `File` and S3-compatible presigned upload support exist, but there is no task-specific ingestion, row-level validation, verified completion, review lifecycle, or submission history.
- No Socket.IO gateway, event bus, or analytics endpoint was found.

The proposal adds a tenant- and department-scoped operational-task domain, versioned task validation definitions, immutable upload/validation/submission/review history, analytics read APIs, and a transactional outbox feeding Socket.IO. PostgreSQL remains the source of truth. Existing student, faculty, attendance, assignment, exam, timetable, fee, and file modules remain intact and are linked from the dashboard rather than rebuilt.

## 1. Existing-system analysis

### 1.1 System architecture and status

| Area              | Verified current implementation                                                                                                                 | Status relative to this request                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Workspace         | pnpm monorepo: `apps/web`, `apps/api`, `packages/db`, `packages/types`, `packages/ui`, shared configs                                           | Implemented                                                             |
| Web               | Next.js App Router, React, TypeScript, shared shell, semantic tokens, reusable cards/forms/tables/pagination/feedback states                    | Implemented foundation                                                  |
| API               | NestJS application; global `/api/v1` prefix; modular controllers/services/DTO parsers                                                           | Implemented                                                             |
| Persistence       | PostgreSQL through Prisma; tenant-owned records generally carry `collegeId`; composite tenant relations are used in the schema                  | Implemented foundation                                                  |
| Authentication    | College-scoped account; password hashing; access token plus rotating HttpOnly refresh cookie; session revocation and email/password token flows | Implemented                                                             |
| Authorization     | Access-token guard followed by authorization guard; role, permission, college, and faculty-department context loaded from server-side records   | Implemented foundation; use case-specific policies remain necessary     |
| Dashboard         | Role-aware cards linking to module pages                                                                                                        | Implemented as navigation only                                          |
| Analytics         | No analytics API or aggregated analytical dashboard/chart implementation found                                                                  | Missing                                                                 |
| Operational tasks | No administrator-to-faculty task entity or workflow found                                                                                       | Missing; proposed here                                                  |
| Coursework        | `Assignment` and `Submission` support coursework distribution and student submissions                                                           | Implemented separately; do not reuse for operational tasks              |
| Files             | File metadata and S3-compatible presigned upload/download support                                                                               | Implemented foundation; no task upload finalization/validation pipeline |
| Real-time         | No Socket.IO gateway, socket authentication, event contract, or outbox publisher found                                                          | Missing; proposed here                                                  |
| Automated tests   | Jest service/controller/authorization tests exist in API modules; web package currently reports no automated web test suite                     | Partial                                                                 |

### 1.2 Backend modules and current functionality

`AppModule` registers authentication, authorization, students, departments, faculty, attendance, coursework assignments, files, exams, timetable, and fees.

| Module                 | Current endpoint surface (all under `/api/v1`)                                                                                                                         | Existing responsibility                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Authentication         | `POST /auth/register`, `/login`, `/refresh`, `/logout`, `/verify-email`, `/forgot-password`, `/reset-password`; `GET /auth/me`                                         | Registration, session lifecycle, verification and recovery          |
| Authorization          | `GET /authorization/probes/...` (isolated probes)                                                                                                                      | Proves authorization-context and scope behavior; not a business API |
| Students               | `POST /students`; `GET /students`, `/students/me`, `/students/:id`; `PUT /students/:id`; `POST /students/:id/enrollments`                                              | Student profiles, paginated/search listing, own profile, enrollment |
| Departments            | `POST /departments`; `GET /departments`, `/:id`; `PUT /departments/:id`                                                                                                | Department directory and management                                 |
| Faculty                | `POST /faculty`; `GET /faculty`, `/faculty/me`, `/:id`; `PUT /faculty/:id`                                                                                             | Faculty directory and profiles                                      |
| Attendance             | `GET /classes`; `POST /attendance`; `GET /attendance`, `/attendance/:id`; `PUT /attendance/:id`                                                                        | Class listing and attendance session/record management              |
| Coursework assignments | `POST /assignments`; `GET /assignments`, `/:id`; `PUT`/`DELETE /assignments/:id`; student `POST /assignments/:id/submissions`; staff `GET` submissions and `PUT` grade | Coursework authoring, student submission, grading                   |
| Files                  | `POST /files/presigned-url`; `GET /files`, `/:id`; `DELETE /files/:id`                                                                                                 | Tenant file metadata and signed storage URLs                        |
| Exams                  | `POST /exams`; `GET /exams`, `/:id`; `PUT`/`DELETE /exams/:id`; subject management; marks; result calculation/publication; student `GET /exams/me/results`             | Exam setup, marks, results                                          |
| Timetable              | `POST /timetable`; `GET /timetable`, `/me`, `/rooms`, `/classes`; `DELETE /timetable/:id`                                                                              | Timetable entries and supporting room/class lists                   |
| Fees                   | Fee structures, invoices, student invoice view, Razorpay order/payment verification, receipts                                                                          | Billing and payment workflows                                       |

This is the route surface declared by inspected controllers; it is not a claim that every route has production deployment or external integration configured. Detailed role annotations are not uniform across all legacy controllers. New endpoints must define explicit authorization policies at the controller and service/data-access layers.

### 1.3 Existing database models and relationships

The current schema is broader than the implemented dashboard and includes:

- **Tenant and identity:** `College` is the tenant; `User`, `AuthSession`, `EmailVerificationToken`, `PasswordResetToken`.
- **Access control:** college-scoped `Role`, global `Permission`, `UserRole`, `RolePermission`.
- **Academic organization:** `Department` → `Course` → `Semester` → `Section`; `Subject` is connected to department/course/semester.
- **People and placement:** `Student` and `Faculty` may link to a `User`; `Enrollment` links a student to a section.
- **Teaching and attendance:** `Class` links section, subject, and optional faculty; `Timetable` links class and room; `Attendance` is a dated class session with `AttendanceRecord` rows per student.
- **Coursework:** `Assignment` belongs to a class and optional faculty creator; `Material` belongs to class and optionally coursework assignment; `Submission` belongs to an assignment and student and has coursework grading fields.
- **Exams:** `Exam`, `ExamSubject`, `Mark`, and `Result`.
- **Finance:** `FeeStructure`, `Invoice`, `Payment`, and `Receipt`.
- **Supporting domain:** `Announcement`, `Notification`, `File`, and `AuditLog`.

Tenant-owned models use `collegeId`, many also define compound `(collegeId, id)` uniqueness for composite foreign keys, and relationships commonly include the tenant key. This is a strong pattern to extend. New task relations should follow it. The schema does not currently contain an operational task, task assignee, validation run, operational submission, or review entity.

### 1.4 Authentication, authorization, and tenant boundaries

The inspected access flow is:

1. `AccessAuthGuard` validates the bearer access token and its session.
2. `AuthorizationGuard` loads the user’s roles and permissions and the faculty profile’s department from the database.
3. Controller decorators declare allowed role names; services enforce resource and scope constraints.
4. The authorization context contains `userId`, `collegeId`, roles, permissions, and `departmentId`. Request-supplied tenant, role, or department values are not authorization proof.

The recognized role names are `SUPER_ADMIN`, `ADMIN`, `HOD`, `FACULTY`, and `STUDENT`. The current permission catalog in `authorization.types.ts` contains `TENANT_READ`, `TENANT_MANAGE`, `DEPARTMENT_READ`, and `DEPARTMENT_MANAGE`. Existing tenant and department assertion helpers provide prior art, but the proposed task permissions below do not exist yet.

For the new feature, derive `collegeId` only from this context. HOD task creation, assignment, listing, review, and analytics must be restricted to the authenticated HOD’s department. Faculty may only view and act on their own task assignments. Super-admin cross-tenant access must remain explicit and separately audited.

### 1.5 Existing frontend pages and dashboard

The existing App Router includes login, a role-aware dashboard, student directory/profile and student self-service pages, faculty directory/profile pages, department management, attendance list/create/detail pages, coursework assignment list/create/detail pages, exams/marks/results, fees/invoices/structures, timetable list/create, files, and a foundation playground.

The dashboard links staff to students, faculty, departments, attendance, coursework assignments, exams, timetable, fees, and files; students receive student-facing links. The shared `AppShell` provides navigation, role badge, responsive menu, account display, sign-out, and theme toggle. Existing detailed module pages should remain the drill-down destinations. The centralized analytical view is additive, not a replacement for them.

### 1.6 Academic workflows and gaps

**Already modeled and exposed in the inspected code:** student enrollment, faculty/department placement, classes and attendance, student coursework submissions and grading, exam setup/marks/results, recurring timetable, and fee/invoice/payment workflows.

**Partial or not evidenced by the inspected code:** organization-wide analytics; charts and aggregated metrics; operational administrator-to-faculty tasks; task-specific documents/data requirements; reusable file parsers; row-level validation and accepted-record storage; verified progress calculations; review feedback/resubmission history; deadline monitoring; activity stream; and real-time updates.

The current `File` presigned-upload flow creates metadata and returns a storage URL. The inspected flow does not provide a task-level “upload completed” verification, parsing, row validation, or task progress update. A persisted `Submission` is specifically coursework by a student and has one row per assignment/student; using it for staff operations would conflate authorization, lifecycle, history, and analytics.

## 2. Overall CampusOS high-level design

### 2.1 Target logical architecture

```text
Browser (Next.js)
  ├─ existing detailed module pages and shared UI
  ├─ admin analytics dashboard
  ├─ operational task / faculty submission / review pages
  ├─ REST API client (authenticated HTTP)
  └─ Socket.IO client (notifications only; REST resync on reconnect)
             │
             ├──────── HTTPS /api/v1 ────────┐
             └──────── WSS /socket.io ───────┤
                                              ▼
NestJS API
  ├─ authentication and centralized authorization
  ├─ existing domain modules
  ├─ analytics read services (read-only aggregation)
  ├─ operational task domain services
  ├─ upload validation adapters / worker boundary
  ├─ Socket.IO gateway and outbox publisher
  └─ PostgreSQL transactions via Prisma
       ├─ existing normalized campus models
       ├─ proposed task, validation, submission and review history
       └─ transactional event outbox
                                              │
                               S3-compatible object storage
                               (original uploads and artifacts)
```

PostgreSQL is authoritative for application state, metrics, and event sequence. Object storage holds bytes; database records hold tenant-scoped metadata, validation outcomes, and references. Socket.IO communicates committed-change notifications only. Clients always use authenticated REST reads to recover from missed, reordered, or duplicated notifications.

### 2.2 Technology and deployment notes

The repository currently has PostgreSQL/Prisma, NestJS/Express, Next.js, and S3 SDK presigned uploads. Existing architecture documentation lists Redis, BullMQ, S3, Docker, and CI as planned runtime components; Redis/BullMQ are not currently in the API dependency manifest. Do not assume those services are deployed.

Start with PostgreSQL aggregation and a synchronous path for small, bounded structured submissions if acceptable. Large CSV/XLSX imports and document scanning should use a durable background worker when volume/latency requirements justify the operational dependency. The outbox can initially be polled by a NestJS process; multi-instance fan-out and durable job processing must be designed before production scale.

## 3. Phase 1 HLD — centralized analytical dashboard

### 3.1 Product behavior and navigation

Provide a role-aware administrative overview at `/dashboard` for `ADMIN` and an equivalent department-scoped overview for `HOD`. Use existing module pages for drill-down:

- Student analytics → `/dashboard/students`
- Faculty and department analytics → `/dashboard/faculty`, `/dashboard/departments`
- Attendance analytics → `/dashboard/attendance`
- Coursework/submission statistics → `/dashboard/assignments`
- Operational task status and deadlines → proposed `/dashboard/operational-tasks`
- Exam/academic operations → `/dashboard/exams`
- Timetable → `/dashboard/timetable`
- Fees → `/dashboard/fees`

Faculty and students should not be granted campus-wide administrative analytics by hiding UI elements alone. Their existing personalized views remain. The API must authorize the requested aggregation scope before returning any result.

### 3.2 Dashboard information architecture and visualization

Use a responsive grid of summary cards, trend charts, status distributions, department comparisons, and recent activity. Each card/chart should show its time window, denominator, last-updated time, empty/error state, and accessible text equivalent. Add filters for academic period/date range and, for ADMIN, department; HOD department is fixed by server context and is not overrideable.

| Section             | Recommended measures                                                                                                  | Visualization                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Students            | Active enrollment count, newly enrolled in selected period, enrollment status breakdown                               | Summary cards, line trend, doughnut          |
| Faculty             | Active faculty count, faculty by department, teaching participation if defined by class assignments                   | Summary cards, department bar chart          |
| Attendance          | Attendance rate by period; present/late/absent/excused counts; missing/held sessions if defined                       | Percentage indicator, line chart, doughnut   |
| Departments         | Student, faculty, attendance, and operational-task counts by department                                               | Comparative bar chart and department table   |
| Academic operations | Upcoming/completed exams, recorded marks/results, scheduled classes; only metrics supported by defined business rules | Summary cards, timeline/list                 |
| Operational tasks   | Open, in-progress, pending-review, changes-requested, accepted counts; verified completion distribution               | Summary cards, doughnut, progress indicators |
| Submission/review   | Uploads awaiting validation, submissions pending review, change requests, review turnaround                           | Summary cards, line chart and queue          |
| Deadlines           | Open assignments past deadline, due soon, review-queue age; show overdue separate from pending review                 | Actionable deadline list                     |
| Recent activity     | Task creation/assignment, upload validation completion, submission, review, acceptance, and other permitted events    | Chronological activity feed                  |

Charts are proposal requirements, not installed dependencies. No chart library was found in the web manifest. Reuse existing cards/tables/tokens and accessibility conventions. Confirm a charting library (or approve a small custom SVG approach) before adding a dependency.

### 3.3 Metric definitions and aggregation rules

The API must publish metric definitions rather than exposing ambiguous counts:

- **Active students:** distinct students with an `ACTIVE` enrollment in the selected academic scope, not all historical student profiles.
- **Faculty count:** distinct active faculty profile count; “active” is not currently modeled on `Faculty`, so either define it from linked `User.status` or add an explicit business rule.
- **Attendance rate:** `present records / eligible attendance records` with the treatment of `LATE` and `EXCUSED` explicitly selected. Recommended initial definition is `(PRESENT + LATE) / (PRESENT + LATE + ABSENT)`, excluding `EXCUSED`; show the definition in API documentation/UI.
- **Department breakdown:** apply authenticated college and department scope before grouping. Department identifiers in query parameters are filters, not authorization grants.
- **Task completion:** use validated, unique, accepted records divided by expected records where the task has a record-count requirement. Never use faculty-entered percentages. For non-count tasks, report requirement checklist/file state only if objectively verifiable; otherwise show a non-numeric state rather than inventing a percent.
- **Overdue:** calculated from deadline and assignment/task lifecycle, not stored as a mutually exclusive state. A submission can be `PENDING_REVIEW` and overdue at the same time; display both dimensions.
- **Submission and review:** count distinct operational-task submissions and current assignment status separately; do not count every upload as a new formal submission.

All time-series buckets use the college timezone for display boundaries and UTC timestamps in storage/API. Define the academic period source and default dashboard time window before release.

### 3.4 Analytics APIs and aggregation strategy

Proposed read-only endpoints:

| Endpoint                                                                      | Purpose                                                    |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `GET /api/v1/analytics/dashboard?from=...&to=...&departmentId=...`            | Summary cards and trend series for the dashboard           |
| `GET /api/v1/analytics/departments?from=...&to=...`                           | Department comparison rows and totals                      |
| `GET /api/v1/analytics/attendance?from=...&to=...&departmentId=...&bucket=day | week                                                       | month` | Attendance counts/rate series |
| `GET /api/v1/analytics/operations?from=...&to=...&departmentId=...`           | Task, validation, submission, review, and deadline metrics |
| `GET /api/v1/analytics/activity?cursor=...&limit=...&departmentId=...`        | Paginated, authorized recent activity                      |

Request filters are validated (date order, maximum range, supported bucket, bounded page size). The authenticated context sets `collegeId`; HOD scope injects its server-derived `departmentId`. ADMIN may filter within its own college. Any declared SUPER_ADMIN cross-tenant access must use an explicit, audited contract.

Example response:

```json
{
  "window": {
    "from": "2026-10-01T00:00:00.000Z",
    "to": "2026-11-01T00:00:00.000Z",
    "timezone": "Asia/Kolkata"
  },
  "scope": { "departmentId": null },
  "students": {
    "active": 1240,
    "newEnrollments": 42,
    "byEnrollmentStatus": { "ACTIVE": 1240, "COMPLETED": 18, "WITHDRAWN": 4 }
  },
  "faculty": { "active": 86 },
  "attendance": {
    "ratePercent": 91.4,
    "denominator": 11240,
    "counts": { "PRESENT": 10120, "LATE": 150, "ABSENT": 820, "EXCUSED": 150 },
    "series": [{ "bucket": "2026-10-01", "ratePercent": 90.8, "eligibleRecords": 640 }]
  },
  "operations": {
    "openAssignments": 15,
    "pendingReview": 7,
    "changesRequested": 2,
    "accepted": 21,
    "overdue": 3
  },
  "generatedAt": "2026-11-01T10:00:00.000Z"
}
```

Aggregation strategy:

1. Build narrowly scoped Prisma queries or parameterized SQL with `collegeId` in every tenant-owned predicate. Use `GROUP BY`, filtered counts, and date buckets over existing normalized records.
2. Execute only selected metric queries; avoid fetching whole tables to aggregate in NestJS. Limit ranges and points returned.
3. Add indexes from measured query plans, beginning with tenant plus relevant date/status/department keys. Use existing relation paths from student enrollment through section/semester/course/department.
4. Treat PostgreSQL as the initial source. Add summary tables/materialized views only after latency/volume measurements; update them transactionally or via replayable jobs and define staleness.
5. Cache only if needed. Cache keys must contain tenant and scope, and invalidation/TTL must be explicit. Never use a client-supplied tenant ID in a cache key as authorization.
6. Make dashboard reads eventually consistent only where disclosed. `generatedAt` and freshness should be visible.

## 4. Operational task management LLD

### 4.1 Domain boundaries

Add a separate `OperationalTask` module. Do not alter the meaning or lifecycle of coursework `Assignment`, `Submission`, `Material`, or student grading. A task is a request from an authorized administrator/HOD to one or more faculty members. Each faculty-task pair is a distinct assignment with an independent deadline state, verified progress, uploads, submission attempts, and review history.

An operational task defines:

- Tenant and owning department.
- Author and task title/instructions.
- Structured requirement/validation definition and version.
- Expected record count and/or document/form requirements.
- Accepted input formats and allowed file size/type.
- Assignment deadline and task-level open/closed state.

An operational task assignment defines:

- One faculty profile and task.
- Assignment timestamp and optional assignment-specific due date (if task-level date is overridden).
- Current state and server-calculated verified metrics.
- All upload, validation, submission, and review history for this faculty member.

### 4.2 Proposed status lifecycle

**Task lifecycle:** `DRAFT → OPEN → CLOSED`; `CANCELLED` may be allowed only before final acceptance or with an explicit cancellation audit reason. Closing a task stops new work by default; whether already assigned faculty may complete after close is a client policy decision.

**Faculty assignment current state:**

```text
ASSIGNED → IN_PROGRESS → PENDING_REVIEW → ACCEPTED
                         ↑       │
                         └─ CHANGES_REQUESTED

ASSIGNED / IN_PROGRESS / CHANGES_REQUESTED → CANCELLED (authorized action)
```

- `ASSIGNED`: created and visible, with no verified upload progress.
- `IN_PROGRESS`: at least one upload/form payload has a completed validation run.
- `PENDING_REVIEW`: faculty explicitly submits a validated snapshot for review.
- `CHANGES_REQUESTED`: reviewer records written feedback; faculty can add corrected data and resubmit.
- `ACCEPTED`: authorized reviewer accepts a submission; final unless an explicitly audited reopen workflow is approved.
- `CANCELLED`: explicit terminal cancellation, not an overdue surrogate.
- **Overdue** is a derived flag: deadline is before current time and assignment is not accepted/cancelled. The pending-review state remains visible; show both flags where applicable.

Every formal resubmission creates a new immutable submission attempt. Every review decision creates a review-history row. Prior attempt, validation result, file, and feedback remain accessible.

### 4.3 Proposed Prisma model set

These are design-level model definitions, not a migration-ready schema. Use the existing `collegeId` composite relation pattern and ensure all tenant-owned relations include it. Names can be adjusted to match final domain vocabulary.

| Proposed model                   | Purpose and core fields                                                                                                                                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OperationalTask`                | `id`, `collegeId`, `departmentId`, `createdByUserId`, `title`, `description`, `requirements`, `taskType`, `validatorKey`, `validatorVersion`, `expectedRecordCount`, `dueAt`, `status`, `createdAt`, `updatedAt`, `closedAt`                                               |
| `OperationalTaskAssignment`      | `id`, `collegeId`, `taskId`, `facultyId`, `assignedByUserId`, `assignedAt`, `dueAt` (snapshot/override), `status`, `verifiedRecordCount`, `rejectedRecordCount`, `submittedAt`, `acceptedAt`, `createdAt`, `updatedAt`; unique `(collegeId, taskId, facultyId)`            |
| `OperationalTaskUpload`          | `id`, `collegeId`, `assignmentId`, `uploadedByUserId`, optional existing `fileId`, `inputKind`, `receivedAt`, `idempotencyKey`, content hash, `status`; immutable artifact reference                                                                                       |
| `OperationalTaskValidationRun`   | `id`, `collegeId`, `uploadId`, `validatorKey`, `validatorVersion`, `status`, `expectedCount`, `receivedCount`, `validCount`, `rejectedCount`, `startedAt`, `completedAt`, aggregate `summary` JSON                                                                         |
| `OperationalTaskValidationIssue` | Optional normalized row issues: `id`, `collegeId`, `validationRunId`, `rowNumber`, `field`, stable `code`, safe human-readable message, redacted `details` JSON                                                                                                            |
| `OperationalTaskRecord`          | Validated record storage: `id`, `collegeId`, `assignmentId`, `validationRunId`, `recordKey`, `payload` JSON, `acceptedAt`, optional superseded/revision linkage; unique key per assignment for deduplicated record counting                                                |
| `OperationalTaskSubmission`      | Immutable formal submission snapshot: `id`, `collegeId`, `assignmentId`, monotonic `attemptNumber`, `submittedByUserId`, `status`, `submittedAt`, validation/run references or snapshot JSON, verified counts at submit; unique `(collegeId, assignmentId, attemptNumber)` |
| `OperationalTaskReview`          | Append-only decision: `id`, `collegeId`, `submissionId`, `reviewerUserId`, `decision` (`ACCEPTED` or `CHANGES_REQUESTED`), required feedback for changes, `reviewedAt`                                                                                                     |
| `OutboxEvent`                    | Durable event record: `id`, `collegeId`, aggregate type/id, event type, safe payload JSON, `occurredAt`, `publishedAt`, retry count/error metadata                                                                                                                         |

Relations should use `(collegeId, id)` unique keys for parent references, such as task/assignment/upload/submission, so a valid task assignment cannot point to another college’s faculty or file. Where Prisma relation optionality or multiple composite relations makes a compact schema misleading, generate and review the exact schema as a separate implementation task. Do not store raw uploads or unbounded row errors in JSON columns.

Suggested indexes (finalize after query-plan review): task `(collegeId, departmentId, status, dueAt)`; assignment `(collegeId, facultyId, status, dueAt)` and `(collegeId, taskId, status)`; submission `(collegeId, assignmentId, attemptNumber)` and `(collegeId, status, submittedAt)`; validation `(collegeId, status, createdAt)`; records unique `(collegeId, assignmentId, recordKey)`; outbox `(publishedAt, occurredAt)` plus tenant/aggregate indexes. Enforce database-level uniqueness and tenant foreign keys, not only service checks.

### 4.4 Task creation and assignment APIs

Proposed routes (all require bearer authentication and centralized authorization):

| Method / route                                                   | Permission intent                                                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `POST /api/v1/operational-tasks`                                 | ADMIN or HOD with task-create permission; HOD creates only in own department                   |
| `GET /api/v1/operational-tasks`                                  | ADMIN college-wide; HOD own department; faculty only tasks assigned to self                    |
| `GET /api/v1/operational-tasks/:taskId`                          | Same scope plus explicit assignment visibility for faculty                                     |
| `PUT /api/v1/operational-tasks/:taskId`                          | Creator/authorized ADMIN; HOD only own department; restrict edits after assignments/submission |
| `POST /api/v1/operational-tasks/:taskId/assignments`             | ADMIN/HOD; faculty IDs must resolve to same college and allowed department                     |
| `GET /api/v1/operational-tasks/:taskId/assignments`              | ADMIN/HOD scoped; faculty only own assignment details                                          |
| `GET /api/v1/operational-task-assignments/:assignmentId`         | Owner faculty or authorized scoped reviewer                                                    |
| `GET /api/v1/operational-task-assignments/:assignmentId/history` | Owner faculty or authorized scoped reviewer                                                    |

Example task creation request:

```http
POST /api/v1/operational-tasks
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "departmentId": "dept-opaque-id",
  "title": "Verify current semester student records",
  "description": "Submit one verified record per currently enrolled student.",
  "requirements": {
    "taskType": "RECORD_DATA",
    "expectedRecordCount": 100,
    "validatorKey": "student-record-v1",
    "acceptedFormats": ["CSV", "XLSX"],
    "fields": [
      { "key": "studentCode", "type": "string", "required": true },
      { "key": "semester", "type": "string", "required": true }
    ]
  },
  "dueAt": "2026-11-15T18:29:00.000Z"
}
```

Example response:

```json
{
  "task": {
    "id": "task-opaque-id",
    "departmentId": "dept-opaque-id",
    "title": "Verify current semester student records",
    "status": "DRAFT",
    "dueAt": "2026-11-15T18:29:00.000Z",
    "createdAt": "2026-11-01T10:00:00.000Z",
    "assignmentCount": 0
  }
}
```

Tenant and creator IDs are intentionally absent from the write body. The API derives them from authenticated context. The department ID is a requested resource scope and must be checked against context, not trusted as proof.

For assigning multiple faculty, accept a bounded array of faculty IDs and use one transaction: verify every faculty profile is eligible, in the task’s college/department, and linked to an active user where login is required; create missing task assignments; write audit/outbox entries; then return assignments. Define whether reassigning an existing faculty is idempotent or conflict. Recommended: idempotent create with unique constraint and explicit existing-assignment result; never overwrite progress/history.

## 5. Automatic data collection and validation architecture

### 5.1 Input modes and validation registry

Support three task types through a small, versioned adapter boundary:

1. **Structured form:** task version publishes a constrained field schema; API validates submitted rows against it.
2. **CSV/XLSX records:** allow-listed format/size; parser maps columns to a server-defined schema; validate rows and identity/deduplication keys.
3. **Document evidence:** allow-listed document uploads with objective receipt/integrity checks and, if required, human review. Do not claim a document is semantically valid or award numeric record completion solely because a file was uploaded.

Use a server-side registry keyed by `validatorKey` and pinned `validatorVersion`, not arbitrary client-provided code or executable schemas. Validator input includes tenant-scoped task definition, assignment, file/structured input, and prior accepted record keys. Validator output is typed counts, accepted records, rejected issue details, and safe summary. Validator implementations remain deterministic and side-effect-free; persistence is handled by the domain service.

### 5.2 Upload and validation flow

1. Faculty authenticates; API resolves the user’s faculty profile and verifies the assignment is theirs, open, not accepted/cancelled, and editable.
2. For a file, client obtains an upload URL through the existing file API and uploads directly to object storage. Client then calls the task upload endpoint with the existing file ID and task assignment. The API must verify college ownership and object existence/size/checksum before processing; a presigned URL response alone is not proof bytes arrived.
3. For structured forms, the client submits bounded rows to the same validation service without a file.
4. Create an immutable upload record with idempotency key and content hash. Pin the task requirement/validator version to the upload/run.
5. Parse safely, normalize data, validate schema and business identity against tenant-scoped records, detect duplicate keys both within the batch and against accepted rows, and classify each row as valid or rejected.
6. Persist run and issue summary; persist only valid rows as accepted task records or through a domain-specific adapter when the task’s explicit purpose is to update an existing canonical domain model.
7. In a transaction, update the assignment’s derived/cached counters and status, write audit and outbox entries, and commit. A failed parse or transaction must not present a successful progress update.
8. Return accepted/rejected counts, completion percent (only when count-based), and bounded row errors. Large imports return `202` with a run ID and poll endpoint; small synchronous submissions may return `200`.

### 5.3 Completion calculation and resubmission semantics

For count-based tasks:

```text
verifiedCompletionPercent =
  min(100, floor(100 * distinctCurrentAcceptedRecordCount / expectedRecordCount))
```

For the supplied example: expected `100`, received `60`, valid unique `50`, rejected `10` → verified `50%`. Received/rejected counts are diagnostic; only accepted unique records count toward completion.

Resubmitted rows must not increment progress twice. Use a stable task-defined natural key. A corrected row with an existing key replaces the current accepted value only through a recorded revision/supersession event; invalid replacement must not silently erase the last valid record. If the task requires append-only facts, reject duplicates instead. Whether valid records are cumulative across multiple files or the latest upload is a full replacement must be defined per task type and immutable once assignments begin.

For non-count tasks, return `verifiedCompletionPercent: null` unless all requirements have machine-verifiable completion semantics. Never accept a percentage field from faculty.

Example validation response:

```json
{
  "uploadId": "upload-opaque-id",
  "validation": {
    "status": "COMPLETED",
    "expectedRecords": 100,
    "receivedRecords": 60,
    "validRecords": 50,
    "rejectedRecords": 10,
    "verifiedCompletionPercent": 50,
    "issues": [
      {
        "row": 8,
        "field": "studentCode",
        "code": "UNKNOWN_STUDENT",
        "message": "Student code was not found in this department."
      }
    ]
  },
  "assignment": { "id": "assignment-opaque-id", "status": "IN_PROGRESS", "verifiedRecordCount": 50 }
}
```

### 5.4 Parser and storage safety

- Allow-list extensions and MIME types; verify actual file signatures, not just client headers.
- Set compressed and uncompressed size limits, row/column limits, execution timeouts, and memory bounds. Protect against archive bombs and malformed workbook structures.
- Reject macro-enabled formats unless explicitly required and safely scanned; never execute formulas/macros. Decide formula-cell treatment (cached value vs reject) and document it.
- Escape/restrict formula-leading values on any future CSV export.
- Store original bytes in private college-scoped object paths; avoid public ACLs. Use short-lived signed URLs and least-privilege storage credentials.
- Keep PII out of application logs, socket payloads, and issue messages. Apply retention/deletion policy to source files and row-level validation issues.
- Consider malware scanning for document uploads before reviewer access. Select an approved scanner/service and deployment boundary before production.
- Make upload processing idempotent. Persist run state (`QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`) and surface failures explicitly; retry only idempotent work.

## 6. Submission, review, feedback, and history

### 6.1 Submission and review workflow

1. Faculty reviews validation results and chooses **Submit for review**. Uploading data alone does not submit it.
2. API checks task state, deadline policy, ownership, no invalid/incomplete blocking condition if configured, and no existing pending review.
3. Create a new immutable `OperationalTaskSubmission` snapshot with the current accepted record set/count, validation run references, and supporting files; change assignment current status to `PENDING_REVIEW`.
4. Emit `operational-task.submission.created` only after commit.
5. Authorized ADMIN or in-scope HOD opens the submission, validation report, and permitted uploaded data.
6. Reviewer accepts or requests changes with written feedback. The decision and reviewer identity are appended as a review record; transactionally update submission/assignment state and write audit/outbox.
7. On changes requested, faculty uploads corrections and creates a new submission attempt. Previous submissions, validations, reviewer, timestamps, and feedback remain immutable and viewable.
8. On acceptance, assignment becomes `ACCEPTED`; edits are blocked except through an explicit audited reopen/correction policy.

Example review request:

```http
POST /api/v1/operational-task-submissions/submission-opaque-id/reviews
Authorization: Bearer <access-token>
Content-Type: application/json

{ "decision": "CHANGES_REQUESTED", "feedback": "Rows 8 and 19 need corrected student identifiers." }
```

Example response:

```json
{
  "review": {
    "id": "review-opaque-id",
    "submissionId": "submission-opaque-id",
    "decision": "CHANGES_REQUESTED",
    "feedback": "Rows 8 and 19 need corrected student identifiers.",
    "reviewedAt": "2026-11-03T09:30:00.000Z"
  },
  "assignment": { "id": "assignment-opaque-id", "status": "CHANGES_REQUESTED" }
}
```

### 6.2 Assignment history and monitoring

Provide immutable, append-only history for:

- Task creation and permitted definition changes.
- Each faculty assignment and assignment/deadline change.
- Every upload and its hash, receipt time, uploader, and validation-run reference.
- Each validation run/version, row counts, errors, and accepted-record revisions.
- Each formal submission attempt and snapshot.
- Each review decision, reviewer, written feedback, and timestamp.
- Cancellation, reopening, or other exceptional administrative action.

Never update a single task row to represent a new task. New tasks get new IDs; task assignments are unique per task/faculty pair; formal attempts use a monotonic number per assignment. Keep `createdAt`, `assignedAt`, effective deadline, current status, and history timestamps distinct.

### 6.3 Filters and queue semantics

The task list supports `departmentId`, `facultyId`, `status`, `dueBefore`, `dueAfter`, `overdue`, `pendingReview`, `search`, page, and page size. Server scope is applied before filters. HOD cannot see or filter into another department; faculty may list only their own assignments. Use stable cursor pagination for long histories/activity feeds and page-number pagination only for bounded administrative tables.

An overdue filter is a derived predicate: deadline before now and assignment not accepted/cancelled. A pending-review filter is status-based. A record may match both, so aggregate counts are not mutually exclusive unless the UI explicitly defines mutually exclusive buckets.

## 7. Real-time monitoring architecture

### 7.1 Transport, source of truth, and publication

Add a NestJS Socket.IO gateway alongside REST. PostgreSQL remains authoritative. Every state-changing service writes the domain update and an `OutboxEvent` in the same Prisma transaction. A publisher emits only committed outbox rows and marks them published after delivery attempt. This avoids emitting success before commit and reduces loss between commit and emit. Clients handle duplicates using event IDs and reconcile against REST. Socket delivery is not a substitute for REST response state.

If running multiple API instances, use a supported Socket.IO adapter (likely Redis) for cross-instance rooms and coordinate publisher ownership. Redis is not currently configured in this repository; deployment and recovery semantics need approval. Without a distributed adapter, explicitly support a single Socket.IO node only.

### 7.2 Authentication, authorization, and rooms

- Authenticate the socket handshake using the existing short-lived access-token/session validation path; do not accept role, college, department, or user ID as authoritative from handshake query data.
- Resolve fresh server-side authorization context on connection and when reconnecting. Close/deny unauthenticated, expired, revoked, or suspended sessions.
- Join server-selected rooms only: `college:{collegeId}`, `college:{collegeId}:department:{departmentId}`, `user:{userId}`, and assignment rooms only after authorized resource lookup.
- ADMIN subscriptions are restricted to their authenticated college. HOD subscriptions are restricted to server-derived department. Faculty subscribes to their user/assignment rooms only. STUDENT receives no operational task events unless a later requirement explicitly authorizes them.
- Do not broadcast row content, PII, validation details, file URLs, or written feedback into broad rooms. Send IDs, event type/version, scope-safe status/count deltas, and timestamp; clients fetch details over REST.
- Recheck access for room joins and sensitive event delivery. Permission revocation should invalidate/disconnect active sockets promptly or on bounded revalidation.

### 7.3 Event contracts

Proposed event envelope:

```json
{
  "eventId": "evt-opaque-id",
  "type": "operational-task.validation.completed",
  "version": 1,
  "occurredAt": "2026-11-02T10:10:00.000Z",
  "collegeId": "server-scoped-tenant-id",
  "departmentId": "server-scoped-department-id",
  "taskId": "task-opaque-id",
  "assignmentId": "assignment-opaque-id",
  "submissionId": null,
  "data": {
    "status": "COMPLETED",
    "validRecords": 50,
    "rejectedRecords": 10,
    "verifiedCompletionPercent": 50
  }
}
```

`collegeId`/`departmentId` in this envelope are server-derived routing context; clients must not use event fields as authorization proof. Do not include names/email in broad events.

| Event                                   | Emitted after committed operation        | Suggested recipients                            |
| --------------------------------------- | ---------------------------------------- | ----------------------------------------------- |
| `operational-task.created`              | Task creation                            | Scoped ADMIN/HOD rooms                          |
| `operational-task.assignment.created`   | Faculty assignment creation              | Scoped manager room and assigned faculty user   |
| `operational-task.upload.received`      | Upload metadata/object verification      | Assigned faculty and authorized scoped managers |
| `operational-task.validation.completed` | Persisted validation outcome/progress    | Assigned faculty and authorized scoped managers |
| `operational-task.progress.updated`     | Verified record count/status transaction | Assigned faculty and authorized scoped managers |
| `operational-task.submission.created`   | Formal submission committed              | Reviewer queue and assigned faculty             |
| `operational-task.review.created`       | Review decision/feedback committed       | Assigned faculty and authorized scoped managers |
| `operational-task.accepted`             | Accepted terminal state committed        | Assigned faculty and scoped managers            |

### 7.4 Reconnection and API synchronization

On disconnect, reconnect with a newly authenticated token and repeat server-side room authorization. Use exponential backoff with jitter and a bounded retry policy. On reconnect, fetch dashboard/task list or history with a cursor/`since` timestamp from REST; do not assume events were buffered. Client deduplicates by `eventId`, ignores unknown event versions safely, and invalidates affected query caches. Include a last-event cursor only if the server provides durable replay semantics; otherwise explicitly resync all relevant REST resources.

## 8. Role and permission matrix

Proposed permission codes are additive and must be introduced in the permission catalog/seed; current code has only the four baseline permissions noted earlier. Role membership alone is not sufficient for department scope.

| Capability                    | SUPER_ADMIN                                                        | ADMIN                               | HOD                                | FACULTY                                          | STUDENT                          |
| ----------------------------- | ------------------------------------------------------------------ | ----------------------------------- | ---------------------------------- | ------------------------------------------------ | -------------------------------- |
| Read analytics                | Explicit cross-tenant permission and selected tenant; audit access | College-wide                        | Own department only                | No campus-wide analytics; own task progress only | Existing own academic views only |
| Create/edit task              | Explicit platform policy; tenant context required                  | Own college                         | Own department                     | No                                               | No                               |
| Assign faculty                | Explicit policy                                                    | Any eligible faculty in own college | Eligible faculty in own department | No                                               | No                               |
| List task assignments         | Explicit policy                                                    | Own college                         | Own department                     | Own assignments only                             | No                               |
| Upload/validate own task data | No implicit access                                                 | No implicit access                  | Only if separately assigned        | Own assignment                                   | No                               |
| Submit for review             | No implicit access                                                 | No implicit access                  | Only if separately assigned        | Own assignment                                   | No                               |
| Review and request changes    | Explicit policy                                                    | Own college                         | Own department                     | No                                               | No                               |
| Accept submission             | Explicit policy                                                    | Own college                         | Own department                     | No                                               | No                               |
| View history/feedback         | Authorized tenant/scope                                            | Own college                         | Own department                     | Own task history and feedback                    | No                               |
| Subscribe to live events      | Tenant/permission-limited                                          | Own college rooms                   | Own department rooms               | User/assignment rooms                            | No operational rooms             |

Recommended permission codes: `OPERATIONAL_TASK_READ`, `OPERATIONAL_TASK_CREATE`, `OPERATIONAL_TASK_ASSIGN`, `OPERATIONAL_TASK_SUBMIT`, `OPERATIONAL_TASK_REVIEW`, `ANALYTICS_READ`, and a separate explicit cross-tenant analytics/task permission if required. The exact role-to-permission seed mapping requires confirmation. Enforce in guards and services, not only client navigation.

## 9. Frontend architecture

Reuse `AppShell`, auth provider, `authenticatedRequest`/API client patterns, shared cards, buttons, form fields, tables, pagination, skeleton/error/empty states, and existing detailed pages. Keep role visibility as UX only; API authorization remains authoritative.

Proposed routes:

- `/dashboard`: analytics overview for ADMIN/HOD; preserve existing role-specific experience when no analytics permission applies.
- `/dashboard/operational-tasks`: filterable task list and overdue/review queues.
- `/dashboard/operational-tasks/new`: task definition and multi-faculty assignment.
- `/dashboard/operational-tasks/[taskId]`: task requirements, assignment progress, deadlines, and history.
- `/dashboard/operational-task-assignments/[assignmentId]`: faculty upload/form entry, validation errors, verified progress, and submission history.
- `/dashboard/operational-task-submissions/[submissionId]`: reviewer data/validation view and review feedback/decision.

Build screen-specific components only when a repeat use case exists. Chart components need keyboard/screen-reader alternatives, responsive layout, loading/error/empty states, and accessible data tables or summaries. Use the existing API client’s refresh behavior; do not store long-lived socket credentials in URLs/local storage. An authenticated socket client should use a short-lived access token through the supported handshake authentication field and reconnect on token rotation.

## 10. API documentation and error contract

All new external inputs receive boundary DTO validation. Use the existing `/api/v1` prefix and structured error shape `{ "code", "message", "details" }`. Proposed stable errors include:

| HTTP | Code                                                                 | Meaning                                                                   |
| ---- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 400  | `INVALID_INPUT`                                                      | Request/schema malformed or unsupported filter                            |
| 401  | `UNAUTHORIZED` / `SESSION_EXPIRED`                                   | Missing/invalid/revoked authentication                                    |
| 403  | `FORBIDDEN`                                                          | Role, tenant, department, or ownership scope denied                       |
| 404  | `OPERATIONAL_TASK_NOT_FOUND` / `TASK_ASSIGNMENT_NOT_FOUND`           | Resource not found within caller scope                                    |
| 409  | `TASK_NOT_EDITABLE`, `SUBMISSION_PENDING_REVIEW`, `DUPLICATE_UPLOAD` | Conflict with current lifecycle/idempotency                               |
| 413  | `UPLOAD_TOO_LARGE`                                                   | File/row limits exceeded                                                  |
| 422  | `VALIDATION_FAILED`                                                  | Input parsed but rows fail domain validation; include bounded safe issues |
| 429  | `RATE_LIMITED`                                                       | Upload/validation or socket/API rate limit exceeded                       |

Errors must not disclose whether an out-of-scope tenant’s resource exists. Validation errors should be bounded/paginated and must not echo full PII-containing input rows.

## 11. Security, privacy, and scalability considerations

### 11.1 Security controls

- Enforce tenant and department scope in every query, write, relation, analytics aggregation, cache key, socket room, file access, and background job.
- Use composite foreign keys or equivalent database constraints for task→department, assignment→task/faculty, upload→assignment/file, validation→upload, submission→assignment, and review→submission.
- Resolve actor, tenant, roles, and department from authenticated server state. Never trust values supplied in the request or socket payload.
- Prevent IDOR by scoped resource lookup before mutation and by returning non-enumerating not-found/forbidden responses consistently.
- Validate task schema updates and freeze validator/schema versions once faculty data is submitted; record author, before/after metadata, and audit history.
- Use transaction boundaries for each state transition and event-outbox insert. Add optimistic concurrency/version checks for concurrent review/submission operations.
- Protect upload endpoints against spoofed MIME, storage-key traversal, oversized payloads, presigned URL replay, malware, parser abuse, and unverified S3 object existence.
- Require reviewer feedback for `CHANGES_REQUESTED`; accept decisions only from authorized scoped roles.
- Apply rate limits and quotas to task creation, upload count/size, validation jobs, and socket connections/subscriptions.
- Keep secrets in centralized environment configuration. Never log raw tokens, passwords, file URLs, row contents, or unnecessary student/faculty PII.
- Define retention, right-to-delete, audit retention, backup/restore, and object-storage deletion semantics.

### 11.2 Scalability and consistency risks

- Full-table dashboard scans become expensive; measure indexes and query plans before denormalizing.
- Large imports can monopolize API threads/memory; worker queue is likely required beyond bounded synchronous input.
- Socket.IO events can be lost, duplicated, reordered, or emitted after process failure; transactional outbox plus REST reconciliation addresses the source-of-truth gap.
- Multi-instance WebSocket delivery requires a shared adapter and operational readiness checks. Redis is a new operational dependency, not currently present in this API package.
- Row-level JSON payloads can grow rapidly; define retention, indexing, export, and partitioning thresholds before high-volume use.
- High-cardinality activity/task histories need cursor pagination and archival policy.
- Cached assignment counters can diverge from accepted records if writes are not transactional/reconcilable. Prefer deriving where affordable and periodically reconcile any cached metrics.
- Department/faculty analytics may expose sensitive operational details; scope and minimum-necessary response fields are mandatory.

## 12. Testing strategy

Use existing Jest conventions and API test setup; add tests with each milestone.

### Backend unit and integration coverage

- Guard and service authorization matrix for ADMIN, HOD, FACULTY, STUDENT, SUPER_ADMIN; cross-college and cross-department IDs; faculty ownership; revoked sessions.
- DTO boundary validation, immutable task requirement versions, due dates, filter bounds, and status transition guards.
- Multi-faculty assignment transaction/idempotency and partial-failure rollback.
- CSV/XLSX/form adapters: valid/invalid rows, malformed files, duplicate keys, corrected-key behavior, expected count `100` / received `60` / accepted `50` / rejected `10` → exactly `50%`.
- No progress increment for duplicate uploads/records; no accepted-record loss when a correction is invalid.
- Formal submission snapshots, monotonic attempts, pending-review lock, feedback required on change requests, immutable history, acceptance.
- Concurrent reviewer/submission race and transaction rollback of outbox/domain state.
- Tenant-scoped analytics counts/rates and HOD scope enforcement; attendance definition and time-boundary/timezone behavior.
- Socket handshake authentication, role/scope room joins, event payload minimization, post-commit emission, duplicate event handling, reconnect REST resync.
- Storage upload completion verification, MIME/signature checks, size limits, object deletion and signed URL expiration.

### Frontend tests

Add a web test strategy rather than relying on the current placeholder script. Test dashboard role/scope display, metric loading/error/empty states, accessible chart alternatives, filters/drill-downs, upload results, validation errors, submission status, review feedback, overdue/pending-review distinction, socket disconnect/reconnect, and REST reconciliation. Use Playwright for critical end-to-end flows once harness/configuration is established.

### Validation and operations

Run targeted API tests per module, then monorepo `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` as implementation progresses. Add Prisma format/validation/client generation and migration status checks for schema milestones. Use PostgreSQL integration tests for tenant composite constraints and transaction semantics; in-memory Prisma-compatible tests do not prove PostgreSQL behavior.

## 13. Implementation roadmap

File names below are likely additions or integration points, not files changed by this design. Final locations should follow nearby module patterns. Each milestone should be independently reviewable and deployable behind permissions/feature flags where appropriate.

| Milestone                                   | Likely files                                                                                                                                         | Database changes                                                                                                                  | Backend changes                                                                                                            | Frontend changes                                                                                         | API dependencies                                                                                                                 | Tests and exit criteria                                                                                             | Depends on |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------- |
| 0. Confirm policies and metric definitions  | `docs/phase-1-technical-design.md`; follow-up product decision record if requested                                                                   | None                                                                                                                              | None                                                                                                                       | None                                                                                                     | Confirm attendance formula, deadline policy, task/review rules, permission mapping, accepted formats, data retention             | Product/security sign-off; no implementation                                                                        | None       |
| 1. Task domain and tenant-safe schema       | `packages/db/prisma/schema.prisma`; new versioned migration; seed if permission catalog is seeded there                                              | Add task, task assignment, permission codes, lifecycle enums, composite tenant FKs and indexes                                    | New `operational-tasks` module skeleton, DTO/parser, scoped query helpers; no ingestion yet                                | None                                                                                                     | Task/assignment CRUD read/write contracts                                                                                        | Prisma validate/generate/migrate; integration test cross-tenant and cross-department constraints; API service tests | 0          |
| 2. Task management APIs and screens         | `apps/api/src/operational-tasks/*`; `apps/api/src/app.module.ts`; `apps/web/src/app/dashboard/operational-tasks/*`; app shell/nav; client API module | Assignment and task audit/history fields if not in milestone 1                                                                    | Create/edit/list/assign/detail; explicit role+permission guards; atomic multiple assignment; deadline/status query filters | Task list/create/detail, filters and multi-faculty selection                                             | Authenticated API client and existing department/faculty lookup endpoints                                                        | RBAC and ownership tests; HOD scope; idempotent assignment; responsive/accessible UI checks                         | 1          |
| 3. Upload and validation foundation         | Schema plus migration for upload/run/issues/records; reuse `File` metadata                                                                           | Validation adapters, object existence verification, bounded parser path, structured form input, async worker boundary if required | Faculty upload/form UI, validation report, verified progress display                                                       | Existing `/files/presigned-url`; new task upload/form/validation endpoints                               | File authorization, parser adversarial fixtures, exact 100/60/50/10 threshold, duplicate/retry/idempotency, transaction rollback | 1–2                                                                                                                 |
| 4. Submission and review history            | Schema/migration for immutable submission attempts and review records                                                                                | Submission create/history/review/accept/change-request services; lock and concurrency rules                                       | Faculty assignment history/submit UI; admin/HOD review queue and submission detail                                         | Upload/validation records and task state endpoints                                                       | Review role/scope, immutable attempts, feedback, concurrent transition tests, end-to-end correction/resubmission                 | 3                                                                                                                   |
| 5. Analytics APIs and dashboard             | No new storage initially; add indexes only from EXPLAIN evidence                                                                                     | Read-only analytics aggregation services, metric definitions, scope and bounded filters                                           | `/analytics/*` APIs and admin/HOD dashboard cards/charts/drill-down                                                        | Existing domain APIs and new task/review aggregates                                                      | API contract snapshots, metric fixture verification, HOD isolation, timezone/empty data tests, accessible chart UI tests         | 1–4 (task metrics need task model; existing-domain analytics could ship earlier)                                    |
| 6. Transactional event outbox and Socket.IO | Schema/migration for outbox; possible deployment config for Redis adapter later                                                                      | Transactional outbox writer, publisher, socket gateway/auth/rooms, REST resync endpoint/cursor if chosen                          | Socket client subscriptions, live badges/queue refresh, reconnect logic                                                    | Committed-operation event tests, role/room isolation, duplicate/reconnect tests, outbox retry/monitoring | 1–5 for all event sources; may be delivered incrementally after milestone 4                                                      | 4 (or publish existing-domain events in a separately scoped slice)                                                  |
| 7. Production hardening and rollout         | Environment/deployment documentation, monitoring/runbook, tests                                                                                      | Retention/cleanup jobs and optional materialized aggregates only if measured                                                      | Malware scanning/worker operations, rate limits, outbox monitoring, migration/backup plans                                 | Feature flags, support/empty/error states, telemetry without PII                                         | Security review, load tests, restore/replay drill, accessibility and E2E validation                                              | 1–6                                                                                                                 |

Milestones 3 and 4 must not ship a UI-only completion percentage. Every displayed metric must be derived by the backend from validated, persisted data. Task state, submission history, and outbox changes must commit transactionally.

## 14. Assumptions requiring client confirmation

These choices materially affect schema, validation semantics, security, and UI:

1. **Task scope:** Can HODs create tasks only in their own department and assign only department faculty? Recommendation: yes.
2. **Faculty identity:** Must every assignable `Faculty` profile link to an active `User` account? Current `Faculty.userId` is optional; task assignment/upload authorization is simpler and safer if assignment eligibility requires a linked active user.
3. **Expected record semantics:** Are records cumulative across uploads, latest-upload replacement, or per-row revision keyed by a natural identifier? Recommendation: task validator defines this explicitly, default to stable-key upsert with immutable revision history.
4. **Completion for non-record tasks:** Should document-only tasks have no percentage, or use explicit machine-verifiable checklist requirements? Recommendation: no percentage without verifiable denominator.
5. **Overdue submissions:** May faculty submit after deadline? May administrators accept an overdue submission? Recommendation: allow submission unless task is closed/cancelled, mark overdue separately, and let reviewer decide; confirm policy.
6. **Task closure/cancellation:** Can tasks be closed while faculty assignments are in progress? Is accepted work ever reopened? Define who can do so and whether a reason is mandatory.
7. **Review policy:** Can the task creator review their own task? Are HODs permitted to review ADMIN-created tasks in their department? Is a second approval or review SLA needed?
8. **Analytics definitions:** Confirm attendance rate treatment of `LATE` and `EXCUSED`; active faculty definition; academic period/calendar source; default dashboard window; whether finance metrics are in scope.
9. **Input formats and limits:** Confirm CSV/XLSX only at launch, maximum file/row sizes, formulas/macros policy, document formats, document malware scanning, and whether batch processing must be asynchronous at first release.
10. **Data destination:** Are accepted records intended only as evidence for the operational request, or should some task types update canonical `Student`, `Faculty`, attendance, or other domain models? Recommendation: explicit domain-specific adapter and separate confirmation; never generic-write arbitrary JSON into canonical records.
11. **Retention/privacy:** How long to retain uploads, rejected row details, accepted task data, audit history, and socket activity metadata? Establish deletion and legal-hold policy.
12. **Real-time deployment:** Is a single API instance sufficient initially, or is multi-instance Socket.IO required? If multi-instance, approve Redis/adapter and operational ownership; none is currently configured.
13. **Charting dependency:** Approve a chart library or custom SVG implementation; no chart package exists today.
14. **SUPER_ADMIN:** Is cross-tenant task and analytics access required in this phase? If yes, define explicit permission, tenant selection, audit, and redaction rules.

## Final milestone summary and open decisions

Recommended sequence: confirm definitions and role policy → tenant-safe task schema/API → validated uploads and server-derived progress → immutable submission/review history → analytics aggregation/dashboard → transactional outbox and Socket.IO → production hardening. The first release should prioritize tenant isolation, data provenance, and review-history correctness over broad chart complexity or premature caching.

The key unresolved decisions are HOD scope, faculty account linkage, deduplication/replacement semantics, deadline and closure policy, attendance/faculty metric definitions, canonical data destinations, file limits/scanning/retention, chart dependency, and whether Redis-backed multi-instance sockets are required. No implementation is made until these policies are confirmed where they materially change behavior.
