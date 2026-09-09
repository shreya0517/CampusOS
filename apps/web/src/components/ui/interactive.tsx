'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { Button } from './button';

export function Dialog({ open, title, description, onClose, children }: { open: boolean; title: string; description?: string; onClose(): void; children: ReactNode }) {
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement;
    const focusable = dialogRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    focusable?.focus();
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); returnFocusRef.current?.focus(); };
  }, [onClose, open]);

  if (!open) return null;
  return <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className="w-full max-w-lg rounded-[var(--radius)] bg-[hsl(var(--card))] p-5 shadow-xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><h2 id={titleId} className="text-lg font-semibold">{title}</h2>{description && <p id={descriptionId} className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{description}</p>}</div><button className="text-sm font-semibold" aria-label="Close dialog" onClick={onClose}>Close</button></div><div className="mt-5">{children}</div></section></div>;
}

type Tab = { id: string; label: string; content: ReactNode; disabled?: boolean };
export function Tabs({ tabs }: { tabs: Tab[] }) {
  const initial = tabs.find((tab) => !tab.disabled)?.id ?? '';
  const [active, setActive] = useState(initial);
  const idPrefix = useId();
  const enabledTabs = tabs.filter((tab) => !tab.disabled);
  const select = (id: string) => setActive(id);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, tab: Tab) => {
    const index = enabledTabs.findIndex((item) => item.id === tab.id);
    const targetIndex = event.key === 'ArrowRight' ? (index + 1) % enabledTabs.length : event.key === 'ArrowLeft' ? (index - 1 + enabledTabs.length) % enabledTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? enabledTabs.length - 1 : -1;
    if (targetIndex < 0) return;
    event.preventDefault();
    const target = enabledTabs[targetIndex]!;
    select(target.id);
    document.getElementById(`${idPrefix}-${target.id}-tab`)?.focus();
  };
  const current = tabs.find((tab) => tab.id === active);
  return <div><div role="tablist" aria-label="Foundation content sections" className="flex overflow-x-auto border-b">{tabs.map((tab) => <button key={tab.id} id={`${idPrefix}-${tab.id}-tab`} role="tab" aria-selected={active === tab.id} aria-controls={`${idPrefix}-${tab.id}-panel`} tabIndex={active === tab.id ? 0 : -1} disabled={tab.disabled} className={`shrink-0 px-3 py-2 text-sm font-semibold ${active === tab.id ? 'border-b-2 border-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`} onClick={() => select(tab.id)} onKeyDown={(event) => onKeyDown(event, tab)}>{tab.label}</button>)}</div>{current && <div id={`${idPrefix}-${current.id}-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-${current.id}-tab`} className="py-4">{current.content}</div>}</div>;
}

export function Dropdown({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener('mousedown', closeOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('mousedown', closeOutside); window.removeEventListener('keydown', handleKeyDown); };
  }, [open]);
  return <div ref={rootRef} className="relative inline-block"><Button ref={triggerRef} variant="outline" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((value) => !value)}>{label}</Button>{open && <div id={menuId} role="menu" className="absolute right-0 z-10 mt-2 min-w-40 rounded-[var(--radius)] border bg-[hsl(var(--card))] p-1 shadow-lg" onClick={() => setOpen(false)}>{children}</div>}</div>;
}

export function MenuItem({ children, onSelect, destructive = false }: { children: ReactNode; onSelect(): void; destructive?: boolean }) { return <button role="menuitem" className={`block w-full rounded px-3 py-2 text-left text-sm hover:bg-[hsl(var(--muted))] ${destructive ? 'text-[hsl(var(--destructive))]' : ''}`} onClick={onSelect}>{children}</button>; }

export function Toast({ message, tone = 'info', onDismiss }: { message: string; tone?: 'success' | 'error' | 'warning' | 'info'; onDismiss(): void }) { const color = tone === 'error' ? 'border-[hsl(var(--destructive))]' : tone === 'warning' ? 'border-amber-500' : tone === 'success' ? 'border-emerald-600' : 'border-[hsl(var(--primary))]'; return <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-center justify-between gap-4 rounded-[var(--radius)] border bg-[hsl(var(--card))] p-3 text-sm shadow-lg ${color}`}><span>{message}</span><button aria-label="Dismiss notification" onClick={onDismiss}>Dismiss</button></div>; }
