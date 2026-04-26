#!/usr/bin/env node
/**
 * Daily Puzzle Generator
 *
 * Generates puzzles for mini (5x5) and easy (7x7) modes in both en/es locales.
 * For each mode/locale, generates ~50 candidate puzzles with random racks,
 * scores them for difficulty, picks the best fit for the day-of-week target,
 * solves it, and POSTs to the API.
 *
 * Usage:
 *   node dist/generate-daily.js                        # Generate for tomorrow
 *   node dist/generate-daily.js --date 2026-04-25      # Specific date
 *   node dist/generate-daily.js --from 2026-04-08 --to 2026-04-30  # Batch
 *   node dist/generate-daily.js --dry-run --verbose     # Preview without saving
 *   node dist/generate-daily.js --force                 # Overwrite existing puzzles
 */

import { randomInt } from "crypto"
import { createRequire } from "module"
import type { DailyPuzzle } from "../../app/puzzles"
import type { LocaleCode } from "../../app/locales"

// Use createRequire to load app modules (they're under a CJS package scope)
const require = createRequire(import.meta.url)
const { getPuzzleByDate } = require("../../app/puzzles")
const { solvePuzzle } = require("../../app/solver")
const { BLANK_TILE } = require("../../app/scoring")
import {
  scoreDifficulty,
  estimateDifficultyFast,
  pickBestCandidate,
  getTargetDifficulty,
  type PuzzleMode,
  type DifficultyBreakdown,
} from "./difficulty"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE = process.env.API_BASE || "http://localhost:3100"
const ADMIN_KEY = process.env.JWT_SECRET || ""
const CANDIDATES_PER_PUZZLE = 50
const GENERATOR_VERSION = 1

// Scrabble-like tile bags for random rack generation
const EN_TILE_BAG = [
  ..."AAAAAAAAABBCCDDDDEEEEEEEEEEEEFFGGGHHIIIIIIIIIJKLLLLMMNNNNNNOOOOOOOOPPQRRRRRRSSSSTTTTTTUUUUVVWWXYYZ??",
]

const ES_TILE_BAG = [
  ..."AAAAAAAAAAABBCCCDDDDDEEEEEEEEEEEEFFGGHIIIIIIIJLLLLLLMMMNNNNNNÑOOOOOOOOPPQRRRRRRRSSSSSSSTTTTTUUUUUVVXYZ??",
]

const EN_VOWELS = new Set(["A", "E", "I", "O", "U"])
const ES_VOWELS = new Set(["A", "E", "I", "O", "U"])

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface Args {
  date: string | null
  from: string | null
  to: string | null
  dryRun: boolean
  verbose: boolean
  force: boolean
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const result: Args = {
    date: null,
    from: null,
    to: null,
    dryRun: false,
    verbose: false,
    force: false,
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--date":
        result.date = args[++i]
        break
      case "--from":
        result.from = args[++i]
        break
      case "--to":
        result.to = args[++i]
        break
      case "--dry-run":
        result.dryRun = true
        break
      case "--verbose":
        result.verbose = true
        break
      case "--force":
        result.force = true
        break
      default:
        console.error(`Unknown argument: ${args[i]}`)
        process.exit(1)
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Random rack generation (true random, not seeded)
// ---------------------------------------------------------------------------

function generateRandomRack(length: number, locale: LocaleCode): string[] {
  const bag = [...(locale === "es" ? ES_TILE_BAG : EN_TILE_BAG)]
  const rack: string[] = []
  const vowels = locale === "es" ? ES_VOWELS : EN_VOWELS

  for (let i = 0; i < length && bag.length > 0; i++) {
    const idx = randomInt(bag.length)
    rack.push(bag.splice(idx, 1)[0])
  }

  // Ensure at least 2 vowels (same logic as frontend)
  const vowelCount = rack.filter((t) => vowels.has(t)).length
  if (vowelCount < 2 && rack.length > 0) {
    const vowelArr = [...vowels]
    const replaceIdx = rack.findIndex((t) => !vowels.has(t) && t !== BLANK_TILE)
    if (replaceIdx >= 0) {
      rack[replaceIdx] = vowelArr[randomInt(vowelArr.length)]
    }
  }

  return rack
}

// ---------------------------------------------------------------------------
// Candidate generation
// ---------------------------------------------------------------------------

/**
 * Generate a candidate puzzle by taking the layout from a "virtual date"
 * (which cycles through templates deterministically) and replacing the rack
 * with a truly random one. This leverages all existing layout generation
 * and validation logic in puzzles.ts.
 */
function generateCandidate(
  targetDate: string,
  virtualDateOffset: number,
  mode: PuzzleMode,
  locale: LocaleCode
): DailyPuzzle | null {
  // Use a virtual date to get different template layouts.
  // The layout is determined by date offset from a start date, modulo the
  // number of variants. By varying virtualDateOffset we cycle through them.
  const baseDate = new Date("2026-04-18T00:00:00Z")
  baseDate.setUTCDate(baseDate.getUTCDate() + virtualDateOffset)
  const virtualDate = baseDate.toISOString().slice(0, 10)

  try {
    // Get the layout from the virtual date (uses existing template cycling)
    const layoutPuzzle = getPuzzleByDate(virtualDate, mode, locale)

    // Replace the rack with a truly random one
    const rackLength = mode === "mini" ? 5 : 7
    const randomRack = generateRandomRack(rackLength, locale)

    // Build the candidate puzzle with the target date
    const candidate: DailyPuzzle = {
      ...layoutPuzzle,
      id: `gen-${targetDate}-${mode}-${locale}-${virtualDateOffset}`,
      date: targetDate,
      rack: randomRack,
    }

    return candidate
  } catch (err) {
    // Layout validation failed for this virtual date — skip
    return null
  }
}

// ---------------------------------------------------------------------------
// Candidate scoring and selection
// ---------------------------------------------------------------------------

interface ScoredCandidate {
  puzzle: DailyPuzzle
  difficultyScore: number
  breakdown: DifficultyBreakdown
  solverResult: { bestScore: number; bestWords: string[] }
}

const FINALISTS_COUNT = 5

function generateAndScoreCandidates(
  targetDate: string,
  mode: PuzzleMode,
  locale: LocaleCode,
  verbose: boolean
): ScoredCandidate[] {
  // Phase 1: Generate all candidates with fast difficulty estimate (no solver)
  const target = getTargetDifficulty(targetDate, mode)
  const rough: { puzzle: DailyPuzzle; estimate: number; index: number }[] = []

  for (let i = 0; i < CANDIDATES_PER_PUZZLE; i++) {
    const puzzle = generateCandidate(targetDate, i, mode, locale)
    if (!puzzle) continue

    try {
      const estimate = estimateDifficultyFast(puzzle, locale)
      rough.push({ puzzle, estimate, index: i })

      if (verbose) {
        console.log(`  Candidate ${i}: fast estimate=${estimate.toFixed(3)}`)
      }
    } catch (err) {
      if (verbose) {
        console.log(`  Candidate ${i}: FAILED - ${(err as Error).message}`)
      }
    }
  }

  // Phase 2: Pick top N closest to target, run full solver + scoring on those
  rough.sort((a, b) =>
    Math.abs(a.estimate - target.ideal) - Math.abs(b.estimate - target.ideal)
  )
  const finalists = rough.slice(0, FINALISTS_COUNT)

  if (verbose) {
    console.log(`  Scoring ${finalists.length} finalists with full solver...`)
  }

  const candidates: ScoredCandidate[] = []

  for (const { puzzle, index } of finalists) {
    try {
      const solverResult = solvePuzzle(puzzle, locale)

      // Skip puzzles where solver found no valid play
      if (solverResult.bestScore === 0) {
        if (verbose) console.log(`  Finalist ${index}: no valid plays, skipping`)
        continue
      }

      const { score, breakdown } = scoreDifficulty(puzzle, solverResult, locale)

      candidates.push({
        puzzle,
        difficultyScore: score,
        breakdown,
        solverResult,
      })

      if (verbose) {
        console.log(
          `  Finalist ${index}: difficulty=${score.toFixed(3)} ` +
          `(rack=${breakdown.rack_score.toFixed(2)} board=${breakdown.board_score.toFixed(2)} ` +
          `word=${breakdown.word_obscurity_score.toFixed(2)}) ` +
          `optimal=${solverResult.bestScore} placements=${breakdown.valid_placement_count}`
        )
      }
    } catch (err) {
      if (verbose) {
        console.log(`  Finalist ${index}: FAILED - ${(err as Error).message}`)
      }
    }
  }

  return candidates
}

// ---------------------------------------------------------------------------
// API interaction
// ---------------------------------------------------------------------------

async function checkPuzzleExists(
  date: string,
  mode: string,
  locale: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_BASE}/api/puzzles/${date}?mode=${mode}&locale=${locale}`,
      {
        headers: {
          Authorization: `Bearer ${ADMIN_KEY}`,
        },
      }
    )
    return res.ok
  } catch {
    return false
  }
}

async function postPuzzle(
  puzzle: DailyPuzzle,
  locale: LocaleCode,
  optimalScore: number,
  optimalWords: string[],
  difficultyScore: number,
  difficultyBreakdown: DifficultyBreakdown
): Promise<boolean> {
  const payload = {
    date: puzzle.date,
    mode: puzzle.boardSize === 5 ? "mini" : "easy",
    locale,
    board_size: puzzle.boardSize,
    rack: puzzle.rack,
    filled_cells: puzzle.filledCells,
    bonus_cells: puzzle.bonusCells,
    optimal_score: optimalScore,
    optimal_words: optimalWords,
    difficulty_score: difficultyScore,
    difficulty_breakdown: difficultyBreakdown,
    generator_version: GENERATOR_VERSION,
  }

  try {
    const res = await fetch(`${API_BASE}/api/puzzles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": ADMIN_KEY,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error(`  POST failed: ${err}`)
      return false
    }

    return true
  } catch (err) {
    const e = err as Error
    console.error(`  POST error: ${e.message}`)
    if (e.cause) console.error(`  Cause: ${JSON.stringify(e.cause, null, 2)}`)
    return false
  }
}

// ---------------------------------------------------------------------------
// Date utilities
// ---------------------------------------------------------------------------

function getTomorrow(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function getDateRange(from: string, to: string): string[] {
  const dates: string[] = []
  const current = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10))
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return dates
}

function dayName(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function generateForDate(
  date: string,
  args: Args
): Promise<{ success: number; skipped: number; failed: number }> {
  const modes: PuzzleMode[] = ["mini", "easy"]
  const locales: LocaleCode[] = ["en", "es"]
  let success = 0
  let skipped = 0
  let failed = 0

  console.log(`\n${date} (${dayName(date)}):`)

  for (const mode of modes) {
    for (const locale of locales) {
      const label = `  ${mode}/${locale}`

      // Check if puzzle already exists
      if (!args.force) {
        const exists = await checkPuzzleExists(date, mode, locale)
        if (exists) {
          console.log(`${label}: already exists (skip)`)
          skipped++
          continue
        }
      }

      // Generate and score candidates
      const target = getTargetDifficulty(date, mode)
      if (args.verbose) {
        console.log(
          `${label}: generating ${CANDIDATES_PER_PUZZLE} candidates ` +
          `(target: ${target.min.toFixed(2)}-${target.max.toFixed(2)}, ideal=${target.ideal.toFixed(2)})`
        )
      }

      const candidates = generateAndScoreCandidates(date, mode, locale, args.verbose)

      if (candidates.length === 0) {
        console.log(`${label}: FAILED - no valid candidates generated`)
        failed++
        continue
      }

      // Pick the best candidate
      const best = pickBestCandidate(candidates, date, mode)!
      const inRange = best.difficultyScore >= target.min && best.difficultyScore <= target.max

      console.log(
        `${label}: difficulty=${best.difficultyScore.toFixed(3)} ` +
        `${inRange ? "(in range)" : "(out of range)"} ` +
        `optimal=${best.solverResult.bestScore} ` +
        `words=[${best.solverResult.bestWords.join(", ")}] ` +
        `(${candidates.length} candidates)`
      )

      if (args.verbose) {
        console.log(`${label}: breakdown:`, best.breakdown)
      }

      if (args.dryRun) {
        console.log(`${label}: [DRY RUN] would POST to ${API_BASE}`)
        success++
        continue
      }

      // POST to API
      const posted = await postPuzzle(
        best.puzzle,
        locale,
        best.solverResult.bestScore,
        best.solverResult.bestWords,
        best.difficultyScore,
        best.breakdown
      )

      if (posted) {
        success++
      } else {
        failed++
      }
    }
  }

  return { success, skipped, failed }
}

async function main() {
  const args = parseArgs()

  if (!ADMIN_KEY && !args.dryRun) {
    console.error("JWT_SECRET environment variable is required (used as admin key)")
    console.error("Set it or use --dry-run to preview")
    process.exit(1)
  }

  console.log("=== Lexicon Puzzle Generator ===")
  console.log(`API: ${API_BASE}`)
  if (args.dryRun) console.log("MODE: dry run")
  if (args.force) console.log("MODE: force overwrite")

  // Determine dates to generate
  let dates: string[]
  if (args.from && args.to) {
    dates = getDateRange(args.from, args.to)
    console.log(`Batch: ${args.from} to ${args.to} (${dates.length} days)`)
  } else if (args.date) {
    dates = [args.date]
  } else {
    dates = [getTomorrow()]
    console.log(`Default: generating for tomorrow (${dates[0]})`)
  }

  let totalSuccess = 0
  let totalSkipped = 0
  let totalFailed = 0

  for (const date of dates) {
    const { success, skipped, failed } = await generateForDate(date, args)
    totalSuccess += success
    totalSkipped += skipped
    totalFailed += failed
  }

  console.log(
    `\nDone: ${totalSuccess} generated, ${totalSkipped} skipped, ${totalFailed} failed`
  )

  if (totalFailed > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
