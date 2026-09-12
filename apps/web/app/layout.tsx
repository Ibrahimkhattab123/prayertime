import type { Metadata } from 'next';
import './globals.css';
import { themeBootstrap } from '@/lib/theme';
import { LanguageProvider } from '@/components/language';
export const metadata: Metadata = {
  title: 'PrayerTime · Daily prayer timetable',
  description:
    'Local prayer-time calculations with transparent methods, high-latitude estimates and offline support.',
  manifest: '/manifest.webmanifest',
  applicationName: 'PrayerTime',
  appleWebApp: {
    capable: true,
    title: 'PrayerTime',
    statusBarStyle: 'default',
  },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#076849" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
