'use client';
import { useEffect, useState } from 'react';
import {
  THEME_KEY,
  themePreference,
  isDarkTheme,
  type ThemePreference,
} from '@/lib/theme';
export function ThemePicker() {
  const [preference, setPreference] = useState<ThemePreference | null>(null);
  useEffect(() => {
    let current: ThemePreference = 'system';
    try {
      current = themePreference(localStorage.getItem(THEME_KEY));
    } catch {}
    setPreference(current);
  }, []);
  useEffect(() => {
    if (preference === null) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = isDarkTheme(preference, media.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key === THEME_KEY || e.key === null)
        setPreference(themePreference(e.newValue));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return (
    <label className="theme-picker">
      <span>Theme</span>
      <select
        aria-label="Colour theme"
        value={preference ?? 'system'}
        onChange={(e) => {
          const next = themePreference(e.target.value);
          setPreference(next);
          try {
            localStorage.setItem(THEME_KEY, next);
          } catch {}
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
