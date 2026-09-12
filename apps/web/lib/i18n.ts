import messages from './locales/messages.json' with { type: 'json' };
import templates from './locales/templates.json' with { type: 'json' };
export type Language = 'en' | 'de' | 'ar';
export const LANGUAGE_KEY = 'prayertime-language-v1';
export const localeFor = (language: Language) =>
  ({ en: 'en-GB', de: 'de-DE', ar: 'ar' })[language];
export const getLanguage = (value: unknown): Language =>
  value === 'de' || value === 'ar' ? value : 'en';
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const catalogue = messages as Record<string, string[]>;
const patterns = Object.entries(templates as Record<string, string[]>).map(
  ([key, values]) => ({
    expression: new RegExp(
      '^' +
        normalize(key)
          .split(/\{\d+\}/)
          .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('(.*?)') +
        '$',
    ),
    values,
  }),
);
export function translate(text: string, language: Language, depth = 0): string {
  if (language === 'en' || !text.trim() || depth > 3) return text;
  const key = normalize(text),
    index = language === 'de' ? 0 : 1;
  let value = catalogue[key]?.[index];
  if (!value) {
    for (const pattern of patterns) {
      const match = key.match(pattern.expression);
      if (match) {
        value = pattern.values[index].replace(/\{(\d+)\}/g, (_, n) =>
          translate(match[Number(n) + 1], language, depth + 1),
        );
        break;
      }
    }
  }
  if (value === undefined) {
    const error = key.match(/^([A-Z_]+): (.*)$/);
    if (error)
      value =
        translate(error[1], language, depth + 1) +
        ': ' +
        translate(error[2], language, depth + 1);
  }
  if (value === undefined) return text;
  return (
    (text.match(/^\s*/)?.[0] ?? '') + value + (text.match(/\s*$/)?.[0] ?? '')
  );
}
