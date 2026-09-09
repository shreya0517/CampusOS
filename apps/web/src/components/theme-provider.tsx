'use client';
import { createContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
type Theme = 'light' | 'dark';
export const ThemeContext = createContext<{ theme: Theme; toggleTheme(): void }>({ theme: 'light', toggleTheme: () => undefined });
export function ThemeProvider({ children }: { children: ReactNode }) { const [theme, setTheme] = useState<Theme>('light'); useEffect(() => { const saved = window.localStorage.getItem('campusos-theme') as Theme | null; setTheme(saved ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')); }, []); useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]); const toggleTheme = () => setTheme((current) => { const next = current === 'light' ? 'dark' : 'light'; window.localStorage.setItem('campusos-theme', next); return next; }); return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>; }
