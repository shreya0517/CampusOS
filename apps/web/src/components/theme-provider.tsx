'use client';
import { createContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
type Theme = 'light' | 'dark';
const THEME_KEY = 'campusos-theme-preference';
export const ThemeContext = createContext<{ theme: Theme; toggleTheme(): void }>({ theme: 'light', toggleTheme: () => undefined });
export function ThemeProvider({ children }: { children: ReactNode }) { const [theme, setTheme] = useState<Theme>('light'); useEffect(() => { /* Light by default for everyone; dark only when chosen in Settings. A new key so earlier automatic dark choices don't carry over. */ const saved = window.localStorage.getItem(THEME_KEY) as Theme | null; setTheme(saved === 'dark' ? 'dark' : 'light'); }, []); useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]); const toggleTheme = () => setTheme((current) => { const next = current === 'light' ? 'dark' : 'light'; window.localStorage.setItem(THEME_KEY, next); return next; }); return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>; }
