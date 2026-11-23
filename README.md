# CampusOS

CampusOS is a multi-tenant college management platform. Each college is a separate tenant, and everyone signs in to a portal built around their role: **Admin**, **Head of Department (HOD)**, **Faculty** or **Student**. Every request is checked on the server against the user's college, role and department.

## What each portal does

| Portal      | Main features                                                                                                                                                                                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Student** | Dashboard, subject-wise attendance against the college's minimum (75% by default), timetable, assignments and submissions, exams and published results, fee invoices with online payment and receipts, announcements, visitor requests, files, profile and password   |
| **Faculty** | Dashboard, my classes, attendance marking (corrections within the college's window, 48 hours by default, with history), coursework and grading, marks entry submitted for HOD review, tasks, timetable                                                                |
| **HOD**     | Department overview, tasks for department staff, faculty performance from system records, marks review (approve or return), visitor approvals, department students, faculty and timetables                                                                            |
| **Admin**   | Students and enrollment, faculty, departments, tasks across departments, timetables, exam publishing once every paper is approved, fee structures and invoices, announcements, faculty performance, college settings (profile, minimum attendance, correction window) |

Marks follow an approval workflow: **faculty submit → HOD approves or returns → Admin publishes results**. Every step is recorded in the audit log.

## Tech stack

- **Web:** Next.js 15, React 19, TypeScript, Tailwind CSS (`apps/web`)
- **API:** NestJS 11, TypeScript strict mode, Socket.IO for real-time task events (`apps/api`)
- **Database:** PostgreSQL with Prisma 6 migrations and an idempotent seed (`packages/db`)
- **Integrations:** AWS S3 presigned uploads for files, Razorpay for online fee payments
- **Tooling:** pnpm workspaces, ESLint, Prettier, Jest and Supertest

## Repository layout

```
apps/
  web/        Next.js app with the four portals
  api/        NestJS REST API and WebSocket gateway
packages/
  db/         Prisma schema, migrations and development seed
  types/      shared TypeScript contracts
  ui/         shared UI building blocks
  config-*/   shared ESLint and TypeScript configuration
docs/         API, architecture, database and WebSocket notes
```

## Getting started

### Prerequisites

- Node.js 22 or newer
- pnpm 10 (`corepack enable` sets it up)
- PostgreSQL (developed against version 17)

### Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy `.env.example` to `.env` and set at least:
   - `DATABASE_URL`, pointing at an empty PostgreSQL database;
   - `AUTH_ACCESS_TOKEN_SECRET`, a random string of 32+ characters.

3. Create the tables and load the demo data:

   ```bash
   pnpm --filter @campusos/db prisma:migrate:deploy
   pnpm --filter @campusos/db prisma:seed
   ```

4. Start the web app and the API together:

   ```bash
   pnpm dev
   ```

   The web app runs at http://localhost:3000 and the API at http://localhost:3001/api/v1.

### Demo accounts

The seed creates the college **DEMO** with one account per role. Every account uses the development password `CampusOSDev!2026`. The sign-in page also has quick buttons that fill these in.

| Role                                | Email                    |
| ----------------------------------- | ------------------------ |
| Admin                               | `admin@campusos.local`   |
| HOD (Electronics and Communication) | `hod@campusos.local`     |
| Faculty (Computer Science)          | `faculty@campusos.local` |
| Student (B.Tech CSE, Semester 1)    | `student@campusos.local` |

These credentials are for local development only. Never run the seed against a production database.

### Demo data

For a demonstration, fill the DEMO college with a full sample college:

```bash
pnpm --filter @campusos/db prisma:seed:demo
```

It runs the seed above, then adds four departments (CSE, ECE, ME, CE) with their HODs and faculty, about 200 students, a weekly timetable, six weeks of attendance, coursework, exams and results, fees, tasks, visitors and announcements. Dates are relative to the day it runs, and running it again adds nothing twice.

- Every demo account signs in with `DEMO_PASSWORD` if it is set, otherwise with the development password.
- Students sign in with their roll number, for example `cse26a01@campusos.local`. Faculty use `firstname.lastname@campusos.local`, for example `anjali.verma@campusos.local` (HOD of CSE).
- To fill a separate demo database, point `DATABASE_URL` at it, then run `pnpm --filter @campusos/db prisma:migrate:deploy` and the command above.

### Optional services

- **File uploads** need `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
- **Password-reset email** needs `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` (Gmail works with an app password), plus `APP_URL` for the link.
  - Without them, "Forgot password" tells the college's Admins instead. They issue a temporary password from the person's faculty or student record.
  - An account with neither record, such as an Admin, is reset on the server: `pnpm --filter @campusos/db account:reset-password <college code> <email>`.
- **Online fee payments** use `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
  - Outside production, without these keys, payments run in a test mode that accepts simulated payments.
  - In production without keys, online payment is switched off and students are told to pay at the accounts office.

## Checks before a pull request

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

When the Prisma schema changes, also run `pnpm --filter @campusos/db prisma:validate` and `prisma:migrate:status`.

## Documentation

- [`docs/api.md`](docs/api.md): REST endpoints and who may call them
- [`docs/architecture.md`](docs/architecture.md): goals, monorepo layout and architecture principles
- [`docs/database.md`](docs/database.md): schema design, migration rules and local database setup
- [`docs/websocket.md`](docs/websocket.md): real-time events and socket authentication

## Status

The Student, Faculty and HOD portals are complete. The Admin portal is in progress (dashboard, student, faculty and department management, attendance monitoring). In-app notifications are planned next.
