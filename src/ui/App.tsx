/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AnalysisPlayground } from './AnalysisPlayground.tsx'
import { GameReviewPage } from './GameReviewPage.tsx'
import { LanguageSwitcher } from './LanguageSwitcher.tsx'
import { PlayPage } from './PlayPage.tsx'
import { LicenseNotice } from './LicenseNotice.tsx'

/**
 * Two pages, so a state variable rather than a router: routing a pair of tabs
 * would be a dependency for something `useState` already does.
 */
const PAGES = ['review', 'play', 'playground'] as const
type Page = (typeof PAGES)[number]

export function App() {
  const { t } = useTranslation()
  const [page, setPage] = useState<Page>('review')

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('app.title')}</h1>
          <p className="text-sm text-slate-400">{t('app.tagline')}</p>
        </div>
        <LanguageSwitcher />
      </header>

      <nav className="flex gap-1 border-b border-slate-800">
        {PAGES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => setPage(candidate)}
            aria-current={page === candidate ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
              page === candidate
                ? 'border-emerald-500 text-slate-50'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t(`nav.${candidate}`)}
          </button>
        ))}
      </nav>

      <main className="flex-1">
        {page === 'review' && <GameReviewPage />}
        {page === 'play' && <PlayPage />}
        {page === 'playground' && <AnalysisPlayground />}
      </main>

      <LicenseNotice />
    </div>
  )
}
