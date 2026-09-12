/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useTranslation } from 'react-i18next'
import { supportedLanguages } from '../i18n/index.ts'

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const current = i18n.resolvedLanguage

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-slate-400">{t('language.label')}</span>
      <div role="group" aria-label={t('language.label')} className="flex overflow-hidden rounded-md border border-slate-700">
        {supportedLanguages.map((language) => (
          <button
            key={language}
            type="button"
            aria-pressed={language === current}
            onClick={() => void i18n.changeLanguage(language)}
            className={`px-3 py-1 text-sm transition-colors ${
              language === current
                ? 'bg-slate-200 text-slate-900'
                : 'bg-transparent text-slate-300 hover:bg-slate-800'
            }`}
          >
            {t(`language.${language}`)}
          </button>
        ))}
      </div>
    </div>
  )
}
