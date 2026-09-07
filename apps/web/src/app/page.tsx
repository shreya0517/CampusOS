export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <section className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          CampusOS
        </p>
        <h1 className="mt-4 text-4xl font-bold text-slate-900">
          Repository foundation ready for product development
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          This placeholder page exists only to verify the frontend build pipeline. Business
          features will be added in later phases.
        </p>
      </section>
    </main>
  );
}
