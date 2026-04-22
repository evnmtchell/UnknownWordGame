import { VALID_WORDS } from "./words"
import { SPANISH_VALID_WORDS } from "./words-es"
import type { DailyPuzzle, BonusType } from "./puzzles"
import { BLANK_TILE, LETTER_SCORES } from "./scoring"
import { SPANISH_LETTER_SCORES } from "./scoring-es"
import type { LocaleCode } from "./locales"

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

const solverCache = new Map<string, SolverResult>()

function getCellKey(row: number, col: number) {
  return `${row},${col}`
}

function getPuzzleCacheKey(puzzle: DailyPuzzle, locale: LocaleCode) {
  return [
    locale,
    puzzle.id,
    puzzle.date,
    puzzle.boardSize,
    puzzle.rack.join(""),
    puzzle.filledCells.map((cell) => `${cell.row},${cell.col},${cell.letter}`).join("|"),
    puzzle.bonusCells.map((cell) => `${cell.row},${cell.col},${cell.type}`).join("|"),
  ].join("::")
}

function countLetters(letters: string[]) {
  const map: Record<string, number> = {}
  for (const letter of letters) {
    map[letter] = (map[letter] || 0) + 1
  }
  return map
}

function getWordSet(locale: LocaleCode) {
  return locale === "es" ? SPANISH_VALID_WORDS : VALID_WORDS
}

function getLetterScores(locale: LocaleCode) {
  return locale === "es" ? SPANISH_LETTER_SCORES : LETTER_SCORES
}

function getBoardLetter(
  filledMap: Map<string, string>,
  placedMap: Map<string, PlacedCell>,
  row: number,
  col: number
) {
  return placedMap.get(getCellKey(row, col))?.letter ?? filledMap.get(getCellKey(row, col)) ?? ""
}

function getWordCellsFromBoard(
  puzzle: DailyPuzzle,
  filledMap: Map<string, string>,
  placedMap: Map<string, PlacedCell>,
  row: number,
  col: number,
  direction: "row" | "col"
) {
  const cells: Array<PlacedCell & { isNew: boolean }> = []

  let startRow = row
  let endRow = row
  let startCol = col
  let endCol = col

  if (direction === "row") {
    while (startCol > 0 && getBoardLetter(filledMap, placedMap, row, startCol - 1)) startCol--
    while (
      endCol < puzzle.boardSize - 1 &&
      getBoardLetter(filledMap, placedMap, row, endCol + 1)
    ) {
      endCol++
    }

    for (let currentCol = startCol; currentCol <= endCol; currentCol++) {
      const key = getCellKey(row, currentCol)
      const placedCell = placedMap.get(key)
      const letter = getBoardLetter(filledMap, placedMap, row, currentCol)
      if (!letter) return []
      cells.push({
        row,
        col: currentCol,
        letter,
        isBlank: placedCell?.isBlank ?? false,
        isNew: Boolean(placedCell),
      })
    }

    return cells
  }

  while (startRow > 0 && getBoardLetter(filledMap, placedMap, startRow - 1, col)) startRow--
  while (
    endRow < puzzle.boardSize - 1 &&
    getBoardLetter(filledMap, placedMap, endRow + 1, col)
  ) {
    endRow++
  }

  for (let currentRow = startRow; currentRow <= endRow; currentRow++) {
    const key = getCellKey(currentRow, col)
    const placedCell = placedMap.get(key)
    const letter = getBoardLetter(filledMap, placedMap, currentRow, col)
    if (!letter) return []
    cells.push({
      row: currentRow,
      col,
      letter,
      isBlank: placedCell?.isBlank ?? false,
      isNew: Boolean(placedCell),
    })
  }

  return cells
}

function canBuildWordOnBoard(
  puzzle: DailyPuzzle,
  filledMap: Map<string, string>,
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

    const boardLetter = filledMap.get(getCellKey(row, col)) || ""
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
      const neighborLetter = filledMap.get(getCellKey(n.row, n.col))
      if (neighborLetter) touchesExisting = true
    }
  }

  if (!touchesExisting) return null

  return placed
}


function scoreWordCells(
  bonusMap: Map<string, BonusType>,
  cells: Array<PlacedCell & { isNew: boolean }>,
  locale: LocaleCode
) {
  let total = 0
  let wordMultiplier = 1
  const letterScores = getLetterScores(locale)

  for (const cell of cells) {
    let letterScore = cell.isBlank ? 0 : letterScores[cell.letter] || 0

    if (cell.isNew) {
      const bonus = bonusMap.get(getCellKey(cell.row, cell.col))
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
  filledMap: Map<string, string>,
  placedMap: Map<string, PlacedCell>,
  bonusMap: Map<string, BonusType>,
  newTile: PlacedCell,
  mainDirection: "row" | "col",
  locale: LocaleCode
): { word: string; score: number } | null {
  const crossDir = mainDirection === "row" ? "col" : "row"
  const cells = getWordCellsFromBoard(
    puzzle,
    filledMap,
    placedMap,
    newTile.row,
    newTile.col,
    crossDir
  )

  if (cells.length <= 1) return null

  const word = cells.map((c) => c.letter).join("")

  return { word, score: scoreWordCells(bonusMap, cells, locale) }
}

export function solvePuzzle(puzzle: DailyPuzzle, locale: LocaleCode = "en"): SolverResult {
  const cacheKey = getPuzzleCacheKey(puzzle, locale)
  const cached = solverCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const filledMap = new Map(
    puzzle.filledCells.map((cell) => [getCellKey(cell.row, cell.col), cell.letter])
  )
  const bonusMap = new Map(
    puzzle.bonusCells.map((cell) => [getCellKey(cell.row, cell.col), cell.type])
  )
  let bestScore = 0
  let bestWords: string[] = []
  let bestPlacement: PlacedCell[] = []
  const wordSet = getWordSet(locale)

  const words = Array.from(wordSet).filter(
    (word) => typeof word === "string" && word.length >= 2 && word.length <= puzzle.boardSize
  )

  for (const word of words) {
    for (let row = 0; row < puzzle.boardSize; row++) {
      for (let col = 0; col < puzzle.boardSize; col++) {
        for (const direction of ["row", "col"] as const) {
          const placed = canBuildWordOnBoard(puzzle, filledMap, word, row, col, direction)
          if (!placed) continue
          const placedMap = new Map(placed.map((cell) => [getCellKey(cell.row, cell.col), cell]))
          const mainCells = getWordCellsFromBoard(
            puzzle,
            filledMap,
            placedMap,
            placed[0].row,
            placed[0].col,
            direction
          )
          const mainWord = mainCells.map((cell) => cell.letter).join("")

          if (mainWord.length <= 1 || !wordSet.has(mainWord)) {
            continue
          }

          const crossWords: { word: string; score: number }[] = []
          let hasInvalidCrossWord = false

          for (const newTile of placed) {
            const cross = getCrossWordResult(
              puzzle,
              filledMap,
              placedMap,
              bonusMap,
              newTile,
              direction,
              locale
            )
            if (!cross) continue
            if (!wordSet.has(cross.word)) {
              hasInvalidCrossWord = true
              break
            }
            crossWords.push(cross)
          }

          if (hasInvalidCrossWord) continue

          const mainScore = scoreWordCells(bonusMap, mainCells, locale)
          const crossScore = crossWords.reduce((sum, cw) => sum + cw.score, 0)
          const score = mainScore + crossScore

          if (score > bestScore) {
            bestScore = score
            bestWords = [mainWord, ...crossWords.map((cross) => cross.word)]
            bestPlacement = placed
          }
        }
      }
    }
  }

  const result = {
    bestScore,
    bestWords,
    bestPlacement,
  }

  solverCache.set(cacheKey, result)
  return result
}
