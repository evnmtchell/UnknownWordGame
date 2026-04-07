"use client"

import { startTransition, useEffect, useMemo, useRef, useState } from "react"
import { VALID_WORDS } from "./words"
import { getTodayPuzzle, DAILY_PUZZLES, type BonusType } from "./puzzles"
import { solvePuzzle } from "./solver"
import { LETTER_SCORES } from "./scoring"

type TileSelection = {
  letter: string
  index: number
} | null

type DraggedPlacedTile = {
  row: number
  col: number
  letter: string
} | null

type TouchDragState = {
  type: "rack"
  letter: string
  index: number
  x: number
  y: number
} | {
  type: "placed"
  letter: string
  row: number
  col: number
  x: number
  y: number
} | null

type PlacedTile = {
  row: number
  col: number
  letter: string
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
  const touchDragOffsetRef = useRef<{ x: number; y: number }>({ x: 28, y: 28 })

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
          if (parsed.hintUsed) setHintUsed(parsed.hintUsed)
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

  function getPlacedCellLetter(row: number, col: number) {
    const placedCell = placedTiles.find(
      (item) => item.row === row && item.col === col
    )
    return placedCell ? placedCell.letter : ""
  }

  function getCellLetter(row: number, col: number) {
    return getPlacedCellLetter(row, col) || getFixedCellLetter(row, col) || ""
  }

  function isPlacedTile(row: number, col: number) {
    return placedTiles.some((tile) => tile.row === row && tile.col === col)
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
    setSelectedTile({ letter: tile, index })
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
    setDraggedTile(null)
    setSelectedTile(null)
    setRackDropIndex(null)
    setMessage("Rack rearranged.")
  }

  function handleRackGapDrop(targetIndex: number) {
    if (!draggedTile) return
    if (draggedPlacedTile) return
    reorderRackTile(draggedTile.index, targetIndex)
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

    setPlacedTiles((prev) => [...prev, { row, col, letter: tileData.letter }])
    setRack((prev) => prev.filter((_, i) => i !== tileData.index))
    setSelectedTile(null)
    setDraggedTile(null)
    setRackDropIndex(null)
    setMessage("Good move. Keep placing tiles in one line.")
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
      { row, col, letter: tile.letter },
    ])
    setDraggedPlacedTile(null)
    setSelectedTile(null)
    setRackDropIndex(null)
    setMessage(`Moved ${tile.letter}.`)
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
    setDraggedTile({ letter: tile, index })
    setDraggedPlacedTile(null)
    setSelectedTile(null)
  }
  function handleRackTileDragEnd() {
    setDraggedTile(null)
    setRackDropIndex(null)
  }

  function handlePlacedTileDragStart(
    e: React.DragEvent<HTMLDivElement>,
    row: number,
    col: number,
    letter: string
  ) {
    if (attemptsLeft === 0) return
    e.dataTransfer.setData("text/plain", `${letter}-${row}-${col}`)
    e.dataTransfer.effectAllowed = "move"
    setDraggedPlacedTile({ row, col, letter })
    setDraggedTile(null)
    setSelectedTile(null)
    setRackDropIndex(null)
  }

  function handlePlacedTileDragEnd() {
    setDraggedPlacedTile(null)
  }

  function handleCellDrop(row: number, col: number) {
    if (draggedTile) {
      placeTileOnBoard(d
