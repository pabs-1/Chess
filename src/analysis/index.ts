/*
 * Pabs Chess: free chess learning tools.
 * Copyright (C) 2026 Pabs Chess contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 * See COPYING for the full license text.
 */

export {
  formatEval,
  toEvaluation,
  winPercentFromCp,
  winPercentFromEvaluation,
  winPercentFromWdl,
} from './evaluation.ts'
export { gameAccuracy, moveAccuracy } from './accuracy.ts'
export {
  BEST_MOVE_TOLERANCE,
  CLASSIFICATION_THRESHOLDS,
  FORCED_ALTERNATIVE_GAP,
  classifyMove,
  isNoteworthy,
  type Classification,
  type ClassificationInput,
} from './classify.ts'
export {
  bestMoveOf,
  bestMoveSanOf,
  gradeMove,
  motifFor,
  terminalWinPercent,
  winPercentToMove,
  type MoveGrade,
} from './gradeMove.ts'
export type { Motif, MotifId, MotifLevel, MotifTier, PieceOnSquare } from './motifs/index.ts'
export {
  PLAY_MODES,
  isCheck,
  legalDestinations,
  makeMove,
  needsPromotion,
  outcomeOf,
  turnOf,
  type Destinations,
  type PlayMode,
  type PlayOutcome,
} from './playGame.ts'
export { gamePositions, parsePgn, type PgnParseErrorCode, type PgnParseResult } from './pgn.ts'
export {
  invertEvaluation,
  invertWdl,
  opponentOf,
  sideToMove,
  toPov,
  toWhitePov,
  winPercentFor,
} from './pov.ts'
export {
  DEFAULT_REVIEW_DEPTH,
  DEFAULT_REVIEW_MULTI_PV,
  ReviewCancelledError,
  reviewGame,
  type GameReview,
  type ReviewEngine,
  type ReviewOptions,
  type ReviewProgress,
  type ReviewedAlternative,
  type ReviewedMove,
} from './reviewGame.ts'
export type {
  Color,
  Evaluation,
  GameHeaders,
  GameMove,
  MoveClassification,
  ParsedGame,
} from './types.ts'
export { fenError, isValidFen, parseUciMove, uciMoveToSan, uciPvToSan } from './pv.ts'
