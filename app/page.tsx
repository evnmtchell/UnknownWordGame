"use client"

import { startTransition, useEffect, useMemo, useRef, useState } from "react"
import { VALID_WORDS } from "./words"
import { getPuzzleByDate, DAILY_PUZZLES, type BonusType } from "./puzzles"
import { solvePuzzle } from "./solver"
import { BLANK_TILE, LETTER_SCORES } from "./scoring"
import { saveSession, saveStats } from "./api-client"

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
  direction: "row" | "col"
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

type RackSlot = string | null

type GameStats = {
  gamesPlayed: number
  currentStreak: number
  maxStreak: number
  perfectCurrentStreak: number
  perfectMaxStreak: number
  lastPlayedDate: string | null
  lastPerfectDate: string | null
  ratingCounts: Record<string, number>
  puzzleHistory: PuzzleAnalyticsRecord[]
}

type UiFeedbackKind = "submit" | "hint" | "recall" | "win"

type PuzzleAnalyticsRecord = {
  date: string
  mode: "easy" | "hard"
  bestScore: number
  optimalScore: number
  scorePercent: number
  attemptsUsed: number
  hintsUsed: number
  rating: string
}

type ArchiveCompletionStatus = {
  easy: boolean
  hard: boolean
}

const defaultStats: GameStats = {
  gamesPlayed: 0,
  currentStreak: 0,
  maxStreak: 0,
  perfectCurrentStreak: 0,
  perfectMaxStreak: 0,
  lastPlayedDate: null,
  lastPerfectDate: null,
  ratingCounts: { Perfect: 0, Excellent: 0, Great: 0, Solid: 0, "Keep trying": 0 },
  puzzleHistory: [],
}

const STATS_KEY = "daily-word-game-stats"
const SOUND_MUTED_KEY = "daily-word-game-sound-muted"
const HAPTICS_ENABLED_KEY = "daily-word-game-haptics-enabled"
const REDUCED_MOTION_KEY = "daily-word-game-reduced-motion"
const HOME_BRAND_TILES = ["L", "E", "X", "I", "C", "O", "N"]

function shuffleArray(items: RackSlot[]) {
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

function getBoardCellKey(row: number, col: number) {
  return `${row}-${col}`
}

function getLocalDateString() {
  return new Intl.DateTimeFormat("en-CA").format(new Date())
}

function formatDisplayDate(date: string) {
  const [year, month, day] = date.split("-")
  if (!year || !month || !day) return date
  return `${month}-${day}-${year}`
}

function getMonthKey(date: string) {
  const [year, month] = date.split("-")
  if (!year || !month) return date
  return `${year}-${month}`
}

function formatCalendarMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-")
  if (!year || !month) return monthKey
  const date = new Date(Number(year), Number(month) - 1, 1)
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date)
}

function getTimeUntilNextLocalDay(now: Date) {
  const nextMidnight = new Date(now)
  nextMidnight.setHours(24, 0, 0, 0)
  return Math.max(0, nextMidnight.getTime() - now.getTime())
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function triggerHapticFeedback(pattern: number | number[] = 12) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return
  }

  navigator.vibrate(pattern)
}

function createPlacementSound(ctx: AudioContext) {
  const now = ctx.currentTime
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()

  oscillator.type = "triangle"
  oscillator.frequency.setValueAtTime(740, now)
  oscillator.frequency.exponentialRampToValueAtTime(520, now + 0.08)

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11)

  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.12)
}

function createUiFeedbackSound(ctx: AudioContext, kind: UiFeedbackKind) {
  const now = ctx.currentTime
  const gain = ctx.createGain()
  gain.connect(ctx.destination)

  const notesByKind: Record<UiFeedbackKind, Array<{ freq: number; start: number; duration: number; type: OscillatorType; volume: number }>> = {
    submit: [
      { freq: 420, start: 0, duration: 0.08, type: "triangle", volume: 0.04 },
      { freq: 620, start: 0.07, duration: 0.1, type: "sine", volume: 0.05 },
    ],
    hint: [
      { freq: 540, start: 0, duration: 0.07, type: "sine", volume: 0.035 },
      { freq: 760, start: 0.06, duration: 0.09, type: "triangle", volume: 0.045 },
    ],
    recall: [
      { freq: 500, start: 0, duration: 0.07, type: "triangle", volume: 0.035 },
      { freq: 360, start: 0.05, duration: 0.08, type: "sine", volume: 0.03 },
    ],
    win: [
      { freq: 520, start: 0, duration: 0.09, type: "triangle", volume: 0.05 },
      { freq: 660, start: 0.08, duration: 0.11, type: "triangle", volume: 0.055 },
      { freq: 880, start: 0.16, duration: 0.16, type: "sine", volume: 0.06 },
    ],
  }

  for (const note of notesByKind[kind]) {
    const oscillator = ctx.createOscillator()
    const noteGain = ctx.createGain()
    oscillator.type = note.type
    oscillator.frequency.setValueAtTime(note.freq, now + note.start)
    noteGain.gain.setValueAtTime(0.0001, now + note.start)
    noteGain.gain.exponentialRampToValueAtTime(note.volume, now + note.start + 0.015)
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration)
    oscillator.connect(noteGain)
    noteGain.connect(gain)
    oscillator.start(now + note.start)
    oscillator.stop(now + note.start + note.duration + 0.02)
  }
}

export default function Home() {
  const todayDate = useMemo(() => getLocalDateString(), [])
  const todayDisplayDate = useMemo(() => formatDisplayDate(todayDate), [todayDate])
  const [selectedDate, setSelectedDate] = useState(todayDate)
  const [selectedMode, setSelectedMode] = useState<"easy" | "hard">("easy")
  const [loadedGameConfig, setLoadedGameConfig] = useState<{ date: string; mode: "easy" | "hard" }>({
    date: todayDate,
    mode: "easy",
  })
  const [hasMounted, setHasMounted] = useState(false)
  const [countdownMs, setCountdownMs] = useState(() => getTimeUntilNextLocalDay(new Date()))
  const resetCountdown = useMemo(() => formatCountdown(countdownMs), [countdownMs])
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [showArchive, setShowArchive] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [viewMode, setViewMode] = useState<"home" | "daily" | "game">("home")
  const [archiveMonthKey, setArchiveMonthKey] = useState(() => getMonthKey(todayDate))
  const [completedArchiveDates, setCompletedArchiveDates] = useState<
    Record<string, ArchiveCompletionStatus>
  >({})
  const [touchDrag, setTouchDrag] = useState<TouchDragState>(null)
  const [touchDragEngaged, setTouchDragEngaged] = useState(false)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const touchDragRef = useRef<TouchDragState>(null)
  const draggedTileRef = useRef<TileSelection>(null)
  const draggedPlacedTileRef = useRef<DraggedPlacedTile>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const completeTouchDragRef = useRef<((touch: { clientX: number; clientY: number }) => void) | null>(null)
  const reorderRackTileRef = useRef<((fromIndex: number, targetIndex: number) => void) | null>(null)
  const placeTileOnBoardRef = useRef<((tileData: TileSelection, row: number, col: number) => void) | null>(null)
  const movePlacedTileOnBoardRef = useRef<((tile: DraggedPlacedTile, row: number, col: number) => void) | null>(null)
  const returnPlacedTileToRackRef = useRef<((tile: DraggedPlacedTile) => void) | null>(null)

  const puzzle = useMemo(
    () => getPuzzleByDate(loadedGameConfig.date, loadedGameConfig.mode),
    [loadedGameConfig]
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
  const activeGameMode = loadedGameConfig.mode
  const storageKey = `daily-word-game-${puzzle.date}-${loadedGameConfig.mode}`
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
  const compactViewportWidth = Math.max(0, viewportSize.width - 16)
  const compactViewportHeightBudget = Math.max(
    0,
    viewportSize.height - (activeGameMode === "hard" ? 318 : 286)
  )
  const compactPuzzleFrameWidth =
    isCompactMobile && compactViewportWidth > 0
      ? Math.max(260, Math.min(compactViewportWidth, compactViewportHeightBudget || compactViewportWidth))
      : null
  const boardTileFontSize = isCompactMobile ? "clamp(16px, 4.8vw, 20px)" : "clamp(18px, 5vw, 24px)"
  const boardBonusFontSize = isCompactMobile ? "clamp(7px, 2vw, 9px)" : "clamp(8px, 2.4vw, 11px)"
  const boardScoreFontSize = isCompactMobile ? "clamp(7px, 1.8vw, 9px)" : "clamp(8px, 2vw, 10px)"
  const validWordOutlineColor = "#72ad2d"
  const validWordOutlineThickness = isCompactMobile ? 5 : 6
  const validWordOutlineInset = -4
  const validWordOutlineBridge = boardGap / 2 + 5
  const validWordOutlineCornerOffset = isCompactMobile ? 8 : 10
  const touchDragActivationDistance = 14

  const [rack, setRack] = useState<RackSlot[]>(startingRack)
  const [homeBrandRack, setHomeBrandRack] = useState<string[]>(HOME_BRAND_TILES)
  const [homeBrandDraggedIndex, setHomeBrandDraggedIndex] = useState<number | null>(null)
  const [homeBrandDropIndex, setHomeBrandDropIndex] = useState<number | null>(null)
  const homeBrandTouchStartRef = useRef<{ x: number; y: number } | null>(null)
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
  const [showSettings, setShowSettings] = useState(false)
  const [showPuzzleReview, setShowPuzzleReview] = useState(false)
  const [showResultsModal, setShowResultsModal] = useState(false)
  const [recentPlacementKey, setRecentPlacementKey] = useState<string | null>(null)
  const [uiFeedback, setUiFeedback] = useState<{ kind: UiFeedbackKind; tick: number } | null>(null)
  const [soundMuted, setSoundMuted] = useState(false)
  const [hapticsEnabled, setHapticsEnabled] = useState(true)
  const [reducedMotionEnabled, setReducedMotionEnabled] = useState(false)
  const [hasSavedTodayGame, setHasSavedTodayGame] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [stats, setStats] = useState<GameStats>(defaultStats)
  const statsUpdatedRef = useRef(false)
  const fixedCellsMap = useMemo(
    () => new Map(puzzle.filledCells.map((cell) => [getBoardCellKey(cell.row, cell.col), cell.letter])),
    [puzzle.filledCells]
  )
  const placedTilesMap = useMemo(
    () => new Map(placedTiles.map((tile) => [getBoardCellKey(tile.row, tile.col), tile])),
    [placedTiles]
  )
  const bonusCellsMap = useMemo(
    () => new Map(puzzle.bonusCells.map((cell) => [getBoardCellKey(cell.row, cell.col), cell.type])),
    [puzzle.bonusCells]
  )
  const optimalCellSet = useMemo(
    () => new Set(solution.bestPlacement.map((cell) => getBoardCellKey(cell.row, cell.col))),
    [solution.bestPlacement]
  )
  const optimalLetterMap = useMemo(
    () => new Map(solution.bestPlacement.map((cell) => [getBoardCellKey(cell.row, cell.col), cell.letter])),
    [solution.bestPlacement]
  )

  function playPlacementSound() {
    if (typeof window === "undefined") return
    if (soundMuted) return

    const AudioContextConstructor = window.AudioContext
    if (!AudioContextConstructor) return

    let audioContext = audioContextRef.current
    if (!audioContext) {
      audioContext = new AudioContextConstructor()
      audioContextRef.current = audioContext
    }

    if (audioContext.state === "suspended") {
      void audioContext.resume().then(() => {
        createPlacementSound(audioContext!)
      }).catch(() => {
        // ignore blocked audio playback
      })
      return
    }

    createPlacementSound(audioContext)
  }

  function playUiFeedbackSound(kind: UiFeedbackKind) {
    if (typeof window === "undefined") return
    if (soundMuted) return

    const AudioContextConstructor = window.AudioContext
    if (!AudioContextConstructor) return

    let audioContext = audioContextRef.current
    if (!audioContext) {
      audioContext = new AudioContextConstructor()
      audioContextRef.current = audioContext
    }

    if (audioContext.state === "suspended") {
      void audioContext.resume().then(() => {
        createUiFeedbackSound(audioContext!, kind)
      }).catch(() => {
        // ignore blocked audio playback
      })
      return
    }

    createUiFeedbackSound(audioContext, kind)
  }

  function triggerUiFeedback(kind: UiFeedbackKind) {
    setUiFeedback({ kind, tick: Date.now() })
    playUiFeedbackSound(kind)
  }

  function triggerAppHapticFeedback(pattern: number | number[] = 12) {
    if (!hapticsEnabled) return
    triggerHapticFeedback(pattern)
  }

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
    setHasMounted(true)
  }, [])

  useEffect(() => {
    setCountdownMs(getTimeUntilNextLocalDay(new Date()))
    const intervalId = window.setInterval(() => {
      setCountdownMs(getTimeUntilNextLocalDay(new Date()))
    }, 1000)

    return () => window.clearInterval(intervalId)
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

    try {
      setSoundMuted(localStorage.getItem(SOUND_MUTED_KEY) === "1")
    } catch {
      // ignore
    }

    try {
      const savedHaptics = localStorage.getItem(HAPTICS_ENABLED_KEY)
      setHapticsEnabled(savedHaptics === null ? true : savedHaptics === "1")
    } catch {
      // ignore
    }

    try {
      const savedReducedMotion = localStorage.getItem(REDUCED_MOTION_KEY)
      if (savedReducedMotion === null) {
        setReducedMotionEnabled(
          typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        )
      } else {
        setReducedMotionEnabled(savedReducedMotion === "1")
      }
    } catch {
      // ignore
    }

    try {
      setHasSavedTodayGame(Boolean(localStorage.getItem(`daily-word-game-${todayDate}`)))
    } catch {
      // ignore
    }
  }, [storageKey, todayDate])

  useEffect(() => {
    try {
      localStorage.setItem(SOUND_MUTED_KEY, soundMuted ? "1" : "0")
    } catch {
      // ignore
    }
  }, [soundMuted])

  useEffect(() => {
    try {
      localStorage.setItem(HAPTICS_ENABLED_KEY, hapticsEnabled ? "1" : "0")
    } catch {
      // ignore
    }
  }, [hapticsEnabled])

  useEffect(() => {
    try {
      localStorage.setItem(REDUCED_MOTION_KEY, reducedMotionEnabled ? "1" : "0")
    } catch {
      // ignore
    }
  }, [reducedMotionEnabled])

  useEffect(() => {
    try {
      setHasSavedTodayGame(Boolean(localStorage.getItem(`daily-word-game-${todayDate}`)))
    } catch {
      // ignore
    }
  }, [
    todayDate,
    attemptsLeft,
    bestScore,
    attemptHistory,
    submittedWords,
    submittedScore,
    hintLevel,
    hasLoadedSave,
  ])

  useEffect(() => {
    try {
      const completionMap: Record<string, ArchiveCompletionStatus> = {}

      for (const puzzleEntry of DAILY_PUZZLES) {
        for (const mode of ["easy", "hard"] as const) {
          const saved = localStorage.getItem(`daily-word-game-${puzzleEntry.date}-${mode}`)
          if (!saved) continue

          try {
            const parsed = JSON.parse(saved) as Partial<SavedGameState>
            if (parsed.attemptsLeft === 0) {
              const currentStatus = completionMap[puzzleEntry.date] ?? {
                easy: false,
                hard: false,
              }
              completionMap[puzzleEntry.date] = {
                ...currentStatus,
                [mode]: true,
              }
            }
          } catch {
            // ignore bad saved data
          }
        }
      }

      if (attemptsLeft === 0) {
        const currentStatus = completionMap[selectedDate] ?? {
          easy: false,
          hard: false,
        }
        completionMap[selectedDate] = {
          ...currentStatus,
          [activeGameMode]: true,
        }
      }

      setCompletedArchiveDates(completionMap)
    } catch {
      // ignore
    }
  }, [
    attemptsLeft,
    bestScore,
    attemptHistory,
    submittedWords,
    submittedScore,
    hintLevel,
    hasLoadedSave,
    selectedDate,
  ])

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
    if (!recentPlacementKey) return
    const timeoutId = window.setTimeout(() => {
      setRecentPlacementKey(null)
    }, 260)

    return () => window.clearTimeout(timeoutId)
  }, [recentPlacementKey])

  useEffect(() => {
    function onTouchMove(e: TouchEvent) {
      if (!touchDragRef.current) return
      e.preventDefault()
      const touch = e.touches[0]
      const start = touchStartPosRef.current
      if (start) {
        const moved = Math.hypot(touch.clientX - start.x, touch.clientY - start.y)
        if (moved >= touchDragActivationDistance) {
          setTouchDragEngaged(true)
        }
      }
      setTouchDrag((prev) => (prev ? { ...prev, x: touch.clientX, y: touch.clientY } : null))
    }
    document.addEventListener("touchmove", onTouchMove, { passive: false })
    return () => document.removeEventListener("touchmove", onTouchMove)
  }, [touchDragActivationDistance])

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

    // Dual-write to database
    saveSession({
      date: puzzle.date,
      mode: loadedGameConfig.mode,
      attempts_left: attemptsLeft,
      best_score: bestScore,
      attempt_history: attemptHistory,
      hint_used: hintLevel > 0,
      hint_level: hintLevel,
      completed: attemptsLeft === 0,
      rating: null,
      submitted_words: submittedWords,
      submitted_score: submittedScore,
      message,
    })
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
    puzzle.date,
    loadedGameConfig.mode,
  ])

  function getFixedCellLetter(row: number, col: number) {
    return fixedCellsMap.get(getBoardCellKey(row, col)) || ""
  }

  function getPlacedTile(row: number, col: number) {
    return placedTilesMap.get(getBoardCellKey(row, col))
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
    return bonusCellsMap.get(getBoardCellKey(row, col))
  }

  function isOptimalCell(row: number, col: number) {
    return optimalCellSet.has(getBoardCellKey(row, col))
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
    setRack((prev) => {
      const tilesOnly = shuffleArray(prev.filter((tile): tile is string => tile !== null))
      let tileIndex = 0
      return prev.map((slot) => (slot === null ? null : tilesOnly[tileIndex++]))
    })
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
    triggerAppHapticFeedback(10)
    draggedTileRef.current = null
    setDraggedTile(null)
    setSelectedTile(null)
    setRackDropIndex(null)
    setMessage("Rack rearranged.")
  }

  function reorderHomeBrandTile(fromIndex: number, targetIndex: number) {
    let finalIndex = targetIndex
    if (fromIndex < targetIndex) {
      finalIndex = targetIndex - 1
    }

    if (finalIndex === fromIndex) {
      setHomeBrandDraggedIndex(null)
      setHomeBrandDropIndex(null)
      return
    }

    setHomeBrandRack((prev) => moveItemToIndex(prev, fromIndex, finalIndex))
    setHomeBrandDraggedIndex(null)
    setHomeBrandDropIndex(null)
  }

  function handleHomeBrandTouchStart(e: React.TouchEvent, index: number) {
    const touch = e.touches[0]
    if (!touch) return
    homeBrandTouchStartRef.current = { x: touch.clientX, y: touch.clientY }
    setHomeBrandDraggedIndex(index)
    setHomeBrandDropIndex(index)
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
    setRecentPlacementKey(`${row}-${col}`)
    setRack((prev) => prev.map((tile, index) => (index === tileData.index ? null : tile)))
    draggedTileRef.current = null
    setSelectedTile(null)
    setDraggedTile(null)
    setRackDropIndex(null)
    triggerAppHapticFeedback(tileData.isBlank ? [10, 20, 10] : 12)
    playPlacementSound()
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
    triggerAppHapticFeedback(10)
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
    setRack((prev) => {
      const nextRack = [...prev]
      const emptyIndex = nextRack.findIndex((slot) => slot === null)
      if (emptyIndex !== -1) {
        nextRack[emptyIndex] = tile.isBlank ? BLANK_TILE : tile.letter
        return nextRack
      }
      return [...nextRack, tile.isBlank ? BLANK_TILE : tile.letter]
    })
    draggedPlacedTileRef.current = null
    setDraggedPlacedTile(null)
    setSelectedTile(null)
    setRackDropIndex(null)
    triggerAppHapticFeedback(10)
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

  function getWordOutlineStyle(row: number, col: number, highlightedCells: Set<string>) {
    const cellKey = getBoardCellKey(row, col)

    if (!highlightedCells.has(cellKey)) {
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

    const top = !highlightedCells.has(getBoardCellKey(row - 1, col))
    const right = !highlightedCells.has(getBoardCellKey(row, col + 1))
    const bottom = !highlightedCells.has(getBoardCellKey(row + 1, col))
    const left = !highlightedCells.has(getBoardCellKey(row, col - 1))

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

  function getAllWordPreviews() {
    if (placedTiles.length === 0) return []

    const results: WordPreview[] = []
    const seenKeys = new Set<string>()

    const mainDirection = getMoveDirection()
    if (!mainDirection) return []

    const mainWord = buildWordAt(placedTiles[0].row, placedTiles[0].col, mainDirection)
    const mainCells = getWordCells(placedTiles[0].row, placedTiles[0].col, mainDirection)

    if (mainWord.length > 1 && mainCells.length > 0) {
      const key = `${mainDirection}-${mainCells[0].row}-${mainCells[0].col}-${mainWord}`
      results.push({
        word: mainWord,
        score: scoreWordFromCells(mainCells),
        direction: mainDirection,
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
            direction: crossDirection,
            cells: crossCells,
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
    triggerAppHapticFeedback(solvedOptimally ? [18, 24, 18] : [12, 18, 12])
    triggerUiFeedback(solvedOptimally ? "win" : "submit")
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
      updateStats(rating, {
        date: puzzle.date,
        mode: activeGameMode,
        bestScore: newBestScore,
        optimalScore: solution.bestScore,
        scorePercent: solution.bestScore > 0 ? newBestScore / solution.bestScore : 0,
        attemptsUsed: attemptHistory.length + 1,
        hintsUsed: hintLevel,
        rating,
      })
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
    setRack((prev) => {
      const nextRack = [...prev]
      const emptyIndex = nextRack.findIndex((slot) => slot === null)
      if (emptyIndex !== -1) {
        nextRack[emptyIndex] = last.isBlank ? BLANK_TILE : last.letter
        return nextRack
      }
      return [...nextRack, last.isBlank ? BLANK_TILE : last.letter]
    })
    triggerAppHapticFeedback(8)
    triggerUiFeedback("recall")
    setMessage(last.isBlank ? "Returned blank tile to the rack." : `Returned ${last.letter} to the rack.`)
  }

  function clearCurrentMove() {
    setRack(startingRack)
    setPlacedTiles([])
    setSelectedTile(null)
    setDraggedTile(null)
    setDraggedPlacedTile(null)
    setRackDropIndex(null)
    triggerAppHapticFeedback(8)
    triggerUiFeedback("recall")
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
    setShowSettings(false)
    setShowPuzzleReview(false)
    statsUpdatedRef.current = false
    triggerAppHapticFeedback([10, 18, 10])
    setMessage("New game started.")
    localStorage.removeItem(storageKey)
  }

  function updateStats(rating: string, analyticsRecord: PuzzleAnalyticsRecord) {
    if (statsUpdatedRef.current) return
    statsUpdatedRef.current = true

    try {
      const saved = localStorage.getItem(STATS_KEY)
      const parsed = saved ? JSON.parse(saved) : {}
      const current: GameStats = {
        ...defaultStats,
        ...parsed,
        ratingCounts: {
          ...defaultStats.ratingCounts,
          ...(parsed.ratingCounts ?? {}),
        },
        puzzleHistory: Array.isArray(parsed.puzzleHistory) ? parsed.puzzleHistory : [],
      }
      if (current.lastPlayedDate === puzzle.date) return

      const yesterday = new Date(new Date(puzzle.date).getTime() - 86400000)
        .toISOString()
        .slice(0, 10)
      const newStreak =
        current.lastPlayedDate === yesterday ? current.currentStreak + 1 : 1
      const isPerfectGame = rating === "Perfect"
      const newPerfectStreak = isPerfectGame
        ? current.lastPerfectDate === yesterday
          ? current.perfectCurrentStreak + 1
          : 1
        : 0

      const newStats: GameStats = {
        gamesPlayed: current.gamesPlayed + 1,
        currentStreak: newStreak,
        maxStreak: Math.max(current.maxStreak, newStreak),
        perfectCurrentStreak: newPerfectStreak,
        perfectMaxStreak: Math.max(current.perfectMaxStreak, newPerfectStreak),
        lastPlayedDate: puzzle.date,
        lastPerfectDate: isPerfectGame ? puzzle.date : current.lastPerfectDate,
        ratingCounts: {
          ...current.ratingCounts,
          [rating]: (current.ratingCounts[rating] ?? 0) + 1,
        },
        puzzleHistory: [...current.puzzleHistory, analyticsRecord].slice(-400),
      }

      localStorage.setItem(STATS_KEY, JSON.stringify(newStats))
      setStats(newStats)

      // Dual-write to database
      saveStats({
        games_played: newStats.gamesPlayed,
        current_streak: newStats.currentStreak,
        max_streak: newStats.maxStreak,
        perfect_current_streak: newStats.perfectCurrentStreak,
        perfect_max_streak: newStats.perfectMaxStreak,
        last_played_date: newStats.lastPlayedDate,
        last_perfect_date: newStats.lastPerfectDate,
        rating_counts: newStats.ratingCounts,
      })
    } catch {
      // ignore
    }
  }

  function dismissTutorial() {
    setShowTutorial(false)
    localStorage.setItem("daily-word-game-tutorial-seen", "1")
  }

  function selectPuzzleDate(date: string, mode: "easy" | "hard" = selectedMode) {
    const newPuzzle = getPuzzleByDate(date, mode)
    setLoadedGameConfig({ date, mode })
    setSelectedMode(mode)
    setViewMode("game")
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

  function goHome() {
    setViewMode("home")
    setShowArchive(false)
    setShowStats(false)
    setShowMoreActions(false)
    setShowSettings(false)
    setShowPuzzleReview(false)
  }

  function handleRackTouchStart(e: React.TouchEvent, tile: string, index: number) {
    if (gameOver) return
    e.preventDefault()
    const touch = e.touches[0]
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
    setTouchDragEngaged(false)
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
    setTouchDragEngaged(false)
    setTouchDrag({ type: "placed", letter, row, col, isBlank, x: touch.clientX, y: touch.clientY })
    setDraggedPlacedTile({ row, col, letter, isBlank })
    setDraggedTile(null)
  }

  function completeTouchDrag(touch: { clientX: number; clientY: number }) {
    const drag = touchDragRef.current
    if (!drag) return
    const start = touchStartPosRef.current
    const moved = start ? Math.hypot(touch.clientX - start.x, touch.clientY - start.y) : 999

    if (moved < touchDragActivationDistance) {
      setTouchDrag(null)
      setTouchDragEngaged(false)
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
    setTouchDragEngaged(false)
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

  useEffect(() => {
    if (homeBrandDraggedIndex === null) return

    function onTouchMove(e: TouchEvent) {
      const touch = e.touches[0]
      if (!touch) return
      const el = document.elementFromPoint(touch.clientX, touch.clientY)
      const tileEl = el?.closest("[data-home-brand-index]") as HTMLElement | null
      if (!tileEl?.dataset.homeBrandIndex) return
      setHomeBrandDropIndex(parseInt(tileEl.dataset.homeBrandIndex, 10))
    }

    function onTouchEnd(e: TouchEvent) {
      const touch = e.changedTouches[0]
      const start = homeBrandTouchStartRef.current
      const moved = start ? Math.hypot(touch.clientX - start.x, touch.clientY - start.y) : 0
      const dropIndex = homeBrandDropIndex
      const dragIndex = homeBrandDraggedIndex

      homeBrandTouchStartRef.current = null

      if (dragIndex !== null && dropIndex !== null && moved >= touchDragActivationDistance) {
        reorderHomeBrandTile(dragIndex, dropIndex)
        return
      }

      setHomeBrandDraggedIndex(null)
      setHomeBrandDropIndex(null)
    }

    document.addEventListener("touchmove", onTouchMove, { passive: true })
    document.addEventListener("touchend", onTouchEnd)
    document.addEventListener("touchcancel", onTouchEnd)

    return () => {
      document.removeEventListener("touchmove", onTouchMove)
      document.removeEventListener("touchend", onTouchEnd)
      document.removeEventListener("touchcancel", onTouchEnd)
    }
  }, [homeBrandDraggedIndex, homeBrandDropIndex, touchDragActivationDistance])

  const gameOver = attemptsLeft === 0
  const canShare = attemptHistory.length > 0
  const turnNumber = Math.min(attemptHistory.length + 1, maxAttempts)
  const completedTurns = Math.min(attemptHistory.length, maxAttempts)
  const turnProgressDegrees = `${(completedTurns / maxAttempts) * 360}deg`

  useEffect(() => {
    if (gameOver) {
      setShowResultsModal(true)
    } else {
      setShowResultsModal(false)
      setShowPuzzleReview(false)
    }
  }, [gameOver])

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
    setRack((prev) => prev.map((tile, index) => (index === rackIndex ? null : tile)))
    setSelectedTile(null)
    setDraggedTile(null)
    setDraggedPlacedTile(null)
    setRackDropIndex(null)
    setHintLevel(2)
    setShowHint(true)
    triggerAppHapticFeedback([10, 20, 10])
    playPlacementSound()
    triggerUiFeedback("hint")
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
      triggerAppHapticFeedback(10)
      triggerUiFeedback("hint")
      return
    }

    if (hintLevel === 1) {
      applySecondHint()
    }
  }

  async function shareResults() {
    const header =
      activeGameMode === "hard"
        ? `Lexicon Hard ${formatDisplayDate(puzzle.date)}`
        : `Lexicon ${formatDisplayDate(puzzle.date)}`
    const summary = isPerfectFirstTryRun()
      ? activeGameMode === "hard"
        ? `Perfect hard first try: ${bestScore}/${solution.bestScore}`
        : `Perfect first try: ${bestScore}/${solution.bestScore}`
      : activeGameMode === "hard"
        ? `Hard Mode Score: ${bestScore}/${solution.bestScore}`
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allWordPreviews = useMemo(() => getAllWordPreviews(), [placedTiles, boardSize, fixedCellsMap, placedTilesMap, bonusCellsMap])
  const validWordPreviews = useMemo(
    () => allWordPreviews.filter((preview) => VALID_WORDS.has(preview.word)),
    [allWordPreviews]
  )
  const validWordHighlightCells = useMemo(
    () =>
      new Set(
        validWordPreviews.flatMap((preview) =>
          preview.cells.map((cell) => getBoardCellKey(cell.row, cell.col))
        )
      ),
    [validWordPreviews]
  )
  const showLiveScorePreview =
    placedTiles.length > 0 &&
    isTouchingFilledCells() &&
    allWordPreviews.length > 0 &&
    validWordPreviews.length === allWordPreviews.length
  const liveScoreAnchorCell = showLiveScorePreview
    ? (() => {
        const mainPreview = allWordPreviews[0]
        if (!mainPreview) return null
        return mainPreview.direction === "row"
          ? mainPreview.cells.reduce((best, cell) => (cell.col > best.col ? cell : best))
          : mainPreview.cells.reduce((best, cell) => (cell.row > best.row ? cell : best))
      })()
    : null
  const liveScoreTotal = showLiveScorePreview
    ? allWordPreviews.reduce((sum, preview) => sum + preview.score, 0)
    : null
  const homeActionButtonStyle: React.CSSProperties = {
    padding: isCompactMobile ? "14px 16px" : "16px 18px",
    fontSize: isCompactMobile ? "15px" : "16px",
    borderRadius: "18px",
    border: "1px solid rgba(123, 98, 65, 0.16)",
    background: "linear-gradient(180deg, rgba(255,250,240,0.96) 0%, rgba(244,233,214,0.98) 100%)",
    color: "#2f2419",
    cursor: "pointer",
    fontWeight: 800,
    textAlign: "left",
    boxShadow: "0 10px 24px rgba(78, 56, 28, 0.08)",
  }
  const analyticsRecords = stats.puzzleHistory ?? []
  const averageScorePercent =
    analyticsRecords.length > 0
      ? Math.round(
          (analyticsRecords.reduce((sum, record) => sum + record.scorePercent, 0) /
            analyticsRecords.length) *
            100
        )
      : 0
  const averageAttemptsUsed =
    analyticsRecords.length > 0
      ? (
          analyticsRecords.reduce((sum, record) => sum + record.attemptsUsed, 0) /
          analyticsRecords.length
        ).toFixed(1)
      : "0.0"
  const hintUsageRate =
    analyticsRecords.length > 0
      ? Math.round(
          (analyticsRecords.filter((record) => record.hintsUsed > 0).length / analyticsRecords.length) * 100
        )
      : 0
  const hardGamesPlayed = analyticsRecords.filter((record) => record.mode === "hard").length
  const perfectRate =
    analyticsRecords.length > 0
      ? Math.round(
          (analyticsRecords.filter((record) => record.rating === "Perfect").length / analyticsRecords.length) *
            100
        )
      : 0
  const toughestPuzzle =
    analyticsRecords.length > 0
      ? analyticsRecords.reduce((lowest, record) =>
          record.scorePercent < lowest.scorePercent ? record : lowest
        )
      : null
  const statsPanel = showStats && (
    <div
      style={{
        width: "100%",
        background: homeActionButtonStyle.background,
        border: homeActionButtonStyle.border,
        borderRadius: homeActionButtonStyle.borderRadius,
        padding: isCompactMobile ? "14px 16px" : "16px 18px",
        marginBottom: "16px",
        boxShadow: homeActionButtonStyle.boxShadow,
        animation: reducedMotionEnabled ? undefined : "fade-up 220ms ease both",
      }}
    >
      <strong style={{ fontSize: "18px" }}>Your Stats</strong>
      <div style={{ display: "flex", gap: "24px", marginTop: "12px", flexWrap: "wrap" }}>
        {[
          { label: "Played", value: stats.gamesPlayed },
          { label: "Streak", value: stats.currentStreak },
          { label: "Best Streak", value: stats.maxStreak },
          { label: "Perfect Streak", value: stats.perfectCurrentStreak },
        ].map(({ label, value }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "28px", fontWeight: "bold" }}>{value}</div>
            <div style={{ fontSize: "12px", color: "#5b4630" }}>{label}</div>
          </div>
        ))}
      </div>
      {stats.gamesPlayed > 0 && (
        <div style={{ marginTop: "16px" }}>
          <div style={{ fontWeight: "bold", marginBottom: "10px", fontSize: "13px" }}>
            Puzzle Analytics
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isCompactMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
              gap: "10px",
              marginBottom: "16px",
            }}
          >
            {[
              { label: "Avg Score", value: `${averageScorePercent}%` },
              { label: "Avg Attempts", value: averageAttemptsUsed },
              { label: "Hint Rate", value: `${hintUsageRate}%` },
              { label: "Hard Games", value: hardGamesPlayed },
              { label: "Perfect Rate", value: `${perfectRate}%` },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  background: "rgba(255,250,240,0.7)",
                  border: "1px solid rgba(123, 98, 65, 0.12)",
                  borderRadius: "12px",
                  padding: "10px 12px",
                }}
              >
                <div style={{ fontSize: "12px", color: "#8a6a42", marginBottom: "4px" }}>{label}</div>
                <div style={{ fontSize: "22px", fontWeight: 800 }}>{value}</div>
              </div>
            ))}
          </div>

          {toughestPuzzle && (
            <div
              style={{
                background: "rgba(255,250,240,0.7)",
                border: "1px solid rgba(123, 98, 65, 0.12)",
                borderRadius: "12px",
                padding: "10px 12px",
                marginBottom: "16px",
              }}
            >
              <div style={{ fontSize: "12px", color: "#8a6a42", marginBottom: "4px" }}>Toughest Puzzle So Far</div>
              <div style={{ fontSize: "16px", fontWeight: 800 }}>
                {formatDisplayDate(toughestPuzzle.date)} · {toughestPuzzle.mode}
              </div>
              <div style={{ fontSize: "13px", color: "#5b4630", marginTop: "4px" }}>
                Best score {toughestPuzzle.bestScore}/{toughestPuzzle.optimalScore} ({Math.round(toughestPuzzle.scorePercent * 100)}%)
              </div>
            </div>
          )}

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
  )
  const archivePuzzles = DAILY_PUZZLES.filter((p) => p.date <= todayDate)
  const archiveMonthKeys = Array.from(new Set(archivePuzzles.map((p) => getMonthKey(p.date)))).sort()
  const activeArchiveMonthKey =
    archiveMonthKeys.includes(archiveMonthKey)
      ? archiveMonthKey
      : archiveMonthKeys[archiveMonthKeys.length - 1] ?? getMonthKey(todayDate)
  const activeArchiveMonthIndex = archiveMonthKeys.indexOf(activeArchiveMonthKey)
  const archiveDateMap = new Map(archivePuzzles.map((p) => [p.date, p]))
  const [archiveYear, archiveMonth] = activeArchiveMonthKey.split("-").map(Number)
  const archiveDaysInMonth =
    archiveYear && archiveMonth ? new Date(archiveYear, archiveMonth, 0).getDate() : 0
  const archiveFirstWeekday =
    archiveYear && archiveMonth ? new Date(archiveYear, archiveMonth - 1, 1).getDay() : 0
  const archiveCalendarCells: Array<{ date: string | null; puzzleDate: string | null }> = []
  const archivePuzzleDatesInMonth = archivePuzzles.filter(
    (puzzle) => getMonthKey(puzzle.date) === activeArchiveMonthKey
  )
  const archivePuzzleCountThisMonth = archivePuzzleDatesInMonth.length
  const archiveCompletedCountThisMonth = archivePuzzleDatesInMonth.filter(
    (puzzle) => {
      const status = completedArchiveDates[puzzle.date]
      return Boolean(status?.easy || status?.hard)
    }
  ).length
  const archiveEasyCompletedCountThisMonth = archivePuzzleDatesInMonth.filter(
    (puzzle) => completedArchiveDates[puzzle.date]?.easy
  ).length
  const archiveHardCompletedCountThisMonth = archivePuzzleDatesInMonth.filter(
    (puzzle) => completedArchiveDates[puzzle.date]?.hard
  ).length

  for (let index = 0; index < archiveFirstWeekday; index++) {
    archiveCalendarCells.push({ date: null, puzzleDate: null })
  }

  for (let day = 1; day <= archiveDaysInMonth; day++) {
    const date = `${String(archiveYear).padStart(4, "0")}-${String(archiveMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    archiveCalendarCells.push({
      date,
      puzzleDate: archiveDateMap.has(date) ? date : null,
    })
  }

  while (archiveCalendarCells.length % 7 !== 0) {
    archiveCalendarCells.push({ date: null, puzzleDate: null })
  }

  const archivePanel = showArchive && (
    <div
      style={{
        width: "100%",
        background: homeActionButtonStyle.background,
        border: homeActionButtonStyle.border,
        borderRadius: homeActionButtonStyle.borderRadius,
        padding: isCompactMobile ? "16px" : "18px 20px",
        marginBottom: "16px",
        boxShadow: homeActionButtonStyle.boxShadow,
        animation: reducedMotionEnabled ? undefined : "fade-up 220ms ease both",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "14px",
          marginBottom: "14px",
        }}
      >
        <div>
          <strong style={{ fontSize: isCompactMobile ? "17px" : "18px", display: "block" }}>
            Puzzle Archive
          </strong>
          <div
            style={{
              marginTop: "4px",
              fontSize: isCompactMobile ? "12px" : "13px",
              color: "#6d5537",
              lineHeight: 1.4,
            }}
          >
            Browse past boards and jump back into any day.
          </div>
        </div>
        <div
          style={{
            padding: isCompactMobile ? "8px 10px" : "9px 12px",
            borderRadius: "999px",
            background: "rgba(255,250,240,0.9)",
            border: "1px solid rgba(123, 98, 65, 0.14)",
            color: "#2f2419",
            fontWeight: 800,
            flexShrink: 0,
            fontSize: isCompactMobile ? "12px" : "13px",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
          }}
        >
          {archiveCompletedCountThisMonth}/{archivePuzzleCountThisMonth} done
        </div>
      </div>
      <div
        style={{
          background: "rgba(255,250,240,0.7)",
          borderRadius: isCompactMobile ? "16px" : "18px",
          border: "1px solid rgba(123, 98, 65, 0.12)",
          padding: isCompactMobile ? "12px" : "14px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "12px",
          }}
        >
          <button
            onClick={() =>
              setArchiveMonthKey(
                archiveMonthKeys[Math.max(0, activeArchiveMonthIndex - 1)] ?? activeArchiveMonthKey
              )
            }
            disabled={activeArchiveMonthIndex <= 0}
            aria-label="Previous month"
            style={{
              width: isCompactMobile ? "36px" : "40px",
              height: isCompactMobile ? "36px" : "40px",
              borderRadius: "999px",
              border: "1px solid rgba(123, 98, 65, 0.18)",
              backgroundColor: activeArchiveMonthIndex <= 0 ? "#e7dcc8" : "#efe2c7",
              color: activeArchiveMonthIndex <= 0 ? "#9d8b71" : "#2f2419",
              cursor: activeArchiveMonthIndex <= 0 ? "not-allowed" : "pointer",
              fontWeight: 800,
              flexShrink: 0,
              fontSize: isCompactMobile ? "18px" : "20px",
              lineHeight: 1,
            }}
          >
            ‹
          </button>
          <div
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: isCompactMobile ? "15px" : "16px",
              fontWeight: 800,
              color: "#3a2c1f",
              padding: isCompactMobile ? "8px 10px" : "9px 12px",
              borderRadius: "999px",
              background: "rgba(239,226,199,0.72)",
              border: "1px solid rgba(123, 98, 65, 0.12)",
            }}
          >
            {formatCalendarMonthLabel(activeArchiveMonthKey)}
          </div>
          <button
            onClick={() =>
              setArchiveMonthKey(
                archiveMonthKeys[Math.min(archiveMonthKeys.length - 1, activeArchiveMonthIndex + 1)] ??
                  activeArchiveMonthKey
              )
            }
            disabled={activeArchiveMonthIndex === -1 || activeArchiveMonthIndex >= archiveMonthKeys.length - 1}
            aria-label="Next month"
            style={{
              width: isCompactMobile ? "36px" : "40px",
              height: isCompactMobile ? "36px" : "40px",
              borderRadius: "999px",
              border: "1px solid rgba(123, 98, 65, 0.18)",
              backgroundColor:
                activeArchiveMonthIndex === -1 || activeArchiveMonthIndex >= archiveMonthKeys.length - 1
                  ? "#e7dcc8"
                  : "#efe2c7",
              color:
                activeArchiveMonthIndex === -1 || activeArchiveMonthIndex >= archiveMonthKeys.length - 1
                  ? "#9d8b71"
                  : "#2f2419",
              cursor:
                activeArchiveMonthIndex === -1 || activeArchiveMonthIndex >= archiveMonthKeys.length - 1
                  ? "not-allowed"
                  : "pointer",
              fontWeight: 800,
              flexShrink: 0,
              fontSize: isCompactMobile ? "18px" : "20px",
              lineHeight: 1,
            }}
          >
            ›
          </button>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            marginBottom: "10px",
            fontSize: isCompactMobile ? "11px" : "12px",
            color: "#7b6140",
            fontWeight: 700,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "999px",
                background: "#7aad2a",
                boxShadow: "0 0 0 2px rgba(122,173,42,0.18)",
              }}
            />
            Easy
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "999px",
                background: "#5f4221",
                boxShadow: "0 0 0 2px rgba(95,66,33,0.14)",
              }}
            />
            Hard
          </div>
          <div style={{ opacity: 0.75 }}>
            {archivePuzzleCountThisMonth === 0
              ? "No puzzles in this month."
              : `${archiveCompletedCountThisMonth}/${archivePuzzleCountThisMonth} dates played · ${archiveEasyCompletedCountThisMonth} easy · ${archiveHardCompletedCountThisMonth} hard`}
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gap: isCompactMobile ? "5px" : "6px",
          }}
        >
          {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
            <div
              key={`${day}-${index}`}
              style={{
                textAlign: "center",
                fontSize: isCompactMobile ? "10px" : "11px",
                fontWeight: 800,
                color: "#8a6a42",
                paddingBottom: isCompactMobile ? "2px" : "3px",
              }}
            >
              {day}
            </div>
          ))}
          {archiveCalendarCells.map((cell, index) => {
            if (!cell.date) {
              return (
                <div
                  key={`empty-${index}`}
                  style={{
                    aspectRatio: "1 / 1",
                    borderRadius: isCompactMobile ? "11px" : "12px",
                    backgroundColor: "rgba(203, 190, 170, 0.12)",
                    border: "1px dashed rgba(123, 98, 65, 0.08)",
                  }}
                />
              )
            }

            const isToday = cell.date === todayDate
            const isSelected = cell.date === selectedDate
            const completionStatus = completedArchiveDates[cell.date] ?? {
              easy: false,
              hard: false,
            }
            const isEasyCompleted = completionStatus.easy
            const isHardCompleted = completionStatus.hard
            const isCompleted = isEasyCompleted || isHardCompleted
            const hasPuzzle = Boolean(cell.puzzleDate)

            if (!hasPuzzle) {
              return (
                <div
                  key={cell.date}
                  style={{
                    aspectRatio: "1 / 1",
                    borderRadius: isCompactMobile ? "11px" : "12px",
                    backgroundColor: "rgba(203, 190, 170, 0.18)",
                    border: "1px solid rgba(123, 98, 65, 0.08)",
                    color: "#a08b73",
                    display: "grid",
                    placeItems: "center",
                    fontSize: isCompactMobile ? "11px" : "12px",
                    fontWeight: 700,
                  }}
                >
                  {Number(cell.date.slice(-2))}
                </div>
              )
            }

            return (
              <button
                key={cell.date}
                onClick={() => selectPuzzleDate(cell.date!)}
                title={formatDisplayDate(cell.date)}
                style={{
                  aspectRatio: "1 / 1",
                  borderRadius: isCompactMobile ? "11px" : "12px",
                  border: isSelected
                    ? "2px solid #5f4221"
                    : isToday
                      ? "2px solid #b98f58"
                      : "1px solid rgba(123, 98, 65, 0.18)",
                  backgroundColor: isCompleted ? "#7aad2a" : "#efe2c7",
                  color: isCompleted ? "#fffaf1" : "#2f2419",
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: isCompactMobile ? "11px" : "12px",
                  display: "grid",
                  placeItems: "center",
                  boxShadow: isCompleted
                    ? "0 8px 16px rgba(114, 173, 45, 0.18)"
                    : isToday
                      ? "0 6px 14px rgba(185, 143, 88, 0.16)"
                      : "none",
                  position: "relative",
                  transition: reducedMotionEnabled ? undefined : "transform 140ms ease, box-shadow 140ms ease",
                  transform: isSelected ? "translateY(-1px)" : "translateY(0)",
                  overflow: "hidden",
                }}
              >
                {isCompleted && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        isEasyCompleted && isHardCompleted
                          ? "linear-gradient(90deg, #7aad2a 0%, #7aad2a 50%, #5f4221 50%, #5f4221 100%)"
                          : isHardCompleted
                            ? "#5f4221"
                            : "#7aad2a",
                    }}
                  />
                )}
                <span
                  style={{
                    position: "relative",
                    zIndex: 1,
                    color: isCompleted ? "#fffaf1" : "#2f2419",
                  }}
                >
                  {Number(cell.date.slice(-2))}
                </span>
                {isToday && (
                  <span
                    style={{
                      position: "absolute",
                      top: "4px",
                      right: "4px",
                      width: "6px",
                      height: "6px",
                      borderRadius: "999px",
                      backgroundColor: isCompleted ? "#fffaf1" : "#b98f58",
                      zIndex: 1,
                    }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )

  return (
    <main
      style={{
        minHeight: "100dvh",
        height: isCompactMobile ? "100dvh" : undefined,
        background:
          "linear-gradient(180deg, rgba(251,245,234,0.96) 0%, rgba(242,230,210,0.96) 100%)",
        padding: isCompactMobile
          ? "max(8px, env(safe-area-inset-top)) 8px max(8px, env(safe-area-inset-bottom))"
          : "clamp(12px, 4vw, 32px)",
        fontFamily: "var(--font-sans)",
        color: "#2f2419",
        animation: reducedMotionEnabled ? undefined : "fade-up 300ms ease both",
        overflow: isCompactMobile ? "hidden" : undefined,
      }}
    >
      <div
        style={{
          maxWidth: isCompactMobile ? "100%" : "920px",
          margin: "0 auto",
          height: isCompactMobile ? "100%" : undefined,
        }}
      >
        {viewMode === "home" ? (
          <div
            style={{
              minHeight: isCompactMobile ? "calc(100dvh - 16px)" : "calc(100dvh - 48px)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: isCompactMobile ? "18px" : "22px",
              maxWidth: "760px",
              margin: "0 auto",
            }}
          >
            <div
              style={{
                padding: isCompactMobile ? "20px 18px" : "28px 28px 24px",
                borderRadius: isCompactMobile ? "24px" : "28px",
                background:
                  "linear-gradient(180deg, rgba(255,250,240,0.96) 0%, rgba(244,233,214,0.98) 100%)",
                border: "1px solid rgba(123, 98, 65, 0.14)",
                boxShadow: "0 18px 36px rgba(78, 56, 28, 0.08)",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: isCompactMobile ? "18px" : "24px",
                  right: isCompactMobile ? "18px" : "24px",
                  fontSize: isCompactMobile ? "12px" : "13px",
                  color: "#8a6a42",
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                }}
              >
                {todayDisplayDate}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: isCompactMobile ? "11px" : "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  color: "#8a6a42",
                  fontWeight: 800,
                }}
              >
                Daily Puzzle
              </p>
              <div
                aria-label="Lexicon"
                style={{
                  display: "flex",
                  flexWrap: "nowrap",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: isCompactMobile ? "2px" : "4px",
                  margin: isCompactMobile ? "8px 0 10px" : "10px 0 12px",
                  overflowX: "auto",
                  paddingBottom: "4px",
                }}
              >
                {homeBrandRack.map((letter, index) => (
                  <div
                    key={`${letter}-${index}`}
                    data-home-brand-index={index}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setHomeBrandDropIndex(index)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (homeBrandDraggedIndex === null) return
                      reorderHomeBrandTile(homeBrandDraggedIndex, index)
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: isCompactMobile ? "2px" : "4px",
                    }}
                  >
                    <div
                      draggable
                      onDragStart={() => setHomeBrandDraggedIndex(index)}
                      onDragEnd={() => {
                        setHomeBrandDraggedIndex(null)
                        setHomeBrandDropIndex(null)
                      }}
                      onTouchStart={(e) => handleHomeBrandTouchStart(e, index)}
                      style={{
                        width: isCompactMobile ? "40px" : "56px",
                        height: isCompactMobile ? "40px" : "56px",
                        borderRadius: isCompactMobile ? "10px" : "14px",
                        border: "2px solid rgba(135,106,63,0.9)",
                        background:
                          "linear-gradient(180deg, rgba(242,223,176,0.98) 0%, rgba(232,206,143,0.98) 100%)",
                        boxShadow: "0 8px 14px rgba(98, 74, 34, 0.12)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: isCompactMobile ? "24px" : "34px",
                        fontWeight: 800,
                        color: "#332616",
                        position: "relative",
                        cursor: "grab",
                        transform:
                          homeBrandDraggedIndex === index
                            ? "scale(0.96) rotate(-2deg)"
                            : "rotate(0deg)",
                        opacity: homeBrandDraggedIndex === index ? 0.75 : 1,
                        flexShrink: 0,
                        userSelect: "none",
                      }}
                    >
                      <span>{letter}</span>
                      <span
                        style={{
                          position: "absolute",
                          right: isCompactMobile ? "5px" : "7px",
                          bottom: isCompactMobile ? "4px" : "6px",
                          fontSize: isCompactMobile ? "9px" : "11px",
                          fontWeight: 700,
                          color: "#6d5430",
                          opacity: 0.85,
                        }}
                      >
                        {LETTER_SCORES[letter] ?? 0}
                      </span>
                    </div>
                    {homeBrandDropIndex === index && homeBrandDraggedIndex !== null && (
                      <div
                        style={{
                          width: isCompactMobile ? "4px" : "6px",
                          height: isCompactMobile ? "30px" : "40px",
                          borderRadius: "999px",
                          backgroundColor: "#7aad2a",
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
              <p style={{ margin: 0, fontSize: isCompactMobile ? "15px" : "17px", color: "#5b4630", maxWidth: "40ch", lineHeight: 1.45 }}>
                A lexicon is the vocabulary of a language, speaker, or subject.
              </p>
              <div
                style={{
                  marginTop: "12px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: isCompactMobile ? "8px 12px" : "9px 14px",
                  borderRadius: "999px",
                  background: "rgba(255,250,240,0.92)",
                  border: "1px solid rgba(123, 98, 65, 0.14)",
                  fontSize: isCompactMobile ? "12px" : "13px",
                  color: "#6d5537",
                  fontWeight: 700,
                }}
              >
                <span style={{ opacity: 0.72, textTransform: "uppercase", letterSpacing: "0.06em" }}>Next puzzle</span>
                <span style={{ color: "#2f2419", fontWeight: 800 }}>{hasMounted ? resetCountdown : "--:--:--"}</span>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isCompactMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                gap: "12px",
              }}
            >
              <button
                onClick={() => {
                  setViewMode("daily")
                  setShowArchive(false)
                  setShowStats(false)
                }}
                style={{
                  ...homeActionButtonStyle,
                  background: "linear-gradient(180deg, rgba(45,34,23,0.98) 0%, rgba(23,18,13,0.98) 100%)",
                  color: "#fffaf1",
                }}
              >
                <div style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.7 }}>
                  {hasSavedTodayGame ? "Continue" : "Start"}
                </div>
                <div style={{ fontSize: isCompactMobile ? "22px" : "24px", lineHeight: 1.15, marginTop: "4px" }}>
                  Play Daily
                </div>
              </button>

              <button
                onClick={() => {
                  setShowArchive((prev) => !prev)
                  setShowStats(false)
                }}
                style={homeActionButtonStyle}
              >
                <div style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.7 }}>
                  Browse
                </div>
                <div style={{ fontSize: isCompactMobile ? "22px" : "24px", lineHeight: 1.15, marginTop: "4px" }}>
                  {showArchive ? "Hide Archive" : "Open Archive"}
                </div>
              </button>

              <button
                onClick={() => {
                  setShowStats((prev) => !prev)
                  setShowArchive(false)
                }}
                style={homeActionButtonStyle}
              >
                <div style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.7 }}>
                  Progress
                </div>
                <div style={{ fontSize: isCompactMobile ? "22px" : "24px", lineHeight: 1.15, marginTop: "4px" }}>
                  {showStats ? "Hide Stats" : "View Stats"}
                </div>
              </button>
            </div>

            {statsPanel}
            {archivePanel}

            <button
              onClick={() => setShowTutorial(true)}
              aria-label="How to Play"
              style={{
                position: "fixed",
                right: isCompactMobile ? "14px" : "22px",
                bottom: isCompactMobile ? "max(14px, calc(env(safe-area-inset-bottom) + 8px))" : "22px",
                width: isCompactMobile ? "46px" : "52px",
                height: isCompactMobile ? "46px" : "52px",
                borderRadius: "999px",
                border: "1px solid rgba(123, 98, 65, 0.22)",
                background: "linear-gradient(180deg, rgba(255,250,240,0.96) 0%, rgba(244,233,214,0.98) 100%)",
                color: "#2f2419",
                cursor: "pointer",
                fontSize: isCompactMobile ? "22px" : "24px",
                fontWeight: 800,
                boxShadow: "0 12px 28px rgba(78, 56, 28, 0.12)",
                display: "grid",
                placeItems: "center",
                zIndex: 15,
              }}
            >
              ?
            </button>
          </div>
        ) : viewMode === "daily" ? (
          <div
            style={{
              minHeight: isCompactMobile ? "calc(100dvh - 16px)" : "calc(100dvh - 48px)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              gap: isCompactMobile ? "18px" : "22px",
              maxWidth: "560px",
              margin: "0 auto",
              textAlign: "center",
              position: "relative",
            }}
          >
            <button
              onClick={goHome}
              aria-label="Back"
              style={{
                position: "absolute",
                top: isCompactMobile ? "4px" : "0",
                left: isCompactMobile ? "0" : "4px",
                width: isCompactMobile ? "42px" : "46px",
                height: isCompactMobile ? "42px" : "46px",
                borderRadius: "999px",
                border: "1px solid rgba(123, 98, 65, 0.16)",
                background: "rgba(255,250,240,0.86)",
                color: "#2f2419",
                cursor: "pointer",
                fontSize: isCompactMobile ? "26px" : "28px",
                lineHeight: 1,
                display: "grid",
                placeItems: "center",
                boxShadow: "0 10px 22px rgba(78, 56, 28, 0.08)",
              }}
            >
              ‹
            </button>

            <div
              style={{
                width: "100%",
                padding: isCompactMobile ? "28px 20px 24px" : "36px 28px 30px",
              }}
            >
              <div
                style={{
                  width: isCompactMobile ? "72px" : "84px",
                  height: isCompactMobile ? "72px" : "84px",
                  margin: "0 auto 14px",
                  borderRadius: "20px",
                  background: "rgba(255,255,255,0.28)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: isCompactMobile ? "34px" : "40px",
                }}
              >
                ◈
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: isCompactMobile ? "42px" : "50px",
                  lineHeight: 1,
                  fontFamily: "Georgia, serif",
                }}
              >
                Lexicon
              </h1>
              <p
                style={{
                  margin: "10px auto 0",
                  maxWidth: "12ch",
                  fontSize: isCompactMobile ? "17px" : "20px",
                  lineHeight: 1.25,
                  color: "#3d2a38",
                  fontWeight: 500,
                }}
              >
                Choose your daily mode.
              </p>

              <div
                style={{
                  marginTop: isCompactMobile ? "24px" : "28px",
                  background: "rgba(129, 83, 128, 0.16)",
                  borderRadius: "14px",
                  padding: "4px",
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "4px",
                  maxWidth: "320px",
                  marginInline: "auto",
                }}
              >
                {(["easy", "hard"] as const).map((mode) => {
                  const isSelected = selectedMode === mode
                  return (
                    <button
                      key={mode}
                      onClick={() => setSelectedMode(mode)}
                      style={{
                        padding: isCompactMobile ? "10px 12px" : "11px 14px",
                        borderRadius: "10px",
                        border: "none",
                        background: isSelected ? "#fffaf1" : "transparent",
                        color: isSelected ? "#2f2419" : "#3d2a38",
                        cursor: "pointer",
                        fontSize: isCompactMobile ? "15px" : "16px",
                        fontWeight: 800,
                        textTransform: "capitalize",
                        boxShadow: isSelected ? "0 4px 10px rgba(61, 42, 56, 0.08)" : "none",
                      }}
                    >
                      {mode}
                    </button>
                  )
                })}
              </div>

              <button
                onClick={() => selectPuzzleDate(todayDate, selectedMode)}
                style={{
                  marginTop: isCompactMobile ? "18px" : "20px",
                  minWidth: isCompactMobile ? "140px" : "160px",
                  padding: isCompactMobile ? "14px 24px" : "16px 28px",
                  borderRadius: "999px",
                  border: "none",
                  background: "#17120d",
                  color: "#fffaf1",
                  cursor: "pointer",
                  fontSize: isCompactMobile ? "24px" : "26px",
                  fontWeight: 800,
                  boxShadow: "0 12px 24px rgba(23,18,13,0.2)",
                }}
              >
                Play
              </button>

              <div
                style={{
                  marginTop: isCompactMobile ? "18px" : "22px",
                  fontSize: isCompactMobile ? "16px" : "18px",
                  color: "#2f2419",
                  fontWeight: 700,
                }}
              >
                {todayDisplayDate}
              </div>
              <div
                style={{
                  marginTop: "10px",
                  fontSize: isCompactMobile ? "14px" : "15px",
                  color: "#4f384b",
                  fontWeight: 700,
                }}
              >
                Next puzzle in {hasMounted ? resetCountdown : "--:--:--"}
              </div>
              <div
                style={{
                  marginTop: "8px",
                  fontSize: isCompactMobile ? "14px" : "15px",
                  lineHeight: 1.45,
                  color: "#4f384b",
                }}
              >
                Puzzle by Lexicon
                <br />
                Pick your track and play.
              </div>
            </div>

            <button
              onClick={() => setShowTutorial(true)}
              aria-label="How to Play"
              style={{
                position: "fixed",
                right: isCompactMobile ? "14px" : "22px",
                bottom: isCompactMobile ? "max(14px, calc(env(safe-area-inset-bottom) + 8px))" : "22px",
                width: isCompactMobile ? "46px" : "52px",
                height: isCompactMobile ? "46px" : "52px",
                borderRadius: "999px",
                border: "1px solid rgba(123, 98, 65, 0.22)",
                background: "linear-gradient(180deg, rgba(255,250,240,0.96) 0%, rgba(244,233,214,0.98) 100%)",
                color: "#2f2419",
                cursor: "pointer",
                fontSize: isCompactMobile ? "22px" : "24px",
                fontWeight: 800,
                boxShadow: "0 12px 28px rgba(78, 56, 28, 0.12)",
                display: "grid",
                placeItems: "center",
                zIndex: 15,
              }}
            >
              ?
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: isCompactMobile ? "100%" : undefined,
              minHeight: 0,
              overflow: isCompactMobile ? "hidden" : undefined,
            }}
          >
        {isCompactMobile && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "10px",
              marginBottom: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                onClick={goHome}
                style={{
                  padding: "8px 14px",
                  fontSize: "13px",
                  borderRadius: "999px",
                  border: "1px solid rgba(123, 98, 65, 0.18)",
                  backgroundColor: "rgba(255,250,240,0.92)",
                  cursor: "pointer",
                  color: "#2f2419",
                  fontWeight: 800,
                  boxShadow: "0 8px 18px rgba(78, 56, 28, 0.06)",
                }}
              >
                Home
              </button>
              <span
                style={{
                  padding: "7px 10px",
                  fontSize: "12px",
                  borderRadius: "999px",
                  backgroundColor: activeGameMode === "hard" ? "rgba(90,58,20,0.96)" : "rgba(219,233,255,0.96)",
                  color: activeGameMode === "hard" ? "#fffaf1" : "#26456e",
                  fontWeight: 800,
                  textTransform: "capitalize",
                }}
              >
                {activeGameMode}
              </span>
            </div>
            <button
              onClick={() => setShowTutorial(true)}
              style={{
                padding: "8px 14px",
                fontSize: "13px",
                borderRadius: "999px",
                border: "1px solid rgba(123, 98, 65, 0.18)",
                backgroundColor: "rgba(255,250,240,0.92)",
                cursor: "pointer",
                color: "#2f2419",
                fontWeight: 800,
                boxShadow: "0 8px 18px rgba(78, 56, 28, 0.06)",
              }}
            >
              How to Play
            </button>
          </div>
        )}
        {!isCompactMobile && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "12px",
            }}
          >
            <div
              style={{
                fontSize: "14px",
                color: "#6d5537",
                fontWeight: 700,
              }}
            >
              <strong>{formatDisplayDate(puzzle.date)}</strong> ·{" "}
              <strong style={{ textTransform: "capitalize" }}>{activeGameMode}</strong> mode
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
                onClick={goHome}
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
                Home
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
        )}

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
            width: isCompactMobile && compactPuzzleFrameWidth ? `${compactPuzzleFrameWidth}px` : "100%",
            maxWidth: isCompactMobile && compactPuzzleFrameWidth ? `${compactPuzzleFrameWidth}px` : "100%",
            marginLeft: isCompactMobile ? "auto" : undefined,
            marginRight: isCompactMobile ? "auto" : undefined,
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
        {statsPanel}
        {archivePanel}

        {viewMode === "game" && uiFeedback && (
          <div
            key={`${uiFeedback.kind}-${uiFeedback.tick}`}
            style={{
              position: "fixed",
              top: isCompactMobile ? "max(60px, calc(env(safe-area-inset-top) + 48px))" : "24px",
              left: "50%",
              transform: "translateX(-50%)",
              padding: isCompactMobile ? "8px 12px" : "9px 14px",
              borderRadius: "999px",
              background:
                uiFeedback.kind === "win"
                  ? "linear-gradient(180deg, rgba(112,173,45,0.98) 0%, rgba(79,143,24,0.98) 100%)"
                  : uiFeedback.kind === "submit"
                  ? "linear-gradient(180deg, rgba(32,41,57,0.96) 0%, rgba(18,24,36,0.98) 100%)"
                  : uiFeedback.kind === "hint"
                  ? "linear-gradient(180deg, rgba(88,122,63,0.96) 0%, rgba(60,90,41,0.98) 100%)"
                  : "linear-gradient(180deg, rgba(109,85,55,0.96) 0%, rgba(79,59,35,0.98) 100%)",
              color: "#fffaf1",
              fontSize: isCompactMobile ? "12px" : "13px",
              fontWeight: 800,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              boxShadow: "0 14px 28px rgba(34, 25, 13, 0.18)",
              zIndex: 35,
              pointerEvents: "none",
              animation: reducedMotionEnabled ? undefined : "action-feedback-pop 520ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
            }}
          >
            {uiFeedback.kind === "submit"
              ? "Move submitted"
              : uiFeedback.kind === "hint"
              ? "Hint used"
              : uiFeedback.kind === "recall"
              ? "Tiles recalled"
              : "Puzzle solved"}
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
            flexShrink: 0,
            width: isCompactMobile && compactPuzzleFrameWidth ? `${compactPuzzleFrameWidth}px` : "100%",
            maxWidth: isCompactMobile && compactPuzzleFrameWidth ? `${compactPuzzleFrameWidth}px` : "100%",
            marginLeft: isCompactMobile ? "auto" : undefined,
            marginRight: isCompactMobile ? "auto" : undefined,
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
                display: isCompactMobile ? "-webkit-box" : undefined,
                WebkitLineClamp: isCompactMobile ? 1 : undefined,
                WebkitBoxOrient: isCompactMobile ? "vertical" : undefined,
                overflow: isCompactMobile ? "hidden" : undefined,
              }}
            >
              {submittedWords.map((item) => `${item.word} - ${item.score} points`).join(", ")}
            </div>
          )}

          {!isCompactMobile && attemptHistory.length > 0 && (
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

          {!isCompactMobile && canShare && (
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

        {gameOver && showResultsModal && (
          <div
            onClick={() => setShowResultsModal(false)}
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
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "relative",
                width: `min(${isCompactMobile ? "calc(100vw - 16px)" : "620px"}, calc(100vw - 24px))`,
                padding: isCompactMobile ? "16px 16px 14px" : "20px",
                background: "linear-gradient(180deg, rgba(245,251,239,0.98) 0%, rgba(237,246,231,0.98) 100%)",
                border: "1px solid rgba(98, 128, 76, 0.22)",
                borderRadius: isCompactMobile ? "18px" : "22px",
                boxShadow: "0 20px 40px rgba(84, 116, 66, 0.16)",
                animation: reducedMotionEnabled
                    ? undefined
                    :
                  (
                  uiFeedback?.kind === "win"
                    ? "win-celebration-card 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both"
                    : "pop-in-sheet 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both"),
              }}
            >
            <button
              onClick={() => setShowResultsModal(false)}
              style={{
                position: "absolute",
                top: isCompactMobile ? "10px" : "12px",
                right: isCompactMobile ? "10px" : "12px",
                width: "34px",
                height: "34px",
                borderRadius: "999px",
                border: "1px solid rgba(98, 128, 76, 0.2)",
                backgroundColor: "rgba(255,255,255,0.72)",
                cursor: "pointer",
                fontSize: "18px",
                lineHeight: 1,
                fontWeight: 700,
                color: "#355126",
              }}
              aria-label="Close results"
            >
              ×
            </button>
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
                onClick={goHome}
                style={{
                  padding: "11px 16px",
                  fontSize: "15px",
                  borderRadius: "12px",
                  border: "1px solid rgba(123, 98, 65, 0.2)",
                  backgroundColor: "#fff7dc",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Home
              </button>

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
                onClick={() => setShowResultsModal(false)}
                style={{
                  padding: "11px 16px",
                  fontSize: "15px",
                  borderRadius: "12px",
                  border: "1px solid rgba(123, 98, 65, 0.2)",
                  backgroundColor: "#eef4e8",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Close
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
            flex: isCompactMobile ? 1 : undefined,
            minHeight: 0,
          }}
        >
          <div
            style={{
              background:
                "linear-gradient(180deg, var(--board-shell-start) 0%, var(--board-shell-mid) 42%, var(--board-shell-end) 100%)",
              padding: isCompactMobile ? "8px" : "14px",
              borderRadius: isCompactMobile ? "18px" : "22px",
              boxShadow: "0 16px 34px var(--board-shell-shadow)",
              width: isCompactMobile && compactPuzzleFrameWidth ? `${compactPuzzleFrameWidth}px` : "100%",
              maxWidth: isCompactMobile && compactPuzzleFrameWidth ? `${compactPuzzleFrameWidth}px` : "100%",
              overflowX: isCompactMobile ? "hidden" : "auto",
              margin: isCompactMobile ? "0 auto" : undefined,
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
                const validWordOutline = getWordOutlineStyle(row, col, validWordHighlightCells)
                const optimalLetter = gameOver && !letter ? optimalLetterMap.get(getBoardCellKey(row, col)) ?? "" : ""
                const displayLetter = letter || optimalLetter
                const hasLetter = Boolean(displayLetter)
                const letterScore = displayLetter
                  ? placedTile?.isBlank
                    ? 0
                    : LETTER_SCORES[displayLetter] || 0
                  : 0
                const isMovablePlacedTile = Boolean(placedTile)
                const isRecentlyPlacedTile = recentPlacementKey === `${row}-${col}` && Boolean(placedTile)
                const isLiveScoreAnchor =
                  liveScoreAnchorCell?.row === row && liveScoreAnchorCell?.col === col

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
                      animation:
                        reducedMotionEnabled
                          ? undefined
                          : isRecentlyPlacedTile
                          ? "tile-place-pop 220ms cubic-bezier(0.2, 0.8, 0.2, 1)"
                          : undefined,
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
                    {isLiveScoreAnchor && liveScoreTotal !== null && (
                      <div
                        style={{
                          position: "absolute",
                          right: isCompactMobile ? "-8px" : "-10px",
                          bottom: isCompactMobile ? "-10px" : "-12px",
                          minWidth: isCompactMobile ? "26px" : "30px",
                          height: isCompactMobile ? "26px" : "30px",
                          padding: "0 7px",
                          borderRadius: "999px",
                          background:
                            "linear-gradient(180deg, rgba(125,197,42,0.98) 0%, rgba(89,161,23,0.98) 100%)",
                          color: "#fffdf8",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: isCompactMobile ? "13px" : "14px",
                          fontWeight: 900,
                          boxShadow: "0 8px 16px rgba(71, 117, 20, 0.28)",
                          border: "2px solid rgba(255,255,255,0.72)",
                          zIndex: 4,
                        }}
                      >
                        {liveScoreTotal}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div
              data-return-zone
              onDragOver={(e) => {
                if (draggedPlacedTileRef.current) {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = "move"
                }
              }}
              onDrop={(e) => {
                if (!draggedPlacedTileRef.current) return
                e.preventDefault()
                returnPlacedTileToRack(draggedPlacedTileRef.current)
              }}
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
                    key={`${tile ?? "empty"}-${index}-wrapper`}
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
                      draggable={!gameOver && tile !== null}
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
                      onDragStart={(e) => {
                        if (!tile) return
                        handleTileDragStart(e, tile, index)
                      }}
                      onDragEnd={handleRackTileDragEnd}
                      onClick={() => {
                        if (!tile) return
                        handleTileClick(tile, index)
                      }}
                      onTouchStart={(e) => {
                        if (!tile) return
                        handleRackTouchStart(e, tile, index)
                      }}
                      style={{
                        width: `${rackTileSize}px`,
                        height: `${rackTileSize}px`,
                        border: `3px solid ${
                          tile === null
                            ? "rgba(123, 98, 65, 0.2)"
                            :
                          selectedTile?.index === index
                            ? "#2563eb"
                            : draggedTile?.index === index
                            ? "#7b6241"
                            : "#7b6241"
                        }`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: isCompactMobile ? "20px" : "26px",
                        fontWeight: "bold",
                        backgroundColor: tile === null ? "rgba(255,250,240,0.3)" : "#e7d3a8",
                        cursor: gameOver ? "default" : tile === null ? "default" : "grab",
                        position: "relative",
                        borderRadius: isCompactMobile ? "10px" : "12px",
                        boxShadow:
                          tile === null
                            ? "none"
                            : isCompactMobile
                            ? "0 4px 10px rgba(39,70,117,0.14)"
                            : "0 6px 14px rgba(0,0,0,0.12)",
                        color: "#2f2419",
                        opacity: tile === null ? 0.55 : draggedTile?.index === index ? 0.6 : 1,
                        transition: "transform 160ms ease, box-shadow 160ms ease",
                        boxSizing: "border-box",
                        touchAction: "none",
                        WebkitUserSelect: "none",
                        userSelect: "none",
                      }}
                    >
                      {tile ?? ""}
                      {tile !== null && (
                        <span
                          style={{
                            position: "absolute",
                            bottom: isCompactMobile ? "3px" : "4px",
                            right: isCompactMobile ? "4px" : "6px",
                            fontSize: isCompactMobile ? "8px" : "11px",
                            fontWeight: "bold",
                            color: "#4b3a28",
                          }}
                        >
                          {tile === BLANK_TILE ? 0 : LETTER_SCORES[tile] || 0}
                        </span>
                      )}
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
                          setShowMoreActions(false)
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
                          animation:
                            reducedMotionEnabled
                              ? undefined
                              : uiFeedback?.kind === "hint"
                              ? "action-button-bounce 320ms ease"
                              : undefined,
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
                          setShowSettings(true)
                          setShowMoreActions(false)
                        }}
                        style={{
                          padding: "10px 12px",
                          fontSize: "14px",
                          borderRadius: "14px",
                          border: "1px solid rgba(123, 98, 65, 0.2)",
                          backgroundColor: "#efe2c7",
                          cursor: "pointer",
                          color: "#2f2419",
                          fontWeight: 700,
                          textAlign: "left",
                        }}
                      >
                        Settings
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
                    color: "#2f2419",
                    fontWeight: 800,
                    boxShadow: isCompactMobile ? "none" : undefined,
                    animation:
                      reducedMotionEnabled
                        ? undefined
                        : uiFeedback?.kind === "recall"
                        ? "action-button-bounce 320ms ease"
                        : undefined,
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
                    animation:
                      reducedMotionEnabled
                        ? undefined
                        : uiFeedback?.kind === "submit" || uiFeedback?.kind === "win"
                        ? "action-button-bounce 340ms ease"
                        : undefined,
                  }}
                >
                  {isCompactMobile ? "Submit" : "Submit Move"}
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
        )}
      </div>

      {touchDrag && (
        <div
          style={{
            position: "fixed",
            left: touchDrag.x - 28,
            top: touchDrag.y - 22,
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
            opacity: touchDragEngaged ? 0.92 : 0,
            transform: touchDragEngaged ? "scale(1)" : "scale(0.92)",
            transition: "opacity 120ms ease, transform 120ms ease",
            boxShadow: "0 8px 18px rgba(0,0,0,0.22)",
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

      {showSettings && (
        <div
          onClick={() => setShowSettings(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10001,
            padding: "16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#fffaf0",
              borderRadius: "18px",
              padding: isCompactMobile ? "20px 18px" : "24px",
              maxWidth: "440px",
              width: "100%",
              border: "1px solid rgba(123, 98, 65, 0.18)",
              boxShadow: "0 20px 40px rgba(34, 25, 13, 0.18)",
              color: "#2f2419",
              animation: reducedMotionEnabled ? undefined : "pop-in-sheet 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "18px" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "22px" }}>Settings</h2>
                <div style={{ fontSize: "13px", color: "#6d5537", marginTop: "4px" }}>
                  Tune sound, haptics, and motion.
                </div>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "999px",
                  border: "1px solid rgba(123, 98, 65, 0.16)",
                  backgroundColor: "#f5ead6",
                  cursor: "pointer",
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "#2f2419",
                }}
                aria-label="Close settings"
              >
                ×
              </button>
            </div>

            {[
              {
                label: "Sound effects",
                description: "Play tones for tile placement, actions, and wins.",
                checked: !soundMuted,
                onChange: () => setSoundMuted((prev) => !prev),
              },
              {
                label: "Haptics",
                description: "Use vibration feedback on supported mobile devices.",
                checked: hapticsEnabled,
                onChange: () => setHapticsEnabled((prev) => !prev),
              },
              {
                label: "Reduced motion",
                description: "Tone down pop, bounce, and celebration animations.",
                checked: reducedMotionEnabled,
                onChange: () => setReducedMotionEnabled((prev) => !prev),
              },
            ].map((setting, index) => (
              <button
                key={setting.label}
                onClick={setting.onChange}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "14px",
                  padding: "14px 0",
                  background: "transparent",
                  border: "none",
                  borderTop: index === 0 ? "1px solid rgba(123, 98, 65, 0.12)" : "1px solid rgba(123, 98, 65, 0.12)",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "#2f2419",
                }}
              >
                <div>
                  <div style={{ fontSize: "16px", fontWeight: 800 }}>{setting.label}</div>
                  <div style={{ marginTop: "4px", fontSize: "13px", lineHeight: 1.4, color: "#6d5537" }}>
                    {setting.description}
                  </div>
                </div>
                <div
                  style={{
                    width: "54px",
                    height: "30px",
                    borderRadius: "999px",
                    backgroundColor: setting.checked ? "#7aad2a" : "#d9cfbf",
                    padding: "3px",
                    display: "flex",
                    justifyContent: setting.checked ? "flex-end" : "flex-start",
                    flexShrink: 0,
                    transition: reducedMotionEnabled ? "none" : "background-color 160ms ease",
                  }}
                >
                  <div
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "999px",
                      backgroundColor: "#fffaf1",
                      boxShadow: "0 2px 6px rgba(34, 25, 13, 0.16)",
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
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
