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

function countStartingWords(filledCells: PuzzleCell[]) {
  const occupied = new Map(filledCells.map((cell) => [`${cell.row},${cell.col}`, cell]))
  let wordCount = 0

  for (const cell of filledCells) {
    const leftKey = `${cell.row},${cell.col - 1}`
    const rightKey = `${cell.row},${cell.col + 1}`
    const upKey = `${cell.row - 1},${cell.col}`
    const downKey = `${cell.row + 1},${cell.col}`

    if (!occupied.has(leftKey) && occupied.has(rightKey)) {
      wordCount += 1
    }

    if (!occupied.has(upKey) && occupied.has(downKey)) {
      wordCount += 1
    }
  }

  return wordCount
}

function validatePuzzleLayout(puzzle: DailyPuzzle) {
  const center = Math.floor(puzzle.boardSize / 2)
  const centerCovered = puzzle.filledCells.some(
    (cell) => cell.row === center && cell.col === center
  )

  if (!centerCovered) {
    throw new Error(`${puzzle.id} (${puzzle.date}) must cover the center tile.`)
  }

  const startingWordCount = countStartingWords(puzzle.filledCells)
  if (startingWordCount < 2 || startingWordCount > 4) {
    throw new Error(
      `${puzzle.id} (${puzzle.date}) must start with 2 to 4 words, found ${startingWordCount}.`
    )
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
    filledCells: [
      { row: 3, col: 2, letter: "O" },
      { row: 3, col: 3, letter: "A" },
      { row: 3, col: 4, letter: "K" },
      { row: 2, col: 3, letter: "R" },
      { row: 4, col: 3, letter: "N" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-8",
    date: "2026-04-10",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "I", "L", "K"],
    filledCells: [
      { row: 3, col: 2, letter: "N" },
      { row: 3, col: 3, letter: "A" },
      { row: 3, col: 4, letter: "P" },
      { row: 2, col: 3, letter: "T" },
      { row: 4, col: 3, letter: "P" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-9",
    date: "2026-04-11",
    boardSize: 7,
    rack: ["S", "E", "R", "A", "N", "G", "L"],
    filledCells: [
      { row: 2, col: 2, letter: "B" },
      { row: 2, col: 3, letter: "I" },
      { row: 2, col: 4, letter: "T" },
      { row: 1, col: 3, letter: "P" },
      { row: 3, col: 3, letter: "N" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-10",
    date: "2026-04-12",
    boardSize: 7,
    rack: ["S", "T", "R", "I", "N", "G", "L"],
    filledCells: [
      { row: 3, col: 2, letter: "A" },
      { row: 3, col: 3, letter: "G" },
      { row: 3, col: 4, letter: "E" },
      { row: 2, col: 2, letter: "B" },
      { row: 4, col: 2, letter: "R" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-11",
    date: "2026-04-13",
    boardSize: 7,
    rack: ["S", "T", "R", "I", "N", "G", "D"],
    filledCells: [
      { row: 3, col: 2, letter: "A" },
      { row: 3, col: 3, letter: "C" },
      { row: 3, col: 4, letter: "E" },
      { row: 2, col: 3, letter: "I" },
      { row: 4, col: 3, letter: "E" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-12",
    date: "2026-04-14",
    boardSize: 7,
    rack: ["S", "T", "E", "A", "I", "N", "G"],
    filledCells: [
      { row: 3, col: 2, letter: "R" },
      { row: 3, col: 3, letter: "U" },
      { row: 3, col: 4, letter: "G" },
      { row: 2, col: 3, letter: "S" },
      { row: 4, col: 3, letter: "N" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-13",
    date: "2026-04-15",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "I", "N", "G"],
    filledCells: [
      { row: 3, col: 1, letter: "M" },
      { row: 3, col: 2, letter: "A" },
      { row: 3, col: 3, letter: "P" },
      { row: 2, col: 2, letter: "C" },
      { row: 4, col: 2, letter: "N" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-14",
    date: "2026-04-16",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "I", "L", "G"],
    filledCells: [
      { row: 3, col: 2, letter: "P" },
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
    id: "puzzle-15",
    date: "2026-04-17",
    boardSize: 7,
    rack: ["S", "R", "N", "D", "L", "P", "I"],
    filledCells: [
      { row: 3, col: 2, letter: "T" },
      { row: 3, col: 3, letter: "E" },
      { row: 3, col: 4, letter: "A" },
      { row: 2, col: 3, letter: "P" },
      { row: 4, col: 3, letter: "N" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-16",
    date: "2026-04-18",
    boardSize: 7,
    rack: ["S", "E", "R", "A", "I", "N", "G"],
    filledCells: [
      { row: 3, col: 2, letter: "C" },
      { row: 3, col: 3, letter: "O" },
      { row: 3, col: 4, letter: "D" },
      { row: 2, col: 3, letter: "T" },
      { row: 4, col: 3, letter: "P" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
  {
    id: "puzzle-17",
    date: "2026-04-19",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "A", "N", "G"],
    filledCells: [
      { row: 3, col: 2, letter: "D" },
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
    id: "puzzle-18",
    date: "2026-04-20",
    boardSize: 7,
    rack: ["S", "T", "R", "E", "A", "I", "N"],
    filledCells: [
      { row: 3, col: 2, letter: "F" },
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
    rack: ["?", "A", "N", "I", "L", "G", "S"],
    filledCells: [
      { row: 3, col: 1, letter: "S" },
      { row: 3, col: 2, letter: "T" },
      { row: 3, col: 3, letter: "O" },
      { row: 3, col: 4, letter: "P" },
      { row: 1, col: 3, letter: "R" },
      { row: 2, col: 3, letter: "O" },
      { row: 4, col: 3, letter: "A" },
      { row: 5, col: 3, letter: "D" },
    ],
    bonusCells: defaultBonusCells,
    optimalScore: 0,
    optimalWords: [],
  },
]

export const DAILY_PUZZLES: DailyPuzzle[] = baseDailyPuzzles.map((puzzle, index) => {
  if (puzzle.date === "2026-04-08") {
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
  validatePuzzleLayout(puzzle)
}

export function getTodayPuzzle() {
  const today = new Date().toISOString().slice(0, 10)
  return (
    DAILY_PUZZLES.find((puzzle) => puzzle.date === today) || DAILY_PUZZLES[0]
  )
}
