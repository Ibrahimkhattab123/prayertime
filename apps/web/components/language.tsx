'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  isValidElement,
  cloneElement,
  Children,
  type ReactNode,
  type ReactElement,
} from 'react';
import {
  LANGUAGE_KEY,
  getLanguage,
  translate,
  type Language,
} from '@/lib/i18n';
const Context = createContext({
  language: 'en' as Language,
  setLanguage: (_language: Language) => {},
});
export const useLanguage = () => useContext(Context);
export function LanguageProvider({
  children,
  initialLanguage = 'en',
}: {
  children: ReactNode;
  initialLanguage?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  useEffect(() => {
    let saved;
    try {
      saved = localStorage.getItem(LANGUAGE_KEY);
    } catch {}
    setLanguageState(getLanguage(saved ?? navigator.language.split('-')[0]));
  }, []);
  useEffect(() => {
    document.title = translate('PrayerTime · Daily prayer timetable', language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);
  const setLanguage = (value: Language) => {
    setLanguageState(value);
    try {
      localStorage.setItem(LANGUAGE_KEY, value);
    } catch {}
  };
  return (
    <Context.Provider value={{ language, setLanguage }}>
      {children}
    </Context.Provider>
  );
}
export function LanguagePicker() {
  const { language, setLanguage } = useLanguage();
  return (
    <label className="theme-picker">
      <span>{translate('Language', language)}</span>
      <select
        aria-label={translate('Language', language)}
        value={language}
        onChange={(e) => setLanguage(getLanguage(e.target.value))}
      >
        <option value="en">English</option>
        <option value="de">Deutsch</option>
        <option value="ar">العربية</option>
      </select>
    </label>
  );
}
/** Translate presentation nodes, never input values, profile IDs or raw records. */
export function Localized({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  function walk(node: ReactNode): ReactNode {
    if (typeof node === 'string') return translate(node, language);
    if (Array.isArray(node)) return Children.map(node, walk);
    if (!isValidElement(node)) return node;
    const element = node as ReactElement<Record<string, unknown>>;
    if (
      element.type === 'pre' ||
      element.type === 'code' ||
      element.props.translate === 'no'
    )
      return node;
    const props: Record<string, unknown> = {};
    for (const key of ['title', 'placeholder', 'aria-label', 'label'])
      if (typeof element.props[key] === 'string')
        props[key] = translate(element.props[key] as string, language);
    if (
      element.props.children !== undefined &&
      typeof element.props.children !== 'function'
    )
      props.children = walk(element.props.children as ReactNode);
    return cloneElement(element, props);
  }
  return <>{walk(children)}</>;
}
