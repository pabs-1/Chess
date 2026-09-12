/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

/**
 * i18n bootstrap.
 *
 * Italian is the reference language: it is the fallback, and `it.json` is the
 * file that types every translation key (see i18next.d.ts). Adding a language
 * means adding a locale file and one entry in `resources` — nothing else.
 *
 * No user-facing string may live outside src/i18n/locales/.
 */

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import it from './locales/it.json'
import en from './locales/en.json'

export const defaultNS = 'translation'

export const resources = {
  it: { translation: it },
  en: { translation: en },
} as const

export const supportedLanguages = ['it', 'en'] as const
export type SupportedLanguage = (typeof supportedLanguages)[number]

const LANGUAGE_STORAGE_KEY = 'pabs-chess.language'

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (supportedLanguages as readonly string[]).includes(value)
}

/** Keeps <html lang> in sync, for screen readers and text rendering. */
function syncDocumentLanguage(language: string): void {
  if (typeof document !== 'undefined') document.documentElement.lang = language
}

void i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    defaultNS,
    fallbackLng: 'it',
    supportedLngs: [...supportedLanguages],
    // Accept regional tags from the browser: `it-CH` resolves to `it`.
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    interpolation: {
      // React already escapes interpolated values.
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    },
  })

syncDocumentLanguage(i18next.resolvedLanguage ?? 'it')
i18next.on('languageChanged', syncDocumentLanguage)

export default i18next
