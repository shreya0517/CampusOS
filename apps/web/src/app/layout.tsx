import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/components/auth-provider';

export const metadata: Metadata = {
  title: 'CampusOS',
  description: 'CampusOS engineering foundation',
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body><ThemeProvider><AuthProvider>{children}</AuthProvider></ThemeProvider></body>
    </html>
  );
}
