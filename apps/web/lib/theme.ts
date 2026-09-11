export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_KEY = 'prayertime-theme-v1';
export function themePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}
export function isDarkTheme(preference: ThemePreference, systemDark: boolean) {
  return preference === 'dark' || (preference === 'system' && systemDark);
}
// Runs before paint; storage may be blocked without preventing system theme detection.
export const themeBootstrap = `(function(){var p='system';try{p=localStorage.getItem('${THEME_KEY}')||p}catch(e){}var d=p==='dark'||(p!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'})()`;
