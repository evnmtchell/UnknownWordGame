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

type WordPreview = {
  word: string
  score: number
  cells: { row: number; col: number; letter: string; isBlank: boolean }[]
}

type AttemptResult = {
  words: WordResult[]
  totalScore: number
  placements: PlacedTile[]
}

type SavedGameState = {
  attemptsLeft: number
  bestScore: number
  attemptHistory: AttemptResult[]
  submittedWords: WordResult[]
  submittedScore: number
  message: string
  hintUsed: boolean
  hintLevel?: number
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

function triggerHapticFeedback(pattern: number | number[] = 12) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return
  }

  navigator.vibrate(pattern)
}

export default function Home() {
  const todayDate = useMemo(() => getLocalDateString(), [])
  const [selectedDate, setSelectedDate] = useState(todayDate)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [showArchive, setShowArchive] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [touchDrag, setTouchDrag] = useState<TouchDragState>(null)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const touchDragRef = useRef<TouchDragState>(null)
  const draggedTileRef = useRef<TileSelection>(null)
  const draggedPlacedTileRef = useRef<DraggedPlacedTile>(null)
  const completeTouchDragRef = useRef<((touch: { clientX: number; clientY: number }) => void) | null>(null)
  const reorderRackTileRef = useRef<((fromIndex: number, targetIndex: number) => void) | null>(null)
  const placeTileOnBoardRef = useRef<((tileData: TileSelection, row: number, col: number) => void) | null>(null)
  const movePlacedTileOnBoardRef = useRef<((tile: DraggedPlacedTile, row: number, col: number) => void) | null>(null)
  const returnPlacedTileToRackRef = useRef<((tile: DraggedPlacedTile) => void) | null>(null)

  const puzzle = useMemo(
    () => DAILY_PUZZLES.find((p) => p.date === selectedDate) || getTodayPuzzle(),
    [selectedDate]
  )
  const solution = useMemo(() => solvePuzzle(puzzle), [puzzle])

  const isCompactMobile =
    viewportSize.width > 0 &&
    viewportSize.width <= 430 &&
    viewportSize.height > 0 &&
    viewportSize.height <= 950
  const boardSize = puzzle.boardSize
  const maxAttempts = 3
  const startingRack = puzzle.rack
  const storageKey = `daily-word-game-${puzzle.date}`
  const boardGap = isCompactMobile ? 3 : 4
  const boardCellSize = isCompactMobile ? 46 : 54
  const compactRackGapWidth = 2
  const compactRackTileSize =
    isCompactMobile && viewportSize.width > 0
      ? Math.max(
          34,
          Math.min(
            46,
            Math.floor(
              (viewportSize.width - 32 - (startingRack.length + 1) * compactRackGapWidth) /
                startingRack.length
            )
          )
        )
      : 46
  const rackTileSize = isCompactMobile ? compactRackTileSize : 56
  const actionButtonMinHeight = isCompactMobile ? 46 : 54
  const boardMaxWidth = `${boardSize * boardCellSize + (boardSize - 1) * boardGap}px`
  const boardTileFontSize = isCompactMobile ? "clamp(16px, 4.8vw, 20px)" : "clamp(18px, 5vw, 24px)"
  const boardBonusFontSize = isCompactMobile ? "clamp(7px, 2vw, 9px)" : "clamp(8px, 2.4vw, 11px)"
  const boardScoreFontSize = isCompactMobile ? "clamp(7px, 1.8vw, 9px)" : "clamp(8px, 2vw, 10px)"
  const validWordOutlineColor = "#72ad2d"
  const validWordOutlineThickness = isCompactMobile ? 5 : 6
  const validWordOutlineInset = -4
  const validWordOutlineBridge = boardGap / 2 + 5
  const validWordOutlineCornerOffset = isCompactMobile ? 8 : 10

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
  const [hintLevel, setHintLevel] = useState(0)
  const [showHint, setShowHint] = useState(false)
  const [showMoreActions, setShowMoreActions] = useState(false)
  const [showPuzzleReview, setShowPuzzleReview] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [stats, setStats] = useState<GameStats>(defaultStats)
  const statsUpdatedRef = useRef(false)

  const filledCells = puzzle.filledCells
  const bonusCells = puzzle.bonusCells

  useEffect(() => {
    function updateViewportSize() {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    updateViewportSize()
    window.addEventListener("resize", updateViewportSize)
    return () => window.removeEventListener("resize", updateViewportSize)
  }, [])

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
          const savedHintLevel = parsed.hintLevel ?? (parsed.hintUsed ? 1 : 0)
          if (savedHintLevel > 0) {
            setHintLevel(savedHintLevel)
            setShowHint(false)
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
      hintUsed: hintLevel > 0,
      hintLevel,
    }

    localStorage.setItem(storageKey, JSON.stringify(dataToSave))
  }, [
    attemptsLeft,
    bestScore,
    attemptHistory,
    submittedWords,
    submittedScore,
    message,
    hintLevel,
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
    triggerHapticFeedback(10)
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
    if (placedTiles.length === 0) return true
    if (placedTiles.length === 1) {
      return row === placedTiles[0].row || col === placedTiles[0].col
    }

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
    if (tiles.length === 0) return true
    if (tiles.length === 1) {
      return row === tiles[0].row || col === tiles[0].col
    }

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
    triggerHapticFeedback(tileData.isBlank ? [10, 20, 10] : 12)
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
    triggerHapticFeedback(10)
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
    setDraggedPlacedTile(null)
    setSelectedTile(null)
    setRackDropIndex(null)
    triggerHapticFeedback(10)
    setMessage(tile.isBlank ? "Returned blank tile to the rack." : `Returned ${tile.letter} to the rack.`)
  }

  useEffect(() => {
    reorderRackTileRef.current = reorderRackTile
    placeTileOnBoardRef.current = placeTileOnBoard
    movePlacedTileOnBoardRef.current = movePlacedTileOnBoard
    returnPlacedTileToRackRef.current = returnPlacedTileToRack
  })

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

  function getAllWordPreviews() {
    if (placedTiles.length === 0) return []

    const results: WordPreview[] = []
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
        cells: mainCells,
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
            cells: crossCells,
          })
          seenKeys.add(key)
        }
      }
    }

    return results
  }

  function getWordOutlineStyle(row: number, col: number, previews: WordPreview[]) {
    const highlightedCells = new Set(
      previews.flatMap((preview) => preview.cells.map((cell) => `${cell.row}-${cell.col}`))
    )

    if (!highlightedCells.has(`${row}-${col}`)) {
      return {
        top: false,
        right: false,
        bottom: false,
        left: false,
        topLeftRadius: false,
        topRightRadius: false,
        bottomLeftRadius: false,
        bottomRightRadius: false,
      }
    }

    const top = !highlightedCells.has(`${row - 1}-${col}`)
    const right = !highlightedCells.has(`${row}-${col + 1}`)
    const bottom = !highlightedCells.has(`${row + 1}-${col}`)
    const left = !highlightedCells.has(`${row}-${col - 1}`)

    return {
      top,
      right,
      bottom,
      left,
      topLeftRadius: top && left,
      topRightRadius: top && right,
      bottomLeftRadius: bottom && left,
      bottomRightRadius: bottom && right,
    }
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

    const wordsFormed = getAllWordPreviews()

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

    if (wordsFormed.length === 1) {
      const singleWord = wordsFormed[0].word
      const wasAlreadySubmittedAsSingleWord = attemptHistory.some(
        (attempt) => attempt.words.length === 1 && attempt.words[0]?.word === singleWord
      )

      if (wasAlreadySubmittedAsSingleWord) {
        setMessage(
          `${singleWord} was already submitted as its own guess. You can only reuse it as part of a cross word.`
        )
        return
      }
    }

    const totalScore = wordsFormed.reduce((sum, item) => sum + item.score, 0)
    const wordResults = wordsFormed.map(({ word, score }) => ({ word, score }))
    const placementSnapshot = placedTiles.map((tile) => ({ ...tile }))
    const solvedOptimally = totalScore >= solution.bestScore
    const solvedOptimallyOnFirstTry = attemptHistory.length === 0 && solvedOptimally
    const newAttemptsLeft = solvedOptimally ? 0 : attemptsLeft - 1
    const newBestScore = Math.max(bestScore, totalScore)
    const newAttempt = {
      words: wordResults,
      totalScore,
      placements: placementSnapshot,
    }

    setSubmittedWords(wordResults)
    setSubmittedScore(totalScore)
    setAttemptsLeft(newAttemptsLeft)
    setBestScore(newBestScore)
    setAttemptHistory([...attemptHistory, newAttempt])
    triggerHapticFeedback(solvedOptimally ? [18, 24, 18] : [12, 18, 12])
    setMessage(
      solvedOptimallyOnFirstTry
        ? `Perfect first try. You scored the optimal ${solution.bestScore}, so the game is over.`
        : solvedOptimally
        ? `You found the optimal ${solution.bestScore}, so the game is over.`
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
    triggerHapticFeedback(8)
    setMessage(last.isBlank ? "Returned blank tile to the rack." : `Returned ${last.letter} to the rack.`)
  }

  function clearCurrentMove() {
    setRack(startingRack)
    setPlacedTiles([])
    setSelectedTile(null)
    setDraggedTile(null)
    setDraggedPlacedTile(null)
    setRackDropIndex(null)
    triggerHapticFeedback(8)
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
    setHintLevel(0)
    setShowHint(false)
    setShowMoreActions(false)
    setShowPuzzleReview(false)
    statsUpdatedRef.current = false
    triggerHapticFeedback([10, 18, 10])
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
    setHintLevel(0)
    setShowHint(false)
    setShowMoreActions(false)
    setShowPuzzleReview(false)
    setShowArchive(false)
    statsUpdatedRef.current = false
    setMessage("Drag a tile onto the board, drag rack tiles between slots, or click a tile and then click a square.")
    setHasLoadedSave(false)
  }

  function handleRackTouchStart(e: React.TouchEvent, tile: string, index: number) {
    if (gameOver) return
    e.preventDefault()
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
    e.preventDefault()
    const touch = e.touches[0]
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
    setTouchDrag({ type: "placed", letter, row, col, isBlank, x: touch.clientX, y: touch.clientY })
    setDraggedPlacedTile({ row, col, letter, isBlank })
    setDraggedTile(null)
  }

  function completeTouchDrag(touch: { clientX: number; clientY: number }) {
    const drag = touchDragRef.current
    if (!drag) return
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
        returnPlacedTileToRackRef.current?.({
          row: drag.row,
          col: drag.col,
          letter: drag.letter,
          isBlank: drag.isBlank,
        })
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
      returnPlacedTileToRackRef.current?.({
        row: drag.row,
        col: drag.col,
        letter: drag.letter,
        isBlank: drag.isBlank,
      })
    } else if (drag.type === "rack" && rackGapEl) {
      reorderRackTileRef.current?.(drag.index, parseInt(rackGapEl.dataset.rackGap!, 10))
    } else if (drag.type === "rack" && rackTileEl) {
      reorderRackTileRef.current?.(drag.index, parseInt(rackTileEl.dataset.rackTile!, 10))
    } else if (cellEl) {
      const row = parseInt(cellEl.dataset.row!)
      const col = parseInt(cellEl.dataset.col!)
      if (drag.type === "rack") {
        setDraggedTile({ letter: drag.letter, index: drag.index, isBlank: drag.isBlank })
        setDraggedPlacedTile(null)
        placeTileOnBoardRef.current?.(
          { letter: drag.letter, index: drag.index, isBlank: drag.isBlank },
          row,
          col
        )
      } else {
        setDraggedTile(null)
        setDraggedPlacedTile({ row: drag.row, col: drag.col, letter: drag.letter, isBlank: drag.isBlank })
        movePlacedTileOnBoardRef.current?.(
          { row: drag.row, col: drag.col, letter: drag.letter, isBlank: drag.isBlank },
          row,
          col
        )
      }
    } else if (drag.type === "placed") {
      setDraggedTile(null)
      setDraggedPlacedTile(null)
      returnPlacedTileToRackRef.current?.({
        row: drag.row,
        col: drag.col,
        letter: drag.letter,
        isBlank: drag.isBlank,
      })
    } else {
      setDraggedTile(null)
      setDraggedPlacedTile(null)
    }
  }

  useEffect(() => {
    completeTouchDragRef.current = completeTouchDrag
  })

  useEffect(() => {
    function onTouchEnd(e: TouchEvent) {
      if (!touchDragRef.current) return
      const touch = e.changedTouches[0]
      if (!touch) return
      completeTouchDragRef.current?.(touch)
    }

    document.addEventListener("touchend", onTouchEnd)
    document.addEventListener("touchcancel", onTouchEnd)

    return () => {
      document.removeEventListener("touchend", onTouchEnd)
      document.removeEventListener("touchcancel", onTouchEnd)
    }
  }, [])

  const gameOver = attemptsLeft === 0
  const canShare = attemptHistory.length > 0
  const turnNumber = Math.min(attemptHistory.length + 1, maxAttempts)
  const completedTurns = Math.min(attemptHistory.length, maxAttempts)
  const turnProgressDegrees = `${(completedTurns / maxAttempts) * 360}deg`

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

  function getAttemptHighlightColor(score: number) {
    if (bestScore === 0) return "#e7e5e4"
    if (score === bestScore) return "#86efac"
    if (score >= Math.ceil(bestScore * 0.75)) return "#fde68a"
    return "#d6d3d1"
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

  function applySecondHint() {
    const nextHintTile = solution.bestPlacement.find(
      (cell) => !placedTiles.some((tile) => tile.row === cell.row && tile.col === cell.col)
    )

    if (!nextHintTile) {
      setMessage("The best placement is already fully on the board.")
      return
    }

    if (getCellLetter(nextHintTile.row, nextHintTile.col)) {
      setMessage("Clear your current move before using the second hint.")
      return
    }

    if (!isPlacementAllowed(nextHintTile.row, nextHintTile.col)) {
      setMessage("Clear your current move before using the second hint.")
      return
    }

    const exactRackIndex = rack.findIndex((tile) => tile === nextHintTile.letter)
    const blankRackIndex = rack.findIndex((tile) => tile === BLANK_TILE)

    if (exactRackIndex === -1 && blankRackIndex === -1) {
      setMessage("No matching tile is available in your rack for that hint.")
      return
    }

    const rackIndex = exactRackIndex !== -1 ? exactRackIndex : blankRackIndex
    const useBlank = rack[rackIndex] === BLANK_TILE

    setPlacedTiles((prev) => [
      ...prev,
      {
        row: nextHintTile.row,
        col: nextHintTile.col,
        letter: nextHintTile.letter,
        isBlank: useBlank,
      },
    ])
    setRack((prev) => prev.filter((_, index) => index !== rackIndex))
    setSelectedTile(null)
    setDraggedTile(null)
    setDraggedPlacedTile(null)
    setRackDropIndex(null)
    setHintLevel(2)
    setShowHint(true)
    triggerHapticFeedback([10, 20, 10])
  }

  function getHintStatusText() {
    if (hintLevel === 0) return ""
    if (hintLevel === 1) return "Hint used"
    return "Hint used: one tile placed"
  }

  function handleHintClick() {
    if (hintLevel === 0) {
      setHintLevel(1)
      setShowHint(true)
      triggerHapticFeedback(10)
      return
    }

    if (hintLevel === 1) {
      applySecondHint()
    }
  }

  async function shareResults() {
    const header = `Daily Word Game ${puzzle.date}`
    const summary = isPerfectFirstTryRun()
      ? `Perfect first try: ${bestScore}/${solution.bestScore}`
      : `Best Score: ${bestScore}/${solution.bestScore}`
    const hintSummary = getHintStatusText()
    const lines = attemptHistory.map((attempt, index) => {
      const icon = getShareIcon(attempt.totalScore)
      return `${icon} ${getAttemptLabel(index, attempt.totalScore)}: ${attempt.totalScore}`
    })
    const text = [header, summary, hintSummary, "", ...lines].filter(Boolean).join("\n")

    try {
      await navigator.clipboard.writeText(text)
      setMessage("Results copied to clipboard.")
    } catch {
      setMessage("Could not copy results automatically.")
    }
  }

  const validWordPreviews = getAllWordPreviews().filter((preview) => VALID_WORDS.has(preview.word))

  return (
    <main
      style={{
        minHeight: "100dvh",
        background:
          "linear-gradient(180deg, rgba(251,245,234,0.96) 0%, rgba(242,230,210,0.96) 100%)",
        padding: isCompactMobile
          ? "max(8px, env(safe-area-inset-top)) 8px max(8px, env(safe-area-inset-bottom))"
          : "clamp(12px, 4vw, 32px)",
        fontFamily: "var(--font-sans)",
        color: "#2f2419",
        animation: "fade-up 300ms ease both",
      }}
    >
      <div style={{ maxWidth: isCompactMobile ? "100%" : "920px", margin: "0 auto" }}>
        <div
          style={{
            display: isCompactMobile ? "none" : "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: isCompactMobile ? "8px" : "16px",
            flexWrap: "wrap",
            marginBottom: isCompactMobile ? "8px" : "16px",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: isCompactMobile ? "10px" : "12px",
                textTransform: "uppercase",
                letterSpacing: "0.16em",
                color: "#8a6a42",
                fontWeight: 800,
              }}
            >
              Daily Puzzle
            </p>
            <h1 style={{ fontSize: isCompactMobile ? "22px" : "clamp(28px, 5vw, 42px)", marginBottom: isCompactMobile ? "2px" : "6px", marginTop: isCompactMobile ? "2px" : "6px", fontFamily: "Georgia, serif" }}>
              Daily Word Game
            </h1>
            <p style={{ margin: 0, fontSize: isCompactMobile ? "12px" : "15px", color: "#6d5537" }}>
              Puzzle date: <strong>{puzzle.date}</strong>
            </p>
          </div>

          <div style={{ display: "flex", gap: isCompactMobile ? "6px" : "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              onClick={() => setShowStats((s) => !s)}
              style={{
                padding: isCompactMobile ? "6px 10px" : "8px 14px",
                fontSize: isCompactMobile ? "11px" : "13px",
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
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: isCompactMobile ? "8px" : "12px",
            flexWrap: "wrap",
            marginBottom: isCompactMobile ? "8px" : "16px",
            padding: isCompactMobile ? "10px 10px 8px" : "12px 16px",
            borderRadius: isCompactMobile ? "18px" : "20px",
            background: isCompactMobile
              ? "linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(247,242,234,0.94) 100%)"
              : "linear-gradient(180deg, rgba(255,250,240,0.92) 0%, rgba(247,237,220,0.92) 100%)",
            border: "1px solid rgba(123, 98, 65, 0.14)",
            boxShadow: isCompactMobile ? "0 10px 22px rgba(78, 56, 28, 0.08)" : "0 10px 24px rgba(78, 56, 28, 0.06)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: isCompactMobile ? "8px" : "10px", flexWrap: "wrap", width: isCompactMobile ? "100%" : undefined }}>
            <div
              style={{
                background: isCompactMobile ? "#eef2f9" : "#dbe9ff",
                color: isCompactMobile ? "#5f646e" : "#26456e",
                borderRadius: isCompactMobile ? "14px" : "14px",
                padding: isCompactMobile ? "10px 12px" : "10px 14px",
                minWidth: isCompactMobile ? "96px" : "132px",
                flex: isCompactMobile ? "1 1 0" : undefined,
              }}
            >
              <div style={{ fontSize: isCompactMobile ? "11px" : "11px", textTransform: isCompactMobile ? "none" : "uppercase", letterSpacing: isCompactMobile ? "0" : "0.08em", fontWeight: 800, opacity: 0.72 }}>
                {isCompactMobile ? "Score" : bestScore}
              </div>
              <div style={{ fontSize: isCompactMobile ? "18px" : "28px", fontWeight: 900, lineHeight: 1.1 }}>
                {isCompactMobile ? bestScore : `${gameOver ? attemptHistory.length : turnNumber}/${maxAttempts}`}
              </div>
            </div>

            <div
              style={{
                background: isCompactMobile ? "transparent" : "#fff7dc",
                color: "#6b4f14",
                borderRadius: "999px",
                padding: isCompactMobile ? "0" : "8px 14px",
                display: "flex",
                alignItems: "center",
                gap: isCompactMobile ? "6px" : "8px",
                fontWeight: 800,
                justifyContent: "center",
                flex: isCompactMobile ? "0 0 auto" : undefined,
              }}
            >
              {isCompactMobile ? (
                <div
                  style={{
                    width: "68px",
                    height: "68px",
                    borderRadius: "999px",
                    background:
                      `conic-gradient(#6aa5ff 0deg, #6aa5ff ${turnProgressDegrees}, #f0f2f6 ${turnProgressDegrees}, #f0f2f6 360deg)`,
                    display: "grid",
                    placeItems: "center",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      width: "50px",
                      height: "50px",
                      borderRadius: "999px",
                      background: "#fffdf8",
                      display: "grid",
                      placeItems: "center",
                      boxShadow: "inset 0 0 0 1px rgba(123, 98, 65, 0.08)",
                      textAlign: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "9px", color: "#8a6a42", lineHeight: 1, letterSpacing: "0.04em" }}>OPTIMAL</div>
                      <div style={{ fontSize: "20px", color: "#f2b400", fontWeight: 900, lineHeight: 1.05 }}>
                        {solution.bestScore}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <span style={{ fontSize: isCompactMobile ? "10px" : "12px", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.72 }}>
                    Optimal
                  </span>
                  <span style={{ fontSize: isCompactMobile ? "20px" : "24px", lineHeight: 1 }}>{solution.bestScore}</span>
                </>
              )}
            </div>

          </div>

          <div style={{ display: isCompactMobile ? "none" : "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end", width: isCompactMobile ? "auto" : undefined }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: isCompactMobile ? "11px" : "11px", textTransform: isCompactMobile ? "none" : "uppercase", letterSpacing: isCompactMobile ? "0" : "0.08em", color: "#8a6a42", fontWeight: 800 }}>
                {solution.bestScore}
              </div>
              <div style={{ fontSize: isCompactMobile ? "18px" : "24px", fontWeight: 900, color: "#2f2419" }}>{isCompactMobile ? "Optimal" : bestScore}</div>
            </div>
          </div>
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
            background: isCompactMobile ? "transparent" : "rgba(255,250,240,0.88)",
            border: isCompactMobile ? "none" : "1px solid rgba(123, 98, 65, 0.14)",
            borderRadius: isCompactMobile ? "0" : "16px",
            padding: isCompactMobile ? "2px 4px 0" : "14px 16px",
            marginBottom: isCompactMobile ? "10px" : "18px",
            boxShadow: isCompactMobile ? "none" : "0 10px 24px rgba(78, 56, 28, 0.06)",
            textAlign: isCompactMobile ? "center" : "left",
          }}
        >
          {!isCompactMobile && (
            <div style={{ fontSize: isCompactMobile ? "10px" : "12px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a6a42", fontWeight: 700, marginBottom: isCompactMobile ? "4px" : "6px" }}>
              Current Turn
            </div>
          )}
          <div style={{ fontSize: isCompactMobile ? "15px" : "16px", lineHeight: 1.3, fontWeight: isCompactMobile ? 700 : 400 }}>{message}</div>
          {submittedWords.length > 0 && (
            <div
              style={{
                marginTop: "8px",
                fontSize: isCompactMobile ? "14px" : "15px",
                lineHeight: 1.35,
                color: "#5b4630",
                textAlign: isCompactMobile ? "center" : "left",
              }}
            >
              {submittedWords.map((item) => `${item.word} - ${item.score} points`).join(", ")}
            </div>
          )}

          {attemptHistory.length > 0 && (
            <div
              style={{
                display: "grid",
                marginTop: "14px",
              }}
            >
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
              position: "fixed",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: isCompactMobile ? "16px" : "24px",
              background: "rgba(34, 25, 13, 0.18)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              zIndex: 40,
            }}
          >
            <div
              style={{
                position: "relative",
                width: `min(${isCompactMobile ? "calc(100vw - 16px)" : "620px"}, calc(100vw - 24px))`,
                padding: isCompactMobile ? "16px 16px 14px" : "20px",
                background: "linear-gradient(180deg, rgba(245,251,239,0.98) 0%, rgba(237,246,231,0.98) 100%)",
                border: "1px solid rgba(98, 128, 76, 0.22)",
                borderRadius: isCompactMobile ? "18px" : "22px",
                boxShadow: "0 20px 40px rgba(84, 116, 66, 0.16)",
                animation: "pop-in-sheet 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
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
                onClick={() => setShowPuzzleReview(true)}
                style={{
                  padding: "11px 16px",
                  fontSize: "15px",
                  borderRadius: "12px",
                  border: "1px solid rgba(123, 98, 65, 0.2)",
                  backgroundColor: "#eef2f9",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                View Puzzle
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
          </div>
        )}

        {showPuzzleReview && (
          <div
            onClick={() => setShowPuzzleReview(false)}
            style={{
              position: "fixed",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: isCompactMobile ? "16px" : "24px",
              background: "rgba(34, 25, 13, 0.24)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              zIndex: 50,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: `min(${isCompactMobile ? "calc(100vw - 20px)" : "760px"}, calc(100vw - 24px))`,
                maxHeight: "min(84vh, 920px)",
                overflowY: "auto",
                padding: isCompactMobile ? "16px" : "20px",
                background: "linear-gradient(180deg, rgba(255,250,240,0.98) 0%, rgba(247,242,234,0.98) 100%)",
                border: "1px solid rgba(123, 98, 65, 0.14)",
                borderRadius: isCompactMobile ? "18px" : "22px",
                boxShadow: "0 20px 40px rgba(34, 25, 13, 0.18)",
                animation: "pop-in-sheet 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "14px",
                }}
              >
                <div>
                  <strong style={{ fontSize: isCompactMobile ? "18px" : "20px" }}>Puzzle Review</strong>
                  <div style={{ fontSize: "13px", color: "#6d5537", marginTop: "4px" }}>
                    All guesses are overlaid on one board.
                  </div>
                </div>
                <button
                  onClick={() => setShowPuzzleReview(false)}
                  style={{
                    padding: "8px 12px",
                    fontSize: "13px",
                    borderRadius: "999px",
                    border: "1px solid rgba(123, 98, 65, 0.2)",
                    backgroundColor: "#f5ead6",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Close
                </button>
              </div>

              <div style={{ display: "grid", gap: "16px" }}>
                <div
                  style={{
                    background: "rgba(255,255,255,0.7)",
                    border: "1px solid rgba(123, 98, 65, 0.12)",
                    borderRadius: "18px",
                    padding: isCompactMobile ? "12px" : "14px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "8px 12px",
                      alignItems: "center",
                      marginBottom: "12px",
                    }}
                  >
                    {attemptHistory.map((attempt, index) => (
                      <div
                        key={`legend-${index}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontSize: "13px",
                          color: "#5b4630",
                        }}
                      >
                        <span
                          style={{
                            width: "12px",
                            height: "12px",
                            borderRadius: "999px",
                            backgroundColor: getAttemptHighlightColor(attempt.totalScore),
                            border: "1px solid rgba(93, 74, 48, 0.2)",
                            flexShrink: 0,
                          }}
                        />
                        <span>
                          {getAttemptLabel(index, attempt.totalScore)}: {attempt.words.map((word) => word.word).join(", ")}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      background: "linear-gradient(180deg, var(--board-shell-start) 0%, var(--board-shell-mid) 42%, var(--board-shell-end) 100%)",
                      padding: isCompactMobile ? "8px" : "10px",
                      borderRadius: "18px",
                      boxShadow: "0 10px 20px var(--board-shell-shadow)",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`,
                        gap: `${isCompactMobile ? 2 : 3}px`,
                        width: "100%",
                        maxWidth: `${boardSize * (isCompactMobile ? 32 : 40) + (boardSize - 1) * (isCompactMobile ? 2 : 3)}px`,
                        margin: "0 auto",
                      }}
                    >
                      {Array.from({ length: boardSize * boardSize }).map((_, boardIndex) => {
                        const row = Math.floor(boardIndex / boardSize)
                        const col = boardIndex % boardSize
                        const fixedLetter = getFixedCellLetter(row, col)
                        const placementsAtCell = attemptHistory.flatMap((attempt, attemptIndex) =>
                          (attempt.placements ?? [])
                            .filter((tile) => tile.row === row && tile.col === col)
                            .map((tile) => ({
                              ...tile,
                              attemptIndex,
                              color: getAttemptHighlightColor(attempt.totalScore),
                            }))
                        )
                        const latestPlacement = placementsAtCell[placementsAtCell.length - 1]
                        const reviewLetter = latestPlacement?.letter || fixedLetter
                        const hasReviewLetter = Boolean(reviewLetter)
                        const reviewBonus = getBonusAt(row, col)
                        const overlayColors = [...new Set(placementsAtCell.map((placement) => placement.color))]
                        const splitCount = Math.min(overlayColors.length, 3)
                        const splitPlacements = placementsAtCell.slice(-splitCount)

                        return (
                          <div
                            key={`review-${boardIndex}`}
                            style={{
                              width: "100%",
                              aspectRatio: "1 / 1",
                              border: "1px solid rgba(93, 74, 48, 0.45)",
                              borderRadius: "8px",
                              background:
                                !latestPlacement
                                  ? fixedLetter
                                    ? "#e7d3a8"
                                    : reviewBonus === "DL"
                                    ? "#cfe8ff"
                                    : reviewBonus === "TL"
                                    ? "#8dc5ff"
                                    : reviewBonus === "DW"
                                    ? "#ffd1dc"
                                    : reviewBonus === "TW"
                                    ? "#ff9fb2"
                                    : "#f7f3ea"
                                  : overlayColors.length === 1
                                  ? latestPlacement.color
                                  : "#f7f3ea",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              position: "relative",
                              color: "#2f2419",
                              fontWeight: "bold",
                              fontSize: isCompactMobile ? "15px" : "18px",
                              boxShadow: latestPlacement ? "inset 0 0 0 2px rgba(255,255,255,0.38)" : "none",
                              overflow: "hidden",
                            }}
                          >
                            {overlayColors.length > 1 && (
                              <div
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  display: "grid",
                                  gridTemplateColumns: `repeat(${splitCount}, minmax(0, 1fr))`,
                                }}
                              >
                                {splitPlacements.map((placement, colorIndex) => (
                                  <div
                                    key={`${placement.attemptIndex}-${colorIndex}`}
                                    style={{
                                      backgroundColor: placement.color,
                                      borderLeft:
                                        colorIndex === 0 ? "none" : "1px solid rgba(255,255,255,0.45)",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      position: "relative",
                                      color: "#2f2419",
                                      fontWeight: 800,
                                      fontSize: isCompactMobile ? "11px" : "13px",
                                    }}
                                  >
                                    {placement.letter}
                                    <span
                                      style={{
                                        position: "absolute",
                                        bottom: "1px",
                                        right: "2px",
                                        fontSize: isCompactMobile ? "5px" : "6px",
                                        fontWeight: 700,
                                        color: "#4b3a28",
                                      }}
                                    >
                                      {placement.isBlank ? 0 : LETTER_SCORES[placement.letter] || 0}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {(overlayColors.length <= 1 ? reviewLetter || reviewBonus || "" : "")}
                            {hasReviewLetter && overlayColors.length <= 1 && (
                              <span
                                style={{
                                  position: "absolute",
                                  bottom: "2px",
                                  right: "3px",
                                  fontSize: isCompactMobile ? "7px" : "8px",
                                  fontWeight: 700,
                                  color: "#4b3a28",
                                }}
                              >
                                {latestPlacement?.isBlank ? 0 : LETTER_SCORES[reviewLetter] || 0}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: isCompactMobile ? "10px" : "18px",
            alignItems: "stretch",
          }}
        >
          <div
            style={{
              background:
                "linear-gradient(180deg, var(--board-shell-start) 0%, var(--board-shell-mid) 42%, var(--board-shell-end) 100%)",
              padding: isCompactMobile ? "8px" : "14px",
              borderRadius: isCompactMobile ? "18px" : "22px",
              boxShadow: "0 16px 34px var(--board-shell-shadow)",
              width: "100%",
              maxWidth: "100%",
              overflowX: isCompactMobile ? "hidden" : "auto",
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
                const validWordOutline = getWordOutlineStyle(row, col, validWordPreviews)
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
                      touchAction: "none",
                      WebkitUserSelect: "none",
                      userSelect: "none",
                      opacity:
                        draggedPlacedTile &&
                        draggedPlacedTile.row === row &&
                        draggedPlacedTile.col === col
                          ? 0.55
                          : 1,
                    }}
                  >
                    {(validWordOutline.top ||
                      validWordOutline.right ||
                      validWordOutline.bottom ||
                      validWordOutline.left) && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          pointerEvents: "none",
                          zIndex: 2,
                        }}
                      >
                        {validWordOutline.top && (
                          <div
                            style={{
                              position: "absolute",
                              top: `${validWordOutlineInset}px`,
                              left: validWordOutline.left
                                ? `${validWordOutlineCornerOffset}px`
                                : `${-validWordOutlineBridge}px`,
                              right: validWordOutline.right
                                ? `${validWordOutlineCornerOffset}px`
                                : `${-validWordOutlineBridge}px`,
                              height: `${validWordOutlineThickness}px`,
                              borderRadius: "999px",
                              backgroundColor: validWordOutlineColor,
                            }}
                          />
                        )}
                        {validWordOutline.bottom && (
                          <div
                            style={{
                              position: "absolute",
                              bottom: `${validWordOutlineInset}px`,
                              left: validWordOutline.left
                                ? `${validWordOutlineCornerOffset}px`
                                : `${-validWordOutlineBridge}px`,
                              right: validWordOutline.right
                                ? `${validWordOutlineCornerOffset}px`
                                : `${-validWordOutlineBridge}px`,
                              height: `${validWordOutlineThickness}px`,
                              borderRadius: "999px",
                              backgroundColor: validWordOutlineColor,
                            }}
                          />
                        )}
                        {validWordOutline.left && (
                          <div
                            style={{
                              position: "absolute",
                              left: `${validWordOutlineInset}px`,
                              top: validWordOutline.top
                                ? `${validWordOutlineCornerOffset}px`
                                : `${-validWordOutlineBridge}px`,
                              bottom: validWordOutline.bottom
                                ? `${validWordOutlineCornerOffset}px`
                                : `${-validWordOutlineBridge}px`,
                              width: `${validWordOutlineThickness}px`,
                              borderRadius: "999px",
                              backgroundColor: validWordOutlineColor,
                            }}
                          />
                        )}
                        {validWordOutline.right && (
                          <div
                            style={{
                              position: "absolute",
                              right: `${validWordOutlineInset}px`,
                              top: validWordOutline.top
                                ? `${validWordOutlineCornerOffset}px`
                                : `${-validWordOutlineBridge}px`,
                              bottom: validWordOutline.bottom
                                ? `${validWordOutlineCornerOffset}px`
                                : `${-validWordOutlineBridge}px`,
                              width: `${validWordOutlineThickness}px`,
                              borderRadius: "999px",
                              backgroundColor: validWordOutlineColor,
                            }}
                          />
                        )}
                        {validWordOutline.topLeftRadius && (
                          <div
                            style={{
                              position: "absolute",
                              left: `${validWordOutlineInset}px`,
                              top: `${validWordOutlineInset}px`,
                              width: "16px",
                              height: "16px",
                              borderTop: `${validWordOutlineThickness}px solid ${validWordOutlineColor}`,
                              borderLeft: `${validWordOutlineThickness}px solid ${validWordOutlineColor}`,
                              borderTopLeftRadius: "16px",
                              boxSizing: "border-box",
                            }}
                          />
                        )}
                        {validWordOutline.topRightRadius && (
                          <div
                            style={{
                              position: "absolute",
                              right: `${validWordOutlineInset}px`,
                              top: `${validWordOutlineInset}px`,
                              width: "16px",
                              height: "16px",
                              borderTop: `${validWordOutlineThickness}px solid ${validWordOutlineColor}`,
                              borderRight: `${validWordOutlineThickness}px solid ${validWordOutlineColor}`,
                              borderTopRightRadius: "16px",
                              boxSizing: "border-box",
                            }}
                          />
                        )}
                        {validWordOutline.bottomLeftRadius && (
                          <div
                            style={{
                              position: "absolute",
                              left: `${validWordOutlineInset}px`,
                              bottom: `${validWordOutlineInset}px`,
                              width: "16px",
                              height: "16px",
                              borderBottom: `${validWordOutlineThickness}px solid ${validWordOutlineColor}`,
                              borderLeft: `${validWordOutlineThickness}px solid ${validWordOutlineColor}`,
                              borderBottomLeftRadius: "16px",
                              boxSizing: "border-box",
                            }}
                          />
                        )}
                        {validWordOutline.bottomRightRadius && (
                          <div
                            style={{
                              position: "absolute",
                              right: `${validWordOutlineInset}px`,
                              bottom: `${validWordOutlineInset}px`,
                              width: "16px",
                              height: "16px",
                              borderBottom: `${validWordOutlineThickness}px solid ${validWordOutlineColor}`,
                              borderRight: `${validWordOutlineThickness}px solid ${validWordOutlineColor}`,
                              borderBottomRightRadius: "16px",
                              boxSizing: "border-box",
                            }}
                          />
                        )}
                      </div>
                    )}
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
                width: "100%",
                background: isCompactMobile ? "transparent" : "rgba(255,250,240,0.84)",
                border: isCompactMobile ? "none" : "1px solid rgba(123, 98, 65, 0.14)",
                borderRadius: isCompactMobile ? "0" : "20px",
                padding: isCompactMobile ? "8px 0 0" : "16px",
                boxShadow: isCompactMobile ? "none" : "0 12px 28px rgba(78, 56, 28, 0.06)",
                marginTop: isCompactMobile ? "10px" : "16px",
              }}
            >
              {!isCompactMobile && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: isCompactMobile ? "8px" : "12px" }}>
                  <h2 style={{ margin: 0, fontSize: isCompactMobile ? "16px" : "18px" }}>Your Tiles</h2>
                  <div style={{ fontSize: isCompactMobile ? "11px" : "13px", color: "#6d5537" }}>Drag to reorder or tap a tile then a square.</div>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  gap: isCompactMobile ? "2px" : "4px",
                  justifyContent: "center",
                  flexWrap: isCompactMobile ? "nowrap" : "wrap",
                  overflowX: isCompactMobile ? "visible" : "initial",
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
                        width: isCompactMobile ? `${compactRackGapWidth}px` : "10px",
                        minHeight: `${rackTileSize + 2}px`,
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
                      style={{
                        width: `${rackTileSize}px`,
                        height: `${rackTileSize}px`,
                        border:
                          selectedTile?.index === index
                            ? "3px solid #2563eb"
                            : draggedTile?.index === index
                            ? "3px solid #7b6241"
                            : "2px solid #7b6241",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: isCompactMobile ? "20px" : "26px",
                        fontWeight: "bold",
                        backgroundColor: isCompactMobile ? "#3f6fb3" : "#e7d3a8",
                        cursor: gameOver ? "default" : "grab",
                        position: "relative",
                        borderRadius: isCompactMobile ? "10px" : "12px",
                        boxShadow: isCompactMobile ? "0 4px 10px rgba(39,70,117,0.28)" : "0 6px 14px rgba(0,0,0,0.12)",
                        color: isCompactMobile ? "#fffdf9" : "#2f2419",
                        opacity: draggedTile?.index === index ? 0.6 : 1,
                        transition: "transform 160ms ease, box-shadow 160ms ease",
                        touchAction: "none",
                        WebkitUserSelect: "none",
                        userSelect: "none",
                      }}
                    >
                      {tile}
                      <span
                        style={{
                          position: "absolute",
                          bottom: isCompactMobile ? "3px" : "4px",
                          right: isCompactMobile ? "4px" : "6px",
                          fontSize: isCompactMobile ? "8px" : "11px",
                          fontWeight: "bold",
                          color: isCompactMobile ? "#eef5ff" : "#4b3a28",
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
                          width: isCompactMobile ? `${compactRackGapWidth}px` : "10px",
                          minHeight: `${rackTileSize + 2}px`,
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
                  display: "grid",
                  gridTemplateColumns: isCompactMobile
                    ? "0.8fr 1fr 1fr 1.15fr"
                    : "minmax(80px, 0.95fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(180px, 1.4fr)",
                  gap: isCompactMobile ? "8px" : "10px",
                  marginTop: isCompactMobile ? "12px" : "18px",
                  alignItems: "stretch",
                }}
              >
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setShowMoreActions((prev) => !prev)}
                    style={{
                      width: "100%",
                      height: "100%",
                      minHeight: `${actionButtonMinHeight}px`,
                      padding: isCompactMobile ? "8px 8px" : "10px 12px",
                      fontSize: isCompactMobile ? "12px" : "14px",
                      borderRadius: isCompactMobile ? "16px" : "18px",
                      border: "none",
                      backgroundColor: isCompactMobile ? "transparent" : showMoreActions ? "#d7c3a0" : "#efe2c7",
                      cursor: "pointer",
                      color: isCompactMobile ? "#2f2419" : "#2f2419",
                      fontWeight: 800,
                      boxShadow: isCompactMobile ? "none" : undefined,
                    }}
                  >
                    {isCompactMobile ? "More" : "More"}
                  </button>

                  {showMoreActions && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        bottom: "calc(100% + 10px)",
                        minWidth: isCompactMobile ? "180px" : "210px",
                        background: "rgba(255,250,240,0.98)",
                        border: "1px solid rgba(123, 98, 65, 0.16)",
                        borderRadius: "18px",
                        boxShadow: "0 16px 34px rgba(78, 56, 28, 0.16)",
                        padding: "10px",
                        display: "grid",
                        gap: "8px",
                        zIndex: 20,
                      }}
                    >
                      <button
                        onClick={() => {
                          handleHintClick()
                          if (hintLevel >= 1) setShowMoreActions(false)
                        }}
                        disabled={gameOver || hintLevel >= 2}
                        title="First click highlights the best placement. Second click places the next correct tile."
                        style={{
                          padding: "10px 12px",
                          fontSize: "14px",
                          borderRadius: "14px",
                          border: "1px solid rgba(69,50,27,0.18)",
                          backgroundColor: gameOver || hintLevel >= 2 ? "#ddd6c8" : showHint ? "#d7c3a0" : "#efe2c7",
                          cursor: gameOver || hintLevel >= 2 ? "not-allowed" : "pointer",
                          color: "#2f2419",
                          fontWeight: 700,
                          textAlign: "left",
                        }}
                      >
                        {hintLevel === 0 ? "Show Hint" : hintLevel === 1 ? "Place Hint Tile" : "Hint Complete"}
                      </button>

                      <button
                        onClick={() => {
                          clearCurrentMove()
                          setShowMoreActions(false)
                        }}
                        disabled={gameOver}
                        style={{
                          padding: "10px 12px",
                          fontSize: "14px",
                          borderRadius: "14px",
                          border: "1px solid rgba(123, 98, 65, 0.2)",
                          backgroundColor: gameOver ? "#ddd6c8" : "#efe2c7",
                          cursor: gameOver ? "not-allowed" : "pointer",
                          color: "#2f2419",
                          fontWeight: 700,
                          textAlign: "left",
                        }}
                      >
                        Clear Move
                      </button>

                      <button
                        onClick={() => {
                          resetGame()
                          setShowMoreActions(false)
                        }}
                        style={{
                          padding: "10px 12px",
                          fontSize: "14px",
                          borderRadius: "14px",
                          border: "1px solid rgba(123, 98, 65, 0.2)",
                          backgroundColor: "#f5ead6",
                          cursor: "pointer",
                          color: "#2f2419",
                          fontWeight: 700,
                          textAlign: "left",
                        }}
                      >
                        Reset Puzzle
                      </button>

                      {canShare && (
                        <button
                          onClick={() => {
                            shareResults()
                            setShowMoreActions(false)
                          }}
                          style={{
                            padding: "10px 12px",
                            fontSize: "14px",
                            borderRadius: "14px",
                            border: "1px solid rgba(123, 98, 65, 0.2)",
                            backgroundColor: "#f5ead6",
                            cursor: "pointer",
                            color: "#2f2419",
                            fontWeight: 700,
                            textAlign: "left",
                          }}
                        >
                          Share Results
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={undoLastTile}
                  disabled={gameOver || placedTiles.length === 0}
                  style={{
                    width: "100%",
                    minHeight: `${actionButtonMinHeight}px`,
                    padding: isCompactMobile ? "8px 8px" : "10px 14px",
                    fontSize: isCompactMobile ? "13px" : "15px",
                    borderRadius: isCompactMobile ? "16px" : "18px",
                    border: isCompactMobile ? "none" : "1px solid rgba(123, 98, 65, 0.2)",
                    backgroundColor:
                      isCompactMobile ? "transparent" : gameOver || placedTiles.length === 0 ? "#ddd6c8" : "#efe2c7",
                    cursor: gameOver || placedTiles.length === 0 ? "not-allowed" : "pointer",
                    color: gameOver || placedTiles.length === 0 ? "#8b7c67" : "#2f2419",
                    fontWeight: 800,
                    boxShadow: isCompactMobile ? "none" : undefined,
                  }}
                >
                  Recall
                </button>

                <button
                  onClick={shuffleRack}
                  disabled={gameOver}
                  style={{
                    width: "100%",
                    minHeight: `${actionButtonMinHeight}px`,
                    padding: isCompactMobile ? "8px 8px" : "10px 14px",
                    fontSize: isCompactMobile ? "13px" : "15px",
                    borderRadius: isCompactMobile ? "16px" : "18px",
                    border: isCompactMobile ? "none" : "1px solid rgba(69,50,27,0.18)",
                    backgroundColor: isCompactMobile ? "transparent" : gameOver ? "#ddd6c8" : "#efe2c7",
                    cursor: gameOver ? "not-allowed" : "pointer",
                    color: isCompactMobile ? (gameOver ? "#9d948a" : "#1f1a14") : gameOver ? "#8b7c67" : "#2f2419",
                    fontWeight: isCompactMobile ? 900 : 800,
                    boxShadow: isCompactMobile ? "none" : undefined,
                  }}
                >
                  Shuffle
                </button>

                <button
                  onClick={submitMove}
                  disabled={gameOver}
                  style={{
                    width: "100%",
                    minHeight: `${actionButtonMinHeight}px`,
                    padding: isCompactMobile ? "10px 10px" : "12px 18px",
                    fontSize: isCompactMobile ? "14px" : "16px",
                    borderRadius: "999px",
                    border: isCompactMobile ? "none" : "1px solid rgba(34,25,13,0.12)",
                    backgroundColor: isCompactMobile ? "#b9b4b0" : gameOver ? "#ddd6c8" : "#17120d",
                    cursor: gameOver ? "not-allowed" : "pointer",
                    color: isCompactMobile ? "#fffaf1" : gameOver ? "#5f5448" : "#fffaf1",
                    fontWeight: 900,
                    boxShadow: isCompactMobile ? "none" : gameOver ? "none" : "0 10px 20px rgba(23,18,13,0.25)",
                  }}
                >
                  {isCompactMobile ? "Submit" : "Submit Move"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {touchDrag && (
        <div
          style={{
            position: "fixed",
            left: touchDrag.x - 28,
            top: touchDrag.y - 14,
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
