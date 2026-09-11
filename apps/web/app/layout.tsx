import type { Metadata } from 'next';
import './globals.css';
import { themeBootstrap } from '@/lib/theme';
export const metadata: Metadata = {
  title: 'PrayerTime · Daily prayer timetable',
  description:
    'Local prayer-time calculations with transparent methods, high-latitude estimates and offline support.',
  manifest: '/manifest.webmanifest',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
