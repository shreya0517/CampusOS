'use client';
import { createContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
type Theme = 'light' | 'dark';
const THEME_KEY = 'campusos-theme';
export const ThemeContext = createContext<{ theme: Theme; toggleTheme(): void }>({ theme: 'light', toggleTheme: () => undefined });
export function ThemeProvider({ children }: { children: ReactNode }) { const [theme, setTheme] = useState<Theme>('light'); useEffect(() => { /* Light by default; dark only when the user chose it in Settings (the key is written only by that toggle, so it never holds the OS setting). */ const saved = window.localStorage.getItem(THEME_KEY) as Theme | null; setTheme(saved === 'dark' ? 'dark' : 'light'); }, []); useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]); const toggleTheme = () => setTheme((current) => { const next = current === 'light' ? 'dark' : 'light'; window.localStorage.setItem(THEME_KEY, next); return next; }); return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>; }
