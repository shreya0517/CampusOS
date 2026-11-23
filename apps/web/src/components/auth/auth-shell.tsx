import type { ReactNode } from 'react';

const HIGHLIGHTS = [
  {
    title: 'Academics in one place',
    description: 'Timetables, attendance, assignments and examinations for every department.',
    icon: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20',
  },
  {
    title: 'Results you can trust',
    description: 'Marks move from faculty to HOD approval before results are published.',
    icon: 'M9 12l2 2 4-4m5.6-4.1A12 12 0 0 1 12 2.9 12 12 0 0 1 3.4 5.9 12 12 0 0 0 12 21.1a12 12 0 0 0 8.6-15.2Z',
  },
  {
    title: 'Fees and campus services',
    description: 'Invoices, receipts, announcements and visitor approvals for the whole campus.',
    icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3Z',
  },
];

/** The two-panel frame of the sign-in pages: the institution panel on large screens, and the form column. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-[hsl(var(--card))] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Institution panel */}
      <section className="relative hidden overflow-hidden bg-[hsl(221_70%_26%)] text-white lg:flex lg:flex-col lg:justify-between lg:gap-10 lg:p-12 xl:p-14">
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[.07]" aria-hidden="true">
          <defs>
            <pattern id="login-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M32 0H0v32" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#login-grid)" />
        </svg>
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[hsl(213_90%_60%)] opacity-20 blur-3xl" aria-hidden="true" />

        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 2 8l10 5 10-5-10-5Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 10.2V15c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.8M22 8v6" />
            </svg>
          </span>
          <span>
            <span className="block text-lg font-bold tracking-tight">CampusOS</span>
            <span className="block text-xs font-medium text-white/70">College Management System</span>
          </span>
        </div>

        <div className="relative max-w-lg">
          <h1 className="text-3xl font-bold leading-tight tracking-tight xl:text-4xl">
            One portal for academics, administration and campus life.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-white/75">
            Students, faculty, heads of department and administrators each get a workspace built around their responsibilities.
          </p>
          <ul className="mt-8 grid gap-5">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                </span>
                <span>
                  <span className="block font-semibold">{item.title}</span>
                  <span className="mt-0.5 block text-sm text-white/70">{item.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/55">© {new Date().getFullYear()} CampusOS · Secure access for registered college members</p>
      </section>

      {/* Sign-in panel */}
      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[26rem]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-white">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 2 8l10 5 10-5-10-5Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 10.2V15c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.8M22 8v6" />
              </svg>
            </span>
            <span className="text-lg font-bold tracking-tight">CampusOS</span>
          </div>

          {children}
        </div>
      </section>
    </div>
  );
}
