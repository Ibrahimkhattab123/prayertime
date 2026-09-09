import type { Metadata } from 'next';
import './globals.css';
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
