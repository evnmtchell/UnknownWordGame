import { englishLocale } from "./en"
import { spanishLocale } from "./es"
import type { LocaleCode, LocaleConfig } from "./types"

export type { LocaleCode, LocaleConfig } from "./types"

export const LOCALE_CONFIGS: Record<LocaleCode, LocaleConfig> = {
  en: englishLocale,
  es: spanishLocale,
}

export function getLocaleConfig(locale: LocaleCode): LocaleConfig {
  return LOCALE_CONFIGS[locale] ?? englishLocale
}

export function getLocaleFromBrowserLanguage(language: string | undefined | null): LocaleCode | null {
  if (!language) return null
  const normalized = language.toLowerCase()

  for (const [code, config] of Object.entries(LOCALE_CONFIGS) as Array<[LocaleCode, LocaleConfig]>) {
    if (config.browserLanguagePrefixes.some((prefix) => normalized.startsWith(prefix))) {
      return code
    }
  }

  return null
}
