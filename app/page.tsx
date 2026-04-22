"use client"

import { startTransition, useEffect, useMemo, useRef, useState } from "react"
import { VALID_WORDS } from "./words"
import { getPuzzleByDate, DAILY_PUZZLES, type BonusType } from "./puzzles"
import { solvePuzzle } from "./solver"
import { BLANK_TILE, LETTER_SCORES } from "./scoring"
import { saveSession, saveStats, loadSession, loadStats, loadPuzzleOptimal, loadWordDefinition, login as apiLogin, register as apiRegister, logout as apiLogout, getAuthState, isLoggedIn, loginWithGoogle, loginWithApple, handleOAuthCallback, storeArrivedFromRef, createShareLink, trackVisit } from "./api-client"

type TileSelection = {
  letter: string
  index: number
  isBlank: boolean
} | null

type PendingBlankPlacement =
  | {
      kind: "new"
      tileData: Exclude<TileSelection, null>
      row: number
      col: number
    }
  | {
      kind: "move"
      tile: Exclude<DraggedPlacedTile, null>
      row: number
      col: number
    }
  | {
      kind: "edit"
      tile: Exclude<DraggedPlacedTile, null>
    }
  | null

type DraggedPlacedTile = {
  row: number
  col: number
  letter: string
  isBlank: boolean
  rackIndex: number
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
  rackIndex: number
  x: number
  y: number
} | null

type PlacedTile = {
  row: number
  col: number
  letter: string
  isBlank: boolean
  rackIndex: number
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

type PuzzleModeName = "mini" | "easy" | "hard"

type PuzzleAnalyticsRecord = {
  date: string
  mode: PuzzleModeName
  bestScore: number
  optimalScore: number
  scorePercent: number
  attemptsUsed: number
  hintsUsed: number
  rating: string
}

type ArchiveCompletionStatus = {
  mini: boolean
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
const NIGHT_MODE_KEY = "daily-word-game-night-mode"
const FUTURE_PUZZLE_TEST_MODE_KEY = "daily-word-game-future-puzzle-test-mode"
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

function restoreRackSlotsFromPlacedTiles(
  rackSlots: RackSlot[],
  tiles: Array<Pick<PlacedTile, "letter" | "isBlank" | "rackIndex">>
) {
  const nextRack = [...rackSlots]

  for (const tile of [...tiles].sort((a, b) => a.rackIndex - b.rackIndex)) {
    const tileValue = tile.isBlank ? BLANK_TILE : tile.letter

    if (
      tile.rackIndex >= 0 &&
      tile.rackIndex < nextRack.length &&
      nextRack[tile.rackIndex] === null
    ) {
      nextRack[tile.rackIndex] = tileValue
      continue
    }

    const fallbackIndex = nextRack.findIndex((slot) => slot === null)
    if (fallbackIndex !== -1) {
      nextRack[fallbackIndex] = tileValue
    } else {
      nextRack.push(tileValue)
    }
  }

  return nextRack
}

function getBoardCellKey(row: number, col: number) {
  return `${row}-${col}`
}

function getLocalDateString(date: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA").format(date)
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
  const [todayDate, setTodayDate] = useState(() => getLocalDateString())
  const todayDisplayDate = useMemo(() => formatDisplayDate(todayDate), [todayDate])
  const [selectedDate, setSelectedDate] = useState(todayDate)
  const [selectedMode, setSelectedMode] = useState<"mini" | "easy">("easy")
  const [loadedGameConfig, setLoadedGameConfig] = useState<{ date: string; mode: "mini" | "easy" }>({
    date: todayDate,
    mode: "easy",
  })
  const [hasMounted, setHasMounted] = useState(false)
  const [countdownMs, setCountdownMs] = useState(() => getTimeUntilNextLocalDay(new Date()))
  const resetCountdown = useMemo(() => formatCountdown(countdownMs), [countdownMs])
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [showTutorial, setShowTutorial] = useState(false)
  const [viewMode, setViewMode] = useState<"home" | "daily" | "archive" | "game">("home")
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

  const [puzzleOptimal, setPuzzleOptimal] = useState<{ score: number; words: string[] } | null>(null)
  const puzzle = useMemo(
    () => getPuzzleByDate(loadedGameConfig.date, loadedGameConfig.mode),
    [loadedGameConfig]
  )
  type SolutionType = { bestScore: number; bestWords: string[]; bestPlacement: { row: number; col: number; letter: string; isBlank: boolean }[] }
  const fullSolutionRef = useRef<SolutionType | null>(null)

  // Use optimal score from API/puzzle data — never run solver on load
  const solution: SolutionType = useMemo(() => {
    fullSolutionRef.current = null
    const score = puzzleOptimal?.score || puzzle.optimalScore
    const words = (puzzleOptimal?.words?.length ? puzzleOptimal.words : puzzle.optimalWords?.length ? puzzle.optimalWords : []) as string[]
    return { bestScore: score || 0, bestWords: words, bestPlacement: [] }
  }, [puzzle, puzzleOptimal])
  const primaryOptimalWord = solution.bestWords[0] ?? null

  const isCompactMobile =
    viewportSize.width > 0 &&
    viewportSize.width <= 480 &&
    viewportSize.height > 0 &&
    viewportSize.height <= 960
  const isSmallPhone = isCompactMobile && viewportSize.width <= 375
  const isLargePhone = isCompactMobile && viewportSize.width >= 428
  const isShortPhone = isCompactMobile && viewportSize.height <= 760
  const isTallPhone = isCompactMobile && viewportSize.height >= 860
  const boardSize = puzzle.boardSize
  const maxAttempts = 3
  const startingRack = puzzle.rack
  const isDesktopHardMode = false
  const storageKey = `daily-word-game-${puzzle.date}-${loadedGameConfig.mode}`
  const boardGap = isCompactMobile ? (isSmallPhone ? 2 : isLargePhone ? 4 : 3) : 4
  const compactBoardShellPadding = isCompactMobile ? (isSmallPhone ? 5 : isLargePhone ? 8 : 6) : 14
  const desktopBoardShellPadding = isDesktopHardMode ? 10 : 14
  const compactRackGapWidth = isSmallPhone ? 1 : isLargePhone ? 3 : 2
  const compactOuterPadding = isCompactMobile ? (isSmallPhone ? 10 : isLargePhone ? 18 : 14) : 0
  const compactScreenPadding = isCompactMobile
    ? `${isSmallPhone ? "max(6px, env(safe-area-inset-top)) 6px max(8px, env(safe-area-inset-bottom))" : isLargePhone ? "max(10px, env(safe-area-inset-top)) 10px max(10px, env(safe-area-inset-bottom))" : "max(8px, env(safe-area-inset-top)) 8px max(8px, env(safe-area-inset-bottom))"}`
    : "clamp(12px, 4vw, 32px)"
  const compactBoardAvailableWidth =
    isCompactMobile && viewportSize.width > 0
      ? Math.max(236, viewportSize.width - compactOuterPadding - compactBoardShellPadding * 2)
      : 0
  const compactBoardCellSize =
    isCompactMobile && compactBoardAvailableWidth > 0
      ? Math.max(
          loadedGameConfig.mode === "mini" ? 42 : isSmallPhone ? 30 : 33,
          Math.min(
            loadedGameConfig.mode === "mini" ? (isTallPhone ? 56 : 52) : isTallPhone ? 46 : 43,
            Math.floor((compactBoardAvailableWidth - (boardSize - 1) * boardGap) / boardSize)
          )
        )
      : 46
  const desktopHardShellHeightBudget =
    isDesktopHardMode && viewportSize.width > 0 && viewportSize.height > 0
      ? Math.max(
          440,
          viewportSize.height - 210
        )
      : 0
  const desktopHardRackSectionHeight = isDesktopHardMode ? 132 : 0
  const desktopHardBoardAvailableSize =
    isDesktopHardMode && desktopHardShellHeightBudget > 0
      ? Math.max(
          360,
          Math.min(
            viewportSize.width - 220,
            desktopHardShellHeightBudget - desktopHardRackSectionHeight - desktopBoardShellPadding * 2
          )
        )
      : 0
  const desktopHardBoardCellSize =
    isDesktopHardMode && desktopHardBoardAvailableSize > 0
      ? Math.max(
          32,
          Math.min(
            44,
            Math.floor(
              (desktopHardBoardAvailableSize - (boardSize - 1) * boardGap) / boardSize
            )
          )
        )
      : 54
  const boardCellSize = isCompactMobile ? compactBoardCellSize : desktopHardBoardCellSize
  const compactRackTileSize =
    isCompactMobile && viewportSize.width > 0
      ? Math.max(
          loadedGameConfig.mode === "mini" ? 34 : isSmallPhone ? 28 : isLargePhone ? 33 : 31,
          Math.min(
            loadedGameConfig.mode === "mini" ? 46 : isTallPhone ? (isLargePhone ? 44 : 42) : isLargePhone ? 41 : 39,
            Math.floor(
              (viewportSize.width - compactOuterPadding - (startingRack.length + 1) * compactRackGapWidth) /
                startingRack.length
            )
          )
        )
      : 46
  const rackTileSize = isCompactMobile ? compactRackTileSize : isDesktopHardMode ? 42 : 56
  const actionButtonMinHeight = isCompactMobile ? (isSmallPhone ? 38 : 40) : isDesktopHardMode ? 42 : 54
  const boardMaxWidth = `${boardSize * boardCellSize + (boardSize - 1) * boardGap}px`
  const compactViewportWidth = Math.max(0, viewportSize.width - compactOuterPadding)
  const compactHeaderReserve =
    loadedGameConfig.mode === "mini"
      ? isShortPhone
        ? 200
        : isLargePhone
          ? 216
          : 208
      : isShortPhone
        ? 240
        : isLargePhone
          ? 222
          : 230
  const compactViewportHeightBudget = Math.max(
    0,
    viewportSize.height - compactHeaderReserve
  )
  const compactPuzzleFrameWidth =
    isCompactMobile && compactViewportWidth > 0
      ? Math.max(
          loadedGameConfig.mode === "mini" ? 220 : 252,
          Math.min(
            compactViewportWidth,
            compactViewportHeightBudget || compactViewportWidth,
            loadedGameConfig.mode === "mini"
              ? isLargePhone
                ? 376
                : 344
              : isLargePhone
                ? 408
                : 372
          )
        )
      : null
  const compactModalInset = isCompactMobile ? (isSmallPhone ? 12 : isLargePhone ? 20 : 16) : 24
  const compactModalPadding = isCompactMobile ? (isSmallPhone ? "14px" : isLargePhone ? "18px" : "16px") : "20px"
  const boardTileFontSize = isCompactMobile
    ? "clamp(16px, 4.8vw, 20px)"
    : isDesktopHardMode
    ? "clamp(16px, 3vw, 21px)"
    : "clamp(18px, 5vw, 24px)"
  const boardBonusFontSize = isCompactMobile
    ? "clamp(7px, 2vw, 9px)"
    : isDesktopHardMode
    ? "clamp(7px, 1.6vw, 10px)"
    : "clamp(8px, 2.4vw, 11px)"
  const boardScoreFontSize = isCompactMobile
    ? "clamp(7px, 1.8vw, 9px)"
    : isDesktopHardMode
    ? "clamp(4px, 0.75vw, 6px)"
    : "clamp(8px, 2vw, 10px)"
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
  const rackDropIndexRef = useRef<number | null>(null)
  const [hintLevel, setHintLevel] = useState(0)
  const [showHint, setShowHint] = useState(false)
  const [showMoreActions, setShowMoreActions] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showPuzzleReview, setShowPuzzleReview] = useState(false)
  const [showResultsModal, setShowResultsModal] = useState(false)
  const [pendingBlankPlacement, setPendingBlankPlacement] = useState<PendingBlankPlacement>(null)
  const [optimalDefinition, setOptimalDefinition] = useState<string | null>(null)
  const [optimalDefinitionWord, setOptimalDefinitionWord] = useState<string | null>(null)
  const [isLoadingOptimalDefinition, setIsLoadingOptimalDefinition] = useState(false)
  const [recentPlacementKey, setRecentPlacementKey] = useState<string | null>(null)
  const [uiFeedback, setUiFeedback] = useState<{ kind: UiFeedbackKind; tick: number } | null>(null)
  const [soundMuted, setSoundMuted] = useState(false)
  const [hapticsEnabled, setHapticsEnabled] = useState(true)
  const [nightModeEnabled, setNightModeEnabled] = useState(false)
  const [futurePuzzleTestMode, setFuturePuzzleTestMode] = useState(false)
  const [hasSavedTodayGame, setHasSavedTodayGame] = useState(false)
  const [showShuffleNudge, setShowShuffleNudge] = useState(false)
  const [lastPlayerActivityAt, setLastPlayerActivityAt] = useState(() => Date.now())
  const [showStats, setShowStats] = useState(false)
  const [stats, setStats] = useState<GameStats>(defaultStats)
  const statsUpdatedRef = useRef(false)
  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] = useState<"login" | "register">("login")
  const [authUsername, setAuthUsername] = useState("")
  const [authEmail, setAuthEmail] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [authError, setAuthError] = useState("")
  const [authLoading, setAuthLoading] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ username: string; anon: boolean } | null>(null)
  const reducedMotionEnabled =
    hasMounted &&
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
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

  function updateRackDropIndex(index: number | null) {
    rackDropIndexRef.current = index
    setRackDropIndex(index)
  }

  function markPlayerActivity() {
    setLastPlayerActivityAt(Date.now())
    setShowShuffleNudge(false)
  }

  function getFullSolution() {
    if (fullSolutionRef.current) return fullSolutionRef.current
    const solved = solvePuzzle(puzzle)
    fullSolutionRef.current = solved
    return solved
  }

  function syncPuzzleOptimalWithFullSolution() {
    const solved = getFullSolution()
    const scoreMatches = solved.bestScore === solution.bestScore
    const wordsMatch = solved.bestWords.join("|") === solution.bestWords.join("|")

    if (!scoreMatches || !wordsMatch) {
      setPuzzleOptimal({ score: solved.bestScore, words: solved.bestWords })
    }

    return solved
  }
  const optimalCellSet = useMemo(() => {
    const placement = hintLevel > 0 ? getFullSolution().bestPlacement : solution.bestPlacement
    return new Set(placement.map((cell) => getBoardCellKey(cell.row, cell.col)))
  }, [solution.bestPlacement, hintLevel])
  const optimalLetterMap = useMemo(() => {
    const placement = hintLevel > 0 ? getFullSolution().bestPlacement : solution.bestPlacement
    return new Map(placement.map((cell) => [getBoardCellKey(cell.row, cell.col), cell.letter]))
  }, [solution.bestPlacement, hintLevel])

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
    // Track unique visitors
    trackVisit()
    // Track share link clicks
    storeArrivedFromRef()
    // Handle OAuth redirect callback (Google/Apple)
    const oauthResult = handleOAuthCallback()
    if (oauthResult) {
      setCurrentUser({ username: oauthResult.username, anon: false })
    } else {
      const auth = getAuthState()
      if (auth) {
        setCurrentUser({ username: auth.username, anon: auth.anon })
      }
    }
  }, [])

  useEffect(() => {
    function syncClockState() {
      const now = new Date()
      setCountdownMs(getTimeUntilNextLocalDay(now))
      setTodayDate((prev) => {
        const nextDate = getLocalDateString(now)
        return prev === nextDate ? prev : nextDate
      })
    }

    syncClockState()
    const intervalId = window.setInterval(() => {
      syncClockState()
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    function applySessionData(parsed: Partial<SavedGameState>) {
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
      if (parsed.attemptsLeft === 0) statsUpdatedRef.current = true
    }

    // Try loading from API first, fall back to localStorage
    console.log("[lexicon] Loading session for", puzzle.date, loadedGameConfig.mode)
    loadSession(puzzle.date, loadedGameConfig.mode).then((apiSession) => {
      console.log("[lexicon] API session result:", apiSession)
      if (apiSession && apiSession.attempt_history && Array.isArray(apiSession.attempt_history) && apiSession.attempt_history.length > 0) {
        console.log("[lexicon] Applying API session:", apiSession.best_score, "score,", apiSession.attempts_left, "attempts left")
        applySessionData({
          attemptsLeft: apiSession.attempts_left,
          bestScore: apiSession.best_score,
          attemptHistory: apiSession.attempt_history as AttemptResult[],
          submittedWords: apiSession.attempt_history.length > 0 ? (apiSession.attempt_history[apiSession.attempt_history.length - 1] as AttemptResult).words : [],
          submittedScore: apiSession.attempt_history.length > 0 ? (apiSession.attempt_history[apiSession.attempt_history.length - 1] as AttemptResult).totalScore : 0,
          hintUsed: apiSession.hint_used,
          hintLevel: apiSession.hint_level,
          message: `Restored from your account. Best score: ${apiSession.best_score}.`,
        })
      } else {
        // Fall back to localStorage
        const saved = localStorage.getItem(storageKey)
        if (saved) {
          try {
            applySessionData(JSON.parse(saved) as Partial<SavedGameState>)
          } catch { /* ignore */ }
        } else {
          startTransition(() => { setHasLoadedSave(true) })
        }
      }
    }).catch(() => {
      // API failed, use localStorage
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        try {
          applySessionData(JSON.parse(saved) as Partial<SavedGameState>)
        } catch { /* ignore */ }
      } else {
        startTransition(() => { setHasLoadedSave(true) })
      }
    })

    // Load stats: try API first, fall back to localStorage
    loadStats().then((apiStats) => {
      if (apiStats && apiStats.games_played > 0) {
        startTransition(() => {
          setStats({
            gamesPlayed: apiStats.games_played,
            currentStreak: apiStats.current_streak,
            maxStreak: apiStats.max_streak,
            perfectCurrentStreak: apiStats.perfect_current_streak,
            perfectMaxStreak: apiStats.perfect_max_streak,
            lastPlayedDate: apiStats.last_played_date,
            lastPerfectDate: apiStats.last_perfect_date,
            ratingCounts: apiStats.rating_counts || defaultStats.ratingCounts,
            puzzleHistory: [],
          })
        })
      } else {
        try {
          const savedStats = localStorage.getItem(STATS_KEY)
          if (savedStats) {
            startTransition(() => { setStats(JSON.parse(savedStats) as GameStats) })
          }
        } catch { /* ignore */ }
      }
    }).catch(() => {
      try {
        const savedStats = localStorage.getItem(STATS_KEY)
        if (savedStats) {
          startTransition(() => { setStats(JSON.parse(savedStats) as GameStats) })
        }
      } catch { /* ignore */ }
    })

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
      const savedNightMode = localStorage.getItem(NIGHT_MODE_KEY)
      if (savedNightMode === null) {
        setNightModeEnabled(
          typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches
        )
      } else {
        setNightModeEnabled(savedNightMode === "1")
      }
    } catch {
      // ignore
    }

    try {
      setFuturePuzzleTestMode(localStorage.getItem(FUTURE_PUZZLE_TEST_MODE_KEY) === "1")
    } catch {
      // ignore
    }

    try {
      setHasSavedTodayGame(
        Boolean(localStorage.getItem(`daily-word-game-${todayDate}-mini`)) ||
          Boolean(localStorage.getItem(`daily-word-game-${todayDate}-easy`))
      )
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
      localStorage.setItem(NIGHT_MODE_KEY, nightModeEnabled ? "1" : "0")
    } catch {
      // ignore
    }

    if (typeof document === "undefined") return

    document.documentElement.dataset.theme = nightModeEnabled ? "night" : "day"
  }, [nightModeEnabled])

  useEffect(() => {
    try {
      localStorage.setItem(FUTURE_PUZZLE_TEST_MODE_KEY, futurePuzzleTestMode ? "1" : "0")
    } catch {
      // ignore
    }
  }, [futurePuzzleTestMode])

  useEffect(() => {
    try {
      setHasSavedTodayGame(
        Boolean(localStorage.getItem(`daily-word-game-${todayDate}-mini`)) ||
          Boolean(localStorage.getItem(`daily-word-game-${todayDate}-easy`))
      )
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

  const previousTodayDateRef = useRef(todayDate)

  useEffect(() => {
    const previousTodayDate = previousTodayDateRef.current
    if (previousTodayDate === todayDate) return

    previousTodayDateRef.current = todayDate

    if (selectedDate === previousTodayDate) {
      setSelectedDate(todayDate)
    }

    if (archiveMonthKey === getMonthKey(previousTodayDate)) {
      setArchiveMonthKey(getMonthKey(todayDate))
    }

    if (loadedGameConfig.date === previousTodayDate) {
      setLoadedGameConfig((prev) => ({ ...prev, date: todayDate }))
      applyFreshPuzzleState(todayDate, loadedGameConfig.mode, "A new daily puzzle is ready.")
    }
  }, [todayDate, selectedDate, archiveMonthKey, loadedGameConfig.date, loadedGameConfig.mode])

  useEffect(() => {
    try {
      const completionMap: Record<string, ArchiveCompletionStatus> = {}

      for (const puzzleEntry of DAILY_PUZZLES) {
        for (const mode of ["mini", "easy"] as const) {
          const saved = localStorage.getItem(`daily-word-game-${puzzleEntry.date}-${mode}`)
          if (!saved) continue

          try {
            const parsed = JSON.parse(saved) as Partial<SavedGameState>
            if (parsed.attemptsLeft === 0) {
              const currentStatus = completionMap[puzzleEntry.date] ?? {
                mini: false,
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
          mini: false,
          easy: false,
          hard: false,
        }
        completionMap[selectedDate] = {
          ...currentStatus,
          [loadedGameConfig.mode]: true,
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
      if (touchDragRef.current?.type === "rack") {
        const el = document.elementFromPoint(touch.clientX, touch.clientY)
        const rackGapEl = el?.closest("[data-rack-gap]") as HTMLElement | null
        const rackTileEl = el?.closest("[data-rack-tile]") as HTMLElement | null
        if (rackGapEl?.dataset.rackGap) {
          updateRackDropIndex(parseInt(rackGapEl.dataset.rackGap, 10))
        } else if (rackTileEl?.dataset.rackTile) {
          updateRackDropIndex(parseInt(rackTileEl.dataset.rackTile, 10))
        } else {
          updateRackDropIndex(null)
        }
      }
      setTouchDrag((prev) => (prev ? { ...prev, x: touch.clientX, y: touch.clientY } : null))
    }
    document.addEventListener("touchmove", onTouchMove, { passive: false })
    return () => document.removeEventListener("touchmove", onTouchMove)
  }, [touchDragActivationDistance])

  const initialLoadDone = useRef(false)

  useEffect(() => {
    if (!hasLoadedSave) return
    // Skip the first render cycle after load to avoid overwriting with defaults
    if (!initialLoadDone.current) {
      initialLoadDone.current = true
      return
    }

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

    // Only dual-write to DB after a word has been submitted
    if (attemptHistory.length === 0) return

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

    if (gameOver && isOptimalCell(row, col)) {
      return "linear-gradient(180deg, rgba(198,224,255,0.98) 0%, rgba(147,194,255,0.98) 100%)"
    }
    if (showHint && isOptimalCell(row, col)) {
      return "linear-gradient(180deg, rgba(212,249,221,0.98) 0%, rgba(151,224,173,0.98) 100%)"
    }
    const bonus = getBonusAt(row, col)

    if (bonus === "DL") {
      return "linear-gradient(180deg, rgba(221,238,255,0.98) 0%, rgba(190,220,255,0.98) 100%)"
    }
    if (bonus === "TL") {
      return "linear-gradient(180deg, rgba(161,210,255,0.98) 0%, rgba(120,185,250,0.98) 100%)"
    }
    if (bonus === "DW") {
      return "linear-gradient(180deg, rgba(255,225,234,0.98) 0%, rgba(249,193,208,0.98) 100%)"
    }
    if (bonus === "TW") {
      return "linear-gradient(180deg, rgba(255,180,196,0.98) 0%, rgba(244,139,162,0.98) 100%)"
    }

    return "linear-gradient(180deg, rgba(251,247,239,0.98) 0%, rgba(242,235,224,0.98) 100%)"
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

  function commitPlacedTile(tileData: Exclude<TileSelection, null>, row: number, col: number, resolvedLetter: string) {
    setPlacedTiles((prev) => [
      ...prev,
      { row, col, letter: resolvedLetter, isBlank: tileData.isBlank, rackIndex: tileData.index },
    ])
    setRecentPlacementKey(`${row}-${col}`)
    setRack((prev) => prev.map((tile, index) => (index === tileData.index ? null : tile)))
    draggedTileRef.current = null
    setSelectedTile(null)
    setDraggedTile(null)
    setRackDropIndex(null)
    setPendingBlankPlacement(null)
    triggerAppHapticFeedback(tileData.isBlank ? [10, 20, 10] : 12)
    playPlacementSound()
    setMessage(
      tileData.isBlank
        ? `Blank tile placed as ${resolvedLetter}.`
        : "Tile placed. Keep building your move."
    )
  }

  function commitMovedBlankTile(tile: Exclude<DraggedPlacedTile, null>, row: number, col: number, resolvedLetter: string) {
    const remainingTiles = placedTiles.filter(
      (placed) => !(placed.row === tile.row && placed.col === tile.col)
    )

    setPlacedTiles([
      ...remainingTiles,
      { row, col, letter: resolvedLetter, isBlank: true, rackIndex: tile.rackIndex },
    ])
    setRecentPlacementKey(`${row}-${col}`)
    draggedPlacedTileRef.current = null
    setDraggedPlacedTile(null)
    setSelectedTile(null)
    setRackDropIndex(null)
    setPendingBlankPlacement(null)
    triggerAppHapticFeedback([10, 20, 10])
    playPlacementSound()
    setMessage(`Blank tile moved as ${resolvedLetter}.`)
  }

  function updateBlankTileInPlace(tile: Exclude<DraggedPlacedTile, null>, resolvedLetter: string) {
    setPlacedTiles((prev) =>
      prev.map((placed) =>
        placed.row === tile.row && placed.col === tile.col
          ? { ...placed, letter: resolvedLetter, isBlank: true }
          : placed
      )
    )
    draggedPlacedTileRef.current = null
    setDraggedPlacedTile(null)
    setSelectedTile(null)
    setRackDropIndex(null)
    setPendingBlankPlacement(null)
    triggerAppHapticFeedback([10, 20, 10])
    setMessage(`Blank tile changed to ${resolvedLetter}.`)
  }

  function cancelBlankPlacement() {
    draggedPlacedTileRef.current = null
    setDraggedPlacedTile(null)
    setPendingBlankPlacement(null)
    setMessage("Blank tile placement cancelled.")
  }

  function handleBlankLetterChoice(letter: string) {
    if (!pendingBlankPlacement) return
    if (pendingBlankPlacement.kind === "new") {
      commitPlacedTile(
        pendingBlankPlacement.tileData,
        pendingBlankPlacement.row,
        pendingBlankPlacement.col,
        letter
      )
      return
    }

    if (pendingBlankPlacement.kind === "move") {
      commitMovedBlankTile(
        pendingBlankPlacement.tile,
        pendingBlankPlacement.row,
        pendingBlankPlacement.col,
        letter
      )
      return
    }

    updateBlankTileInPlace(pendingBlankPlacement.tile, letter)
  }

  function shuffleRack() {
    if (gameOver) return
    markPlayerActivity()
    setRack((prev) => {
      const tilesOnly = shuffleArray(prev.filter((tile): tile is string => tile !== null))
      let tileIndex = 0
      return prev.map((slot) => (slot === null ? null : tilesOnly[tileIndex++]))
    })
    setSelectedTile(null)
    setDraggedTile(null)
    updateRackDropIndex(null)
    setMessage("Rack shuffled.")
  }

  function reorderRackTile(fromIndex: number, targetIndex: number) {
    markPlayerActivity()
    let finalIndex = targetIndex
    if (fromIndex < targetIndex) {
      finalIndex = targetIndex - 1
    }

    if (finalIndex === fromIndex) {
      setDraggedTile(null)
      updateRackDropIndex(null)
      return
    }

    setRack((prev) => moveItemToIndex(prev, fromIndex, finalIndex))
    triggerAppHapticFeedback(10)
    draggedTileRef.current = null
    setDraggedTile(null)
    setSelectedTile(null)
    updateRackDropIndex(null)
    setMessage("Rack rearranged.")
  }

  function getRackTileShift(index: number) {
    const draggedIndex = draggedTile?.index
    if (draggedIndex === undefined || draggedIndex === null || rackDropIndex === null) return 0
    if (index === draggedIndex) return 0

    const slotShift =
      rackTileSize + (isCompactMobile ? compactRackGapWidth : 10) + (isCompactMobile ? 2 : 4)

    if (rackDropIndex > draggedIndex) {
      return index > draggedIndex && index < rackDropIndex ? -slotShift : 0
    }

    if (rackDropIndex < draggedIndex) {
      return index >= rackDropIndex && index < draggedIndex ? slotShift : 0
    }

    return 0
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

  function placeTileOnBoard(tileData: TileSelection, row: number, col: number) {
    markPlayerActivity()
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

    if (tileData.isBlank) {
      setPendingBlankPlacement({ kind: "new", tileData, row, col })
      return
    }

    commitPlacedTile(tileData, row, col, tileData.letter)
  }

  function movePlacedTileOnBoard(tile: DraggedPlacedTile, row: number, col: number) {
    markPlayerActivity()
    if (!tile) return

    if (tile.row === row && tile.col === col) {
      setDraggedPlacedTile(null)
      return
    }

    const targetPlacedTile = getPlacedTile(row, col)

    if (targetPlacedTile) {
      setPlacedTiles((prev) =>
        prev.map((placed) => {
          if (placed.row === tile.row && placed.col === tile.col) {
            return {
              ...placed,
              row,
              col,
            }
          }

          if (placed.row === row && placed.col === col) {
            return {
              ...placed,
              row: tile.row,
              col: tile.col,
            }
          }

          return placed
        })
      )
      draggedPlacedTileRef.current = null
      setDraggedPlacedTile(null)
      setSelectedTile(null)
      updateRackDropIndex(null)
      triggerAppHapticFeedback(10)
      setMessage(`Swapped ${tile.letter} and ${targetPlacedTile.letter}.`)
      return
    }

    if (getCellLetter(row, col)) {
      setMessage("That square is already occupied.")
      return
    }

    const remainingTiles = placedTiles.filter(
      (placed) => !(placed.row === tile.row && placed.col === tile.col)
    )

    if (tile.isBlank) {
      setDraggedPlacedTile(tile)
      draggedPlacedTileRef.current = tile
      setPendingBlankPlacement({ kind: "move", tile, row, col })
      setMessage("Choose a new letter for the blank tile.")
      return
    }

    setPlacedTiles([
      ...remainingTiles,
      { row, col, letter: tile.letter, isBlank: tile.isBlank, rackIndex: tile.rackIndex },
    ])
    draggedPlacedTileRef.current = null
    setDraggedPlacedTile(null)
    setSelectedTile(null)
    updateRackDropIndex(null)
    triggerAppHapticFeedback(10)
    setMessage(tile.isBlank ? `Moved blank tile (${tile.letter}).` : `Moved ${tile.letter}.`)
  }

  function handleCellClick(row: number, col: number) {
    markPlayerActivity()
    const placedTile = getPlacedTile(row, col)

    if (draggedPlacedTile) {
      if (draggedPlacedTile.row === row && draggedPlacedTile.col === col) {
        draggedPlacedTileRef.current = null
        setDraggedPlacedTile(null)
        setMessage("Tile returned to its spot.")
        return
      }

      movePlacedTileOnBoard(draggedPlacedTile, row, col)
      return
    }

    if (placedTile && !gameOver) {
      const selectedPlacedTile = {
        row,
        col,
        letter: placedTile.letter,
        isBlank: placedTile.isBlank,
        rackIndex: placedTile.rackIndex,
      }
      if (placedTile.isBlank) {
        draggedPlacedTileRef.current = selectedPlacedTile
        setDraggedPlacedTile(selectedPlacedTile)
        setSelectedTile(null)
        setPendingBlankPlacement({ kind: "edit", tile: selectedPlacedTile })
        setMessage("Choose a new letter for the blank tile.")
        return
      }
      draggedPlacedTileRef.current = selectedPlacedTile
      setDraggedPlacedTile(selectedPlacedTile)
      setSelectedTile(null)
      setMessage(
        placedTile.isBlank
          ? `Blank tile (${placedTile.letter}) selected. Tap a new square to move it.`
          : `${placedTile.letter} selected. Tap a new square to move it.`
      )
      return
    }

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
    markPlayerActivity()
    e.dataTransfer.setData("text/plain", `${tile}-${index}`)
    e.dataTransfer.effectAllowed = "move"
    setDraggedTile({ letter: tile, index, isBlank: tile === BLANK_TILE })
    draggedPlacedTileRef.current = null
    draggedTileRef.current = { letter: tile, index, isBlank: tile === BLANK_TILE }
    setDraggedPlacedTile(null)
    setSelectedTile(null)
  }

  function handleRackTileDragEnd() {
    const activeDraggedTile = draggedTileRef.current
    const activeRackDropIndex = rackDropIndexRef.current
    if (activeDraggedTile && activeRackDropIndex !== null) {
      reorderRackTile(activeDraggedTile.index, activeRackDropIndex)
      return
    }
    draggedTileRef.current = null
    setDraggedTile(null)
    updateRackDropIndex(null)
  }

  function handlePlacedTileDragStart(
    e: React.DragEvent<HTMLDivElement>,
    row: number,
    col: number,
    letter: string,
    isBlank: boolean,
    rackIndex: number
  ) {
    if (attemptsLeft === 0) return
    markPlayerActivity()
    e.dataTransfer.setData("text/plain", `${letter}-${row}-${col}`)
    e.dataTransfer.effectAllowed = "move"
    setDraggedPlacedTile({ row, col, letter, isBlank, rackIndex })
    draggedTileRef.current = null
    draggedPlacedTileRef.current = { row, col, letter, isBlank, rackIndex }
    setDraggedTile(null)
    setSelectedTile(null)
    updateRackDropIndex(null)
  }

  function handlePlacedTileDragEnd() {
    draggedPlacedTileRef.current = null
    setDraggedPlacedTile(null)
  }

  function handleCellDrop(row: number, col: number) {
    markPlayerActivity()
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
    markPlayerActivity()

    setPlacedTiles((prev) =>
      prev.filter((placed) => !(placed.row === tile.row && placed.col === tile.col))
    )
    setRack((prev) => restoreRackSlotsFromPlacedTiles(prev, [tile]))
    draggedPlacedTileRef.current = null
    setDraggedPlacedTile(null)
    setSelectedTile(null)
    updateRackDropIndex(null)
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
    const allSameCol = placedTiles.every(
      (tile) => tile.col === placedTiles[0].col
    )

    if (allSameRow) return "row"
    if (allSameCol) return "col"
    return null
  }

  function isMoveContinuous(direction: "row" | "col") {
    if (placedTiles.length <= 1) return true

    if (direction === "row") {
      const row = placedTiles[0].row
      const cols = placedTiles.map((tile) => tile.col)
      const minCol = Math.min(...cols)
      const maxCol = Math.max(...cols)

      for (let col = minCol; col <= maxCol; col++) {
        if (!getCellLetter(row, col)) {
          return false
        }
      }

      return true
    }

    const col = placedTiles[0].col
    const rows = placedTiles.map((tile) => tile.row)
    const minRow = Math.min(...rows)
    const maxRow = Math.max(...rows)

    for (let row = minRow; row <= maxRow; row++) {
      if (!getCellLetter(row, col)) {
        return false
      }
    }

    return true
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
    if (!isMoveContinuous(mainDirection)) return []

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
    markPlayerActivity()
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
    const moveDirection = getMoveDirection()

    if (!moveDirection) {
      setMessage("Your tiles must stay in one row or one column.")
      return
    }

    if (!isMoveContinuous(moveDirection)) {
      setMessage("Your tiles must make one continuous line.")
      return
    }

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
    const solutionForSubmit = syncPuzzleOptimalWithFullSolution()
    const solvedOptimally = totalScore >= solutionForSubmit.bestScore
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
        ? "Perfect first try. You found the top play, so the game is over."
        : solvedOptimally
        ? "You found the top play, so the game is over."
        : `You scored ${totalScore}.`
    )

    if (newAttemptsLeft === 0) {
      const rating =
        solutionForSubmit.bestScore <= 0
          ? "Keep trying"
          : newBestScore / solutionForSubmit.bestScore >= 1
          ? "Perfect"
          : newBestScore / solutionForSubmit.bestScore >= 0.9
          ? "Excellent"
          : newBestScore / solutionForSubmit.bestScore >= 0.75
          ? "Great"
          : newBestScore / solutionForSubmit.bestScore >= 0.5
          ? "Solid"
          : "Keep trying"
      updateStats(rating, {
        date: puzzle.date,
        mode: loadedGameConfig.mode,
        bestScore: newBestScore,
        optimalScore: solutionForSubmit.bestScore,
        scorePercent: solutionForSubmit.bestScore > 0 ? newBestScore / solutionForSubmit.bestScore : 0,
        attemptsUsed: attemptHistory.length + 1,
        hintsUsed: hintLevel,
        rating,
      })
    }

    setRack((prev) => restoreRackSlotsFromPlacedTiles(prev, placedTiles))
    setPlacedTiles([])
    setSelectedTile(null)
    setDraggedTile(null)
    setDraggedPlacedTile(null)
    setRackDropIndex(null)

    // Save to DB directly on submit
    const updatedHistory = [...attemptHistory, newAttempt]
    const sessionRating = newAttemptsLeft === 0
      ? (solutionForSubmit.bestScore <= 0 ? "Keep trying"
        : newBestScore / solutionForSubmit.bestScore >= 1 ? "Perfect"
        : newBestScore / solutionForSubmit.bestScore >= 0.9 ? "Excellent"
        : newBestScore / solutionForSubmit.bestScore >= 0.75 ? "Great"
        : newBestScore / solutionForSubmit.bestScore >= 0.5 ? "Solid"
        : "Keep trying")
      : null
    saveSession({
      date: puzzle.date,
      mode: loadedGameConfig.mode,
      attempts_left: newAttemptsLeft,
      best_score: newBestScore,
      attempt_history: updatedHistory,
      hint_used: hintLevel > 0,
      hint_level: hintLevel,
      completed: newAttemptsLeft === 0,
      rating: sessionRating,
      submitted_words: wordResults,
      submitted_score: totalScore,
      message: "",
    })
  }

  function clearCurrentMove() {
    markPlayerActivity()
    setRack((prev) => restoreRackSlotsFromPlacedTiles(prev, placedTiles))
    setPlacedTiles([])
    setSelectedTile(null)
    setDraggedTile(null)
    setDraggedPlacedTile(null)
    setRackDropIndex(null)
    triggerAppHapticFeedback(8)
    triggerUiFeedback("recall")
    setMessage("Board cleared. Start a new move.")
  }

  function applyFreshPuzzleState(date: string, mode: "mini" | "easy", nextMessage: string) {
    const freshPuzzle = getPuzzleByDate(date, mode)

    setPuzzleOptimal(null)
    fullSolutionRef.current = null
    loadPuzzleOptimal(date, mode)
      .then((opt) => {
        if (opt && opt.optimal_score > 0) {
          setPuzzleOptimal({ score: opt.optimal_score, words: opt.optimal_words })
        }
      })
      .catch(() => {})

    setRack(freshPuzzle.rack)
    setPlacedTiles([])
    setSelectedTile(null)
    setDraggedTile(null)
    setDraggedPlacedTile(null)
    setRackDropIndex(null)
    setSubmittedWords([])
    setSubmittedScore(0)
    setAttemptsLeft(maxAttempts)
    setBestScore(0)
    setAttemptHistory([])
    setHintLevel(0)
    setShowHint(false)
    setShowMoreActions(false)
    setShowPuzzleReview(false)
    setShowResultsModal(false)
    setRecentPlacementKey(null)
    setMessage(nextMessage)
    setHasLoadedSave(false)
    initialLoadDone.current = false
    statsUpdatedRef.current = false
  }

  function resetCurrentPuzzle() {
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // ignore
    }

    applyFreshPuzzleState(loadedGameConfig.date, loadedGameConfig.mode, "Puzzle reset. Start a new run.")

    saveSession({
      date: puzzle.date,
      mode: loadedGameConfig.mode,
      attempts_left: maxAttempts,
      best_score: 0,
      attempt_history: [],
      hint_used: false,
      hint_level: 0,
      completed: false,
      rating: null,
      submitted_words: [],
      submitted_score: 0,
      message: "Puzzle reset. Start a new run.",
    })
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

  async function handleAuth() {
    setAuthError("")
    setAuthLoading(true)
    try {
      if (authMode === "login") {
        const auth = await apiLogin(authUsername, authPassword)
        setCurrentUser({ username: auth.username, anon: false })
      } else {
        const auth = await apiRegister(authUsername, authEmail, authPassword)
        setCurrentUser({ username: auth.username, anon: false })
      }
      setShowAuth(false)
      setAuthUsername("")
      setAuthEmail("")
      setAuthPassword("")
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setAuthLoading(false)
    }
  }

  function handleLogout() {
    apiLogout()
    setCurrentUser(null)
    setShowAuth(false)
  }

  function selectPuzzleDate(date: string, mode: "mini" | "easy" = selectedMode) {
    applyFreshPuzzleState(date, mode, "Drag a tile onto the board, drag rack tiles between slots, or click a tile and then click a square.")
    setLoadedGameConfig({ date, mode })
    setSelectedMode(mode)
    setViewMode("game")
    setSelectedDate(date)

    // Load saved state from API, fall back to localStorage
    const key = `daily-word-game-${date}-${mode}`
    loadSession(date, mode).then((apiSession) => {
      if (apiSession && Array.isArray(apiSession.attempt_history) && apiSession.attempt_history.length > 0) {
        setAttemptsLeft(apiSession.attempts_left)
        setBestScore(apiSession.best_score)
        setAttemptHistory(apiSession.attempt_history as AttemptResult[])
        const lastAttempt = apiSession.attempt_history[apiSession.attempt_history.length - 1] as AttemptResult
        setSubmittedWords(lastAttempt.words)
        setSubmittedScore(lastAttempt.totalScore)
        if (apiSession.hint_level > 0) { setHintLevel(apiSession.hint_level); setShowHint(false) }
        if (apiSession.attempts_left === 0) statsUpdatedRef.current = true
        setMessage(`Restored from your account. Best score: ${apiSession.best_score}.`)
      } else {
        const saved = localStorage.getItem(key)
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as Partial<SavedGameState>
            if (parsed.attemptsLeft !== undefined) setAttemptsLeft(parsed.attemptsLeft)
            if (parsed.bestScore !== undefined) setBestScore(parsed.bestScore)
            if (parsed.attemptHistory) setAttemptHistory(parsed.attemptHistory)
            if (parsed.submittedWords) setSubmittedWords(parsed.submittedWords)
            if (parsed.submittedScore !== undefined) setSubmittedScore(parsed.submittedScore)
            if (parsed.message) setMessage(parsed.message)
            if (parsed.attemptsLeft === 0) statsUpdatedRef.current = true
          } catch { /* ignore */ }
        } else {
          setSubmittedWords([])
          setSubmittedScore(0)
          setAttemptsLeft(maxAttempts)
          setBestScore(0)
          setAttemptHistory([])
          setMessage("Drag a tile onto the board, drag rack tiles between slots, or click a tile and then click a square.")
        }
      }
      setHasLoadedSave(true)
    }).catch(() => {
      const saved = localStorage.getItem(key)
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as Partial<SavedGameState>
          if (parsed.attemptsLeft !== undefined) setAttemptsLeft(parsed.attemptsLeft)
          if (parsed.bestScore !== undefined) setBestScore(parsed.bestScore)
          if (parsed.attemptHistory) setAttemptHistory(parsed.attemptHistory)
          if (parsed.submittedWords) setSubmittedWords(parsed.submittedWords)
          if (parsed.submittedScore !== undefined) setSubmittedScore(parsed.submittedScore)
          if (parsed.message) setMessage(parsed.message)
          if (parsed.attemptsLeft === 0) statsUpdatedRef.current = true
        } catch { /* ignore */ }
      }
      setHasLoadedSave(true)
    })
  }

  function goHome() {
    setViewMode("home")
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
    isBlank: boolean,
    rackIndex: number
  ) {
    if (gameOver) return
    e.preventDefault()
    const touch = e.touches[0]
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
    setTouchDragEngaged(false)
    setTouchDrag({
      type: "placed",
      letter,
      row,
      col,
      isBlank,
      rackIndex,
      x: touch.clientX,
      y: touch.clientY,
    })
    setDraggedPlacedTile({ row, col, letter, isBlank, rackIndex })
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
          rackIndex: drag.rackIndex,
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
        rackIndex: drag.rackIndex,
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
        setDraggedPlacedTile({
          row: drag.row,
          col: drag.col,
          letter: drag.letter,
          isBlank: drag.isBlank,
          rackIndex: drag.rackIndex,
        })
        movePlacedTileOnBoardRef.current?.(
          {
            row: drag.row,
            col: drag.col,
            letter: drag.letter,
            isBlank: drag.isBlank,
            rackIndex: drag.rackIndex,
          },
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
        rackIndex: drag.rackIndex,
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
  const currentTurnIndex = Math.min(attemptHistory.length, maxAttempts - 1)

  useEffect(() => {
    if (viewMode !== "game" || gameOver || attemptsLeft === 0 || showMoreActions) {
      setShowShuffleNudge(false)
      return
    }

    const showTimeoutId = window.setTimeout(() => {
      setShowShuffleNudge(true)
    }, 10000)

    const hideTimeoutId = window.setTimeout(() => {
      setShowShuffleNudge(false)
    }, 13000)

    return () => {
      window.clearTimeout(showTimeoutId)
      window.clearTimeout(hideTimeoutId)
    }
  }, [lastPlayerActivityAt, viewMode, gameOver, attemptsLeft, showMoreActions])

  useEffect(() => {
    if (gameOver) {
      setShowResultsModal(true)
    } else {
      setShowResultsModal(false)
      setShowPuzzleReview(false)
    }
  }, [gameOver])

  useEffect(() => {
    if (!gameOver) return

    const solved = getFullSolution()
    const scoreMatches = solved.bestScore === solution.bestScore
    const wordsMatch = solved.bestWords.join("|") === solution.bestWords.join("|")

    if (!scoreMatches || !wordsMatch) {
      setPuzzleOptimal({ score: solved.bestScore, words: solved.bestWords })
    }
  }, [gameOver, puzzle, solution.bestScore, solution.bestWords])

  useEffect(() => {
    if (!showResultsModal || !gameOver || !primaryOptimalWord) {
      setOptimalDefinition(null)
      setOptimalDefinitionWord(null)
      setIsLoadingOptimalDefinition(false)
      return
    }

    let cancelled = false
    setIsLoadingOptimalDefinition(true)
    setOptimalDefinition(null)
    setOptimalDefinitionWord(null)

    const definitionCandidates = Array.from(
      new Set(
        solution.bestWords
          .map((word) => word.trim())
          .filter((word) => word.length > 0)
      )
    )

    async function loadOptimalDefinition() {
      for (const word of definitionCandidates) {
        const definition = await loadWordDefinition(word)
        if (cancelled) return
        if (definition) {
          setOptimalDefinition(definition)
          setOptimalDefinitionWord(word)
          setIsLoadingOptimalDefinition(false)
          return
        }
      }

      if (cancelled) return
      setOptimalDefinition(null)
      setOptimalDefinitionWord(primaryOptimalWord)
      setIsLoadingOptimalDefinition(false)
    }

    void loadOptimalDefinition()

    return () => {
      cancelled = true
    }
  }, [showResultsModal, gameOver, primaryOptimalWord, solution.bestWords])

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
    const fullSolution = getFullSolution()
    const nextHintTile = fullSolution.bestPlacement.find(
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
        rackIndex,
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
      loadedGameConfig.mode === "mini"
        ? `Lexicon Mini ${formatDisplayDate(puzzle.date)}`
        : `Lexicon ${formatDisplayDate(puzzle.date)}`
    const rating = getRating()
    const summary = isPerfectFirstTryRun()
      ? loadedGameConfig.mode === "mini"
        ? "Perfect mini first try"
        : "Perfect first try"
      : loadedGameConfig.mode === "mini"
        ? `Mini: ${rating || "Keep trying"}`
        : rating || "Keep trying"
    const hintSummary = getHintStatusText()
    const lines = attemptHistory.map((attempt, index) => {
      const icon = getShareIcon(attempt.totalScore)
      return `${icon} ${getAttemptLabel(index, attempt.totalScore)}: ${attempt.totalScore}`
    })

    // Generate tracked share link
    const refCode = await createShareLink(puzzle.date, loadedGameConfig.mode, bestScore)
    const shareUrl = refCode
      ? `https://dinkdaddy.org?ref=${refCode}`
      : "https://dinkdaddy.org"

    const text = [header, summary, hintSummary, "", ...lines, "", `Play today's puzzle: ${shareUrl}`].filter(Boolean).join("\n")

    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ text })
        setMessage("Results shared.")
        return
      }

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        setMessage("Results copied to clipboard.")
        return
      }

      setMessage("Sharing is not available on this device.")
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return
      }

      try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text)
          setMessage("Results copied to clipboard.")
          return
        }
      } catch {
        // ignore clipboard fallback errors
      }

      setMessage("Could not share results automatically.")
    }
  }

  const currentDraftDirection = getMoveDirection()
  const hasValidDraftLine =
    placedTiles.length === 0 || currentDraftDirection !== null
  const allWordPreviews = hasValidDraftLine ? getAllWordPreviews() : []
  const validWordPreviews = allWordPreviews.filter((preview) => VALID_WORDS.has(preview.word))
  const validWordHighlightCells = new Set(
    validWordPreviews.flatMap((preview) =>
      preview.cells.map((cell) => getBoardCellKey(cell.row, cell.col))
    )
  )
  const canShowLiveScorePreview =
    placedTiles.length > 0 &&
    hasValidDraftLine &&
    isTouchingFilledCells() &&
    allWordPreviews.length > 0
  const isLiveScorePreviewValid =
    canShowLiveScorePreview && validWordPreviews.length === allWordPreviews.length
  const liveScoreAnchorCell = canShowLiveScorePreview
    ? (() => {
        const mainPreview = allWordPreviews[0]
        if (!mainPreview) return null
        return mainPreview.direction === "row"
          ? mainPreview.cells.reduce((best, cell) => (cell.col > best.col ? cell : best))
          : mainPreview.cells.reduce((best, cell) => (cell.row > best.row ? cell : best))
      })()
    : null
  const liveScoreTotal = canShowLiveScorePreview
    ? allWordPreviews.reduce((sum, preview) => sum + preview.score, 0)
    : null
  const homeActionButtonStyle: React.CSSProperties = {
    padding: isCompactMobile ? (isSmallPhone ? "13px 14px" : isLargePhone ? "15px 18px" : "14px 16px") : "16px 18px",
    fontSize: isCompactMobile ? (isSmallPhone ? "14px" : "15px") : "16px",
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
  const toughestPuzzle =
    analyticsRecords.length > 0
      ? analyticsRecords.reduce((lowest, record) =>
          record.scorePercent < lowest.scorePercent ? record : lowest
        )
      : null
  const statsHeroCards = [
    { label: "Played", value: stats.gamesPlayed },
    { label: "Current Streak", value: stats.currentStreak },
    { label: "Best Streak", value: stats.maxStreak },
    { label: "Perfect Streak", value: stats.perfectCurrentStreak },
  ]
  const statsContent = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <strong style={{ fontSize: isCompactMobile ? "19px" : "20px", display: "block" }}>Your Stats</strong>
          <div style={{ fontSize: "13px", color: "#6d5537", marginTop: "4px" }}>
            Track streaks, scoring, and how your puzzle runs are trending.
          </div>
        </div>
        {stats.gamesPlayed > 0 && (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: "999px",
              background: "rgba(255,250,240,0.78)",
              border: "1px solid rgba(123, 98, 65, 0.14)",
              fontSize: "12px",
              fontWeight: 800,
              color: "#5b4630",
            }}
          >
            {stats.gamesPlayed} games logged
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isCompactMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
          gap: "10px",
          marginTop: "14px",
        }}
      >
        {statsHeroCards.map(({ label, value }) => (
          <div
            key={label}
            style={{
              background: "linear-gradient(180deg, rgba(255,250,240,0.82) 0%, rgba(247,237,222,0.94) 100%)",
              border: "1px solid rgba(123, 98, 65, 0.12)",
              borderRadius: "14px",
              padding: isCompactMobile ? "12px" : "14px",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.42)",
            }}
          >
            <div style={{ fontSize: "12px", color: "#8a6a42", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 800 }}>
              {label}
            </div>
            <div style={{ fontSize: isCompactMobile ? "28px" : "30px", fontWeight: 800, lineHeight: 1 }}>
              {value}
            </div>
          </div>
        ))}
      </div>
      {stats.gamesPlayed > 0 && (
        <div style={{ marginTop: "18px" }}>
          {toughestPuzzle && (
            <div
              style={{
                background: "linear-gradient(180deg, rgba(255,250,240,0.72) 0%, rgba(245,234,214,0.92) 100%)",
                border: "1px solid rgba(123, 98, 65, 0.12)",
                borderRadius: "14px",
                padding: "12px 14px",
                marginBottom: "16px",
              }}
            >
              <div style={{ fontSize: "12px", color: "#8a6a42", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 800 }}>
                Toughest Puzzle So Far
              </div>
              <div style={{ fontSize: "17px", fontWeight: 800 }}>
                {formatDisplayDate(toughestPuzzle.date)} · {toughestPuzzle.mode}
              </div>
              <div style={{ fontSize: "13px", color: "#5b4630", marginTop: "6px", lineHeight: 1.45 }}>
                Best score {toughestPuzzle.bestScore} and {Math.round(toughestPuzzle.scorePercent * 100)}% of the top play.
              </div>
            </div>
          )}

          <div style={{ fontWeight: "bold", marginBottom: "10px", fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a6a42" }}>
            Score Distribution
          </div>
          {(["Perfect", "Excellent", "Great", "Solid", "Keep trying"] as const).map(
            (rating) => {
              const count = stats.ratingCounts[rating] ?? 0
              const pct = Math.round((count / stats.gamesPlayed) * 100)
              return (
                <div
                  key={rating}
                  style={{
                    display: "grid",
                    gridTemplateColumns: isCompactMobile ? "72px 1fr 28px" : "94px 1fr 34px",
                    alignItems: "center",
                    gap: "10px",
                    marginBottom: "8px",
                  }}
                >
                  <span style={{ fontSize: "12px", flexShrink: 0, fontWeight: 700 }}>{rating}</span>
                  <div
                    style={{
                      height: "18px",
                      borderRadius: "999px",
                      background: "rgba(185, 143, 88, 0.14)",
                      overflow: "hidden",
                      border: "1px solid rgba(123, 98, 65, 0.08)",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.max(pct, count > 0 ? 6 : 0)}%`,
                        background: "linear-gradient(90deg, #c49a61 0%, #a97d47 100%)",
                        borderRadius: "999px",
                        minWidth: count > 0 ? "24px" : "0",
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: "12px", textAlign: "right", fontWeight: 700 }}>{count}</span>
                </div>
              )
            }
          )}
        </div>
      )}
    </>
  )
  const showInGameStatsSheet = showStats && viewMode === "game"
  const showHomeStatsSheet = showStats && viewMode === "home" && isCompactMobile
  const inlineStatsPanel = showStats && viewMode !== "game" && !showHomeStatsSheet && (
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
      {statsContent}
    </div>
  )
  const archivePuzzles = DAILY_PUZZLES.filter((p) =>
    futurePuzzleTestMode ? true : p.date <= todayDate
  )
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
      return Boolean(status?.mini || status?.easy || status?.hard)
    }
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

  const archivePanel = (
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
            display: "flex",
            alignItems: "flex-end",
            gap: "8px",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={() => setFuturePuzzleTestMode((prev) => !prev)}
            style={{
              padding: isCompactMobile ? "8px 10px" : "9px 12px",
              borderRadius: "999px",
              background: futurePuzzleTestMode ? "#2f2419" : "rgba(255,250,240,0.9)",
              border: futurePuzzleTestMode
                ? "1px solid rgba(47,36,25,0.8)"
                : "1px solid rgba(123, 98, 65, 0.14)",
              color: futurePuzzleTestMode ? "#fffaf1" : "#2f2419",
              fontWeight: 800,
              flexShrink: 0,
              fontSize: isCompactMobile ? "12px" : "13px",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
              cursor: "pointer",
            }}
          >
            {futurePuzzleTestMode ? "Test Future On" : "Test Future Off"}
          </button>
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
            Completed
          </div>
          <div style={{ opacity: 0.75 }}>
            {archivePuzzleCountThisMonth === 0
              ? "No puzzles in this month."
              : `${archiveCompletedCountThisMonth}/${archivePuzzleCountThisMonth} dates played`}
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
            const isFuture = cell.date > todayDate
            const isSelected = cell.date === selectedDate
            const completionStatus = completedArchiveDates[cell.date] ?? {
              mini: false,
              easy: false,
              hard: false,
            }
            const isCompleted = Boolean(completionStatus.mini || completionStatus.easy || completionStatus.hard)
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
                      : isFuture
                        ? "1px dashed rgba(95, 66, 33, 0.4)"
                      : "1px solid rgba(123, 98, 65, 0.18)",
                  backgroundColor: isCompleted ? "#7aad2a" : isFuture ? "#f5ead6" : "#efe2c7",
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
                      : isFuture
                        ? "0 4px 10px rgba(95, 66, 33, 0.08)"
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
                      background: "#7aad2a",
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
                {isFuture && !isCompleted && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: "4px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: "8px",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      color: "#8a6a42",
                      zIndex: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    Test
                  </span>
                )}
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
  if (!hasMounted) {
    return <main style={{ minHeight: "100dvh", backgroundColor: "#e8dcc8" }} />
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        height: "100dvh",
        background:
          "linear-gradient(180deg, rgba(251,245,234,0.96) 0%, rgba(242,230,210,0.96) 100%)",
        padding: compactScreenPadding,
        fontFamily: "var(--font-sans)",
        color: "#2f2419",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          maxWidth: isCompactMobile ? "100%" : "920px",
          margin: "0 auto",
          height: "100%",
        }}
      >
        {viewMode === "home" ? (
          <div
            style={{
              minHeight: isCompactMobile ? "calc(100dvh - 16px)" : "calc(100dvh - 48px)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: isCompactMobile ? (isSmallPhone ? "22px" : "28px") : "34px",
              maxWidth: "900px",
              margin: "0 auto",
              paddingBottom: isCompactMobile ? "24px" : "40px",
            }}
          >
            <div
              style={{
                padding: isCompactMobile ? "0 8px" : "0 24px",
                textAlign: "center",
              }}
            >
              <div
                aria-label="Lexicon"
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  flexWrap: "nowrap",
                  gap: isCompactMobile ? "10px" : "14px",
                  margin: isCompactMobile ? "0 auto 18px" : "0 auto 26px",
                  maxWidth: "100%",
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
                        width: isCompactMobile
                          ? (isSmallPhone ? "38px" : isLargePhone ? "46px" : "42px")
                          : "108px",
                        height: isCompactMobile
                          ? (isSmallPhone ? "38px" : isLargePhone ? "46px" : "42px")
                          : "108px",
                        borderRadius: isCompactMobile ? "12px" : "22px",
                        border: "1px solid rgba(173, 143, 96, 0.42)",
                        background:
                          "linear-gradient(180deg, rgba(247,236,216,0.98) 0%, rgba(243,229,206,0.98) 100%)",
                        boxShadow:
                          "inset 0 1px 0 rgba(255,255,255,0.72), 0 12px 22px rgba(98, 74, 34, 0.1), 0 2px 6px rgba(98, 74, 34, 0.06)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: isCompactMobile
                          ? (isSmallPhone ? "21px" : isLargePhone ? "27px" : "24px")
                          : "54px",
                        fontWeight: 800,
                        color: "#14110f",
                        position: "relative",
                        cursor: "grab",
                        transform:
                          homeBrandDraggedIndex === index
                            ? `scale(0.96) rotate(${[-4, 3, -2, 2, -3, 2, -2][index]}deg)`
                            : `rotate(${[-4, 3, -2, 2, -3, 2, -2][index]}deg)`,
                        opacity: homeBrandDraggedIndex === index ? 0.75 : 1,
                        flexShrink: 0,
                        userSelect: "none",
                      }}
                    >
                      <span>{letter}</span>
                      <span
                        style={{
                          position: "absolute",
                          right: isCompactMobile ? "5px" : "10px",
                          bottom: isCompactMobile ? "2px" : "6px",
                          fontSize: isCompactMobile ? "9px" : "18px",
                          fontWeight: 700,
                          color: "rgba(47, 36, 25, 0.45)",
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
              <p
                style={{
                  margin: 0,
                  marginTop: isCompactMobile ? "2px" : "6px",
                  fontSize: isCompactMobile ? (isSmallPhone ? "17px" : "18px") : "32px",
                  color: "#1a1714",
                  maxWidth: isCompactMobile ? "18ch" : "none",
                  lineHeight: 1.15,
                  textAlign: "center",
                  marginInline: "auto",
                  fontWeight: 600,
                }}
              >
                Build the strongest play
              </p>
              <div
                style={{
                  marginTop: isCompactMobile ? "6px" : "10px",
                  fontSize: isCompactMobile ? "12px" : "14px",
                  color: "#8a6a42",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {todayDisplayDate} · Next {hasMounted ? resetCountdown : "--:--:--"}
              </div>
            </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: isCompactMobile ? (isSmallPhone ? "10px" : "12px") : "12px",
                  maxWidth: "760px",
                  margin: "0 auto",
                }}
              >
              <button
                onClick={() => {
                  setViewMode("daily")
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
                  if (!currentUser || currentUser.anon) {
                    setShowAuth(true); setAuthMode("login"); setAuthError("")
                  } else {
                    setViewMode("archive")
                    setShowStats(false)
                  }
                }}
                style={homeActionButtonStyle}
              >
                <div style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.7 }}>
                  Browse
                </div>
                <div style={{ fontSize: isCompactMobile ? "22px" : "24px", lineHeight: 1.15, marginTop: "4px" }}>
                  Open Archive
                </div>
              </button>

              <button
                onClick={() => {
                  if (!currentUser || currentUser.anon) {
                    setShowAuth(true); setAuthMode("login"); setAuthError("")
                  } else {
                    setShowStats((prev) => !prev)
                  }
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

              <button
                onClick={() => {
                  if (currentUser && !currentUser.anon) {
                    setShowSettings(true)
                  } else {
                    setShowAuth(true)
                    setAuthMode("login")
                    setAuthError("")
                  }
                }}
                style={homeActionButtonStyle}
              >
                <div style={{ fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.7 }}>
                  Account
                </div>
                <div style={{ fontSize: isCompactMobile ? "22px" : "24px", lineHeight: 1.15, marginTop: "4px" }}>
                  {hasMounted ? (currentUser && !currentUser.anon ? currentUser.username : "Sign In") : "Sign In"}
                </div>
              </button>
            </div>

            {inlineStatsPanel}

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
              gap: isCompactMobile ? (isSmallPhone ? "12px" : "16px") : "22px",
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
                padding: isCompactMobile ? (isSmallPhone ? "24px 16px 20px" : "26px 18px 22px") : "36px 28px 30px",
              }}
            >
              <div
                style={{
                  width: isCompactMobile ? (isSmallPhone ? "64px" : "68px") : "84px",
                  height: isCompactMobile ? (isSmallPhone ? "64px" : "68px") : "84px",
                  margin: "0 auto 14px",
                  borderRadius: "20px",
                  background: "rgba(255,255,255,0.28)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: isCompactMobile ? (isSmallPhone ? "30px" : "32px") : "40px",
                }}
              >
                ◈
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: isCompactMobile ? (isSmallPhone ? "36px" : "40px") : "50px",
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
                  fontSize: isCompactMobile ? (isSmallPhone ? "15px" : "17px") : "20px",
                  lineHeight: 1.25,
                  color: "#3d2a38",
                  fontWeight: 500,
                }}
              >
                Choose your daily board.
              </p>

              <div
                style={{
                  marginTop: isCompactMobile ? (isSmallPhone ? "18px" : "22px") : "28px",
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
                {([
                  { key: "mini", label: "Mini" },
                  { key: "easy", label: "Classic" },
                ] as const).map((mode) => {
                  const isSelected = selectedMode === mode.key
                  return (
                    <button
                      key={mode.key}
                      onClick={() => setSelectedMode(mode.key)}
                      style={{
                        padding: isCompactMobile ? "10px 12px" : "11px 14px",
                        borderRadius: "10px",
                        border: "none",
                        background: isSelected ? "#fffaf1" : "transparent",
                        color: isSelected ? "#2f2419" : "#3d2a38",
                        cursor: "pointer",
                        fontSize: isCompactMobile ? (isSmallPhone ? "14px" : "15px") : "16px",
                        fontWeight: 800,
                        boxShadow: isSelected ? "0 4px 10px rgba(61, 42, 56, 0.08)" : "none",
                      }}
                    >
                      {mode.label}
                    </button>
                  )
                })}
              </div>

              <button
                onClick={() => selectPuzzleDate(todayDate, selectedMode)}
                style={{
                  marginTop: isCompactMobile ? "16px" : "20px",
                  minWidth: isCompactMobile ? (isSmallPhone ? "132px" : "140px") : "160px",
                  padding: isCompactMobile ? (isSmallPhone ? "12px 20px" : "14px 24px") : "16px 28px",
                  borderRadius: "999px",
                  border: "none",
                  background: "#17120d",
                  color: "#fffaf1",
                  cursor: "pointer",
                  fontSize: isCompactMobile ? (isSmallPhone ? "22px" : "24px") : "26px",
                  fontWeight: 800,
                  boxShadow: "0 12px 24px rgba(23,18,13,0.2)",
                }}
              >
                Play
              </button>

              <div
                style={{
                  marginTop: isCompactMobile ? "16px" : "22px",
                  fontSize: isCompactMobile ? (isSmallPhone ? "15px" : "16px") : "18px",
                  color: "#2f2419",
                  fontWeight: 700,
                }}
              >
                {todayDisplayDate}
              </div>
              <div
                style={{
                  marginTop: "10px",
                  fontSize: isCompactMobile ? (isSmallPhone ? "13px" : "14px") : "15px",
                  color: "#4f384b",
                  fontWeight: 700,
                }}
              >
                Next puzzle in {hasMounted ? resetCountdown : "--:--:--"}
              </div>
              <div
                style={{
                  marginTop: "8px",
                  fontSize: isCompactMobile ? (isSmallPhone ? "13px" : "14px") : "15px",
                  lineHeight: 1.45,
                  color: "#4f384b",
                }}
              >
                Puzzle by Lexicon
                <br />
                {selectedMode === "mini"
                  ? "Mini gives you a quicker 5x5 board."
                  : "Classic keeps the 7x7 board."}
              </div>

              {(!currentUser || currentUser.anon) ? (
                <button
                  onClick={() => { setShowAuth(true); setAuthMode("login"); setAuthError(""); }}
                  style={{
                    marginTop: "16px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: isCompactMobile ? "14px" : "15px",
                    color: "#6d5537",
                    textDecoration: "underline",
                    fontWeight: 700,
                    padding: "4px",
                  }}
                >
                  Sign in to save progress
                </button>
              ) : (
                <div style={{ marginTop: "16px", fontSize: isCompactMobile ? "14px" : "15px", color: "#6d5537", fontWeight: 700 }}>
                  Playing as {currentUser.username}
                </div>
              )}
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
        ) : viewMode === "archive" ? (
          <div
            style={{
              minHeight: isCompactMobile ? "calc(100dvh - 16px)" : "calc(100dvh - 48px)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              gap: isCompactMobile ? "18px" : "22px",
              maxWidth: "760px",
              margin: "0 auto",
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
                maxWidth: "640px",
                padding: isCompactMobile ? "28px 0 0" : "36px 0 0",
              }}
            >
              {archivePanel}
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
                  backgroundColor:
                    loadedGameConfig.mode === "mini"
                      ? "rgba(236, 221, 184, 0.96)"
                      : "rgba(219,233,255,0.96)",
                  color: loadedGameConfig.mode === "mini" ? "#6a4c1c" : "#26456e",
                  fontWeight: 800,
                }}
              >
                {loadedGameConfig.mode === "mini" ? "Mini" : "Classic"}
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
              <strong>{loadedGameConfig.mode === "mini" ? "Mini" : "Classic"}</strong>
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
              ? "Move cleared"
              : "Puzzle solved"}
          </div>
        )}

        {showInGameStatsSheet && (
          <div
            onClick={() => setShowStats(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(34, 25, 13, 0.14)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              zIndex: 34,
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
              padding: isCompactMobile
                ? `${isSmallPhone ? "max(8px, env(safe-area-inset-top)) 8px 0" : "max(10px, env(safe-area-inset-top))"} ${compactModalInset}px 0`
                : "20px 24px 0",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: `min(${isCompactMobile ? `calc(100vw - ${compactModalInset * 2}px)` : "760px"}, calc(100vw - 24px))`,
                maxHeight: isCompactMobile ? (isSmallPhone ? "min(70vh, 680px)" : "min(68vh, 700px)") : "min(72vh, 760px)",
                overflowY: "auto",
                background: "linear-gradient(180deg, rgba(255,250,240,0.98) 0%, rgba(247,242,234,0.98) 100%)",
                border: "1px solid rgba(123, 98, 65, 0.14)",
                borderRadius: isCompactMobile ? "18px" : "22px",
                boxShadow: "0 20px 40px rgba(34, 25, 13, 0.18)",
                padding: isCompactMobile ? compactModalPadding : "18px 20px",
                animation: reducedMotionEnabled ? undefined : "pop-in-sheet 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "12px",
                }}
              >
                <div style={{ fontSize: "13px", color: "#8a6a42", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Stats
                </div>
                <button
                  onClick={() => setShowStats(false)}
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
              {statsContent}
            </div>
          </div>
        )}

        {showHomeStatsSheet && (
          <div
            onClick={() => setShowStats(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(34, 25, 13, 0.14)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              zIndex: 34,
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
              padding: `${isSmallPhone ? "max(8px, env(safe-area-inset-top)) 8px 0" : "max(10px, env(safe-area-inset-top))"} ${compactModalInset}px 0`,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: `min(calc(100vw - ${compactModalInset * 2}px), 760px)`,
                maxHeight: isSmallPhone ? "min(70vh, 680px)" : "min(68vh, 700px)",
                overflowY: "auto",
                background: "linear-gradient(180deg, rgba(255,250,240,0.98) 0%, rgba(247,242,234,0.98) 100%)",
                border: "1px solid rgba(123, 98, 65, 0.14)",
                borderRadius: "18px",
                boxShadow: "0 20px 40px rgba(34, 25, 13, 0.18)",
                padding: compactModalPadding,
                animation: reducedMotionEnabled ? undefined : "pop-in-sheet 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "12px",
                }}
              >
                <div style={{ fontSize: "13px", color: "#8a6a42", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Stats
                </div>
                <button
                  onClick={() => setShowStats(false)}
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
              {statsContent}
            </div>
          </div>
        )}

        <div
          style={{
            padding: isCompactMobile ? (isSmallPhone ? "0 1px" : isLargePhone ? "0 4px" : "0 2px") : "0",
            marginBottom: isCompactMobile ? "8px" : "14px",
            flexShrink: 0,
            width: isCompactMobile && compactPuzzleFrameWidth ? `${compactPuzzleFrameWidth}px` : "100%",
            maxWidth: isCompactMobile && compactPuzzleFrameWidth ? `${compactPuzzleFrameWidth}px` : "100%",
            marginLeft: isCompactMobile ? "auto" : undefined,
            marginRight: isCompactMobile ? "auto" : undefined,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: isCompactMobile ? "10px" : "12px",
              fontSize: isCompactMobile ? "13px" : "16px",
              lineHeight: 1.25,
              fontWeight: isCompactMobile ? 700 : 500,
              color: "#3f3020",
              textAlign: isCompactMobile ? "left" : "left",
            }}
          >
            <span style={{ flex: "1 1 auto", minWidth: 0 }}>{message}</span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: isCompactMobile ? "6px" : "8px",
                flexShrink: 0,
              }}
              aria-label={`Turn ${Math.min(attemptHistory.length + 1, maxAttempts)} of ${maxAttempts}`}
            >
              {Array.from({ length: maxAttempts }).map((_, index) => {
                const isCompletedTurn = index < attemptHistory.length
                const isCurrentTurn = !gameOver && index === currentTurnIndex

                return (
                  <span
                    key={index}
                    style={{
                      width: isCurrentTurn ? (isCompactMobile ? "10px" : "12px") : (isCompactMobile ? "8px" : "10px"),
                      height: isCurrentTurn ? (isCompactMobile ? "10px" : "12px") : (isCompactMobile ? "8px" : "10px"),
                      borderRadius: "999px",
                      backgroundColor: isCompletedTurn
                        ? "#2f2419"
                        : isCurrentTurn
                        ? "#b98f58"
                        : "rgba(123, 98, 65, 0.22)",
                      boxShadow: isCurrentTurn
                        ? `0 0 0 ${isCompactMobile ? "3px" : "4px"} rgba(185, 143, 88, 0.16)`
                        : "none",
                      transition: reducedMotionEnabled
                        ? undefined
                        : "transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease",
                      transform: isCurrentTurn ? "scale(1.05)" : "scale(1)",
                    }}
                  />
                )
              })}
            </div>
          </div>
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
              padding: isCompactMobile ? `${compactModalInset}px` : "24px",
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
                width: `min(${isCompactMobile ? `calc(100vw - ${compactModalInset * 2}px)` : "620px"}, calc(100vw - 24px))`,
                maxHeight: isCompactMobile ? (isSmallPhone ? "min(80vh, 720px)" : "min(78vh, 760px)") : undefined,
                overflowY: isCompactMobile ? "auto" : undefined,
                padding: isCompactMobile ? `${isSmallPhone ? "14px" : "16px"} ${isSmallPhone ? "14px" : "16px"} 12px` : "20px",
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
                <>
                  You found the top play immediately with <strong>{bestScore}/{solution.bestScore}</strong>.
                </>
              ) : (
                <>Your best score: <strong>{bestScore}/{solution.bestScore}</strong></>
              )}
            </p>
            <p>
              {isPerfectFirstTryRun() ? (
                <>No extra attempts needed.</>
              ) : (
                <>Rating: <strong>{getRating()}</strong></>
              )}
            </p>
            <p>
              Optimal play: <strong>{solution.bestWords.join(", ") || "Unknown"}</strong>
            </p>
            {primaryOptimalWord && (
              <div
                style={{
                  marginTop: "-2px",
                  marginBottom: "8px",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.56)",
                  border: "1px solid rgba(98, 128, 76, 0.12)",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#55713f",
                    marginBottom: "4px",
                  }}
                >
                  Definition
                </div>
                <div style={{ fontSize: "14px", lineHeight: 1.5, color: "#2f2419" }}>
                  {isLoadingOptimalDefinition
                    ? `Looking up ${primaryOptimalWord.toLowerCase()}...`
                    : optimalDefinition
                      ? `${(optimalDefinitionWord ?? primaryOptimalWord).toUpperCase()}: ${optimalDefinition}`
                      : `No definition available for ${primaryOptimalWord.toLowerCase()}.`}
                </div>
              </div>
            )}
            {getFullSolution().bestPlacement.length > 0 && (
              <p style={{ fontSize: "13px", color: "#1d4ed8", margin: "4px 0 0" }}>
                Blue tiles on the board show the optimal placement, not the word you submitted.
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
            padding: isCompactMobile ? `${compactModalInset}px` : "24px",
            background: "rgba(34, 25, 13, 0.24)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
              zIndex: 50,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: `min(${isCompactMobile ? `calc(100vw - ${compactModalInset * 2}px)` : "760px"}, calc(100vw - 24px))`,
                maxHeight: "min(84vh, 920px)",
                overflowY: "auto",
                padding: isCompactMobile ? compactModalPadding : "20px",
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
            flex: isCompactMobile ? 1 : undefined,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: isCompactMobile ? "center" : undefined,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: isCompactMobile ? "10px" : isDesktopHardMode ? "12px" : "18px",
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                background:
                  "linear-gradient(180deg, var(--board-shell-start) 0%, var(--board-shell-mid) 42%, var(--board-shell-end) 100%)",
                padding: isCompactMobile
                  ? `${compactBoardShellPadding}px`
                  : `${desktopBoardShellPadding}px`,
                borderRadius: isCompactMobile ? "16px" : "22px",
                border: "1px solid rgba(255,255,255,0.34)",
                boxShadow:
                  isCompactMobile
                    ? "inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -10px 18px rgba(61, 89, 118, 0.05), 0 10px 20px rgba(56, 78, 102, 0.16), 0 2px 6px rgba(37, 56, 78, 0.06)"
                    : "inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -14px 24px rgba(61, 89, 118, 0.06), 0 14px 28px rgba(56, 78, 102, 0.14), 0 4px 10px rgba(37, 56, 78, 0.06)",
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
                        handlePlacedTileDragStart(
                          e,
                          row,
                          col,
                          letter,
                          placedTile.isBlank,
                          placedTile.rackIndex
                        )
                      }
                    }}
                    onDragEnd={handlePlacedTileDragEnd}
                    onTouchStart={
                      placedTile
                        ? (e) =>
                            handlePlacedTouchStart(
                              e,
                              row,
                              col,
                              letter,
                              placedTile.isBlank,
                              placedTile.rackIndex
                            )
                        : undefined
                    }
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      border:
                        draggedPlacedTile &&
                        draggedPlacedTile.row === row &&
                        draggedPlacedTile.col === col
                          ? "2px solid #2563eb"
                          : draggedTile && !letter
                          ? "2px dashed #7b6241"
                          : "1px solid #7b6241",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: hasLetter ? boardTileFontSize : boardBonusFontSize,
                      fontWeight: "bold",
                      background: hasLetter
                        ? "linear-gradient(180deg, rgba(240,220,171,0.98) 0%, rgba(228,202,140,0.98) 100%)"
                        : getCellBackground(row, col, Boolean(letter)),
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
                      boxShadow: hasLetter
                        ? draggedPlacedTile &&
                          draggedPlacedTile.row === row &&
                          draggedPlacedTile.col === col
                          ? "inset 0 1px 0 rgba(255,255,255,0.48), 0 18px 30px rgba(53, 39, 19, 0.24), 0 8px 16px rgba(53, 39, 19, 0.16)"
                          : "inset 0 1px 0 rgba(255,255,255,0.42), 0 5px 12px rgba(53, 39, 19, 0.16), 0 1px 2px rgba(53, 39, 19, 0.08)"
                        : "inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 4px rgba(53, 39, 19, 0.04)",
                      touchAction: "none",
                      WebkitUserSelect: "none",
                      userSelect: "none",
                      zIndex:
                        (isLiveScoreAnchor && liveScoreTotal !== null) ||
                        validWordHighlightCells.has(getBoardCellKey(row, col))
                          ? 7
                          : 1,
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
                          ? 0.78
                          : 1,
                      transform:
                        draggedPlacedTile &&
                        draggedPlacedTile.row === row &&
                        draggedPlacedTile.col === col
                          ? "scale(1.04)"
                          : "scale(1)",
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
                          zIndex: 8,
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
                          bottom: isDesktopHardMode ? "2px" : "4px",
                          right: isDesktopHardMode ? "3px" : "5px",
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
                            isLiveScorePreviewValid
                              ? "linear-gradient(180deg, rgba(125,197,42,0.98) 0%, rgba(89,161,23,0.98) 100%)"
                              : "linear-gradient(180deg, rgba(214,145,52,0.98) 0%, rgba(173,104,24,0.98) 100%)",
                          color: "#fffdf8",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: isCompactMobile ? "13px" : "14px",
                          fontWeight: 900,
                          boxShadow: isLiveScorePreviewValid
                            ? "0 5px 10px rgba(71, 117, 20, 0.18)"
                            : "0 5px 10px rgba(136, 82, 16, 0.16)",
                          border: "2px solid rgba(255,255,255,0.72)",
                          zIndex: 9,
                        }}
                        title={
                          isLiveScorePreviewValid
                            ? "Current move score"
                            : "Current move score, but the word is not valid"
                        }
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
                padding: isCompactMobile ? "6px 0 0" : isDesktopHardMode ? "12px" : "16px",
                boxShadow: isCompactMobile ? "none" : "0 12px 28px rgba(78, 56, 28, 0.06)",
                marginTop: isCompactMobile ? "8px" : isDesktopHardMode ? "12px" : "16px",
              }}
            >
              {!isCompactMobile && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: isCompactMobile ? "8px" : isDesktopHardMode ? "8px" : "12px" }}>
                  <h2 style={{ margin: 0, fontSize: isCompactMobile ? "16px" : isDesktopHardMode ? "16px" : "18px" }}>Your Tiles</h2>
                  <div style={{ fontSize: isCompactMobile ? "11px" : isDesktopHardMode ? "12px" : "13px", color: "#6d5537" }}>Drag to reorder or tap a tile then a square.</div>
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
                        if (draggedTile) updateRackDropIndex(index)
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        handleRackGapDrop(index)
                      }}
                      style={{
                        width: isCompactMobile ? `${compactRackGapWidth}px` : "10px",
                        minHeight: `${rackTileSize + 2}px`,
                        backgroundColor: "transparent",
                        borderRadius: "999px",
                      }}
                    />

                    <div
                      data-rack-tile={index}
                      draggable={!gameOver && tile !== null}
                      onDragOver={(e) => {
                        e.preventDefault()
                        if (draggedTile) updateRackDropIndex(index)
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
                        opacity: tile === null ? 0.55 : 1,
                        transition: "transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 180ms ease",
                        willChange: draggedTile ? "transform" : undefined,
                        boxSizing: "border-box",
                        touchAction: "none",
                        WebkitUserSelect: "none",
                        userSelect: "none",
                        transform:
                          draggedTile?.index === index
                            ? "scale(1.04)"
                            : `translateX(${getRackTileShift(index)}px)`,
                      }}
                    >
                      {tile ?? ""}
                      {tile !== null && (
                        <span
                          style={{
                            position: "absolute",
                            bottom: isCompactMobile ? "3px" : isDesktopHardMode ? "2px" : "4px",
                            right: isCompactMobile ? "4px" : isDesktopHardMode ? "3px" : "6px",
                            fontSize: isCompactMobile ? "8px" : isDesktopHardMode ? "6px" : "11px",
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
                          if (draggedTile) updateRackDropIndex(rack.length)
                        }}
                        onDragLeave={() => {
                          if (rackDropIndex === rack.length) updateRackDropIndex(null)
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          handleRackGapDrop(rack.length)
                        }}
                        style={{
                          width: isCompactMobile ? `${compactRackGapWidth}px` : "10px",
                          minHeight: `${rackTileSize + 2}px`,
                          backgroundColor: "transparent",
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
                    ? "0.78fr 0.95fr 0.95fr 1.12fr"
                    : isDesktopHardMode
                    ? "minmax(80px, 0.95fr) minmax(108px, 1fr) minmax(108px, 1fr) minmax(156px, 1.3fr)"
                    : "minmax(80px, 0.95fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(180px, 1.4fr)",
                  gap: isCompactMobile ? "6px" : isDesktopHardMode ? "8px" : "10px",
                  marginTop: isCompactMobile ? "10px" : isDesktopHardMode ? "14px" : "18px",
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
                      padding: isCompactMobile ? "6px 6px" : isDesktopHardMode ? "8px 10px" : "10px 12px",
                      fontSize: isCompactMobile ? "11px" : isDesktopHardMode ? "13px" : "14px",
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

                      {(!currentUser || currentUser.anon) && (
                        <button
                          onClick={() => {
                            setShowAuth(true)
                            setAuthMode("login")
                            setAuthError("")
                            setShowMoreActions(false)
                          }}
                          style={{
                            padding: "10px 12px",
                            fontSize: "14px",
                            borderRadius: "14px",
                            border: "1px solid rgba(122, 173, 42, 0.3)",
                            backgroundColor: "rgba(122, 173, 42, 0.12)",
                            cursor: "pointer",
                            color: "#2f2419",
                            fontWeight: 700,
                            textAlign: "left",
                          }}
                        >
                          Sign In
                        </button>
                      )}
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
                      {gameOver && (
                        <button
                          onClick={() => {
                            setShowResultsModal(true)
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
                          View Results
                        </button>
                      )}
                      <button
                        onClick={resetCurrentPuzzle}
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
                    </div>
                  )}
                </div>

                <button
                  onClick={clearCurrentMove}
                  disabled={gameOver || placedTiles.length === 0}
                  style={{
                    width: "100%",
                    minHeight: `${actionButtonMinHeight}px`,
                    padding: isCompactMobile ? "6px 6px" : isDesktopHardMode ? "8px 10px" : "10px 14px",
                    fontSize: isCompactMobile ? "12px" : isDesktopHardMode ? "14px" : "15px",
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
                  Clear
                </button>

                <div style={{ position: "relative", width: "100%" }}>
                  {showShuffleNudge && !gameOver && (
                    <div
                      style={{
                        position: "absolute",
                        left: "50%",
                        bottom: `calc(100% + ${isCompactMobile ? 8 : 10}px)`,
                        transform: "translateX(-50%)",
                        backgroundColor: "#fff7ea",
                        color: "#2f2419",
                        border: "1px solid rgba(123, 98, 65, 0.24)",
                        borderRadius: "14px",
                        padding: isCompactMobile ? "8px 10px" : "10px 12px",
                        fontSize: isCompactMobile ? "11px" : "12px",
                        fontWeight: 700,
                        lineHeight: 1.35,
                        boxShadow: "0 12px 28px rgba(47, 36, 25, 0.14)",
                        maxWidth: isCompactMobile ? "150px" : "180px",
                        textAlign: "center",
                        zIndex: 4,
                        pointerEvents: "none",
                      }}
                    >
                      Stuck? Try a shuffle.
                      <div
                        style={{
                          position: "absolute",
                          left: "50%",
                          top: "100%",
                          transform: "translateX(-50%)",
                          width: 0,
                          height: 0,
                          borderLeft: "9px solid transparent",
                          borderRight: "9px solid transparent",
                          borderTop: "10px solid #fff7ea",
                        }}
                      />
                    </div>
                  )}

                  <button
                    onClick={shuffleRack}
                    disabled={gameOver}
                    style={{
                      width: "100%",
                      minHeight: `${actionButtonMinHeight}px`,
                      padding: isCompactMobile ? "6px 6px" : isDesktopHardMode ? "8px 10px" : "10px 14px",
                      fontSize: isCompactMobile ? "12px" : isDesktopHardMode ? "14px" : "15px",
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
                </div>

                <button
                  onClick={submitMove}
                  disabled={gameOver}
                  style={{
                    width: "100%",
                    minHeight: `${actionButtonMinHeight}px`,
                    padding: isCompactMobile ? "8px 8px" : isDesktopHardMode ? "10px 14px" : "12px 18px",
                    fontSize: isCompactMobile ? "13px" : isDesktopHardMode ? "15px" : "16px",
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
        </div>
        )}
      </div>

      {touchDrag && (
        <div
          style={{
            position: "fixed",
            left: touchDrag.x - 31,
            top: touchDrag.y - 30,
            width: "62px",
            height: "62px",
            background:
              "linear-gradient(180deg, rgba(240,220,171,0.99) 0%, rgba(228,202,140,0.99) 100%)",
            border: "2px solid rgba(123, 98, 65, 0.92)",
            borderRadius: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "30px",
            fontWeight: 900,
            color: "#2f2419",
            pointerEvents: "none",
            zIndex: 9999,
            opacity: touchDragEngaged ? 0.92 : 0,
            transform: touchDragEngaged
              ? "translateY(-6px) scale(1.08) rotate(-2deg)"
              : "translateY(0) scale(0.9) rotate(0deg)",
            transition: "opacity 120ms ease, transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.46), 0 18px 30px rgba(53, 39, 19, 0.24), 0 8px 14px rgba(53, 39, 19, 0.14)",
          }}
        >
          {touchDrag.letter}
          <span
            style={{
              position: "absolute",
              bottom: "5px",
              right: "7px",
              fontSize: "11px",
              fontWeight: 800,
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
            padding: isCompactMobile ? `${compactModalInset}px` : "16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#fffaf0",
              borderRadius: "18px",
              padding: isCompactMobile ? `${isSmallPhone ? "16px 14px" : "18px 16px"}` : "24px",
              maxWidth: "440px",
              width: "100%",
              maxHeight: isCompactMobile ? (isSmallPhone ? "min(82vh, 680px)" : "min(80vh, 700px)") : undefined,
              overflowY: isCompactMobile ? "auto" : undefined,
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
                  Tune appearance, sound, haptics, and motion.
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
                label: "Night mode",
                description: "Use the softer low-light palette even if Safari is in light mode.",
                checked: nightModeEnabled,
                onChange: () => setNightModeEnabled((prev) => !prev),
              },
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

            <div style={{ borderTop: "1px solid rgba(123, 98, 65, 0.12)", marginTop: "6px", paddingTop: "14px" }}>
              <div style={{ fontSize: "13px", fontWeight: 800, color: "#6d5537", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Account</div>
              {currentUser && !currentUser.anon ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: 800 }}>{currentUser.username}</div>
                    <div style={{ fontSize: "13px", color: "#6d5537", marginTop: "2px" }}>Signed in</div>
                  </div>
                  <button
                    onClick={handleLogout}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: "1px solid rgba(123, 98, 65, 0.2)",
                      backgroundColor: "#f5ead6",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#2f2419",
                    }}
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setShowSettings(false); setShowAuth(true); setAuthMode("login"); setAuthError(""); }}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "10px",
                    border: "1px solid rgba(123, 98, 65, 0.2)",
                    backgroundColor: "#2f2419",
                    cursor: "pointer",
                    fontSize: "15px",
                    fontWeight: 700,
                    color: "#fffaf0",
                  }}
                >
                  Sign in to sync progress
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showAuth && (
        <div
          onClick={() => setShowAuth(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10002,
            padding: isCompactMobile ? `${compactModalInset}px` : "16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#fffaf0",
              borderRadius: "18px",
              padding: isCompactMobile ? `${isSmallPhone ? "18px 16px" : "20px 18px"}` : "24px",
              maxWidth: "400px",
              width: "100%",
              maxHeight: isCompactMobile ? "min(84vh, 760px)" : undefined,
              overflowY: isCompactMobile ? "auto" : undefined,
              border: "1px solid rgba(123, 98, 65, 0.18)",
              boxShadow: "0 20px 40px rgba(34, 25, 13, 0.18)",
              color: "#2f2419",
              animation: reducedMotionEnabled ? undefined : "pop-in-sheet 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <h2 style={{ margin: 0, fontSize: "22px" }}>{authMode === "login" ? "Sign In" : "Create Account"}</h2>
              <button
                onClick={() => setShowAuth(false)}
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
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <input
                type="text"
                placeholder="Username"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                style={{
                  padding: "12px 14px",
                  borderRadius: "10px",
                  border: "1px solid rgba(123, 98, 65, 0.25)",
                  backgroundColor: "#fff",
                  fontSize: "16px",
                  color: "#2f2419",
                  outline: "none",
                }}
              />
              {authMode === "register" && (
                <input
                  type="email"
                  placeholder="Email (optional)"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "10px",
                    border: "1px solid rgba(123, 98, 65, 0.25)",
                    backgroundColor: "#fff",
                    fontSize: "16px",
                    color: "#2f2419",
                    outline: "none",
                  }}
                />
              )}
              <input
                type="password"
                placeholder="Password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAuth() }}
                style={{
                  padding: "12px 14px",
                  borderRadius: "10px",
                  border: "1px solid rgba(123, 98, 65, 0.25)",
                  backgroundColor: "#fff",
                  fontSize: "16px",
                  color: "#2f2419",
                  outline: "none",
                }}
              />

              {authError && (
                <div style={{ fontSize: "14px", color: "#c0392b", fontWeight: 600 }}>{authError}</div>
              )}

              <button
                onClick={handleAuth}
                disabled={authLoading || !authUsername || !authPassword}
                style={{
                  padding: "14px",
                  borderRadius: "10px",
                  border: "none",
                  backgroundColor: authLoading || !authUsername || !authPassword ? "#c8b68f" : "#2f2419",
                  cursor: authLoading ? "wait" : "pointer",
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#fffaf0",
                }}
              >
                {authLoading ? "..." : authMode === "login" ? "Sign In" : "Create Account"}
              </button>

              <button
                onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "14px",
                  color: "#6d5537",
                  textDecoration: "underline",
                  padding: "4px",
                }}
              >
                {authMode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "8px 0" }}>
                <div style={{ flex: 1, height: "1px", backgroundColor: "rgba(123, 98, 65, 0.15)" }} />
                <span style={{ fontSize: "13px", color: "#8a7a5a", fontWeight: 600 }}>or</span>
                <div style={{ flex: 1, height: "1px", backgroundColor: "rgba(123, 98, 65, 0.15)" }} />
              </div>

              <button
                onClick={loginWithGoogle}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid rgba(123, 98, 65, 0.2)",
                  backgroundColor: "#fff",
                  cursor: "pointer",
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "#2f2419",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Continue with Google
              </button>

              <button
                onClick={loginWithApple}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "10px",
                  border: "none",
                  backgroundColor: "#000",
                  cursor: "pointer",
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
                Continue with Apple
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingBlankPlacement && (
        <div
          onClick={cancelBlankPlacement}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10003,
            padding: isCompactMobile ? `${compactModalInset}px` : "16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              backgroundColor: "#ffffff",
              borderRadius: "14px",
              padding: isCompactMobile ? "18px 18px 16px" : "20px 20px 18px",
              width: `min(${isCompactMobile ? "calc(100vw - 40px)" : "320px"}, 320px)`,
              border: "1px solid rgba(80, 104, 164, 0.14)",
              boxShadow: "0 22px 48px rgba(22, 26, 45, 0.22)",
              color: "#1f1f1f",
            }}
          >
            <button
              onClick={cancelBlankPlacement}
              style={{
                position: "absolute",
                top: "8px",
                right: "8px",
                width: "28px",
                height: "28px",
                borderRadius: "999px",
                border: "none",
                background: "transparent",
                color: "#3c3c3c",
                fontSize: "20px",
                lineHeight: 1,
                cursor: "pointer",
              }}
              aria-label="Close blank tile chooser"
            >
              ×
            </button>
            <div
              style={{
                textAlign: "center",
                fontSize: isCompactMobile ? "18px" : "20px",
                fontWeight: 900,
                marginBottom: "14px",
                color: "#171717",
              }}
            >
              Choose Letter
            </div>
            <div
              style={{
                display: "grid",
                gap: "6px",
              }}
            >
              {["ABCDEFG", "HIJKLMN", "OPQRSTU", "VWXYZ"].map((rowLetters) => (
                <div
                  key={rowLetters}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                    gap: "6px",
                  }}
                >
                  {rowLetters === "VWXYZ" && <div aria-hidden="true" />}
                  {rowLetters.split("").map((letter) => (
                    <button
                      key={letter}
                      onClick={() => handleBlankLetterChoice(letter)}
                      style={{
                        width: "100%",
                        aspectRatio: "1 / 1",
                        borderRadius: "8px",
                        border: "2px solid rgba(123, 98, 65, 0.82)",
                        background:
                          "linear-gradient(180deg, rgba(240,220,171,0.98) 0%, rgba(228,202,140,0.98) 100%)",
                        color: "#2f2419",
                        fontSize: isCompactMobile ? "18px" : "19px",
                        fontWeight: 900,
                        cursor: "pointer",
                        boxShadow:
                          "inset 0 1px 0 rgba(255,255,255,0.42), 0 4px 10px rgba(53, 39, 19, 0.14)",
                      }}
                    >
                      {letter}
                    </button>
                  ))}
                  {rowLetters === "VWXYZ" && <div aria-hidden="true" />}
                </div>
              ))}
            </div>
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
            padding: isCompactMobile ? `${compactModalInset}px` : "16px",
          }}
        >
          <div
            style={{
              backgroundColor: "#fffaf0",
              borderRadius: "12px",
              padding: isCompactMobile ? (isSmallPhone ? "20px 16px" : "22px 18px") : "28px 24px",
              maxWidth: "480px",
              width: "100%",
              maxHeight: isCompactMobile ? "min(84vh, 760px)" : undefined,
              overflowY: isCompactMobile ? "auto" : undefined,
              border: "2px solid #c8b68f",
              fontFamily: "Georgia, serif",
              color: "#2f2419",
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: "22px" }}>How to Play</h2>
            <ul style={{ paddingLeft: "20px", lineHeight: "1.7", marginBottom: "20px" }}>
              <li>
                <strong>Place tiles</strong> from your rack onto the board. Keep your move in one row or one column.
              </li>
              <li>
                <strong>Make real words.</strong> Your move has to connect to the board, and every word you make must be valid.
              </li>
              <li>
                <strong>Use bonus squares</strong> to score more: DL, TL, DW, and TW only count on newly placed tiles.
              </li>
              <li>
                You get <strong>3 attempts</strong> to find the strongest play.
              </li>
              <li>
                On <strong>mobile</strong>, drag tiles or tap a tile and then tap a square.
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
