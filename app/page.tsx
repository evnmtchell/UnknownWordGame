"use client"

import { startTransition, useEffect, useMemo, useRef, useState } from "react"
import { VALID_WORDS } from "./words"
import { getTodayPuzzle, DAILY_PUZZLES, type BonusType } from "./puzzles"
import { solvePuzzle } from "./solver"
import { BLANK_TILE, LETTER_SCORES } from "./scoring"

type TileSelection = {
  letter: string
  index: number
  isBlank: boolean
} | null

type DraggedPlacedTile = {
  row: number
  col: number
  letter: string
  isBlank: boolean
} | null

type TouchDragState = {
  type: "rack"
  letter: string
  index: number
  isBlank: boolean
  x: number
  y: number
} | {
  type: "placed"
  letter: string
  row: number
  col: number
  isBlank: boolean
  x: number
  y: number
} | null

type PlacedTile = {
  row: number
  col: number
  letter: string
  isBlank: boolean
}

type WordResult = {
  word: string
  score: number
}

type AttemptResult = {
  words: WordResult[]
  totalScore: number
}

type SavedGameState = {
  attemptsLeft: number
  bestScore: number
  attemptHistory: AttemptResult[]
  submittedWords: WordResult[]
  submittedScore: number
  message: string
  hintUsed: boolean
}

type GameStats = {
  gamesPlayed: number
  currentStreak: number
  maxStreak: number
  lastPlayedDate: string | null
  ratingCounts: Record<string, number>
}

const defaultStats: GameStats = {
  gamesPlayed: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastPlayedDate: null,
  ratingCounts: { Perfect: 0, Excellent: 0, Great: 0, Solid: 0, "Keep trying": 0 },
}

const STATS_KEY = "daily-word-game-stats"

function shuffleArray(items: string[]) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function moveItemToIndex<T>(items: T[], fromIndex: number, toIndex: number) {
  const copy = [...items]
  const [moved] = copy.splice(fromIndex, 1)
  copy.splice(toIndex, 0, moved)
  return copy
}

function getLocalDateString() {
  return new Intl.DateTimeFormat("en-CA").format(new Date())
}

export default function Home() {
  const todayDate = useMemo(() => getLocalDateString(), [])
  const [selectedDate, setSelectedDate] = useState(todayDate)
  const [showArchive, setShowArchive] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [touchDrag, setTouchDrag] = useState<TouchDragState>(null)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const touchDragRef = useRef<TouchDragState>(null)
  const draggedTileRef = useRef<TileSelection>(null)
  const draggedPlacedTileRef = useRef<DraggedPlacedTile>(null)

  const puzzle = useMemo(
    () => DAILY_PUZZLES.find((p) => p.date === selectedDate) || getTodayPuzzle(),
    [selectedDate]
  )
  const solution = useMemo(() => solvePuzzle(puzzle), [puzzle])

  const boardSize = puzzle.boardSize
  const maxAttempts = 3
  const startingRack = puzzle.rack
  const storageKey = `daily-word-game-${puzzle.date}`
  const boardGap = 4
  const boardMaxWidth = `${boardSize * 54 + (boardSize - 1) * boardGap}px`
  const boardTileFontSize = "clamp(18px, 5vw, 24px)"
  const boardBonusFontSize = "clamp(8px, 2.4vw, 11px)"
  const boardScoreFontSize = "clamp(8px, 2vw, 10px)"

  const [rack, setRack] = useState(startingRack)
  const [selectedTile, setSelectedTile] = useState<TileSelection>(null)
  const [draggedTile, setDraggedTile] = useState<TileSelection>(null)
  const [draggedPlacedTile, setDraggedPlacedTile] = useState<DraggedPlacedTile>(null)
  const [placedTiles, setPlacedTiles] = useState<PlacedTile[]>([])
  const [message, setMessage] = useState(
    "Drag a tile onto the board, drag rack tiles between slots, or click a tile and then click a square."
  )
  const [submittedWords, setSubmittedWords] = useState<WordResult[]>([])
  const [submittedScore, setSubmittedScore] = useState(0)
  const [attemptsLeft, setAttemptsLeft] = useState(maxAttempts)
  const [bestScore, setBestScore] = useState(0)
  const [attemptHistory, setAttemptHistory] = useState<AttemptResult[]>([])
  const [hasLoadedSave, setHasLoadedSave] = useState(false)
  const [rackDropIndex, setRackDropIndex] = useState<number | null>(null)
  const [hintUsed, setHintUsed] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [stats, setStats] = useState<GameStats>(defaultStats)
  const statsUpdatedRef = useRef(false)

  const filledCells = puzzle.filledCells
  const bonusCells = puzzle.bonusCells

  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<SavedGameState>
        startTransition(() => {
          if (parsed.attemptsLeft !== undefined) setAttemptsLeft(parsed.attemptsLeft)
          if (parsed.bestScore !== undefined) setBestScore(parsed.bestScore)
          if (parsed.attemptHistory) setAttemptHistory(parsed.attemptHistory)
          if (parsed.submittedWords) setSubmittedWords(parsed.submittedWords)
          if (parsed.submittedScore !== undefined) setSubmittedScore(parsed.submittedScore)
          if (parsed.message) setMessage(parsed.message)
          if (parsed.hintUsed) {
            setHintUsed(parsed.hintUsed)
            setShowHint(true)
          }
          setHasLoadedSave(true)
        })
        if (parsed.attemptsLeft === 0) statsUpdatedRef.current = true
      } catch {
        // ignore bad saved data
      }
    } else {
      startTransition(() => {
        setHasLoadedSave(true)
      })
    }

    try {
      const savedStats = localStorage.getItem(STATS_KEY)
      if (savedStats) {
        const parsedStats = JSON.parse(savedStats) as GameStats
        startTransition(() => {
          setStats(parsedStats)
        })
      }
    } catch {
      // ignore
    }

    if (!localStorage.getItem("daily-word-game-tutorial-seen")) {
      startTransition(() => {
        setShowTutorial(true)
      })
    }
  }, [storageKey])

  useEffect(() => {
    touchDragRef.current = touchDrag
  }, [touchDrag])

  useEffect(() => {
    draggedTileRef.current = draggedTile
  }, [draggedTile])

  useEffect(() => {
    draggedPlacedTileRef.current = draggedPlacedTile
  }, [draggedPlacedTile])

  useEffect(() => {
    function onTouchMove(e: TouchEvent) {
      if (!touchDragRef.current) return
      e.preventDefault()
      const touch = e.touches[0]
      setTouchDrag((prev) => (prev ? { ...prev, x: touch.clientX, y: touch.clientY } : null))
    }
    document.addEventListener("touchmove", onTouchMove, { passive: false })
    return () => document.removeEventListener("touchmove", onTouchMove)
  }, [])

  useEffect(() => {
    if (!hasLoadedSave) return

    const dataToSave: SavedGameState = {
      attemptsLeft,
      bestScore,
      attemptHistory,
      submittedWords,
      submittedScore,
      message,
      hintUsed,
    }

    localStorage.setItem(storageKey, JSON.stringify(dataToSave))
  }, [
    attemptsLeft,
    bestScore,
    attemptHistory,
    submittedWords,
    submittedScore,
    message,
    hintUsed,
    storageKey,
    hasLoadedSave,
  ])

  function getFixedCellLetter(row: number, col: number) {
    const fixedCell = filledCells.find(
      (item) => item.row === row && item.col === col
    )
    return fixedCell ? fixedCell.letter : ""
  }

  function getPlacedTile(row: number, col: number) {
    return placedTiles.find((item) => item.row === row && item.col === col)
  }

  function getPlacedCellLetter(row: number, col: number) {
    const placedCell = getPlacedTile(row, col)
    return placedCell ? placedCell.letter : ""
  }

  function getCellLetter(row: number, col: number) {
    return getPlacedCellLetter(row, col) || getFixedCellLetter(row, col) || ""
  }

  function isPlacedTile(row: number, col: number) {
    return Boolean(getPlacedTile(row, col))
  }

  function getBonusAt(row: number, col: number): BonusType | undefined {
    return bonusCells.find((cell) => cell.row === row && cell.col === col)?.type
  }

  function isOptimalCell(row: number, col: number) {
    return solution.bestPlacement.some((p) => p.row === row && p.col === col)
  }

  function getCellBackground(row: number, col: number, hasLetter: boolean) {
    if (hasLetter) return "#e7d3a8"

    if (gameOver && isOptimalCell(row, col)) return "#bde0fe"
    if (showHint && isOptimalCell(row, col)) return "#bbf7d0"
    const bonus = getBonusAt(row, col)

    if (bonus === "DL") return "#cfe8ff"
    if (bonus === "TL") return "#8dc5ff"
    if (bonus === "DW") return "#ffd1dc"
    if (bonus === "TW") return "#ff9fb2"

    return "#f7f3ea"
  }

  function getBonusLabel(row: number, col: number, hasLetter: boolean) {
    if (hasLetter) return ""
    return getBonusAt(row, col) || ""
  }

  function handleTileClick(tile: string, index: number) {
    if (attemptsLeft === 0) {
      setMessage("No attempts left.")
      return
    }
    setSelectedTile({ letter: tile, index, isBlank: tile === BLANK_TILE })
  }

  function chooseBlankLetter() {
    const response = window.prompt("Choose a letter for the blank tile (A-Z).")
    if (response === null) {
      setMessage("Blank tile placement cancelled.")
      return null
    }

    const letter = response.trim().toUpperCase()
    if (!/^[A-Z]$/.test(letter)) {
      setMessage("Blank tiles must be assigned a single letter from A to Z.")
      return null
    }

    return letter
  }

  function shuffleRack() {
    if (gameOver) return
    setRack((prev) => shuffleArray(prev))
    setSelectedTile(null)
    setDraggedTile(null)
    setRackDropIndex(null)
    setMessage("Rack shuffled.")
  }

  function reorderRackTile(fromIndex: number, targetIndex: number) {
    let finalIndex = targetIndex
    if (fromIndex < targetIndex) {
      finalIndex = targetIndex - 1
    }

    if (finalIndex === fromIndex) {
      setDraggedTile(null)
      setRackDropIndex(null)
      return
    }

    setRack((prev) => moveItemToIndex(prev, fromIndex, finalIndex))
    draggedTileRef.current = null
    setDraggedTile(null)
    setSelectedTile(null)
    setRackDropIndex(null)
    setMessage("Rack rearranged.")
  }

  function handleRackGapDrop(targetIndex: number) {
    const activeDraggedTile = draggedTileRef.current
    if (!activeDraggedTile) return
    if (draggedPlacedTileRef.current) return
    reorderRackTile(activeDraggedTile.index, targetIndex)
  }

  function isPlacementAllowed(row: number, col: number) {
    if (placedTiles.length <= 1) return true

    const allSameRow = placedTiles.every(
      (tile) => tile.row === placedTiles[0].row
    )
    const allSameCol = placedTiles.every(
      (tile) => tile.col === placedTiles[0].col
    )

    if (allSameRow) return row === placedTiles[0].row
    if (allSameCol) return col === placedTiles[0].col

    return false
  }

  function isPlacementAllowedWithTiles(
    tiles: PlacedTile[],
    row: number,
    col: number
  ) {
    if (tiles.length <= 1) return true

    const allSameRow = tiles.every((tile) => tile.row === tiles[0].row)
    const allSameCol = tiles.every((tile) => tile.col === tiles[0].col)

    if (allSameRow) return row === tiles[0].row
    if (allSameCol) return col === tiles[0].col

    return false
  }

  function placeTileOnBoard(tileData: TileSelection, row: number, col: number) {
    if (attemptsLeft === 0) {
      setMessage("No attempts left.")
      return
    }

    if (!tileData) {
      setMessage("Pick up a tile first.")
      return
    }

    if (getCellLetter(row, col)) {
      setMessage("That square is already occupied.")
      return
    }

    if (!isPlacementAllowed(row, col)) {
      setMessage("Your tiles must stay in one row or one column.")
      return
    }

    const resolvedLetter = tileData.isBlank ? chooseBlankLetter() : tileData.letter
    if (!resolvedLetter) return

    setPlacedTiles((prev) => [
      ...prev,
      { row, col, letter: resolvedLetter, isBlank: tileData.isBlank },
    ])
    setRack((prev) => prev.filter((_, i) => i !== tileData.index))
    draggedTileRef.current = null
    setSelectedTile(null)
    setDraggedTile(null)
    setRackDropIndex(null)
    setMessage(
      tileData.isBlank
        ? `Blank tile placed as ${resolvedLetter}.`
        : "Good move. Keep placing tiles in one line."
    )
  }

  function movePlacedTileOnBoard(tile: DraggedPlacedTile, row: number, col: number) {
    if (!tile) return

    if (tile.row === row && tile.col === col) {
      setDraggedPlacedTile(null)
      return
    }

    if (getCellLetter(row, col)) {
      setMessage("That square is already occupied.")
      return
    }

    const remainingTiles = placedTiles.filter(
      (placed) => !(placed.row === tile.row && placed.col === tile.col)
    )

    if (!isPlacementAllowedWithTiles(remainingTiles, row, col)) {
      setMessage("Your tiles must stay in one row or one column.")
      return
    }

    setPlacedTiles([
      ...remainingTiles,
      { row, col, letter: tile.letter, isBlank: tile.isBlank },
    ])
    draggedPlacedTileRef.current = null
    setDraggedPlacedTile(null)
    setSelectedTile(null)
    setRackDropIndex(null)
    setMessage(tile.isBlank ? `Moved blank tile (${tile.letter}).` : `Moved ${tile.letter}.`)
  }

  function handleCellClick(row: number, col: number) {
    if (!selectedTile) {
      setMessage("First click a tile from your rack, or drag one onto the board.")
      return
    }
    placeTileOnBoard(selectedTile, row, col)
  }

  function handleTileDragStart(
    e: React.DragEvent<HTMLDivElement>,
    tile: string,
    index: number
  ) {
    if (attemptsLeft === 0) return
    e.dataTransfer.setData("text/plain", `${tile}-${index}`)
    e.dataTransfer.effectAllowed = "move"
    setDraggedTile({ letter: tile, index, isBlank: tile === BLANK_TILE })
    draggedPlacedTileRef.current = null
    draggedTileRef.current = { letter: tile, index, isBlank: tile === BLANK_TILE }
    setDraggedPlacedTile(null)
    setSelectedTile(null)
  }

  function handleRackTileDragEnd() {
    draggedTileRef.current = null
    setDraggedTile(null)
    setRackDropIndex(null)
  }

  function handlePlacedTileDragStart(
    e: React.DragEvent<HTMLDivElement>,
    row: number,
    col: number,
    letter: string,
    isBlank: boolean
  ) {
    if (attemptsLeft === 0) return
    e.dataTransfer.setData("text/plain", `${letter}-${row}-${col}`)
    e.dataTransfer.effectAllowed = "move"
    setDraggedPlacedTile({ row, col, letter, isBlank })
    draggedTileRef.current = null
    draggedPlacedTileRef.current = { row, col, letter, isBlank }
    setDraggedTile(null)
    setSelectedTile(null)
    setRackDropIndex(null)
  }

  function handlePlacedTileDragEnd() {
    draggedPlacedTileRef.current = null
    setDraggedPlacedTile(null)
  }

  function handleCellDrop(row: number, col: number) {
    const activeDraggedTile = draggedTileRef.current
    const activeDraggedPlacedTile = draggedPlacedTileRef.current

    if (activeDraggedTile) {
      placeTileOnBoard(activeDraggedTile, row, col)
      return
    }

    if (activeDraggedPlacedTile) {
      movePlacedTileOnBoard(activeDraggedPlacedTile, row, col)
    }
  }

  function returnPlacedTileToRack(tile: DraggedPlacedTile) {
    if (!tile) return

    setPlacedTiles((prev) =>
      prev.filter((placed) => !(placed.row === tile.row && placed.col === tile.col))
    )
    setRack((prev) => [...prev, tile.isBlank ? BLANK_TILE : tile.letter])
    draggedPlacedTileRef.current = null
    setRack((prev) => [...prev, tile.isBlank ? BLANK_TILE : tile.letter])
    setDraggedPlacedTile(null)
    setSelectedTile(null)
    setRackDropIndex(null)
    setMessage(tile.isBlank ? "Returned blank tile to the rack." : `Returned ${tile.letter} to the rack.`)
  }

  function getMoveDirection(): "row" | "col" | null {
    if (placedTiles.length === 0) return null
    if (placedTiles.length === 1) return "row"

    const allSameRow = placedTiles.every(
      (tile) => tile.row === placedTiles[0].row
    )

    return allSameRow ? "row" : "col"
  }

  function buildWordAt(row: number, col: number, direction: "row" | "col") {
    let startRow = row
    let endRow = row
    let startCol = col
    let endCol = col

    if (direction === "row") {
      while (startCol > 0 && getCellLetter(row, startCol - 1)) startCol--
      while (endCol < boardSize - 1 && getCellLetter(row, endCol + 1)) endCol++

      let word = ""
      for (let currentCol = startCol; currentCol <= endCol; currentCol++) {
        const letter = getCellLetter(row, currentCol)
        if (!letter) return ""
        word += letter
      }
      return word
    }

    while (startRow > 0 && getCellLetter(startRow - 1, col)) startRow--
    while (endRow < boardSize - 1 && getCellLetter(endRow + 1, col)) endRow++

    let word = ""
    for (let currentRow = startRow; currentRow <= endRow; currentRow++) {
      const letter = getCellLetter(currentRow, col)
      if (!letter) return ""
      word += letter
    }
    return word
  }

  function getWordCells(row: number, col: number, direction: "row" | "col") {
    const cells: { row: number; col: number; letter: string; isBlank: boolean }[] = []

    let startRow = row
    let endRow = row
    let startCol = col
    let endCol = col

    if (direction === "row") {
      while (startCol > 0 && getCellLetter(row, startCol - 1)) startCol--
      while (endCol < boardSize - 1 && getCellLetter(row, endCol + 1)) endCol++

      for (let currentCol = startCol; currentCol <= endCol; currentCol++) {
        const letter = getCellLetter(row, currentCol)
        if (!letter) return []
        cells.push({
          row,
          col: currentCol,
          letter,
          isBlank: getPlacedTile(row, currentCol)?.isBlank ?? false,
        })
      }
      return cells
    }

    while (startRow > 0 && getCellLetter(startRow - 1, col)) startRow--
    while (endRow < boardSize - 1 && getCellLetter(endRow + 1, col)) endRow++

    for (let currentRow = startRow; currentRow <= endRow; currentRow++) {
      const letter = getCellLetter(currentRow, col)
      if (!letter) return []
      cells.push({
        row: currentRow,
        col,
        letter,
        isBlank: getPlacedTile(currentRow, col)?.isBlank ?? false,
      })
    }

    return cells
  }

  function isTouchingFilledCells() {
    if (placedTiles.length === 0) return false

    for (const tile of placedTiles) {
      const neighbors = [
        { row: tile.row - 1, col: tile.col },
        { row: tile.row + 1, col: tile.col },
        { row: tile.row, col: tile.col - 1 },
        { row: tile.row, col: tile.col + 1 },
      ]

      for (const neighbor of neighbors) {
        if (getFixedCellLetter(neighbor.row, neighbor.col)) {
          return true
        }
      }
    }

    return false
  }

  function scoreWordFromCells(cells: { row: number; col: number; letter: string; isBlank: boolean }[]) {
    let total = 0
    let wordMultiplier = 1

    for (const cell of cells) {
      let letterScore = cell.isBlank ? 0 : LETTER_SCORES[cell.letter] || 0

      if (isPlacedTile(cell.row, cell.col)) {
        const bonus = getBonusAt(cell.row, cell.col)

        if (bonus === "DL") letterScore *= 2
        if (bonus === "TL") letterScore *= 3
        if (bonus === "DW") wordMultiplier *= 2
        if (bonus === "TW") wordMultiplier *= 3
      }

      total += letterScore
    }

    return total * wordMultiplier
  }

  function getAllWordsFormed() {
    if (placedTiles.length === 0) return []

    const results: WordResult[] = []
    const seenKeys = new Set<string>()

    const mainDirection = getMoveDirection()
    if (!mainDirection) return []

    const mainWord = buildWordAt(
      placedTiles[0].row,
      placedTiles[0].col,
      mainDirection
    )
    const mainCells = getWordCells(
      placedTiles[0].row,
      placedTiles[0].col,
      mainDirection
    )

    if (mainWord.length > 1 && mainCells.length > 0) {
      const key = `${mainDirection}-${mainCells[0].row}-${mainCells[0].col}-${mainWord}`
      results.push({
        word: mainWord,
        score: scoreWordFromCells(mainCells),
      })
      seenKeys.add(key)
    }

    const crossDirection = mainDirection === "row" ? "col" : "row"

    for (const tile of placedTiles) {
      const crossWord = buildWordAt(tile.row, tile.col, crossDirection)
      const crossCells = getWordCells(tile.row, tile.col, crossDirection)

      if (crossWord.length > 1 && crossCells.length > 0) {
        const key = `${crossDirection}-${crossCells[0].row}-${crossCells[0].col}-${crossWord}`

        if (!seenKeys.has(key)) {
          results.push({
            word: crossWord,
            score: scoreWordFromCells(crossCells),
          })
          seenKeys.add(key)
        }
      }
    }

    return results
  }

  function submitMove() {
    if (attemptsLeft === 0) {
      setMessage("No attempts left.")
      return
    }

    if (placedTiles.length === 0) {
      setMessage("Place at least one tile first.")
      return
    }

    if (!isTouchingFilledCells()) {
      setMessage("Your word must touch the letters already on the board.")
      return
    }

    const wordsFormed = getAllWordsFormed()

    if (wordsFormed.length === 0) {
      setMessage("Your tiles must form a real word.")
      return
    }

    for (const item of wordsFormed) {
      if (!VALID_WORDS.has(item.word)) {
        setMessage(`${item.word} is not in the word list.`)
        return
      }
    }

    const totalScore = wordsFormed.reduce((sum, item) => sum + item.score, 0)
    const solvedOptimallyOnFirstTry =
      attemptHistory.length === 0 && totalScore >= solution.bestScore
    const newAttemptsLeft = solvedOptimallyOnFirstTry ? 0 : attemptsLeft - 1
    const newBestScore = Math.max(bestScore, totalScore)
    const newAttempt = {
      words: wordsFormed,
      totalScore,
    }

    setSubmittedWords(wordsFormed)
    setSubmittedScore(totalScore)
    setAttemptsLeft(newAttemptsLeft)
    setBestScore(newBestScore)
    setAttemptHistory([...attemptHistory, newAttempt])
    setMessage(
      solvedOptimallyOnFirstTry
        ? `Perfect first try. You scored the optimal ${solution.bestScore}, so the game is over.`
        : `You scored ${totalScore}. Optimal score: ${solution.bestScore}.`
    )

    if (newAttemptsLeft === 0) {
      const rating =
        solution.bestScore <= 0
          ? "Keep trying"
          : newBestScore / solution.bestScore >= 1
          ? "Perfect"
          : newBestScore / solution.bestScore >= 0.9
          ? "Excellent"
          : newBestScore / solution.bestScore >= 0.75
          ? "Great"
          : newBestScore / solution.bestScore >= 0.5
          ? "Solid"
          : "Keep trying"
      updateStats(rating)
    }

    setRack(startingRack)
    setPlacedTiles([])
    setSelectedTile(null)
    setDraggedTile(null)
    setDraggedPlacedTile(null)
    setRackDropIndex(null)
  }

  function undoLastTile() {
    if (placedTiles.length === 0) return
    const last = placedTiles[placedTiles.length - 1]
    setPlacedTiles((prev) => prev.slice(0, -1))
    setRack((prev) => [...prev, last.isBlank ? BLANK_TILE : last.letter])
    setMessage(last.isBlank ? "Returned blank tile to the rack." : `Returned ${last.letter} to the rack.`)
  }

  function clearCurrentMove() {
    setRack(startingRack)
    setPlacedTiles([])
    setSelectedTile(null)
    setDraggedTile(null)
    setDraggedPlacedTile(null)
    setRackDropIndex(null)
    setMessage("Board cleared. Start a new move.")
  }

  function resetGame() {
    setRack(startingRack)
    setPlacedTiles([])
    setSelectedTile(null)
    setDraggedTile(null)
    setDraggedPlacedTile(null)
    setSubmittedWords([])
    setSubmittedScore(0)
    setAttemptsLeft(maxAttempts)
    setBestScore(0)
    setAttemptHistory([])
    setRackDropIndex(null)
    setHintUsed(false)
    setShowHint(false)
    statsUpdatedRef.current = false
    setMessage("New game started.")
    localStorage.removeItem(storageKey)
  }

  function updateStats(rating: string) {
    if (statsUpdatedRef.current) return
    statsUpdatedRef.current = true

    try {
      const saved = localStorage.getItem(STATS_KEY)
      const current: GameStats = saved ? JSON.parse(saved) : defaultStats
      if (current.lastPlayedDate === puzzle.date) return

      const yesterday = new Date(new Date(puzzle.date).getTime() - 86400000)
        .toISOString()
        .slice(0, 10)
      const newStreak =
        current.lastPlayedDate === yesterday ? current.currentStreak + 1 : 1

      const newStats: GameStats = {
        gamesPlayed: current.gamesPlayed + 1,
        currentStreak: newStreak,
        maxStreak: Math.max(current.maxStreak, newStreak),
        lastPlayedDate: puzzle.date,
        ratingCounts: {
          ...current.ratingCounts,
          [rating]: (current.ratingCounts[rating] ?? 0) + 1,
        },
      }

      localStorage.setItem(STATS_KEY, JSON.stringify(newStats))
      setStats(newStats)
    } catch {
      // ignore
    }
  }

  function dismissTutorial() {
    setShowTutorial(false)
    localStorage.setItem("daily-word-game-tutorial-seen", "1")
  }

  function selectPuzzleDate(date: string) {
    const newPuzzle = DAILY_PUZZLES.find((p) => p.date === date) || getTodayPuzzle()
    setSelectedDate(date)
    setRack(newPuzzle.rack)
    setPlacedTiles([])
    setSelectedTile(null)
    setDraggedTile(null)
    setDraggedPlacedTile(null)
    setSubmittedWords([])
    setSubmittedScore(0)
    setAttemptsLeft(maxAttempts)
    setBestScore(0)
    setAttemptHistory([])
    setRackDropIndex(null)
    setHintUsed(false)
    setShowHint(false)
    setShowArchive(false)
    statsUpdatedRef.current = false
    setMessage("Drag a tile onto the board, drag rack tiles between slots, or click a tile and then click a square.")
    setHasLoadedSave(false)
  }

  function handleRackTouchStart(e: React.TouchEvent, tile: string, index: number) {
    if (gameOver) return
    const touch = e.touches[0]
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
    setTouchDrag({
      type: "rack",
      letter: tile,
      index,
      isBlank: tile === BLANK_TILE,
      x: touch.clientX,
      y: touch.clientY,
    })
    setDraggedTile({ letter: tile, index, isBlank: tile === BLANK_TILE })
    setDraggedPlacedTile(null)
    setSelectedTile(null)
  }

  function handlePlacedTouchStart(
    e: React.TouchEvent,
    row: number,
    col: number,
    letter: string,
    isBlank: boolean
  ) {
    if (gameOver) return
    const touch = e.touches[0]
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
    setTouchDrag({ type: "placed", letter, row, col, isBlank, x: touch.clientX, y: touch.clientY })
    setDraggedPlacedTile({ row, col, letter, isBlank })
    setDraggedTile(null)
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const drag = touchDragRef.current
    if (!drag) return
    const touch = e.changedTouches[0]
    const start = touchStartPosRef.current
    const moved = start ? Math.hypot(touch.clientX - start.x, touch.clientY - start.y) : 999

    if (moved < 10) {
      setTouchDrag(null)
      touchStartPosRef.current = null
      setDraggedTile(null)
      setDraggedPlacedTile(null)
      if (drag.type === "rack") {
        setSelectedTile({ letter: drag.letter, index: drag.index, isBlank: drag.isBlank })
      } else {
        returnPlacedTileToRack({ row: drag.row, col: drag.col, letter: drag.letter, isBlank: drag.isBlank })
      }
      return
    }

    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const cellEl = el?.closest("[data-row]") as HTMLElement | null
    const returnEl = el?.closest("[data-return-zone]")
    const rackGapEl = el?.closest("[data-rack-gap]") as HTMLElement | null
    const rackTileEl = el?.closest("[data-rack-tile]") as HTMLElement | null

    setTouchDrag(null)
    touchStartPosRef.current = null

    if (returnEl && drag.type === "placed") {
      setDraggedTile(null)
      setDraggedPlacedTile(null)
      returnPlacedTileToRack({ row: drag.row, col: drag.col, letter: drag.letter, isBlank: drag.isBlank })
    } else if (drag.type === "rack" && rackGapEl) {
      reorderRackTile(drag.index, parseInt(rackGapEl.dataset.rackGap!, 10))
    } else if (drag.type === "rack" && rackTileEl) {
      reorderRackTile(drag.index, parseInt(rackTileEl.dataset.rackTile!, 10))
    } else if (cellEl) {
      const row = parseInt(cellEl.dataset.row!)
      const col = parseInt(cellEl.dataset.col!)
      if (drag.type === "rack") {
        setDraggedTile({ letter: drag.letter, index: drag.index })
        setDraggedPlacedTile(null)
        placeTileOnBoard({ letter: drag.letter, index: drag.index, isBlank: drag.isBlank }, row, col)
      } else {
        setDraggedTile(null)
        setDraggedPlacedTile({ row: drag.row, col: drag.col, letter: drag.letter, isBlank: drag.isBlank })
        movePlacedTileOnBoard({ row: drag.row, col: drag.col, letter: drag.letter, isBlank: drag.isBlank }, row, col)
      }
    } else if (drag.type === "placed") {
      setDraggedTile(null)
      setDraggedPlacedTile(null)
      returnPlacedTileToRack({ row: drag.row, col: drag.col, letter: drag.letter, isBlank: drag.isBlank })
    } else {
      setDraggedTile(null)
      setDraggedPlacedTile(null)
    }
  }

  const gameOver = attemptsLeft === 0
  const canShare = attemptHistory.length > 0
  const turnNumber = Math.min(attemptHistory.length + 1, maxAttempts)

  function getRating() {
    if (solution.bestScore <= 0) return ""
    const percent = bestScore / solution.bestScore

    if (percent >= 1) return "Perfect"
    if (percent >= 0.9) return "Excellent"
    if (percent >= 0.75) return "Great"
    if (percent >= 0.5) return "Solid"
    return "Keep trying"
  }

  function getShareIcon(score: number) {
    if (bestScore === 0) return "⬜"
    if (score === bestScore) return "🟩"
    if (score >= Math.ceil(bestScore * 0.75)) return "🟨"
    return "⬜"
  }

  function isPerfectFirstTryRun() {
    return (
      gameOver &&
      attemptHistory.length === 1 &&
      bestScore >= solution.bestScore &&
      attemptHistory[0]?.totalScore >= solution.bestScore
    )
  }

  function getAttemptLabel(index: number, score: number) {
    if (index === 0 && score >= solution.bestScore) {
      return "Perfect first try"
    }
    return `Attempt ${index + 1}`
  }

  async function shareResults() {
    const header = `Daily Word Game ${puzzle.date}`
    const summary = isPerfectFirstTryRun()
      ? `Perfect first try: ${bestScore}/${solution.bestScore}`
      : `Best Score: ${bestScore}/${solution.bestScore}`
    const lines = attemptHistory.map((attempt, index) => {
      const icon = getShareIcon(attempt.totalScore)
      return `${icon} ${getAttemptLabel(index, attempt.totalScore)}: ${attempt.totalScore}`
    })
    const text = [header, summary, "", ...lines].join("\n")

    try {
      await navigator.clipboard.writeText(text)
      setMessage("Results copied to clipboard.")
    } catch {
      setMessage("Could not copy results automatically.")
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, rgba(251,245,234,0.96) 0%, rgba(242,230,210,0.96) 100%)",
        padding: "clamp(12px, 4vw, 32px)",
        fontFamily: "var(--font-sans)",
        color: "#2f2419",
        animation: "fade-up 300ms ease both",
      }}
    >
      <div style={{ maxWidth: "920px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
            flexWrap: "wrap",
            marginBottom: "16px",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: "12px",
                textTransform: "uppercase",
                letterSpacing: "0.16em",
                color: "#8a6a42",
                fontWeight: 800,
              }}
            >
              Daily Puzzle
            </p>
            <h1 style={{ fontSize: "clamp(28px, 5vw, 42px)", marginBottom: "6px", marginTop: "6px", fontFamily: "Georgia, serif" }}>
              Daily Word Game
            </h1>
            <p style={{ margin: 0, fontSize: "15px", color: "#6d5537" }}>
              Puzzle date: <strong>{puzzle.date}</strong>
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              onClick={() => setShowStats((s) => !s)}
              style={{
                padding: "8px 14px",
                fontSize: "13px",
                borderRadius: "999px",
                border: "1px solid rgba(123, 98, 65, 0.2)",
                backgroundColor: showStats ? "#d7c3a0" : "rgba(255,250,240,0.8)",
                cursor: "pointer",
                color: "#2f2419",
                fontWeight: "bold",
              }}
            >
              Stats
            </button>
            <button
              onClick={() => setShowArchive((s) => !s)}
              style={{
                padding: "8px 14px",
                fontSize: "13px",
                borderRadius: "999px",
                border: "1px solid rgba(123, 98, 65, 0.2)",
                backgroundColor: showArchive ? "#d7c3a0" : "rgba(255,250,240,0.8)",
                cursor: "pointer",
                color: "#2f2419",
                fontWeight: "bold",
              }}
            >
              Archive
            </button>
            <button
              onClick={() => setShowTutorial(true)}
              style={{
                padding: "8px 14px",
                fontSize: "13px",
                borderRadius: "999px",
                border: "1px solid rgba(123, 98, 65, 0.2)",
                backgroundColor: "rgba(255,250,240,0.8)",
                cursor: "pointer",
                color: "#2f2419",
                fontWeight: "bold",
              }}
            >
              How to Play
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          {[
            { label: "Turn", value: `${gameOver ? attemptHistory.length : turnNumber}/${maxAttempts}` },
            { label: "Best Score", value: bestScore },
            { label: "Optimal", value: solution.bestScore },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                background: "rgba(255,250,240,0.86)",
                border: "1px solid rgba(123, 98, 65, 0.14)",
                borderRadius: "16px",
                padding: "12px 14px",
                boxShadow: "0 10px 24px rgba(78, 56, 28, 0.06)",
              }}
            >
              <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a6a42", fontWeight: 700 }}>
                {item.label}
              </div>
              <div style={{ fontSize: "28px", fontWeight: 800, marginTop: "2px" }}>{item.value}</div>
            </div>
          ))}
        </div>

        {showStats && (
          <div
            style={{
              background: "rgba(255,250,240,0.88)",
              border: "1px solid rgba(123, 98, 65, 0.14)",
              borderRadius: "18px",
              padding: "16px 20px",
              marginBottom: "16px",
              maxWidth: "560px",
              boxShadow: "0 12px 28px rgba(78, 56, 28, 0.06)",
              animation: "fade-up 220ms ease both",
            }}
          >
            <strong style={{ fontSize: "18px" }}>Your Stats</strong>
            <div style={{ display: "flex", gap: "24px", marginTop: "12px", flexWrap: "wrap" }}>
              {[
                { label: "Played", value: stats.gamesPlayed },
                { label: "Streak", value: stats.currentStreak },
                { label: "Best Streak", value: stats.maxStreak },
              ].map(({ label, value }) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "28px", fontWeight: "bold" }}>{value}</div>
                  <div style={{ fontSize: "12px", color: "#5b4630" }}>{label}</div>
                </div>
              ))}
            </div>
            {stats.gamesPlayed > 0 && (
              <div style={{ marginTop: "16px" }}>
                <div style={{ fontWeight: "bold", marginBottom: "8px", fontSize: "13px" }}>
                  Score Distribution
                </div>
                {(["Perfect", "Excellent", "Great", "Solid", "Keep trying"] as const).map(
                  (rating) => {
                    const count = stats.ratingCounts[rating] ?? 0
                    const pct = Math.round((count / stats.gamesPlayed) * 100)
                    return (
                      <div
                        key={rating}
                        style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}
                      >
                        <span style={{ width: "80px", fontSize: "12px", flexShrink: 0 }}>{rating}</span>
                        <div
                          style={{
                            height: "18px",
                            width: `${Math.max(pct, count > 0 ? 6 : 0)}%`,
                            backgroundColor: "#b98f58",
                            borderRadius: "3px",
                            minWidth: count > 0 ? "24px" : "0",
                            transition: "width 0.3s",
                          }}
                        />
                        <span style={{ fontSize: "12px" }}>{count}</span>
                      </div>
                    )
                  }
                )}
              </div>
            )}
          </div>
        )}

        {showArchive && (
          <div
            style={{
              background: "rgba(255,250,240,0.88)",
              border: "1px solid rgba(123, 98, 65, 0.14)",
              borderRadius: "18px",
              padding: "16px 20px",
              marginBottom: "16px",
              maxWidth: "700px",
              boxShadow: "0 12px 28px rgba(78, 56, 28, 0.06)",
              animation: "fade-up 220ms ease both",
            }}
          >
            <strong style={{ fontSize: "16px" }}>Puzzle Archive</strong>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                marginTop: "12px",
                maxHeight: "180px",
                overflowY: "auto",
                paddingRight: "4px",
              }}
            >
              {DAILY_PUZZLES.filter((p) => p.date <= todayDate)
                .slice()
                .reverse()
                .map((p) => (
                  <button
                    key={p.date}
                    onClick={() => selectPuzzleDate(p.date)}
                    style={{
                      padding: "7px 12px",
                      fontSize: "13px",
                      borderRadius: "999px",
                      border: "1px solid rgba(123, 98, 65, 0.2)",
                      backgroundColor: p.date === selectedDate ? "#b98f58" : "#efe2c7",
                      color: p.date === selectedDate ? "#fff" : "#2f2419",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    {p.date === todayDate ? `${p.date} (Today)` : p.date}
                  </button>
                ))}
            </div>
          </div>
        )}

        <div
          style={{
            background: "rgba(255,250,240,0.88)",
            border: "1px solid rgba(123, 98, 65, 0.14)",
            borderRadius: "16px",
            padding: "14px 16px",
            marginBottom: "18px",
            boxShadow: "0 10px 24px rgba(78, 56, 28, 0.06)",
          }}
        >
          <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a6a42", fontWeight: 700, marginBottom: "6px" }}>
            Current Turn
          </div>
          <div>{message}</div>

          {(submittedWords.length > 0 || attemptHistory.length > 0) && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "14px",
                marginTop: "14px",
              }}
            >
              {submittedWords.length > 0 && (
                <div>
                  <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a6a42", marginBottom: "6px" }}>
                    Latest Move
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "18px" }}>
                    {submittedWords.map((item, index) => (
                      <li key={index}>
                        {item.word} - {item.score} points
                      </li>
                    ))}
                  </ul>
                  <div style={{ marginTop: "8px" }}>Total: {submittedScore}</div>
                </div>
              )}

              {attemptHistory.length > 0 && (
                <div>
                  <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a6a42", marginBottom: "6px" }}>
                    Run So Far
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "18px" }}>
                    {attemptHistory.map((attempt, index) => (
                      <li key={index} style={{ marginBottom: "6px" }}>
                        {getShareIcon(attempt.totalScore)} {getAttemptLabel(index, attempt.totalScore)}:{" "}
                        {attempt.words.map((word) => word.word).join(", ")} - {attempt.totalScore}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {canShare && (
            <button
              onClick={shareResults}
              style={{
                padding: "10px 14px",
                fontSize: "14px",
                borderRadius: "999px",
                border: "1px solid rgba(123, 98, 65, 0.2)",
                backgroundColor: "#f5ead6",
                cursor: "pointer",
                color: "#2f2419",
                fontWeight: 700,
                marginTop: "14px",
              }}
            >
              Share Results
            </button>
          )}
        </div>

        {gameOver && (
          <div
            style={{
              marginBottom: "18px",
              padding: "20px",
              background: "linear-gradient(180deg, #f5fbef 0%, #edf6e7 100%)",
              border: "1px solid rgba(98, 128, 76, 0.22)",
              borderRadius: "22px",
              maxWidth: "620px",
              boxShadow: "0 16px 32px rgba(84, 116, 66, 0.08)",
              animation: "fade-up 240ms ease both",
            }}
          >
            <strong>{isPerfectFirstTryRun() ? "Perfect First Try" : "Results"}</strong>
            <p style={{ marginTop: "10px" }}>
              {isPerfectFirstTryRun() ? (
                <>You found the optimal play immediately with <strong>{bestScore}</strong> points.</>
              ) : (
                <>Your best score: <strong>{bestScore}</strong></>
              )}
            </p>
            <p>
              Optimal score: <strong>{solution.bestScore}</strong>
            </p>
            <p>
              {isPerfectFirstTryRun() ? (
                <>No extra attempts needed.</>
              ) : (
                <>Rating: <strong>{getRating()}</strong></>
              )}
            </p>
            <p>
              Best play: <strong>{solution.bestWords.join(", ") || "Unknown"}</strong>
            </p>
            {solution.bestPlacement.length > 0 && (
              <p style={{ fontSize: "13px", color: "#1d4ed8", margin: "4px 0 0" }}>
                Blue tiles on the board show the optimal placement.
              </p>
            )}

            <div
              style={{
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
                marginTop: "10px",
              }}
            >
              <button
                onClick={resetGame}
                style={{
                  padding: "11px 16px",
                  fontSize: "15px",
                  borderRadius: "12px",
                  border: "1px solid rgba(123, 98, 65, 0.2)",
                  backgroundColor: "#d7c3a0",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Reset Today’s Puzzle
              </button>

              <button
                onClick={shareResults}
                style={{
                  padding: "11px 16px",
                  fontSize: "15px",
                  borderRadius: "12px",
                  border: "1px solid rgba(123, 98, 65, 0.2)",
                  backgroundColor: "#f5ead6",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Share Results
              </button>
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            alignItems: "stretch",
          }}
        >
          <div
            style={{
              background:
                "linear-gradient(180deg, #c79a5f 0%, #b98f58 42%, #aa804b 100%)",
              padding: "14px",
              borderRadius: "22px",
              boxShadow: "0 16px 34px rgba(94, 66, 33, 0.18)",
              width: "100%",
              maxWidth: "100%",
              overflowX: "auto",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`,
                gap: `${boardGap}px`,
                width: "100%",
                maxWidth: boardMaxWidth,
                margin: "0 auto",
              }}
            >
              {Array.from({ length: boardSize * boardSize }).map((_, index) => {
                const row = Math.floor(index / boardSize)
                const col = index % boardSize
                const letter = getCellLetter(row, col)
                const placedTile = getPlacedTile(row, col)
                const optimalLetter =
                  gameOver && !letter
                    ? solution.bestPlacement.find(
                        (p) => p.row === row && p.col === col
                      )?.letter ?? ""
                    : ""
                const displayLetter = letter || optimalLetter
                const hasLetter = Boolean(displayLetter)
                const letterScore = displayLetter
                  ? placedTile?.isBlank
                    ? 0
                    : LETTER_SCORES[displayLetter] || 0
                  : 0
                const isMovablePlacedTile = Boolean(placedTile)

                return (
                  <div
                    key={index}
                    data-row={row}
                    data-col={col}
                    onClick={() => handleCellClick(row, col)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      handleCellDrop(row, col)
                    }}
                    draggable={isMovablePlacedTile && !gameOver}
                    onDragStart={(e) => {
                      if (placedTile) {
                        handlePlacedTileDragStart(e, row, col, letter, placedTile.isBlank)
                      }
                    }}
                    onDragEnd={handlePlacedTileDragEnd}
                    onTouchStart={
                      placedTile
                        ? (e) => handlePlacedTouchStart(e, row, col, letter, placedTile.isBlank)
                        : undefined
                    }
                    onTouchEnd={isMovablePlacedTile ? handleTouchEnd : undefined}
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      border:
                        draggedTile && !letter
                          ? "2px dashed #7b6241"
                          : "1px solid #7b6241",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: hasLetter ? boardTileFontSize : boardBonusFontSize,
                      fontWeight: "bold",
                      backgroundColor: getCellBackground(row, col, Boolean(letter)),
                      cursor: isMovablePlacedTile
                        ? "grab"
                        : gameOver
                        ? "default"
                        : "pointer",
                      color: optimalLetter ? "#1d4ed8" : hasLetter ? "#2f2419" : "#4b5563",
                      position: "relative",
                      borderRadius: "10px",
                      boxSizing: "border-box",
                      transition: "transform 160ms ease, box-shadow 160ms ease",
                      boxShadow: hasLetter ? "0 3px 6px rgba(0,0,0,0.08)" : "none",
                      opacity:
                        draggedPlacedTile &&
                        draggedPlacedTile.row === row &&
                        draggedPlacedTile.col === col
                          ? 0.55
                          : 1,
                    }}
                  >
                    {displayLetter || getBonusLabel(row, col, Boolean(letter))}
                    {hasLetter && (
                      <span
                        style={{
                          position: "absolute",
                          bottom: "4px",
                          right: "5px",
                          fontSize: boardScoreFontSize,
                          fontWeight: "bold",
                          color: "#4b3a28",
                        }}
                      >
                        {letterScore}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                marginTop: "16px",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <button
                onClick={submitMove}
                disabled={gameOver}
                style={{
                  padding: "13px 20px",
                  fontSize: "16px",
                  borderRadius: "14px",
                  border: "1px solid rgba(69,50,27,0.18)",
                  backgroundColor: gameOver ? "#ddd6c8" : "#fff4d8",
                  cursor: gameOver ? "not-allowed" : "pointer",
                  color: "#2f2419",
                  fontWeight: 800,
                  minWidth: "168px",
                  boxShadow: gameOver ? "none" : "0 8px 18px rgba(78, 56, 28, 0.14)",
                }}
              >
                Submit Move
              </button>

              <button
                onClick={shuffleRack}
                disabled={gameOver}
                style={{
                  padding: "10px 14px",
                  fontSize: "14px",
                  borderRadius: "999px",
                  border: "1px solid rgba(69,50,27,0.18)",
                  backgroundColor: gameOver ? "#ddd6c8" : "#efe2c7",
                  cursor: gameOver ? "not-allowed" : "pointer",
                  color: "#2f2419",
                  fontWeight: 700,
                  minWidth: "104px",
                }}
              >
                Shuffle
              </button>

              <button
                onClick={() => {
                  if (!hintUsed) {
                    setHintUsed(true)
                  }
                  setShowHint((prev) => !prev)
                }}
                disabled={gameOver}
                title="Toggle the optimal placement hint"
                style={{
                  padding: "10px 14px",
                  fontSize: "14px",
                  borderRadius: "999px",
                  border: "1px solid rgba(69,50,27,0.18)",
                  backgroundColor: gameOver ? "#ddd6c8" : showHint ? "#d7c3a0" : "#efe2c7",
                  cursor: gameOver ? "not-allowed" : "pointer",
                  color: "#2f2419",
                  fontWeight: 700,
                  minWidth: "112px",
                }}
              >
                {showHint ? "Hide Hint" : "Show Hint"}
              </button>
            </div>
          </div>

          <div
            style={{
              width: "100%",
              background: "rgba(255,250,240,0.84)",
              border: "1px solid rgba(123, 98, 65, 0.14)",
              borderRadius: "20px",
              padding: "16px",
              boxShadow: "0 12px 28px rgba(78, 56, 28, 0.06)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "12px" }}>
              <h2 style={{ margin: 0, fontSize: "18px" }}>Your Tiles</h2>
              <div style={{ fontSize: "13px", color: "#6d5537" }}>Drag to reorder or tap a tile then a square.</div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "stretch",
                gap: "4px",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              {rack.map((tile, index) => (
                <div
                  key={`${tile}-${index}-wrapper`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <div
                    data-rack-gap={index}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (draggedTile) setRackDropIndex(index)
                    }}
                    onDragLeave={() => {
                      if (rackDropIndex === index) setRackDropIndex(null)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      handleRackGapDrop(index)
                    }}
                    style={{
                      width: "10px",
                      minHeight: "58px",
                      backgroundColor:
                        rackDropIndex === index ? "#2563eb" : "transparent",
                      borderRadius: "999px",
                    }}
                  />

                  <div
                    data-rack-tile={index}
                    draggable={!gameOver}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (draggedTile) setRackDropIndex(index)
                    }}
                    onDragLeave={() => {
                      if (rackDropIndex === index) setRackDropIndex(null)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      handleRackGapDrop(index)
                    }}
                    onDragStart={(e) => handleTileDragStart(e, tile, index)}
                    onDragEnd={handleRackTileDragEnd}
                    onClick={() => handleTileClick(tile, index)}
                    onTouchStart={(e) => handleRackTouchStart(e, tile, index)}
                    onTouchEnd={handleTouchEnd}
                    style={{
                      width: "56px",
                      height: "56px",
                      border:
                        selectedTile?.index === index
                          ? "3px solid #2563eb"
                          : draggedTile?.index === index
                          ? "3px solid #7b6241"
                          : "2px solid #7b6241",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "26px",
                      fontWeight: "bold",
                      backgroundColor: "#e7d3a8",
                      cursor: gameOver ? "default" : "grab",
                      position: "relative",
                      borderRadius: "12px",
                      boxShadow: "0 6px 14px rgba(0,0,0,0.12)",
                      color: "#2f2419",
                      opacity: draggedTile?.index === index ? 0.6 : 1,
                      transition: "transform 160ms ease, box-shadow 160ms ease",
                    }}
                  >
                    {tile}
                    <span
                      style={{
                        position: "absolute",
                        bottom: "4px",
                        right: "6px",
                        fontSize: "11px",
                        fontWeight: "bold",
                        color: "#4b3a28",
                      }}
                    >
                      {tile === BLANK_TILE ? 0 : LETTER_SCORES[tile] || 0}
                    </span>
                  </div>

                  {index === rack.length - 1 && (
                    <div
                      data-rack-gap={rack.length}
                      onDragOver={(e) => {
                        e.preventDefault()
                        if (draggedTile) setRackDropIndex(rack.length)
                      }}
                      onDragLeave={() => {
                        if (rackDropIndex === rack.length) setRackDropIndex(null)
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        handleRackGapDrop(rack.length)
                      }}
                      style={{
                        width: "10px",
                        minHeight: "58px",
                        backgroundColor:
                          rackDropIndex === rack.length ? "#2563eb" : "transparent",
                        borderRadius: "999px",
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                marginTop: "18px",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <button
                onClick={undoLastTile}
                disabled={gameOver || placedTiles.length === 0}
                style={{
                  padding: "10px 14px",
                  fontSize: "14px",
                  borderRadius: "999px",
                  border: "1px solid rgba(123, 98, 65, 0.2)",
                  backgroundColor:
                    gameOver || placedTiles.length === 0 ? "#ddd6c8" : "#efe2c7",
                  cursor: gameOver || placedTiles.length === 0 ? "not-allowed" : "pointer",
                  color: "#2f2419",
                  fontWeight: 700,
                }}
              >
                Undo
              </button>

              <button
                onClick={clearCurrentMove}
                disabled={gameOver}
                style={{
                  padding: "10px 14px",
                  fontSize: "14px",
                  borderRadius: "999px",
                  border: "1px solid rgba(123, 98, 65, 0.2)",
                  backgroundColor: gameOver ? "#ddd6c8" : "#efe2c7",
                  cursor: gameOver ? "not-allowed" : "pointer",
                  color: "#2f2419",
                  fontWeight: 700,
                }}
              >
                Clear Move
              </button>

              <button
                onClick={resetGame}
                style={{
                  padding: "10px 14px",
                  fontSize: "14px",
                  borderRadius: "999px",
                  border: "1px solid rgba(123, 98, 65, 0.2)",
                  backgroundColor: "#f5ead6",
                  cursor: "pointer",
                  color: "#2f2419",
                  fontWeight: 700,
                }}
              >
                Reset Puzzle
              </button>
            </div>
          </div>
        </div>
      </div>

      {touchDrag && (
        <div
          style={{
            position: "fixed",
            left: touchDrag.x + 12,
            top: touchDrag.y - 72,
            width: "56px",
            height: "56px",
            backgroundColor: "#e7d3a8",
            border: "2px solid #7b6241",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "26px",
            fontWeight: "bold",
            color: "#2f2419",
            pointerEvents: "none",
            zIndex: 9999,
            opacity: 0.85,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          {touchDrag.letter}
          <span
            style={{
              position: "absolute",
              bottom: "4px",
              right: "6px",
              fontSize: "11px",
              fontWeight: "bold",
              color: "#4b3a28",
            }}
          >
            {touchDrag.isBlank ? 0 : LETTER_SCORES[touchDrag.letter] || 0}
          </span>
        </div>
      )}

      {showTutorial && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "16px",
          }}
        >
          <div
            style={{
              backgroundColor: "#fffaf0",
              borderRadius: "12px",
              padding: "28px 24px",
              maxWidth: "480px",
              width: "100%",
              border: "2px solid #c8b68f",
              fontFamily: "Georgia, serif",
              color: "#2f2419",
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: "22px" }}>How to Play</h2>
            <ul style={{ paddingLeft: "20px", lineHeight: "1.7", marginBottom: "20px" }}>
              <li>
                <strong>Place tiles</strong> from your rack onto the board. Your tiles must all be in one row or one column, and they must connect to the letters already on the board.
              </li>
              <li>
                <strong>Form valid words.</strong> The tiles you place, combined with existing board letters, must spell real English words. Perpendicular words created by your placement also count.
              </li>
              <li>
                <strong>Score big</strong> with bonus squares: DL (double letter), TL (triple letter), DW (double word), TW (triple word). Bonuses apply only to newly placed tiles.
              </li>
              <li>
                You have <strong>3 attempts</strong>. Your best score is compared to the optimal score, but if you hit the optimal score on your first try, the puzzle ends immediately.
              </li>
              <li>
                On <strong>mobile</strong>, drag tiles by touch or tap a tile then tap a board square.
              </li>
            </ul>
            <button
              onClick={dismissTutorial}
              style={{
                padding: "12px 28px",
                fontSize: "17px",
                borderRadius: "8px",
                border: "2px solid #7b6241",
                backgroundColor: "#d7c3a0",
                cursor: "pointer",
                color: "#2f2419",
                fontWeight: "bold",
                width: "100%",
              }}
            >
              Got It!
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
