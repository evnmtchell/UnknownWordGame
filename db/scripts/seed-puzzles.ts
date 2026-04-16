import { getPuzzleByDate, DAILY_PUZZLES } from "../../app/puzzles"
import { solvePuzzle } from "../../app/solver"

const API_BASE = process.env.API_BASE || "https://api-lexicon.plantos.co"

async function seedPuzzles() {
  console.log(`Seeding ${DAILY_PUZZLES.length} puzzles to ${API_BASE}...`)
  let success = 0
  let failed = 0

  for (const basePuzzle of DAILY_PUZZLES) {
    for (const mode of ["easy", "hard"] as const) {
      const puzzle = getPuzzleByDate(basePuzzle.date, mode)
      const solution = solvePuzzle(puzzle)

      const payload = {
        date: basePuzzle.date,
        mode,
        board_size: puzzle.boardSize,
        rack: puzzle.rack,
        filled_cells: puzzle.filledCells,
        bonus_cells: puzzle.bonusCells,
        optimal_score: solution.score,
        optimal_words: solution.words,
      }

      try {
        const res = await fetch(`${API_BASE}/api/puzzles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (res.ok) {
          success++
          console.log(`  ${basePuzzle.date} ${mode}: score=${solution.score}`)
        } else {
          failed++
          const err = await res.text()
          console.error(`  ${basePuzzle.date} ${mode}: FAILED - ${err}`)
        }
      } catch (err) {
        failed++
        console.error(`  ${basePuzzle.date} ${mode}: ERROR - ${err}`)
      }
    }
  }

  console.log(`\nDone: ${success} seeded, ${failed} failed`)
}

seedPuzzles()
