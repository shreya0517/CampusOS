'use client';

import { useState } from 'react';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { Dialog, Dropdown, MenuItem, Tabs, Toast } from '@/components/ui/interactive';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableCell, TableHead } from '@/components/ui/table';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

type ToastNotice = {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'warning' | 'info';
};

// ---------------------------------------------------------------------------
// Section scaffold helpers
// ---------------------------------------------------------------------------

function SectionHeading({
  title,
  description,
  tag,
}: {
  title: string;
  description: string;
  tag: string;
}) {
  return (
    <div className="mb-4 border-b pb-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <code className="rounded bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
          {tag}
        </code>
      </div>
      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{description}</p>
    </div>
  );
}

function VariantRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
        {label}
      </span>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section components (keep state local to each)
// ---------------------------------------------------------------------------

function ColorsSection() {
  const tokens: Array<{ name: string; bg: string; text: string }> = [
    { name: '--primary', bg: 'bg-[hsl(var(--primary))]', text: 'text-[hsl(var(--primary-foreground))]' },
    { name: '--secondary', bg: 'bg-[hsl(var(--secondary))]', text: 'text-[hsl(var(--secondary-foreground))]' },
    { name: '--muted', bg: 'bg-[hsl(var(--muted))]', text: 'text-[hsl(var(--muted-foreground))]' },
    { name: '--accent', bg: 'bg-[hsl(var(--accent))]', text: 'text-[hsl(var(--accent-foreground))]' },
    { name: '--destructive', bg: 'bg-[hsl(var(--destructive))]', text: 'text-white' },
    { name: '--card', bg: 'bg-[hsl(var(--card))] border', text: 'text-[hsl(var(--card-foreground))]' },
    { name: '--background', bg: 'bg-[hsl(var(--background))] border', text: 'text-[hsl(var(--foreground))]' },
    { name: '--sidebar', bg: 'bg-[hsl(var(--sidebar))]', text: 'text-[hsl(var(--sidebar-foreground))]' },
  ];
  return (
    <section aria-labelledby="colors-heading">
      <SectionHeading
        title="Colors & Theme"
        description="CSS custom property tokens consumed by every component. Toggle dark/light in the header to preview both themes."
        tag="globals.css / tailwind"
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
        {tokens.map(({ name, bg, text }) => (
          <div
            key={name}
            className={`rounded-[var(--radius)] p-4 text-center ${bg}`}
          >
            <span className={`text-xs font-semibold ${text}`}>{name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TypographySection() {
  return (
    <section aria-labelledby="typography-heading">
      <SectionHeading
        title="Typography"
        description="Font scale applied via Tailwind utility classes. No custom font wrappers — classes are applied directly."
        tag="Tailwind / Inter"
      />
      <div className="grid gap-4">
        <VariantRow label="text-3xl">
          <span className="text-3xl font-semibold">Heading — 3xl / semibold</span>
        </VariantRow>
        <VariantRow label="text-xl">
          <span className="text-xl font-semibold">Heading — xl / semibold</span>
        </VariantRow>
        <VariantRow label="text-lg">
          <span className="text-lg font-semibold">Heading — lg / semibold (CardTitle default)</span>
        </VariantRow>
        <VariantRow label="text-base">
          <span className="text-base">Body — base / normal</span>
        </VariantRow>
        <VariantRow label="text-sm">
          <span className="text-sm">Body — sm / normal (most UI copy)</span>
        </VariantRow>
        <VariantRow label="text-xs">
          <span className="text-xs uppercase tracking-wide font-semibold text-[hsl(var(--muted-foreground))]">
            Label / caption — xs / uppercase / tracking
          </span>
        </VariantRow>
        <VariantRow label="muted">
          <span className="text-sm text-[hsl(var(--muted-foreground))]">
            Secondary / helper text colour via --muted-foreground
          </span>
        </VariantRow>
        <VariantRow label="primary">
          <span className="text-sm font-semibold text-[hsl(var(--primary))]">
            Accent / highlight text via --primary
          </span>
        </VariantRow>
        <VariantRow label="code">
          <code className="rounded bg-[hsl(var(--muted))] px-2 py-0.5 text-xs">
            inline code snippet
          </code>
        </VariantRow>
      </div>
    </section>
  );
}

function ButtonsSection({ notify }: { notify: (m: string, t?: ToastNotice['tone']) => void }) {
  return (
    <section aria-labelledby="buttons-heading">
      <SectionHeading
        title="Buttons"
        description="Single Button component with variant, loading, and disabled props. Minimum height 40px for touch targets."
        tag="@/components/ui/button"
      />
      <div className="grid gap-4">
        <VariantRow label="variant">
          <Button onClick={() => notify('Primary clicked.', 'success')}>Primary</Button>
          <Button variant="secondary" onClick={() => notify('Secondary clicked.')}>Secondary</Button>
          <Button variant="outline" onClick={() => notify('Outline clicked.')}>Outline</Button>
          <Button variant="ghost" onClick={() => notify('Ghost clicked.')}>Ghost</Button>
          <Button variant="destructive" onClick={() => notify('Destructive clicked.', 'warning')}>Destructive</Button>
        </VariantRow>
        <VariantRow label="state">
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
        </VariantRow>
        <VariantRow label="size hint">
          <Button className="text-xs px-3 min-h-8">Small (custom class)</Button>
          <Button>Medium (default)</Button>
          <Button className="text-base px-6 min-h-12">Large (custom class)</Button>
        </VariantRow>
      </div>
    </section>
  );
}

function FormsSection({ notify }: { notify: (m: string, t?: ToastNotice['tone']) => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (name.trim() && category) {
      notify('Form submitted successfully.', 'success');
    }
  };

  return (
    <section aria-labelledby="forms-heading">
      <SectionHeading
        title="Forms"
        description="Input and Select wrap a label + field + description + error into one composable unit. Validation messages use role=alert."
        tag="@/components/ui/form-field"
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Input variants</CardTitle>
            <CardDescription>Default, description, error, and disabled states.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Input label="Default input" placeholder="Type something…" onChange={() => undefined} />
            <Input
              label="With description"
              description="Helper text appears below the field."
              placeholder="Type something…"
              onChange={() => undefined}
            />
            <Input
              label="Error state"
              error="This field is required."
              value=""
              onChange={() => undefined}
              required
            />
            <Input
              label="Disabled"
              disabled
              value="Readonly example value"
              onChange={() => undefined}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Validated form</CardTitle>
            <CardDescription>Submit shows inline errors when required fields are empty.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
              <Input
                label="Display name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                description="Any non-empty string is valid."
                error={submitted && !name.trim() ? 'Display name is required.' : undefined}
              />
              <Select
                label="Example category"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                error={submitted && !category ? 'Select a category.' : undefined}
              >
                <option value="" disabled>Choose an option</option>
                <option value="one">Option A</option>
                <option value="two">Option B</option>
              </Select>
              <Button type="submit">Submit</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function CardsSection() {
  return (
    <section aria-labelledby="cards-heading">
      <SectionHeading
        title="Cards"
        description="Neutral container with Header, Title, Description, Content, and Footer sub-components."
        tag="@/components/ui/card"
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Header + Content</CardTitle>
            <CardDescription>The minimal composition — header with title and description, then a content area.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              CardContent receives any child nodes. Padding is 1.25rem on all sides.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>With Footer</CardTitle>
            <CardDescription>CardFooter adds a bordered bottom row for actions.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Useful for dialogs, confirmation cards, or detail panels.
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="ml-auto">Action</Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Minimal (no description)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              CardDescription is optional — omit it when the title alone is sufficient.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function TablesPaginationSection() {
  const [page, setPage] = useState(1);
  const rows = [
    { id: 1, name: 'Alpha row', status: 'Active' },
    { id: 2, name: 'Beta row', status: 'Pending' },
    { id: 3, name: 'Gamma row', status: 'Inactive' },
  ];

  return (
    <section aria-labelledby="tables-heading">
      <SectionHeading
        title="Tables & Pagination"
        description="Table wraps a scrollable table with consistent cell and head styles. Pagination renders previous/next plus numbered page buttons."
        tag="@/components/ui/table · @/components/ui/pagination"
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <thead>
              <tr>
                <TableHead>#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Current page</TableHead>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <TableCell>{row.id}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>
                    <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs font-semibold">
                      {row.status}
                    </span>
                  </TableCell>
                  <TableCell>{row.id === page ? '← active' : '—'}</TableCell>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
        <CardFooter>
          <Pagination page={page} pageCount={3} onPageChange={setPage} />
        </CardFooter>
      </Card>
    </section>
  );
}

function DialogsSection({ notify }: { notify: (m: string, t?: ToastNotice['tone']) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <section aria-labelledby="dialogs-heading">
      <SectionHeading
        title="Dialogs"
        description="Modal with focus trap, Escape to close, backdrop click to close, and focus restoration. Uses role=dialog + aria-modal."
        tag="@/components/ui/interactive · Dialog"
      />
      <Card>
        <CardHeader>
          <CardTitle>Confirmation dialog</CardTitle>
          <CardDescription>
            Focus moves into the dialog on open and returns to the trigger on close.
            Tab cycles within the dialog; Escape closes it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button onClick={() => setOpen(true)}>Open dialog</Button>
          <Dialog
            open={open}
            title="Confirm example action"
            description="This is a generic showcase interaction — no real data is affected."
            onClose={() => setOpen(false)}
          >
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => { setOpen(false); notify('Confirmed.', 'success'); }}>Confirm</Button>
            </div>
          </Dialog>
        </CardContent>
      </Card>
    </section>
  );
}

function TabsDropdownsSection({ notify }: { notify: (m: string, t?: ToastNotice['tone']) => void }) {
  return (
    <section aria-labelledby="tabs-heading">
      <SectionHeading
        title="Tabs & Dropdowns"
        description="Tabs use arrow-key navigation (←/→, Home, End). Dropdown closes on Escape, outside click, or item selection."
        tag="@/components/ui/interactive · Tabs · Dropdown · MenuItem"
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tabs</CardTitle>
            <CardDescription>
              Three tabs — two enabled, one disabled. Arrow keys cycle between enabled tabs only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              tabs={[
                {
                  id: 'overview',
                  label: 'Overview',
                  content: (
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                      Overview panel is active. Content is rendered in a <code>role=tabpanel</code>.
                    </p>
                  ),
                },
                {
                  id: 'details',
                  label: 'Details',
                  content: (
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                      Details panel is active. The previous tab is now hidden from the DOM.
                    </p>
                  ),
                },
                {
                  id: 'disabled',
                  label: 'Unavailable',
                  content: null,
                  disabled: true,
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dropdown menu</CardTitle>
            <CardDescription>
              Trigger has <code>aria-haspopup=menu</code>. Items are <code>role=menuitem</code> buttons.
              The destructive item renders in the destructive colour.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Dropdown label="Actions">
              <MenuItem onSelect={() => notify('View selected.')}>View</MenuItem>
              <MenuItem onSelect={() => notify('Edit selected.')}>Edit</MenuItem>
              <MenuItem onSelect={() => notify('Duplicate selected.')}>Duplicate</MenuItem>
              <MenuItem destructive onSelect={() => notify('Delete selected.', 'warning')}>Delete</MenuItem>
            </Dropdown>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function ToastsSection({ notify }: { notify: (m: string, t?: ToastNotice['tone']) => void }) {
  return (
    <section aria-labelledby="toasts-heading">
      <SectionHeading
        title="Toasts"
        description="Dismissible notifications stack at the bottom-right. Errors use role=alert; others use role=status."
        tag="@/components/ui/interactive · Toast"
      />
      <Card>
        <CardHeader>
          <CardTitle>Toast tones</CardTitle>
          <CardDescription>Each button fires a toast in a different semantic tone.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => notify('Success — operation completed.', 'success')}>Success</Button>
          <Button variant="outline" onClick={() => notify('Info — here is some information.')}>Info</Button>
          <Button variant="outline" onClick={() => notify('Warning — proceed with caution.', 'warning')}>Warning</Button>
          <Button variant="destructive" onClick={() => notify('Error — something went wrong.', 'error')}>Error</Button>
        </CardContent>
      </Card>
    </section>
  );
}

function SkeletonsSection() {
  const [loading, setLoading] = useState(false);

  const trigger = () => {
    setLoading(true);
    window.setTimeout(() => setLoading(false), 900);
  };

  return (
    <section aria-labelledby="skeletons-heading">
      <SectionHeading
        title="Loading / Skeletons"
        description="Skeleton is an animate-pulse placeholder. Use aria-live=polite on the container so screen readers announce when content loads."
        tag="@/components/feedback/states · Skeleton"
      />
      <Card>
        <CardHeader>
          <CardTitle>Skeleton pulse</CardTitle>
          <CardDescription>Click to trigger a 900 ms skeleton loading state.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div aria-live="polite" className="grid gap-3">
              <span className="sr-only">Loading example content…</span>
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-5 w-3/5" />
              <div className="grid grid-cols-3 gap-3 pt-1">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Content is visible. Click the button to replay the skeleton.</p>
              <Button className="w-fit" onClick={trigger}>Trigger skeleton</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function ErrorStatesSection({ notify }: { notify: (m: string, t?: ToastNotice['tone']) => void }) {
  const [hasError, setHasError] = useState(true);

  return (
    <section aria-labelledby="error-states-heading">
      <SectionHeading
        title="Error States"
        description="ErrorState renders with role=alert. The optional onRetry callback shows a Retry button. Use inside Card content areas."
        tag="@/components/feedback/states · ErrorState"
      />
      <Card>
        <CardHeader>
          <CardTitle>Error state</CardTitle>
          <CardDescription>Retry dismisses the error in this showcase.</CardDescription>
        </CardHeader>
        <CardContent>
          {hasError ? (
            <ErrorState
              message="An example error occurred. The retry action clears this state locally."
              onRetry={() => { setHasError(false); notify('Error cleared. State recovered.', 'success'); }}
            />
          ) : (
            <div className="grid gap-3">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">State recovered successfully.</p>
              <Button variant="outline" className="w-fit" onClick={() => setHasError(true)}>Reset to error</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function EmptyStatesSection({ notify }: { notify: (m: string, t?: ToastNotice['tone']) => void }) {
  const [hasItems, setHasItems] = useState(false);

  return (
    <section aria-labelledby="empty-states-heading">
      <SectionHeading
        title="Empty States"
        description="EmptyState is a dashed-border placeholder with a title, description, and an optional action slot."
        tag="@/components/feedback/states · EmptyState"
      />
      <Card>
        <CardHeader>
          <CardTitle>Empty state</CardTitle>
          <CardDescription>The action button creates an item and reveals the non-empty state.</CardDescription>
        </CardHeader>
        <CardContent>
          {hasItems ? (
            <div className="grid gap-3">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">An example item exists. Clear it to see the empty state again.</p>
              <Button variant="outline" className="w-fit" onClick={() => setHasItems(false)}>Clear item</Button>
            </div>
          ) : (
            <EmptyState
              title="No items yet"
              description="Empty states are domain-neutral. Replace the title, description, and action with real context."
              action={
                <Button onClick={() => { setHasItems(true); notify('Example item created.', 'success'); }}>
                  Create example item
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function NavigationLayoutSection() {
  return (
    <section aria-labelledby="nav-heading">
      <SectionHeading
        title="Navigation / Layout"
        description="AppShell renders a responsive sidebar + header shell. Below is a static representation of the structural tokens."
        tag="@/components/layout/app-shell"
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sidebar token colours</CardTitle>
            <CardDescription>The sidebar uses --sidebar and --sidebar-foreground CSS tokens.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <div className="flex items-center gap-3 rounded-[var(--radius)] bg-[hsl(var(--sidebar))] px-4 py-3">
              <span className="text-sm font-semibold text-[hsl(var(--sidebar-foreground))]">
                --sidebar background
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-[var(--radius)] bg-white/15 px-4 py-3">
              <span className="text-sm font-semibold text-[hsl(var(--sidebar-foreground))]">
                Active nav item — bg-white/15
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-[var(--radius)] px-4 py-3 hover:bg-white/10">
              <span className="text-sm font-semibold text-[hsl(var(--sidebar-foreground))]">
                Hover nav item — bg-white/10
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Role badge colours</CardTitle>
            <CardDescription>
              Each role gets a distinct badge colour displayed in the header. Purely presentational.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {[
              { label: 'Admin', className: 'bg-purple-600 text-white' },
              { label: 'HOD', className: 'bg-amber-600 text-white' },
              { label: 'Faculty', className: 'bg-blue-600 text-white' },
              { label: 'Student', className: 'bg-green-600 text-white' },
              { label: 'User', className: 'bg-gray-500 text-white' },
            ].map(({ label, className }) => (
              <span
                key={label}
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${className}`}
              >
                {label}
              </span>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Root playground component
// ---------------------------------------------------------------------------

export function FoundationPlayground() {
  const [notices, setNotices] = useState<ToastNotice[]>([]);

  const notify = (message: string, tone: ToastNotice['tone'] = 'info') =>
    setNotices((current) => [...current, { id: Date.now(), message, tone }]);

  const dismiss = (id: number) =>
    setNotices((current) => current.filter((n) => n.id !== id));

  return (
    <div className="grid gap-10">
      {/* Page header */}
      <section>
        <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
          Design System
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Foundation Showcase</h1>
        <p className="mt-2 max-w-2xl text-[hsl(var(--muted-foreground))]">
          Every component below is a working, self-contained example. No application or business
          data appears here — this page exists solely to document and verify the shared UI
          primitives.
        </p>
      </section>

      <ColorsSection />
      <TypographySection />
      <ButtonsSection notify={notify} />
      <FormsSection notify={notify} />
      <CardsSection />
      <TablesPaginationSection />
      <DialogsSection notify={notify} />
      <TabsDropdownsSection notify={notify} />
      <ToastsSection notify={notify} />
      <SkeletonsSection />
      <ErrorStatesSection notify={notify} />
      <EmptyStatesSection notify={notify} />
      <NavigationLayoutSection />

      {/* Toast container */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 right-4 z-40 grid w-[min(24rem,calc(100vw-2rem))] gap-2"
      >
        {notices.map((notice) => (
          <Toast
            key={notice.id}
            message={notice.message}
            tone={notice.tone}
            onDismiss={() => dismiss(notice.id)}
          />
        ))}
      </div>
    </div>
  );
}