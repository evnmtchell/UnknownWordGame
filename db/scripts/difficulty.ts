/**
 * Difficulty scoring algorithm for puzzle generation.
 *
 * Produces a score 0.0 (trivial) to 1.0 (extremely hard) from three components:
 *   - Rack difficulty (30%): vowel ratio, rare letters, blanks, synergy
 *   - Board difficulty (35%): valid placement count, anchor points, bonus access
 *   - Word obscurity (35%): frequency ranking of optimal + alternative plays
 */

import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import type { DailyPuzzle, BonusType, PuzzleCell } from "../../app/puzzles.js"
import type { LocaleCode } from "../../app/locales/index.js"
import { BLANK_TILE, LETTER_SCORES } from "../../app/scoring.js"
import { SPANISH_LETTER_SCORES } from "../../app/scoring-es.js"
import { VALID_WORDS } from "../../app/words.js"
import { SPANISH_VALID_WORDS } from "../../app/words-es.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ---------------------------------------------------------------------------
// Word frequency data (lazy-loaded)
// ---------------------------------------------------------------------------

let enFrequency: Record<string, number> | null = null
let esFrequency: Record<string, number> | null = null

function getFrequencyData(locale: LocaleCode): Record<string, number> {
  if (locale === "es") {
    if (!esFrequency) {
      const path = join(__dirname, "..", "data", "word-frequency-es.json")
      esFrequency = JSON.parse(readFileSync(path, "utf-8"))
    }
    return esFrequency!
  }
  if (!enFrequency) {
    const path = join(__dirname, "..", "data", "word-frequency-en.json")
    enFrequency = JSON.parse(readFileSync(path, "utf-8"))
  }
  return enFrequency!
}

function getWordObscurity(word: string, locale: LocaleCode): number {
  const freq = getFrequencyData(locale)
  return freq[word.toUpperCase()] ?? 0.75 // Unknown words are fairly obscure
}

// ---------------------------------------------------------------------------
// Component 1: Rack Difficulty (0.0 - 1.0)
// ---------------------------------------------------------------------------

const VOWELS = new Set(["A", "E", "I", "O", "U"])
const SPANISH_VOWELS = new Set(["A", "E", "I", "O", "U"])

const RARE_LETTER_PENALTY: Record<string, number> = {
  Q: 0.15,
  Z: 0.12,
  X: 0.10,
  J: 0.10,
  K: 0.05,
}

export function scoreRackDifficulty(rack: string[], locale: LocaleCode = "en"): number {
  if (rack.length === 0) return 0.5

  const vowelSet = locale === "es" ? SPANISH_VOWELS : VOWELS

  // Vowel ratio — ideal is ~0.4, deviation increases difficulty
  const vowelCount = rack.filter((t) => vowelSet.has(t)).length
  const vowelRatio = vowelCount / rack.length
  const idealRatio = 0.4
  // Score: 0 when ideal, up to 0.4 at extremes
  const vowelScore = Math.min(0.4, Math.abs(vowelRatio - idealRatio) * 2)

  // Rare letters
  let rareScore = 0
  for (const tile of rack) {
    rareScore += RARE_LETTER_PENALTY[tile] || 0
  }
  rareScore = Math.min(0.5, rareScore)

  // Blanks reduce difficulty
  const blankCount = rack.filter((t) => t === BLANK_TILE).length
  const blankReduction = blankCount * 0.10

  // Synergy: Q without U
  const hasQ = rack.includes("Q")
  const hasU = rack.includes("U")
  const synergyPenalty = hasQ && !hasU ? 0.15 : 0

  const raw = vowelScore + rareScore + synergyPenalty - blankReduction
  return Math.max(0, Math.min(1, raw))
}

// ---------------------------------------------------------------------------
// Component 2: Board Difficulty (0.0 - 1.0)
// ---------------------------------------------------------------------------

function getAnchorPoints(puzzle: DailyPuzzle): Set<string> {
  const occupied = new Set(
    puzzle.filledCells.map((c) => `${c.row},${c.col}`)
  )
  const anchors = new Set<string>()

  for (const cell of puzzle.filledCells) {
    const neighbors = [
      [cell.row - 1, cell.col],
      [cell.row + 1, cell.col],
      [cell.row, cell.col - 1],
      [cell.row, cell.col + 1],
    ]
    for (const [r, c] of neighbors) {
      if (r >= 0 && r < puzzle.boardSize && c >= 0 && c < puzzle.boardSize) {
        const key = `${r},${c}`
        if (!occupied.has(key)) {
          anchors.add(key)
        }
      }
    }
  }

  return anchors
}

function countBonusAccessibility(puzzle: DailyPuzzle, anchors: Set<string>): number {
  if (puzzle.bonusCells.length === 0) return 0

  let accessible = 0
  for (const bonus of puzzle.bonusCells) {
    const key = `${bonus.row},${bonus.col}`
    // Check if this bonus cell is an anchor or within 1 step of an anchor
    if (anchors.has(key)) {
      accessible++
      continue
    }
    const neighbors = [
      `${bonus.row - 1},${bonus.col}`,
      `${bonus.row + 1},${bonus.col}`,
      `${bonus.row},${bonus.col - 1}`,
      `${bonus.row},${bonus.col + 1}`,
    ]
    if (neighbors.some((n) => anchors.has(n))) {
      accessible++
    }
  }

  return accessible / puzzle.bonusCells.length
}

/**
 * Count valid placements by trying all words at all positions.
 * This is the most expensive part of difficulty scoring — essentially a
 * lightweight solver pass. We count valid placements rather than scoring them.
 */
export function countValidPlacements(puzzle: DailyPuzzle, locale: LocaleCode = "en"): number {
  const wordSet = locale === "es" ? SPANISH_VALID_WORDS : VALID_WORDS
  const filledMap = new Map(
    puzzle.filledCells.map((c) => [`${c.row},${c.col}`, c.letter])
  )
  const rackCounts: Record<string, number> = {}
  for (const tile of puzzle.rack) {
    rackCounts[tile] = (rackCounts[tile] || 0) + 1
  }

  const words = Array.from(wordSet).filter(
    (w) => typeof w === "string" && w.length >= 2 && w.length <= puzzle.boardSize
  )

  let validCount = 0

  for (const word of words) {
    for (let row = 0; row < puzzle.boardSize; row++) {
      for (let col = 0; col < puzzle.boardSize; col++) {
        for (const dir of ["row", "col"] as const) {
          if (canPlaceWord(puzzle, filledMap, rackCounts, word, row, col, dir, wordSet)) {
            validCount++
          }
        }
      }
    }
  }

  return validCount
}

function canPlaceWord(
  puzzle: DailyPuzzle,
  filledMap: Map<string, string>,
  originalRackCounts: Record<string, number>,
  word: string,
  startRow: number,
  startCol: number,
  direction: "row" | "col",
  wordSet: Set<string>
): boolean {
  const rackCounts = { ...originalRackCounts }
  let touchesExisting = false
  let tilesPlaced = 0

  for (let i = 0; i < word.length; i++) {
    const row = direction === "row" ? startRow : startRow + i
    const col = direction === "row" ? startCol + i : startCol

    if (row < 0 || row >= puzzle.boardSize || col < 0 || col >= puzzle.boardSize) {
      return false
    }

    const key = `${row},${col}`
    const boardLetter = filledMap.get(key)
    const wordLetter = word[i]

    if (boardLetter) {
      if (boardLetter !== wordLetter) return false
      touchesExisting = true
    } else {
      if (rackCounts[wordLetter] && rackCounts[wordLetter] > 0) {
        rackCounts[wordLetter]--
        tilesPlaced++
      } else if (rackCounts[BLANK_TILE] && rackCounts[BLANK_TILE] > 0) {
        rackCounts[BLANK_TILE]--
        tilesPlaced++
      } else {
        return false
      }

      // Check cross words formed by this tile
      const crossDir = direction === "row" ? "col" : "row"
      const crossWord = getCrossWordAt(puzzle, filledMap, row, col, wordLetter, crossDir)
      if (crossWord && crossWord.length > 1 && !wordSet.has(crossWord)) {
        return false
      }
    }
  }

  if (tilesPlaced === 0) return false
  if (!touchesExisting) {
    // Check adjacency of placed tiles to existing tiles
    for (let i = 0; i < word.length; i++) {
      const row = direction === "row" ? startRow : startRow + i
      const col = direction === "row" ? startCol + i : startCol
      if (filledMap.has(`${row},${col}`)) continue
      const neighbors = [
        [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1],
      ]
      for (const [nr, nc] of neighbors) {
        if (filledMap.has(`${nr},${nc}`)) {
          touchesExisting = true
          break
        }
      }
      if (touchesExisting) break
    }
  }

  // Check no letters immediately before/after the word
  if (direction === "row") {
    if (startCol > 0 && filledMap.has(`${startRow},${startCol - 1}`)) return false
    const endCol = startCol + word.length
    if (endCol < puzzle.boardSize && filledMap.has(`${startRow},${endCol}`)) return false
  } else {
    if (startRow > 0 && filledMap.has(`${startRow - 1},${startCol}`)) return false
    const endRow = startRow + word.length
    if (endRow < puzzle.boardSize && filledMap.has(`${endRow},${startCol}`)) return false
  }

  return touchesExisting
}

function getCrossWordAt(
  puzzle: DailyPuzzle,
  filledMap: Map<string, string>,
  row: number,
  col: number,
  placedLetter: string,
  crossDirection: "row" | "col"
): string | null {
  const letters: string[] = []

  if (crossDirection === "col") {
    // Vertical cross word
    let r = row - 1
    const prefix: string[] = []
    while (r >= 0 && filledMap.has(`${r},${col}`)) {
      prefix.unshift(filledMap.get(`${r},${col}`)!)
      r--
    }
    letters.push(...prefix, placedLetter)
    r = row + 1
    while (r < puzzle.boardSize && filledMap.has(`${r},${col}`)) {
      letters.push(filledMap.get(`${r},${col}`)!)
      r++
    }
  } else {
    // Horizontal cross word
    let c = col - 1
    const prefix: string[] = []
    while (c >= 0 && filledMap.has(`${row},${c}`)) {
      prefix.unshift(filledMap.get(`${row},${c}`)!)
      c--
    }
    letters.push(...prefix, placedLetter)
    c = col + 1
    while (c < puzzle.boardSize && filledMap.has(`${row},${c}`)) {
      letters.push(filledMap.get(`${row},${c}`)!)
      c++
    }
  }

  if (letters.length <= 1) return null
  return letters.join("")
}

export function scoreBoardDifficulty(
  puzzle: DailyPuzzle,
  validPlacementCount: number,
  locale: LocaleCode = "en"
): number {
  const anchors = getAnchorPoints(puzzle)
  const bonusAccess = countBonusAccessibility(puzzle, anchors)

  // Normalize placement count. For a 7x7 board, typical range is 5-100+.
  // Fewer placements = harder. We use a log scale.
  const placementScore = validPlacementCount <= 1
    ? 1.0
    : Math.max(0, 1 - Math.log10(validPlacementCount) / 2.5)

  // Anchor points: more = easier. For 7x7, typical range is 4-20.
  const anchorScore = Math.max(0, 1 - anchors.size / 20)

  // Bonus accessibility: more accessible = easier
  const bonusScore = 1 - bonusAccess

  // Weighted combination
  return Math.max(0, Math.min(1,
    placementScore * 0.50 +
    anchorScore * 0.25 +
    bonusScore * 0.25
  ))
}

// ---------------------------------------------------------------------------
// Component 3: Word Obscurity (0.0 - 1.0)
// ---------------------------------------------------------------------------

export interface SolverResultForDifficulty {
  bestScore: number
  bestWords: string[]
}

export function scoreWordObscurity(
  solverResult: SolverResultForDifficulty,
  locale: LocaleCode = "en"
): number {
  if (solverResult.bestWords.length === 0) return 0.5

  // Score each word in the optimal play
  let totalObscurity = 0
  for (const word of solverResult.bestWords) {
    totalObscurity += getWordObscurity(word, locale)
  }

  return Math.max(0, Math.min(1, totalObscurity / solverResult.bestWords.length))
}

// ---------------------------------------------------------------------------
// Composite Difficulty Score
// ---------------------------------------------------------------------------

export interface DifficultyBreakdown {
  rack_score: number
  board_score: number
  word_obscurity_score: number
  valid_placement_count: number
  anchor_point_count: number
}

const RACK_WEIGHT = 0.30
const BOARD_WEIGHT = 0.35
const WORD_WEIGHT = 0.35

export function scoreDifficulty(
  puzzle: DailyPuzzle,
  solverResult: SolverResultForDifficulty,
  locale: LocaleCode = "en"
): { score: number; breakdown: DifficultyBreakdown } {
  const rackScore = scoreRackDifficulty(puzzle.rack, locale)

  const validPlacements = countValidPlacements(puzzle, locale)
  const boardScore = scoreBoardDifficulty(puzzle, validPlacements, locale)

  const wordScore = scoreWordObscurity(solverResult, locale)

  const anchors = getAnchorPoints(puzzle)

  const composite =
    RACK_WEIGHT * rackScore +
    BOARD_WEIGHT * boardScore +
    WORD_WEIGHT * wordScore

  return {
    score: Math.max(0, Math.min(1, composite)),
    breakdown: {
      rack_score: Math.round(rackScore * 1000) / 1000,
      board_score: Math.round(boardScore * 1000) / 1000,
      word_obscurity_score: Math.round(wordScore * 1000) / 1000,
      valid_placement_count: validPlacements,
      anchor_point_count: anchors.size,
    },
  }
}

// ---------------------------------------------------------------------------
// Target difficulty by day-of-week
// ---------------------------------------------------------------------------

export type PuzzleMode = "mini" | "easy"

interface DifficultyTarget {
  min: number
  max: number
  ideal: number
}

export function getTargetDifficulty(date: string, mode: PuzzleMode): DifficultyTarget {
  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay() // 0=Sun, 1=Mon...

  if (mode === "mini") {
    // Mini is consistently easy
    return { min: 0.10, max: 0.35, ideal: 0.22 }
  }

  // Classic (easy mode) ramps through the week
  switch (dayOfWeek) {
    case 1: // Monday
      return { min: 0.10, max: 0.25, ideal: 0.18 }
    case 2: // Tuesday
      return { min: 0.20, max: 0.35, ideal: 0.28 }
    case 3: // Wednesday
      return { min: 0.25, max: 0.40, ideal: 0.33 }
    case 4: // Thursday
      return { min: 0.35, max: 0.55, ideal: 0.45 }
    case 5: // Friday
      return { min: 0.40, max: 0.60, ideal: 0.50 }
    case 6: // Saturday
      return { min: 0.55, max: 0.80, ideal: 0.65 }
    case 0: // Sunday
      return { min: 0.60, max: 0.85, ideal: 0.72 }
    default:
      return { min: 0.25, max: 0.50, ideal: 0.38 }
  }
}

/**
 * Pick the candidate closest to the target difficulty for a given date/mode.
 */
export function pickBestCandidate<T extends { difficultyScore: number }>(
  candidates: T[],
  date: string,
  mode: PuzzleMode
): T | null {
  if (candidates.length === 0) return null

  const target = getTargetDifficulty(date, mode)

  // Sort by distance to ideal, preferring candidates within the target range
  const scored = candidates.map((c) => ({
    candidate: c,
    distance: Math.abs(c.difficultyScore - target.ideal),
    inRange: c.difficultyScore >= target.min && c.difficultyScore <= target.max,
  }))

  // Prefer in-range candidates, then sort by distance to ideal
  scored.sort((a, b) => {
    if (a.inRange && !b.inRange) return -1
    if (!a.inRange && b.inRange) return 1
    return a.distance - b.distance
  })

  return scored[0].candidate
}
