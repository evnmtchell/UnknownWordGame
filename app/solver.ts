import { VALID_WORDS } from "./words"
import type { DailyPuzzle, BonusType } from "./puzzles"
import { BLANK_TILE, LETTER_SCORES } from "./scoring"

type PlacedCell = {
  row: number
  col: number
  letter: string
  isBlank: boolean
}

type SolverResult = {
  bestScore: number
  bestWords: string[]
  bestPlacement: PlacedCell[]
}

function getFixedLetter(
  filledCells: DailyPuzzle["filledCells"],
  row: number,
  col: number
) {
  return filledCells.find((c) => c.row === row && c.col === col)?.letter || ""
}

function getBonusAt(
  bonusCells: DailyPuzzle["bonusCells"],
  row: number,
  col: number
): BonusType | undefined {
  return bonusCells.find((c) => c.row === row && c.col === col)?.type
}

function countLetters(letters: string[]) {
  const map: Record<string, number> = {}
  for (const letter of letters) {
    map[letter] = (map[letter] || 0) + 1
  }
  return map
}

function canBuildWordOnBoard(
  puzzle: DailyPuzzle,
  word: string,
  startRow: number,
  startCol: number,
  direction: "row" | "col"
) {
  const rackCounts = countLetters(puzzle.rack)
  const placed: PlacedCell[] = []
  let touchesExisting = false

  for (let i = 0; i < word.length; i++) {
    const row = direction === "row" ? startRow : startRow + i
    const col = direction === "row" ? startCol + i : startCol

    if (row < 0 || row >= puzzle.boardSize || col < 0 || col >= puzzle.boardSize) {
      return null
    }

    const boardLetter = getFixedLetter(puzzle.filledCells, row, col)
    const wordLetter = word[i]

    if (boardLetter) {
      if (boardLetter !== wordLetter) return null
      touchesExisting = true
    } else {
      if (rackCounts[wordLetter]) {
        rackCounts[wordLetter] -= 1
        placed.push({ row, col, letter: wordLetter, isBlank: false })
      } else if (rackCounts[BLANK_TILE]) {
        rackCounts[BLANK_TILE] -= 1
        placed.push({ row, col, letter: wordLetter, isBlank: true })
      } else {
        return null
      }
    }
  }

  if (placed.length === 0) return null

  for (const cell of placed) {
    const neighbors = [
      { row: cell.row - 1, col: cell.col },
      { row: cell.row + 1, col: cell.col },
      { row: cell.row, col: cell.col - 1 },
      { row: cell.row, col: cell.col + 1 },
    ]
    for (const n of neighbors) {
      const neighborLetter = getFixedLetter(puzzle.filledCells, n.row, n.col)
      if (neighborLetter) touchesExisting = true
    }
  }

  if (!touchesExisting) return null

  return placed
}


function scoreWordAtPlacement(
  puzzle: DailyPuzzle,
  word: string,
  startRow: number,
  startCol: number,
  direction: "row" | "col",
  placed: PlacedCell[]
) {
  let total = 0
  let wordMultiplier = 1

  for (let i = 0; i < word.length; i++) {
    const row = direction === "row" ? startRow : startRow + i
    const col = direction === "row" ? startCol + i : startCol
    const letter = word[i]

    const placedCell = placed.find((p) => p.row === row && p.col === col)
    let letterScore = placedCell?.isBlank ? 0 : LETTER_SCORES[letter] || 0
    const isNewTile = Boolean(placedCell)

    if (isNewTile) {
      const bonus = getBonusAt(puzzle.bonusCells, row, col)
      if (bonus === "DL") letterScore *= 2
      if (bonus === "TL") letterScore *= 3
      if (bonus === "DW") wordMultiplier *= 2
      if (bonus === "TW") wordMultiplier *= 3
    }

    total += letterScore
  }

  return total * wordMultiplier
}

function getCrossWordResult(
  puzzle: DailyPuzzle,
  newTile: PlacedCell,
  mainDirection: "row" | "col"
): { word: string; score: number } | null {
  const crossDir = mainDirection === "row" ? "col" : "row"
  const cells: Array<{ row: number; col: number; letter: string; isNew: boolean }> = [
    { row: newTile.row, col: newTile.col, letter: newTile.letter, isNew: true },
  ]

  if (crossDir === "col") {
    for (let r = newTile.row - 1; r >= 0; r--) {
      const letter = getFixedLetter(puzzle.filledCells, r, newTile.col)
      if (!letter) break
      cells.unshift({ row: r, col: newTile.col, letter, isNew: false })
    }
    for (let r = newTile.row + 1; r < puzzle.boardSize; r++) {
      const letter = getFixedLetter(puzzle.filledCells, r, newTile.col)
      if (!letter) break
      cells.push({ row: r, col: newTile.col, letter, isNew: false })
    }
  } else {
    for (let c = newTile.col - 1; c >= 0; c--) {
      const letter = getFixedLetter(puzzle.filledCells, newTile.row, c)
      if (!letter) break
      cells.unshift({ row: newTile.row, col: c, letter, isNew: false })
    }
    for (let c = newTile.col + 1; c < puzzle.boardSize; c++) {
      const letter = getFixedLetter(puzzle.filledCells, newTile.row, c)
      if (!letter) break
      cells.push({ row: newTile.row, col: c, letter, isNew: false })
    }
  }

  if (cells.length <= 1) return null

  const word = cells.map((c) => c.letter).join("")
  let total = 0
  let wordMultiplier = 1

  for (const cell of cells) {
    let letterScore = cell.isNew && newTile.isBlank && cell.row === newTile.row && cell.col === newTile.col
      ? 0
      : LETTER_SCORES[cell.letter] || 0
    if (cell.isNew) {
      const bonus = getBonusAt(puzzle.bonusCells, cell.row, cell.col)
      if (bonus === "DL") letterScore *= 2
      if (bonus === "TL") letterScore *= 3
      if (bonus === "DW") wordMultiplier *= 2
      if (bonus === "TW") wordMultiplier *= 3
    }
    total += letterScore
  }

  return { word, score: total * wordMultiplier }
}

export function solvePuzzle(puzzle: DailyPuzzle): SolverResult {
  let bestScore = 0
  let bestWords: string[] = []
  let bestPlacement: PlacedCell[] = []

  const words = Array.from(VALID_WORDS).filter(
    (word) => typeof word === "string" && word.length >= 2 && word.length <= puzzle.boardSize
  )

  for (const word of words) {
    for (let row = 0; row < puzzle.boardSize; row++) {
      for (let col = 0; col < puzzle.boardSize; col++) {
        for (const direction of ["row", "col"] as const) {
          const placed = canBuildWordOnBoard(puzzle, word, row, col, direction)
          if (!placed) continue

          const crossWords: { word: string; score: number }[] = []
          let hasInvalidCrossWord = false

          for (const newTile of placed) {
            const cross = getCrossWordResult(puzzle, newTile, direction)
            if (!cross) continue
            if (!VALID_WORDS.has(cross.word)) {
              hasInvalidCrossWord = true
              break
            }
            crossWords.push(cross)
          }

          if (hasInvalidCrossWord) continue

          const mainScore = scoreWordAtPlacement(puzzle, word, row, col, direction, placed)
          const crossScore = crossWords.reduce((sum, cw) => sum + cw.score, 0)
          const score = mainScore + crossScore

          if (score > bestScore) {
            bestScore = score
            bestWords = [word]
            bestPlacement = placed
          }
        }
      }
    }
  }

  return {
    bestScore,
    bestWords,
    bestPlacement,
  }
}
