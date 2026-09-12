/*
 * Pabs Chess — free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from './LanguageSwitcher.tsx'
import { LicenseNotice } from './LicenseNotice.tsx'

export function App() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('app.title')}</h1>
          <p className="text-sm text-slate-400">{t('app.tagline')}</p>
        </div>
        <LanguageSwitcher />
      </header>

      <main className="flex-1" />

      <LicenseNotice />
    </div>
  )
}
