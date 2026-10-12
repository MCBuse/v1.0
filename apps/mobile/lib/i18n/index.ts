import { en } from './en';

type Translations = typeof en;

const translations: Record<string, Translations> = { en };

let currentLocale = 'en';

export function setLocale(locale: string) {
  if (translations[locale]) {
    currentLocale = locale;
  }
}

export function getLocale(): string {
  return currentLocale;
}

type PathsToStringValues<T, Prefix extends string = ''> = T extends string
  ? Prefix
  : {
      [K in keyof T & string]: PathsToStringValues<
        T[K],
        Prefix extends '' ? K : `${Prefix}.${K}`
      >;
    }[keyof T & string];

export type TranslationKey = PathsToStringValues<Translations>;

export function t(key: string): string {
  const parts = key.split('.');
  let current: unknown = translations[currentLocale] ?? translations.en;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  return typeof current === 'string' ? current : key;
}

export { en };
