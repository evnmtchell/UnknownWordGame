import { VALID_WORDS } from "./words"
import { SPANISH_VALID_WORDS } from "./words-es"
import type { LocaleCode } from "./locales"
import { SPANISH_RACK_TILE_BAG, SPANISH_RACK_VOWELS } from "./scoring-es"

export type BonusType = "DL" | "TL" | "DW" | "TW"

export type PuzzleCell = {
  row: number
  col: number
  letter: string
}

export type BonusCell = {
  row: number
  col: number
  type: BonusType
}

export type DailyPuzzle = {
  id: string
  date: string
  boardSize: number
  rack: string[]
  filledCells: PuzzleCell[]
  bonusCells: BonusCell[]
  optimalScore: number
  optimalWords: string[]
}

export type PuzzleMode = "mini" | "easy" | "hard"

function getStartingWordRuns(filledCells: PuzzleCell[]) {
  const occupied = new Map(filledCells.map((cell) => [`${cell.row},${cell.col}`, cell]))
  const runs: PuzzleCell[][] = []

  for (const cell of filledCells) {
    const leftKey = `${cell.row},${cell.col - 1}`
    const rightKey = `${cell.row},${cell.col + 1}`
    const upKey = `${cell.row - 1},${cell.col}`
    const downKey = `${cell.row + 1},${cell.col}`

    if (!occupied.has(leftKey) && occupied.has(rightKey)) {
      const run = [cell]
      let nextCol = cell.col + 1
      while (occupied.has(`${cell.row},${nextCol}`)) {
        run.push(occupied.get(`${cell.row},${nextCol}`)!)
        nextCol += 1
      }
      runs.push(run)
    }

    if (!occupied.has(upKey) && occupied.has(downKey)) {
      const run = [cell]
      let nextRow = cell.row + 1
      while (occupied.has(`${nextRow},${cell.col}`)) {
        run.push(occupied.get(`${nextRow},${cell.col}`)!)
        nextRow += 1
      }
      runs.push(run)
    }
  }

  return runs
}

function isConnectedLayout(filledCells: PuzzleCell[]) {
  if (filledCells.length === 0) {
    return true
  }

  const occupied = new Set(filledCells.map((cell) => `${cell.row},${cell.col}`))
  const seen = new Set<string>()
  const queue = [`${filledCells[0].row},${filledCells[0].col}`]

  while (queue.length > 0) {
    const key = queue.shift()!
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    const [rowText, colText] = key.split(",")
    const row = Number(rowText)
    const col = Number(colText)

    for (const neighbor of [
      `${row - 1},${col}`,
      `${row + 1},${col}`,
      `${row},${col - 1}`,
      `${row},${col + 1}`,
    ]) {
      if (occupied.has(neighbor) && !seen.has(neighbor)) {
        queue.push(neighbor)
      }
    }
  }

  return seen.size === filledCells.length
}

function everyCellBelongsToAWord(filledCells: PuzzleCell[]) {
  const cellsInWords = new Set(
    getStartingWordRuns(filledCells)
      .flat()
      .map((cell) => `${cell.row},${cell.col}`)
  )

  return filledCells.every((cell) => cellsInWords.has(`${cell.row},${cell.col}`))
}

function allRunsAreValidWords(filledCells: PuzzleCell[], wordSet: Set<string> = VALID_WORDS) {
  return getStartingWordRuns(filledCells).every((run) =>
    wordSet.has(run.map((cell) => cell.letter).join(""))
  )
}

function validatePuzzleLayout(
  puzzle: DailyPuzzle,
  options: { minWords: number; maxWords?: number; minLength?: number; maxLength?: number } = {
    minWords: 2,
    maxWords: 4,
  },
  wordSet: Set<string> = VALID_WORDS
) {
  const center = Math.floor(puzzle.boardSize / 2)
  const centerCovered = puzzle.filledCells.some(
    (cell) => cell.row === center && cell.col === center
  )

  if (!centerCovered) {
    throw new Error(`${puzzle.id} (${puzzle.date}) must cover the center tile.`)
  }

  if (!isConnectedLayout(puzzle.filledCells)) {
    throw new Error(`${puzzle.id} (${puzzle.date}) must be one connected board shape.`)
  }

  if (!everyCellBelongsToAWord(puzzle.filledCells)) {
    throw new Error(
      `${puzzle.id} (${puzzle.date}) includes isolated tiles that do not belong to a full word.`
    )
  }

  if (!allRunsAreValidWords(puzzle.filledCells, wordSet)) {
    throw new Error(`${puzzle.id} (${puzzle.date}) must use only valid words in every run.`)
  }

  const startingWordRuns = getStartingWordRuns(puzzle.filledCells)
  const startingWordCount = startingWordRuns.length
  const exceedsMax =
    typeof options.maxWords === "number" && startingWordCount > options.maxWords

  if (startingWordCount < options.minWords || exceedsMax) {
    const expectedRange =
      typeof options.maxWords === "number"
        ? `${options.minWords} to ${options.maxWords} words`
        : `at least ${options.minWords} words`
    throw new Error(
      `${puzzle.id} (${puzzle.date}) must start with ${expectedRange}, found ${startingWordCount}.`
    )
  }

  const invalidLengthRun = startingWordRuns.find((run) => {
    if (typeof options.minLength === "number" && run.length < options.minLength) {
      return true
    }

    if (typeof options.maxLength === "number" && run.length > options.maxLength) {
      return true
    }

    return false
  })

  if (invalidLengthRun) {
    const expectedLength =
      typeof options.minLength === "number" && typeof options.maxLength === "number"
        ? `${options.minLength} to ${options.maxLength} letters`
        : "the expected letter range"
    throw new Error(`${puzzle.id} (${puzzle.date}) must use starting words of ${expectedLength}.`)
  }
}

const defaultBonusCells: BonusCell[] = [
  { row: 0, col: 0, type: "TW" },
  { row: 0, col: 6, type: "TW" },
  { row: 6, col: 0, type: "TW" },
  { row: 6, col: 6, type: "TW" },
  { row: 1, col: 1, type: "DW" },
  { row: 1, col: 5, type: "DW" },
  { row: 5, col: 1, type: "DW" },
  { row: 5, col: 5, type: "DW" },
  { row: 0, col: 3, type: "DL" },
  { row: 3, col: 0, type: "DL" },
  { row: 3, col: 6, type: "DL" },
  { row: 6, col: 3, type: "DL" },
  { row: 2, col: 2, type: "TL" },
  { row: 2, col: 4, type: "TL" },
  { row: 4, col: 2, type: "TL" },
  { row: 4, col: 4, type: "TL" },
]

const hardModeBonusCells: BonusCell[] = [
  { row: 0, col: 0, type: "TW" },
  { row: 0, col: 10, type: "TW" },
  { row: 10, col: 0, type: "TW" },
  { row: 10, col: 10, type: "TW" },
  { row: 1, col: 1, type: "DW" },
  { row: 1, col: 9, type: "DW" },
  { row: 5, col: 5, type: "DW" },
  { row: 9, col: 1, type: "DW" },
  { row: 9, col: 9, type: "DW" },
  { row: 2, col: 2, type: "TL" },
  { row: 2, col: 8, type: "TL" },
  { row: 8, col: 2, type: "TL" },
  { row: 8, col: 8, type: "TL" },
  { row: 0, col: 5, type: "TL" },
  { row: 5, col: 0, type: "TL" },
  { row: 5, col: 10, type: "TL" },
  { row: 10, col: 5, type: "TL" },
  { row: 0, col: 4, type: "DL" },
  { row: 0, col: 6, type: "DL" },
  { row: 4, col: 0, type: "DL" },
  { row: 4, col: 10, type: "DL" },
  { row: 6, col: 0, type: "DL" },
  { row: 6, col: 10, type: "DL" },
  { row: 10, col: 4, type: "DL" },
  { row: 10, col: 6, type: "DL" },
]

function createSeededRandom(seedText: string) {
  let seed = 0
  for (const char of seedText) {
    seed = (seed * 31 + char.charCodeAt(0)) >>> 0
  }

  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
}

const RACK_TILE_BAG = [
  ..."AAAAAAAAABBCCDDDDEEEEEEEEEEEEFFGGGHHIIIIIIIIIJKLLLLMMNNNNNNOOOOOOOOPPQRRRRRRSSSSTTTTTTUUUUVVWWXYYZ??",
]

function getWordSetForLocale(locale: LocaleCode) {
  return locale === "es" ? SPANISH_VALID_WORDS : VALID_WORDS
}

function getRackBagForLocale(locale: LocaleCode) {
  return locale === "es" ? SPANISH_RACK_TILE_BAG : RACK_TILE_BAG
}

function getVowelsForLocale(locale: LocaleCode) {
  return locale === "es" ? SPANISH_RACK_VOWELS : ["A", "E", "I", "O", "U"]
}

function generateRackForSeed(length: number, seedText: string, locale: LocaleCode = "en") {
  const random = createSeededRandom(seedText)
  const bag = [...getRackBagForLocale(locale)]
  const rack: string[] = []

  for (let index = 0; index < length && bag.length > 0; index++) {
    const bagIndex = Math.floor(random() * bag.length)
    rack.push(bag.splice(bagIndex, 1)[0])
  }

  const vowels = getVowelsForLocale(locale)
  const vowelCount = rack.filter((letter) => vowels.includes(letter)).length
  if (vowelCount < 2 && rack.length > 0) {
    const vowelBag = vowels
    const replaceIndex = rack.findIndex((letter) => ![...vowels, "?"].includes(letter))
    if (replaceIndex >= 0) {
      rack[replaceIndex] = vowelBag[Math.floor(random() * vowelBag.length)]
    }
  }

  return rack
}

type HardSlot = {
  direction: "across" | "down"
  row: number
  col: number
  word: string
}

type EasySlot = {
  direction: "across" | "down"
  row: number
  col: number
  word: string
}

const HARD_BOARD_SIZE = 11
const MINI_BOARD_SIZE = 5
const EASY_BOARD_SIZE = 7
const FUTURE_EASY_REBUILD_START = "2026-04-18"
const MINI_MODE_REBUILD_START = "2026-04-21"

type HardTransform = {
  transpose?: boolean
}

type EasyTransform = {
  transpose?: boolean
}

type MiniSlot = {
  direction: "across" | "down"
  row: number
  col: number
  word: string
}

type MiniTransform = {
  transpose?: boolean
}

type EasyTemplateSlot = Omit<EasySlot, "word"> & {
  length: number
}

type MiniTemplateSlot = Omit<MiniSlot, "word"> & {
  length: number
}

type EasyLayoutTemplate = {
  slots: EasyTemplateSlot[]
  fills: string[][]
}

type MiniLayoutTemplate = {
  slots: MiniTemplateSlot[]
  fills: string[][]
}

const miniModeBonusCells: BonusCell[] = [
  { row: 0, col: 0, type: "TW" },
  { row: 0, col: 4, type: "TW" },
  { row: 4, col: 0, type: "TW" },
  { row: 4, col: 4, type: "TW" },
  { row: 1, col: 1, type: "DW" },
  { row: 1, col: 3, type: "DW" },
  { row: 2, col: 2, type: "TL" },
  { row: 3, col: 1, type: "DW" },
  { row: 3, col: 3, type: "DW" },
  { row: 0, col: 2, type: "DL" },
  { row: 2, col: 0, type: "DL" },
  { row: 2, col: 4, type: "DL" },
  { row: 4, col: 2, type: "DL" },
]

const miniModeTemplates: MiniLayoutTemplate[] = [
  {
    slots: [
      { direction: "across", row: 2, col: 0, length: 5 },
      { direction: "down", row: 0, col: 1, length: 4 },
      { direction: "down", row: 1, col: 3, length: 3 },
    ],
    fills: [
      ["PLANE", "ISLE", "ANT"],
      ["CLOUD", "ISLE", "MUG"],
      ["GLOVE", "ISLE", "IVY"],
      ["BREAD", "AURA", "MAP"],
      ["STONE", "MATH", "ANT"],
      ["HOUSE", "IRON", "ASH"],
      ["RIVER", "GRID", "PEA"],
    ],
  },
  {
    slots: [
      { direction: "across", row: 2, col: 0, length: 5 },
      { direction: "down", row: 0, col: 2, length: 5 },
      { direction: "down", row: 1, col: 4, length: 3 },
    ],
    fills: [["WATER", "ACTOR", "ORB"]],
  },
  {
    slots: [
      { direction: "across", row: 2, col: 0, length: 5 },
      { direction: "down", row: 0, col: 2, length: 3 },
      { direction: "down", row: 1, col: 4, length: 3 },
    ],
    fills: [["FABLE", "CAB", "PEA"]],
  },
  {
    slots: [
      { direction: "across", row: 2, col: 0, length: 5 },
      { direction: "down", row: 0, col: 0, length: 3 },
      { direction: "down", row: 1, col: 2, length: 3 },
    ],
    fills: [["SMILE", "GAS", "PIN"]],
  },
]

const spanishMiniModeTemplates: MiniLayoutTemplate[] = [
  {
    slots: [
      { direction: "across", row: 2, col: 0, length: 5 },
      { direction: "down", row: 0, col: 1, length: 4 },
      { direction: "down", row: 1, col: 3, length: 3 },
    ],
    fills: [
      ["RATON", "REAL", "SOL"],
      ["LIMON", "UNIR", "SOL"],
      ["SALON", "REAL", "SOL"],
    ],
  },
  {
    slots: [
      { direction: "across", row: 2, col: 0, length: 5 },
      { direction: "down", row: 0, col: 2, length: 5 },
      { direction: "down", row: 1, col: 4, length: 3 },
    ],
    fills: [
      ["MANGO", "TENOR", "SOL"],
      ["PERRO", "ARROZ", "SOL"],
    ],
  },
  {
    slots: [
      { direction: "across", row: 2, col: 0, length: 5 },
      { direction: "down", row: 0, col: 2, length: 3 },
      { direction: "down", row: 1, col: 4, length: 3 },
    ],
    fills: [
      ["LUNAS", "TEN", "ESO"],
      ["MESAS", "DOS", "ESO"],
    ],
  },
]

const miniModeTransforms: MiniTransform[] = [{}, { transpose: true }]

const hardModeBlueprints: HardSlot[][] = [
  [
    { direction: "across", row: 2, col: 1, word: "SPEAK" },
    { direction: "across", row: 5, col: 2, word: "PLANETS" },
    { direction: "across", row: 8, col: 4, word: "MUSED" },
    { direction: "down", row: 1, col: 3, word: "PEARL" },
    { direction: "down", row: 3, col: 6, word: "WHEELS" },
    { direction: "down", row: 5, col: 8, word: "SAND" },
  ],
  [
    { direction: "across", row: 1, col: 4, word: "SPARK" },
    { direction: "across", row: 4, col: 2, word: "PLANETS" },
    { direction: "across", row: 7, col: 1, word: "ASHORE" },
    { direction: "down", row: 1, col: 5, word: "PAINTER" },
    { direction: "down", row: 4, col: 3, word: "LIGHT" },
    { direction: "down", row: 4, col: 8, word: "STAR" },
  ],
  [
    { direction: "across", row: 1, col: 1, word: "THUMB" },
    { direction: "across", row: 4, col: 2, word: "BRANCH" },
    { direction: "across", row: 7, col: 3, word: "KITES" },
    { direction: "down", row: 1, col: 5, word: "BLANKET" },
    { direction: "down", row: 4, col: 3, word: "ROCKET" },
    { direction: "down", row: 4, col: 7, word: "HENS" },
  ],
]

const hardModeTransforms: HardTransform[] = [
  {},
  { transpose: true },
]

const easyModeTemplates: EasyLayoutTemplate[] = [
  {
    slots: [
      { direction: "across", row: 3, col: 1, length: 5 },
      { direction: "down", row: 1, col: 2, length: 4 },
      { direction: "down", row: 2, col: 4, length: 3 },
    ],
    fills: [
      ["PLANE", "AXLE", "ANT"],
      ["CLOUD", "ISLE", "MUG"],
      ["SHORE", "ECHO", "ARM"],
      ["GRAIN", "BARK", "AID"],
      ["MOUSE", "GLOW", "ASK"],
      ["BRICK", "ACRE", "ACE"],
      ["CLOVE", "ISLE", "EVE"],
      ["TIGER", "PAIN", "PEA"],
      ["ROAST", "CROW", "ASH"],
      ["QUILT", "SOUP", "ELM"],
    ],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 1, length: 5 },
      { direction: "down", row: 2, col: 2, length: 3 },
      { direction: "down", row: 2, col: 4, length: 3 },
    ],
    fills: [["FABLE", "MAP", "ELM"]],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 1, length: 5 },
      { direction: "down", row: 1, col: 2, length: 5 },
      { direction: "down", row: 2, col: 4, length: 3 },
    ],
    fills: [["BRICK", "THREE", "ACE"]],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 1, length: 5 },
      { direction: "down", row: 1, col: 3, length: 5 },
      { direction: "down", row: 2, col: 5, length: 3 },
    ],
    fills: [
      ["GLOVE", "BROOK", "HEN"],
      ["WATER", "METAL", "ART"],
    ],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 1, length: 5 },
      { direction: "down", row: 1, col: 1, length: 5 },
      { direction: "down", row: 2, col: 4, length: 3 },
    ],
    fills: [["SMILE", "MUSIC", "ELM"]],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 0, length: 6 },
      { direction: "down", row: 1, col: 1, length: 4 },
      { direction: "down", row: 2, col: 4, length: 3 },
    ],
    fills: [
      ["MARKET", "BEAM", "GEM"],
      ["SPRING", "HOPE", "ANT"],
      ["POCKET", "FROG", "TEN"],
      ["THRIVE", "ECHO", "EVE"],
      ["CANDLE", "BEAM", "ELM"],
      ["HARBOR", "BEAM", "SON"],
    ],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 1, length: 6 },
      { direction: "down", row: 2, col: 3, length: 3 },
      { direction: "down", row: 2, col: 5, length: 3 },
    ],
    fills: [["BUTTON", "ATE", "SOD"]],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 0, length: 7 },
      { direction: "down", row: 1, col: 1, length: 5 },
      { direction: "down", row: 2, col: 4, length: 3 },
    ],
    fills: [["BALANCE", "BEACH", "INK"]],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 0, length: 7 },
      { direction: "down", row: 1, col: 1, length: 5 },
      { direction: "down", row: 1, col: 5, length: 4 },
    ],
    fills: [["HARVEST", "BEACH", "MIST"]],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 0, length: 6 },
      { direction: "down", row: 1, col: 3, length: 5 },
    ],
    fills: [["THREAD", "BLESS"]],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 1, length: 5 },
      { direction: "down", row: 1, col: 3, length: 5 },
    ],
    fills: [["CLOUD", "BROTH"]],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 0, length: 7 },
      { direction: "down", row: 1, col: 1, length: 5 },
      { direction: "down", row: 1, col: 3, length: 5 },
      { direction: "down", row: 1, col: 5, length: 5 },
    ],
    fills: [
      ["PLANETS", "HELLO", "ANNEX", "METAL"],
      ["POCKETS", "BROOK", "TOKEN", "METAL"],
    ],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 0, length: 7 },
      { direction: "down", row: 1, col: 0, length: 5 },
      { direction: "down", row: 1, col: 2, length: 5 },
      { direction: "down", row: 1, col: 4, length: 5 },
      { direction: "down", row: 1, col: 6, length: 5 },
    ],
    fills: [["MARKETS", "COMET", "SHRED", "BLESS", "MUSIC"]],
  },
]

const spanishEasyModeTemplates: EasyLayoutTemplate[] = [
  {
    slots: [
      { direction: "across", row: 3, col: 1, length: 5 },
      { direction: "down", row: 1, col: 2, length: 4 },
      { direction: "down", row: 2, col: 4, length: 3 },
    ],
    fills: [
      ["RATON", "REAL", "SOL"],
      ["LIMON", "UNIR", "SOL"],
      ["SALON", "REAL", "SOL"],
    ],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 1, length: 5 },
      { direction: "down", row: 2, col: 2, length: 3 },
      { direction: "down", row: 2, col: 4, length: 3 },
    ],
    fills: [
      ["LUNAS", "SUR", "PAN"],
      ["MESAS", "SER", "PAN"],
      ["SOLAR", "SOL", "PAN"],
    ],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 1, length: 5 },
      { direction: "down", row: 1, col: 2, length: 5 },
      { direction: "down", row: 2, col: 4, length: 3 },
    ],
    fills: [
      ["LIMON", "UNIDO", "SOL"],
      ["CASAS", "PLAZA", "PAN"],
      ["RATON", "PLAZA", "SOL"],
    ],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 1, length: 5 },
      { direction: "down", row: 1, col: 3, length: 5 },
      { direction: "down", row: 2, col: 5, length: 3 },
    ],
    fills: [
      ["PERRO", "ARROZ", "SOL"],
      ["MANGO", "TENOR", "SOL"],
      ["MESAS", "VISOR", "ESO"],
    ],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 1, length: 5 },
      { direction: "down", row: 1, col: 1, length: 5 },
      { direction: "down", row: 2, col: 4, length: 3 },
    ],
    fills: [
      ["MESAS", "TEMOR", "PAN"],
      ["SOLAR", "VISOR", "PAN"],
    ],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 0, length: 6 },
      { direction: "down", row: 1, col: 1, length: 4 },
      { direction: "down", row: 2, col: 4, length: 3 },
    ],
    fills: [
      ["TIERRA", "UNIR", "ERA"],
      ["MONTES", "AMOR", "VER"],
    ],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 1, length: 6 },
      { direction: "down", row: 2, col: 3, length: 3 },
      { direction: "down", row: 2, col: 5, length: 3 },
    ],
    fills: [["TESORO", "ESO", "ERA"]],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 0, length: 7 },
      { direction: "down", row: 1, col: 1, length: 5 },
      { direction: "down", row: 2, col: 4, length: 3 },
    ],
    fills: [["VENTANA", "SUELO", "PAN"]],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 0, length: 7 },
      { direction: "down", row: 1, col: 1, length: 5 },
      { direction: "down", row: 1, col: 5, length: 4 },
    ],
    fills: [["PLANETA", "MOLAR", "RATA"]],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 0, length: 6 },
      { direction: "down", row: 1, col: 3, length: 5 },
    ],
    fills: [["CAMINO", "UNIDO"]],
  },
  {
    slots: [
      { direction: "across", row: 3, col: 1, length: 5 },
      { direction: "down", row: 1, col: 3, length: 5 },
    ],
    fills: [["MESAS", "VISOR"]],
  },
]

const easyModeTransforms: EasyTransform[] = [
  {},
  { transpose: true },
]

const easyModeVariants = easyModeTransforms.flatMap((transform) =>
  easyModeTemplates.flatMap((template) =>
    template.fills.map((fill) => ({ template, fill, transform }))
  )
)

const spanishEasyModeVariants = easyModeTransforms.flatMap((transform) =>
  spanishEasyModeTemplates.flatMap((template) =>
    template.fills.map((fill) => ({ template, fill, transform }))
  )
)

const miniModeVariants = miniModeTransforms.flatMap((transform) =>
  miniModeTemplates.flatMap((template) =>
    template.fills.map((fill) => ({ template, fill, transform }))
  )
)

const spanishMiniModeVariants = miniModeTransforms.flatMap((transform) =>
  spanishMiniModeTemplates.flatMap((template) =>
    template.fills.map((fill) => ({ template, fill, transform }))
  )
)

function transposeHardSlot(slot: HardSlot): HardSlot {
  return {
    ...slot,
    direction: slot.direction === "across" ? "down" : "across",
    row: slot.col,
    col: slot.row,
  }
}

function transformHardSlot(slot: HardSlot, transform: HardTransform) {
  let transformed = { ...slot }

  if (transform.transpose) {
    transformed = transposeHardSlot(transformed)
  }

  return transformed
}

function transposeEasySlot(slot: EasySlot): EasySlot {
  return {
    ...slot,
    direction: slot.direction === "across" ? "down" : "across",
    row: slot.col,
    col: slot.row,
  }
}

function transformEasySlot(slot: EasySlot, transform: EasyTransform) {
  let transformed = { ...slot }

  if (transform.transpose) {
    transformed = transposeEasySlot(transformed)
  }

  return transformed
}

function transposeMiniSlot(slot: MiniSlot): MiniSlot {
  return {
    ...slot,
    direction: slot.direction === "across" ? "down" : "across",
    row: slot.col,
    col: slot.row,
  }
}

function transformMiniSlot(slot: MiniSlot, transform: MiniTransform) {
  let transformed = { ...slot }

  if (transform.transpose) {
    transformed = transposeMiniSlot(transformed)
  }

  return transformed
}

function fillEasyTemplateSlots(slots: EasyTemplateSlot[], words: string[]): EasySlot[] {
  if (slots.length !== words.length) {
    throw new Error("Easy template fill count does not match slot count.")
  }

  return slots.map((slot, index) => {
    const word = words[index]
    if (word.length !== slot.length) {
      throw new Error(`Easy template fill length mismatch for ${word}.`)
    }

    return {
      direction: slot.direction,
      row: slot.row,
      col: slot.col,
      word,
    }
  })
}

function fillMiniTemplateSlots(slots: MiniTemplateSlot[], words: string[]): MiniSlot[] {
  if (slots.length !== words.length) {
    throw new Error("Mini template fill count does not match slot count.")
  }

  return slots.map((slot, index) => {
    const word = words[index]
    if (word.length !== slot.length) {
      throw new Error(`Mini template fill length mismatch for ${word}.`)
    }

    return {
      direction: slot.direction,
      row: slot.row,
      col: slot.col,
      word,
    }
  })
}

function buildHardLayout(slots: HardSlot[], transform: HardTransform = {}) {
  const cells = new Map<string, PuzzleCell>()

  for (const slot of slots.map((item) => transformHardSlot(item, transform))) {
    for (let index = 0; index < slot.word.length; index++) {
      const row = slot.direction === "across" ? slot.row : slot.row + index
      const col = slot.direction === "across" ? slot.col + index : slot.col
      const key = `${row},${col}`
      const letter = slot.word[index]
      const existing = cells.get(key)

      if (existing && existing.letter !== letter) {
        throw new Error(`Hard layout conflict at ${key}.`)
      }

      cells.set(key, { row, col, letter })
    }
  }

  return Array.from(cells.values())
}

function buildEasyLayout(
  template: EasyLayoutTemplate,
  words: string[],
  transform: EasyTransform = {}
) {
  const cells = new Map<string, PuzzleCell>()

  for (const slot of fillEasyTemplateSlots(template.slots, words).map((item) =>
    transformEasySlot(item, transform)
  )) {
    for (let index = 0; index < slot.word.length; index++) {
      const row = slot.direction === "across" ? slot.row : slot.row + index
      const col = slot.direction === "across" ? slot.col + index : slot.col
      const key = `${row},${col}`
      const letter = slot.word[index]
      const existing = cells.get(key)

      if (existing && existing.letter !== letter) {
        throw new Error(`Easy layout conflict at ${key}.`)
      }

      cells.set(key, { row, col, letter })
    }
  }

  return Array.from(cells.values())
}

function buildMiniLayout(
  template: MiniLayoutTemplate,
  words: string[],
  transform: MiniTransform = {}
) {
  const cells = new Map<string, PuzzleCell>()

  for (const slot of fillMiniTemplateSlots(template.slots, words).map((item) =>
    transformMiniSlot(item, transform)
  )) {
    for (let index = 0; index < slot.word.length; index++) {
      const row = slot.direction === "across" ? slot.row : slot.row + index
      const col = slot.direction === "across" ? slot.col + index : slot.col
      const key = `${row},${col}`
      const letter = slot.word[index]
      const existing = cells.get(key)

      if (existing && existing.letter !== letter) {
        throw new Error(`Mini layout conflict at ${key}.`)
      }

      cells.set(key, { row, col, letter })
    }
  }

  return Array.from(cells.values())
}

function getHardModeLayoutForDate(date: string) {
  const random = createSeededRandom(`hard-${date}`)
  const slotLayout = hardModeBlueprints[Math.floor(random() * hardModeBlueprints.length)]
  const transform = hardModeTransforms[Math.floor(random() * hardModeTransforms.length)]
  const transformedLayout = buildHardLayout(slotLayout, transform)

  for (const cell of transformedLayout) {
    if (cell.row < 0 || cell.row >= HARD_BOARD_SIZE || cell.col < 0 || cell.col >= HARD_BOARD_SIZE) {
      throw new Error(`Generated hard puzzle for ${date} produced out-of-bounds cell.`)
    }
  }

  return transformedLayout
}

function getGeneratedEasyLayoutForDate(date: string) {
  const start = Date.parse(`${FUTURE_EASY_REBUILD_START}T00:00:00Z`)
  const current = Date.parse(`${date}T00:00:00Z`)
  const dayOffset = Number.isFinite(current) ? Math.max(0, Math.floor((current - start) / 86400000)) : 0
  const variant = easyModeVariants[dayOffset % easyModeVariants.length]
  const transformedLayout = buildEasyLayout(variant.template, variant.fill, variant.transform)

  for (const cell of transformedLayout) {
    if (cell.row < 0 || cell.row >= EASY_BOARD_SIZE || cell.col < 0 || cell.col >= EASY_BOARD_SIZE) {
      throw new Error(`Generated easy puzzle for ${date} produced out-of-bounds cell.`)
    }
  }

  return transformedLayout
}

function getGeneratedSpanishEasyLayoutForDate(date: string) {
  const start = Date.parse(`${FUTURE_EASY_REBUILD_START}T00:00:00Z`)
  const current = Date.parse(`${date}T00:00:00Z`)
  const dayOffset = Number.isFinite(current) ? Math.max(0, Math.floor((current - start) / 86400000)) : 0
  const variant = spanishEasyModeVariants[dayOffset % spanishEasyModeVariants.length]
  const transformedLayout = buildEasyLayout(variant.template, variant.fill, variant.transform)

  for (const cell of transformedLayout) {
    if (cell.row < 0 || cell.row >= EASY_BOARD_SIZE || cell.col < 0 || cell.col >= EASY_BOARD_SIZE) {
      throw new Error(`Generated Spanish easy puzzle for ${date} produced out-of-bounds cell.`)
    }
  }

  return transformedLayout
}

function getMiniModeLayoutForDate(date: string) {
  const start = Date.parse(`${MINI_MODE_REBUILD_START}T00:00:00Z`)
  const current = Date.parse(`${date}T00:00:00Z`)
  const dayOffset = Number.isFinite(current) ? Math.max(0, Math.floor((current - start) / 86400000)) : 0
  const variant = miniModeVariants[dayOffset % miniModeVariants.length]
  const transformedLayout = buildMiniLayout(variant.template, variant.fill, variant.transform)

  for (const cell of transformedLayout) {
    if (cell.row < 0 || cell.row >= MINI_BOARD_SIZE || cell.col < 0 || cell.col >= MINI_BOARD_SIZE) {
      throw new Error(`Generated mini puzzle for ${date} produced out-of-bounds cell.`)
    }
  }

  return transformedLayout
}

function getSpanishMiniModeLayoutForDate(date: string) {
  const start = Date.parse(`${MINI_MODE_REBUILD_START}T00:00:00Z`)
  const current = Date.parse(`${date}T00:00:00Z`)
  const dayOffset = Number.isFinite(current) ? Math.max(0, Math.floor((current - start) / 86400000)) : 0
  const variant = spanishMiniModeVariants[dayOffset % spanishMiniModeVariants.length]
  const transformedLayout = buildMiniLayout(variant.template, variant.fill, variant.transform)

  for (const cell of transformedLayout) {
    if (cell.row < 0 || cell.row >= MINI_BOARD_SIZE || cell.col < 0 || cell.col >= MINI_BOARD_SIZE) {
      throw new Error(`Generated Spanish mini puzzle for ${date} produced out-of-bounds cell.`)
    }
  }

  return transformedLayout
}

const hardPuzzleValidationOptions = {
  minWords: 6,
  maxWords: 10,
  minLength: 3,
  maxLength: 7,
} as const

function validateHardBlueprints() {
  for (const [blueprintIndex, blueprint] of hardModeBlueprints.entries()) {
    for (const [transformIndex, transform] of hardModeTransforms.entries()) {
      validatePuzzleLayout(
        {
          id: `hard-blueprint-${blueprintIndex + 1}-transform-${transformIndex + 1}`,
          date: "0000-00-00",
          boardSize: HARD_BOARD_SIZE,
          rack: [],
          filledCells: buildHardLayout(blueprint, transform),
          bonusCells: hardModeBonusCells,
          optimalScore: 0,
          optimalWords: [],
        },
        hardPuzzleValidationOptions
      )
    }
  }
}

function validateEasyBlueprints() {
  for (const [templateIndex, template] of easyModeTemplates.entries()) {
    for (const [fillIndex, fill] of template.fills.entries()) {
      for (const [transformIndex, transform] of easyModeTransforms.entries()) {
        validatePuzzleLayout(
          {
            id: `easy-template-${templateIndex + 1}-fill-${fillIndex + 1}-transform-${transformIndex + 1}`,
            date: "0000-00-00",
            boardSize: EASY_BOARD_SIZE,
            rack: [],
            filledCells: buildEasyLayout(template, fill, transform),
            bonusCells: defaultBonusCells,
            optimalScore: 0,
            optimalWords: [],
          },
          {
            minWords: 2,
            maxWords: 5,
          }
        )
      }
    }
  }
}

function validateSpanishEasyBlueprints() {
  for (const [templateIndex, template] of spanishEasyModeTemplates.entries()) {
    for (const [fillIndex, fill] of template.fills.entries()) {
      for (const [transformIndex, transform] of easyModeTransforms.entries()) {
        validatePuzzleLayout(
          {
            id: `es-easy-template-${templateIndex + 1}-fill-${fillIndex + 1}-transform-${transformIndex + 1}`,
            date: "0000-00-00",
            boardSize: EASY_BOARD_SIZE,
            rack: [],
            filledCells: buildEasyLayout(template, fill, transform),
            bonusCells: defaultBonusCells,
            optimalScore: 0,
            optimalWords: [],
          },
          {
            minWords: 2,
            maxWords: 5,
          },
          SPANISH_VALID_WORDS
        )
      }
    }
  }
}

function validateMiniBlueprints() {
  for (const [templateIndex, template] of miniModeTemplates.entries()) {
    for (const [fillIndex, fill] of template.fills.entries()) {
      for (const [transformIndex, transform] of miniModeTransforms.entries()) {
        validatePuzzleLayout(
          {
            id: `mini-template-${templateIndex + 1}-fill-${fillIndex + 1}-transform-${transformIndex + 1}`,
            date: "0000-00-00",
            boardSize: MINI_BOARD_SIZE,
            rack: [],
            filledCells: buildMiniLayout(template, fill, transform),
            bonusCells: miniModeBonusCells,
            optimalScore: 0,
            optimalWords: [],
          },
          {
            minWords: 2,
            maxWords: 3,
            minLength: 3,
            maxLength: 5,
          }
        )
      }
    }
  }
}

function validateSpanishMiniBlueprints() {
  for (const [templateIndex, template] of spanishMiniModeTemplates.entries()) {
    for (const [fillIndex, fill] of template.fills.entries()) {
      for (const [transformIndex, transform] of miniModeTransforms.entries()) {
        validatePuzzleLayout(
          {
            id: `es-mini-template-${templateIndex + 1}-fill-${fillIndex + 1}-transform-${transformIndex + 1}`,
            date: "0000-00-00",
            boardSize: MINI_BOARD_SIZE,
            rack: [],
            filledCells: buildMiniLayout(template, fill, transform),
            bonusCells: miniModeBonusCells,
            optimalScore: 0,
            optimalWords: [],
          },
          {
            minWords: 2,
            maxWords: 3,
            minLength: 3,
            maxLength: 5,
          },
          SPANISH_VALID_WORDS
        )
      }
    }
  }
}

const harderFutureThreeWordLayouts: PuzzleCell[][] = [
  [
    { row: 3, col: 0, letter: "J" },
    { row: 3, col: 1, letter: "U" },
    { row: 3, col: 2, letter: "M" },
    { row: 3, col: 3, letter: "B" },
    { row: 3, col: 4, letter: "L" },
    { row: 3, col: 5, letter: "E" },
    { row: 4, col: 2, letter: "O" },
    { row: 5, col: 2, letter: "P" },
    { row: 1, col: 4, letter: "O" },
    { row: 2, col: 4, letter: "I" },
  ],
  [
    { row: 3, col: 0, letter: "T" },
    { row: 3, col: 1, letter: "H" },
    { row: 3, col: 2, letter: "R" },
    { row: 3, col: 3, letter: "I" },
    { row: 3, col: 4, letter: "V" },
    { row: 3, col: 5, letter: "E" },
    { row: 4, col: 1, letter: "E" },
    { row: 5, col: 1, letter: "N" },
    { row: 1, col: 5, letter: "T" },
    { row: 2, col: 5, letter: "I" },
  ],
  [
    { row: 3, col: 0, letter: "C" },
    { row: 3, col: 1, letter: "L" },
    { row: 3, col: 2, letter: "O" },
    { row: 3, col: 3, letter: "V" },
    { row: 3, col: 4, letter: "E" },
    { row: 3, col: 5, letter: "R" },
    { row: 4, col: 2, letter: "W" },
    { row: 5, col: 2, letter: "L" },
    { row: 1, col: 4, letter: "B" },
    { row: 2, col: 4, letter: "E" },
  ],
  [
    { row: 3, col: 0, letter: "B" },
    { row: 3, col: 1, letter: "R" },
    { row: 3, col: 2, letter: "I" },
    { row: 3, col: 3, letter: "D" },
    { row: 3, col: 4, letter: "G" },
    { row: 3, col: 5, letter: "E" },
    { row: 4, col: 3, letter: "I" },
    { row: 5, col: 3, letter: "G" },
    { row: 1, col: 4, letter: "R" },
    { row: 2, col: 4, letter: "A" },
  ],
  [
    { row: 3, col: 0, letter: "S" },
    { row: 3, col: 1, letter: "P" },
    { row: 3, col: 2, letter: "R" },
    { row: 3, col: 3, letter: "O" },
    { row: 3, col: 4, letter: "U" },
    { row: 3, col: 5, letter: "T" },
    { row: 4, col: 2, letter: "I" },
    { row: 5, col: 2, letter: "G" },
    { row: 1, col: 5, letter: "N" },
    { row: 2, col: 5, letter: "U" },
  ],
  [
    { row: 3, col: 0, letter: "P" },
    { row: 3, col: 1, letter: "L" },
    { row: 3, col: 2, letter: "A" },
    { row: 3, col: 3, letter: "N" },
    { row: 3, col: 4, letter: "E" },
    { row: 3, col: 5, letter: "T" },
    { row: 4, col: 2, letter: "P" },
    { row: 5, col: 2, letter: "E" },
    { row: 1, col: 5, letter: "N" },
    { row: 2, col: 5, letter: "E" },
  ],
  [
    { row: 3, col: 0, letter: "S" },
    { row: 3, col: 1, letter: "H" },
    { row: 3, col: 2, letter: "A" },
    { row: 3, col: 3, letter: "D" },
    { row: 3, col: 4, letter: "O" },
    { row: 3, col: 5, letter: "W" },
    { row: 4, col: 1, letter: "E" },
    { row: 5, col: 1, letter: "N" },
    { row: 1, col: 5, letter: "R" },
    { row: 2, col: 5, letter: "O" },
  ],
  [
    { row: 3, col: 0, letter: "G" },
    { row: 3, col: 1, letter: "A" },
    { row: 3, col: 2, letter: "R" },
    { row: 3, col: 3, letter: "D" },
    { row: 3, col: 4, letter: "E" },
    { row: 3, col: 5, letter: "N" },
    { row: 4, col: 1, letter: "R" },
    { row: 5, col: 1, letter: "C" },
    { row: 1, col: 5, letter: "D" },
    { row: 2, col: 5, letter: "E" },
  ],
  [
    { row: 3, col: 0, letter: "M" },
    { row: 3, col: 1, letter: "A" },
    { row: 3, col: 2, letter: "R" },
    { row: 3, col: 3, letter: "K" },
    { row: 3, col: 4, letter: "E" },
    { row: 3, col: 5, letter: "T" },
    { row: 4, col: 1, letter: "R" },
    { row: 5, col: 1, letter: "C" },
    { row: 1, col: 5, letter: "N" },
    { row: 2, col: 5, letter: "E" },
  ],
  [
    { row: 3, col: 0, letter: "P" },
    { row: 3, col: 1, letter: "O" },
    { row: 3, col: 2, letter: "C" },
    { row: 3, col: 3, letter: "K" },
    { row: 3, col: 4, letter: "E" },
    { row: 3, col: 5, letter: "T" },
    { row: 4, col: 1, letter: "A" },
    { row: 5, col: 1, letter: "R" },
    { row: 1, col: 5, letter: "A" },
    { row: 2, col: 5, letter: "N" },
  ],
  [
    { row: 3, col: 0, letter: "F" },
    { row: 3, col: 1, letter: "I" },
    { row: 3, col: 2, letter: "G" },
    { row: 3, col: 3, letter: "U" },
    { row: 3, col: 4, letter: "R" },
    { row: 3, col: 5, letter: "E" },
    { row: 4, col: 1, letter: "C" },
    { row: 5, col: 1, letter: "E" },
    { row: 1, col: 5, letter: "R" },
    { row: 2, col: 5, letter: "U" },
  ],
  [
    { row: 3, col: 0, letter: "Q" },
    { row: 3, col: 1, letter: "U" },
    { row: 3, col: 2, letter: "A" },
    { row: 3, col: 3, letter: "R" },
    { row: 3, col: 4, letter: "T" },
    { row: 3, col: 5, letter: "Z" },
    { row: 4, col: 2, letter: "I" },
    { row: 5, col: 2, letter: "L" },
    { row: 0, col: 4, letter: "S" },
    { row: 1, col: 4, letter: "U" },
    { row: 2, col: 4, letter: "I" },
  ],
]

const baseDailyPuzzles: DailyPuzzle[] = [
  {
    id: "puzzle-1",
    date: "2026-04-03",
    boardSize: 7,
    rack: ["A", "R", "E", "T", "S", "L", "N"],
    filledCells: [
      { row: 2, col: 2, letter: "C" },
      { row: 2, col: 3, letter: "A" },
      { row: 2, col: 4, letter: "T" },
      { row: 3, col: 3, letter: "R" },
      { row: 4, col: 3, letter: "T" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 24,
    optimalWords: ["STEAL", "CATS"],
  },
  {
    id: "puzzle-2",
    date: "2026-04-04",
    boardSize: 7,
    rack: ["S", "T", "O", "N", "E", "R", "L"],
    filledCells: [
      { row: 3, col: 1, letter: "R" },
      { row: 3, col: 2, letter: "A" },
      { row: 3, col: 3, letter: "T" },
      { row: 2, col: 2, letter: "E" },
      { row: 4, col: 2, letter: "R" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 20,
    optimalWords: ["STONE"],
  },
  {
    id: "puzzle-3",
    date: "2026-04-05",
    boardSize: 7,
    rack: ["P", "L", "A", "N", "E", "S", "T"],
    filledCells: [
      { row: 1, col: 3, letter: "E" },
      { row: 2, col: 3, letter: "A" },
      { row: 3, col: 3, letter: "R" },
      { row: 3, col: 2, letter: "A" },
      { row: 3, col: 4, letter: "T" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 22,
    optimalWords: ["PLANE"],
  },
  {
    id: "puzzle-4",
    date: "2026-04-06",
    boardSize: 7,
    rack: ["E", "R", "A", "L", "N", "G", "O"],
    filledCells: [
      { row: 3, col: 2, letter: "S" },
      { row: 3, col: 3, letter: "I" },
      { row: 3, col: 4, letter: "T" },
      { row: 2, col: 3, letter: "H" },
      { row: 4, col: 3, letter: "T" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-5",
    date: "2026-04-07",
    boardSize: 7,
    rack: ["?", "S", "L", "T", "P", "I", "G"],
    filledCells: [
      { row: 3, col: 2, letter: "E" },
      { row: 3, col: 3, letter: "A" },
      { row: 3, col: 4, letter: "R" },
      { row: 2, col: 3, letter: "P" },
      { row: 4, col: 3, letter: "N" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },

  {
    id: "puzzle-7",
    date: "2026-04-09",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "I", "N", "G"],
    filledCells: harderFutureThreeWordLayouts[0],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-8",
    date: "2026-04-10",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "I", "L", "K"],
    filledCells: harderFutureThreeWordLayouts[1],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-9",
    date: "2026-04-11",
    boardSize: 7,
    rack: ["S", "E", "R", "A", "N", "G", "L"],
    filledCells: harderFutureThreeWordLayouts[2],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-10",
    date: "2026-04-12",
    boardSize: 7,
    rack: ["S", "T", "R", "I", "N", "G", "L"],
    filledCells: harderFutureThreeWordLayouts[3],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-11",
    date: "2026-04-13",
    boardSize: 7,
    rack: ["S", "T", "R", "I", "N", "G", "D"],
    filledCells: harderFutureThreeWordLayouts[4],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-12",
    date: "2026-04-14",
    boardSize: 7,
    rack: ["S", "T", "E", "A", "I", "N", "G"],
    filledCells: harderFutureThreeWordLayouts[5],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-13",
    date: "2026-04-15",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "I", "N", "G"],
    filledCells: harderFutureThreeWordLayouts[6],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-14",
    date: "2026-04-16",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "I", "L", "G"],
    filledCells: harderFutureThreeWordLayouts[7],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-15",
    date: "2026-04-17",
    boardSize: 7,
    rack: ["S", "R", "N", "D", "L", "P", "I"],
    filledCells: harderFutureThreeWordLayouts[8],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-16",
    date: "2026-04-18",
    boardSize: 7,
    rack: ["S", "E", "R", "A", "I", "N", "G"],
    filledCells: harderFutureThreeWordLayouts[9],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-17",
    date: "2026-04-19",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "A", "N", "G"],
    filledCells: harderFutureThreeWordLayouts[10],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-18",
    date: "2026-04-20",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "A", "I", "N"],
    filledCells: harderFutureThreeWordLayouts[11],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-19",
    date: "2026-04-21",
    boardSize: 7,
    rack: ["S", "E", "R", "A", "D", "L", "G"],
    filledCells: [
      { row: 3, col: 2, letter: "T" },
      { row: 3, col: 3, letter: "I" },
      { row: 3, col: 4, letter: "N" },
      { row: 2, col: 3, letter: "P" },
      { row: 4, col: 3, letter: "N" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-20",
    date: "2026-04-22",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "I", "N", "G"],
    filledCells: [
      { row: 2, col: 2, letter: "H" },
      { row: 2, col: 3, letter: "A" },
      { row: 2, col: 4, letter: "M" },
      { row: 3, col: 3, letter: "N" },
      { row: 4, col: 3, letter: "T" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-21",
    date: "2026-04-23",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "A", "I", "N"],
    filledCells: [
      { row: 3, col: 2, letter: "B" },
      { row: 3, col: 3, letter: "O" },
      { row: 3, col: 4, letter: "G" },
      { row: 2, col: 3, letter: "T" },
      { row: 4, col: 3, letter: "P" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-22",
    date: "2026-04-24",
    boardSize: 7,
    rack: ["S", "E", "R", "A", "I", "N", "G"],
    filledCells: [
      { row: 3, col: 2, letter: "J" },
      { row: 3, col: 3, letter: "O" },
      { row: 3, col: 4, letter: "T" },
      { row: 2, col: 3, letter: "T" },
      { row: 4, col: 3, letter: "P" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-23",
    date: "2026-04-25",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "A", "I", "N"],
    filledCells: [
      { row: 3, col: 2, letter: "M" },
      { row: 3, col: 3, letter: "U" },
      { row: 3, col: 4, letter: "D" },
      { row: 2, col: 3, letter: "S" },
      { row: 4, col: 3, letter: "N" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-24",
    date: "2026-04-26",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "A", "G", "D"],
    filledCells: [
      { row: 3, col: 2, letter: "F" },
      { row: 3, col: 3, letter: "I" },
      { row: 3, col: 4, letter: "N" },
      { row: 2, col: 3, letter: "T" },
      { row: 4, col: 3, letter: "N" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-25",
    date: "2026-04-27",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "A", "I", "N"],
    filledCells: [
      { row: 3, col: 2, letter: "W" },
      { row: 3, col: 3, letter: "I" },
      { row: 3, col: 4, letter: "G" },
      { row: 2, col: 3, letter: "T" },
      { row: 4, col: 3, letter: "N" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-26",
    date: "2026-04-28",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "I", "L", "G"],
    filledCells: [
      { row: 3, col: 2, letter: "V" },
      { row: 3, col: 3, letter: "A" },
      { row: 3, col: 4, letter: "N" },
      { row: 2, col: 3, letter: "E" },
      { row: 4, col: 3, letter: "R" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-27",
    date: "2026-04-29",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "A", "I", "L"],
    filledCells: [
      { row: 3, col: 2, letter: "T" },
      { row: 3, col: 3, letter: "O" },
      { row: 3, col: 4, letter: "P" },
      { row: 2, col: 3, letter: "H" },
      { row: 4, col: 3, letter: "P" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-28",
    date: "2026-04-30",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "A", "I", "L"],
    filledCells: [
      { row: 3, col: 2, letter: "N" },
      { row: 3, col: 3, letter: "E" },
      { row: 3, col: 4, letter: "T" },
      { row: 2, col: 3, letter: "T" },
      { row: 4, col: 3, letter: "N" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-29",
    date: "2026-05-01",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "A", "I", "N"],
    filledCells: [
      { row: 3, col: 2, letter: "G" },
      { row: 3, col: 3, letter: "U" },
      { row: 3, col: 4, letter: "N" },
      { row: 2, col: 3, letter: "S" },
      { row: 4, col: 3, letter: "N" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-30",
    date: "2026-05-02",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "A", "I", "N"],
    filledCells: [
      { row: 3, col: 2, letter: "L" },
      { row: 3, col: 3, letter: "E" },
      { row: 3, col: 4, letter: "G" },
      { row: 2, col: 3, letter: "T" },
      { row: 4, col: 3, letter: "N" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-31",
    date: "2026-05-03",
    boardSize: 7,
    rack: ["S", "T", "E", "A", "I", "N", "G"],
    filledCells: [
      { row: 3, col: 2, letter: "R" },
      { row: 3, col: 3, letter: "I" },
      { row: 3, col: 4, letter: "M" },
      { row: 2, col: 3, letter: "T" },
      { row: 4, col: 3, letter: "N" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-32",
    date: "2026-05-04",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "I", "N", "G"],
    filledCells: [
      { row: 2, col: 2, letter: "Y" },
      { row: 2, col: 3, letter: "A" },
      { row: 2, col: 4, letter: "M" },
      { row: 3, col: 3, letter: "N" },
      { row: 4, col: 3, letter: "T" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-33",
    date: "2026-05-05",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "A", "I", "N"],
    filledCells: [
      { row: 3, col: 2, letter: "O" },
      { row: 3, col: 3, letter: "W" },
      { row: 3, col: 4, letter: "L" },
      { row: 2, col: 3, letter: "O" },
      { row: 4, col: 3, letter: "N" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    // Two words sharing a letter: CAT (horizontal) crosses FAT (vertical) at the T
    id: "puzzle-34",
    date: "2026-05-06",
    boardSize: 7,
    rack: ["S", "E", "R", "L", "N", "I", "G"],
    filledCells: [
      { row: 3, col: 2, letter: "C" },
      { row: 3, col: 3, letter: "A" },
      { row: 3, col: 4, letter: "T" },
      { row: 1, col: 4, letter: "F" },
      { row: 2, col: 4, letter: "A" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    // Two parallel words: MAP and TOP, player must bridge or extend one of them
    id: "puzzle-35",
    date: "2026-05-07",
    boardSize: 7,
    rack: ["?", "E", "R", "A", "L", "N", "I"],
    filledCells: [
      { row: 3, col: 2, letter: "M" },
      { row: 3, col: 3, letter: "A" },
      { row: 3, col: 4, letter: "P" },
      { row: 2, col: 3, letter: "E" },
      { row: 4, col: 3, letter: "R" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    // Full cross: STOP (horizontal) and ROAD (vertical) share the O
    id: "puzzle-36",
    date: "2026-04-08",
    boardSize: 7,
    rack: ["S", "T", "R", "I", "N", "G", "?"],
    filledCells: [
      { row: 3, col: 0, letter: "M" },
      { row: 3, col: 1, letter: "U" },
      { row: 3, col: 2, letter: "Z" },
      { row: 3, col: 3, letter: "Z" },
      { row: 3, col: 4, letter: "L" },
      { row: 3, col: 5, letter: "E" },
      { row: 4, col: 2, letter: "O" },
      { row: 5, col: 2, letter: "O" },
      { row: 0, col: 4, letter: "V" },
      { row: 1, col: 4, letter: "E" },
      { row: 2, col: 4, letter: "I" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
]

function generateFutureBasePuzzles(startDate: string, endDate: string, startingId: number): DailyPuzzle[] {
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  const generated: DailyPuzzle[] = []
  let nextId = startingId

  for (let current = new Date(start); current <= end; current.setUTCDate(current.getUTCDate() + 1)) {
    const date = current.toISOString().slice(0, 10)
    generated.push({
      id: `puzzle-${nextId}`,
      date,
      boardSize: EASY_BOARD_SIZE,
      rack: ["S", "T", "R", "E", "A", "I", "N"],
      filledCells: [],
      bonusCells: defaultBonusCells,
      optimalScore: 0,
      optimalWords: [],
    })
    nextId += 1
  }

  return generated
}

const datedBaseDailyPuzzles: DailyPuzzle[] = [
  ...baseDailyPuzzles,
  ...generateFutureBasePuzzles("2026-05-08", "2026-05-31", 37),
]

export const DAILY_PUZZLES: DailyPuzzle[] = datedBaseDailyPuzzles.map((puzzle, index) => {
  if (puzzle.date >= FUTURE_EASY_REBUILD_START) {
    return {
      ...puzzle,
      filledCells: getGeneratedEasyLayoutForDate(puzzle.date),
    }
  }

  if (puzzle.date >= "2026-04-08" && puzzle.date <= "2026-04-20") {
    return puzzle
  }

  const replacementIndex =
    puzzle.date < "2026-04-08"
      ? index
      : index - baseDailyPuzzles.findIndex((item) => item.date === "2026-04-09")

  return {
    ...puzzle,
    filledCells: harderFutureThreeWordLayouts[replacementIndex % harderFutureThreeWordLayouts.length],
  }
})

for (const puzzle of DAILY_PUZZLES) {
  if (puzzle.date >= FUTURE_EASY_REBUILD_START) {
    validatePuzzleLayout(puzzle, { minWords: 2, maxWords: 5 })
    continue
  }

  validatePuzzleLayout(puzzle)
}

validateEasyBlueprints()
validateHardBlueprints()
validateMiniBlueprints()
validateSpanishEasyBlueprints()
validateSpanishMiniBlueprints()

export function getPuzzleByDate(
  date: string,
  mode: PuzzleMode = "easy",
  locale: LocaleCode = "en"
) {
  const easyPuzzle = DAILY_PUZZLES.find((puzzle) => puzzle.date === date) || DAILY_PUZZLES[0]
  const wordSet = getWordSetForLocale(locale)
  const generatedRack = generateRackForSeed(
    mode === "mini" ? 5 : easyPuzzle.rack.length,
    `${date}-${mode}-${locale}-rack`,
    locale
  )

  if (mode === "mini") {
    const miniPuzzle: DailyPuzzle = {
      ...easyPuzzle,
      id: `${easyPuzzle.id}-mini`,
      boardSize: MINI_BOARD_SIZE,
      rack: generatedRack,
      filledCells: locale === "es" ? getSpanishMiniModeLayoutForDate(date) : getMiniModeLayoutForDate(date),
      bonusCells: miniModeBonusCells,
    }

    validatePuzzleLayout(miniPuzzle, {
      minWords: 2,
      maxWords: 3,
      minLength: 3,
      maxLength: 5,
    }, wordSet)
    return miniPuzzle
  }

  if (mode === "easy") {
    const puzzle = {
      ...easyPuzzle,
      rack: generatedRack,
      filledCells:
        locale === "es"
          ? getGeneratedSpanishEasyLayoutForDate(date)
          : easyPuzzle.filledCells,
    }
    validatePuzzleLayout(puzzle, {
      minWords: 2,
      maxWords: 5,
    }, wordSet)
    return puzzle
  }

  const hardPuzzle: DailyPuzzle = {
    ...easyPuzzle,
    id: `${easyPuzzle.id}-hard`,
    boardSize: HARD_BOARD_SIZE,
    rack: generatedRack,
    filledCells: getHardModeLayoutForDate(date),
    bonusCells: hardModeBonusCells,
  }

  validatePuzzleLayout(hardPuzzle, hardPuzzleValidationOptions, wordSet)
  return hardPuzzle
}

export function getTodayPuzzle(mode: PuzzleMode = "easy", locale: LocaleCode = "en") {
  const today = new Date().toISOString().slice(0, 10)
  return getPuzzleByDate(today, mode, locale)
}
