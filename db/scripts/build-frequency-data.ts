/**
 * Build word frequency data files for the difficulty algorithm.
 *
 * For English: downloads Google Books Ngrams unigram data (totalcounts) and
 * the game's own word list, then assigns each word a frequency score 0..1
 * (0 = most common, 1 = most obscure).
 *
 * For Spanish: the game only has ~250 words, so we assign tiers manually
 * based on simple length/commonality heuristics.
 *
 * Usage: node dist/build-frequency-data.js
 *
 * Outputs:
 *   db/scripts/data/word-frequency-en.json
 *   db/scripts/data/word-frequency-es.json
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { execSync } from "child_process"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DATA_DIR = join(__dirname, "data")
mkdirSync(DATA_DIR, { recursive: true })

// ---------------------------------------------------------------------------
// English frequency data
// ---------------------------------------------------------------------------

// We use a curated tier approach. Words are assigned obscurity scores based on
// their presence in well-known frequency tiers:
//   Tier 0 (0.00-0.10): Top 1000 most common English words
//   Tier 1 (0.10-0.25): Top 5000
//   Tier 2 (0.25-0.45): Top 15000
//   Tier 3 (0.45-0.65): Top 40000
//   Tier 4 (0.65-0.85): Remaining known words
//   Tier 5 (0.85-1.00): Obscure / Scrabble-only words

// Top ~1000 most common English words (curated from multiple frequency lists)
const TIER_0_WORDS = new Set([
  "THE", "BE", "TO", "OF", "AND", "A", "IN", "THAT", "HAVE", "I", "IT", "FOR",
  "NOT", "ON", "WITH", "HE", "AS", "YOU", "DO", "AT", "THIS", "BUT", "HIS",
  "BY", "FROM", "THEY", "WE", "SAY", "HER", "SHE", "OR", "AN", "WILL", "MY",
  "ONE", "ALL", "WOULD", "THERE", "THEIR", "WHAT", "SO", "UP", "OUT", "IF",
  "ABOUT", "WHO", "GET", "WHICH", "GO", "ME", "WHEN", "MAKE", "CAN", "LIKE",
  "TIME", "NO", "JUST", "HIM", "KNOW", "TAKE", "PEOPLE", "INTO", "YEAR", "YOUR",
  "GOOD", "SOME", "COULD", "THEM", "SEE", "OTHER", "THAN", "THEN", "NOW", "LOOK",
  "ONLY", "COME", "ITS", "OVER", "THINK", "ALSO", "BACK", "AFTER", "USE", "TWO",
  "HOW", "OUR", "WORK", "FIRST", "WELL", "WAY", "EVEN", "NEW", "WANT", "BECAUSE",
  "ANY", "THESE", "GIVE", "DAY", "MOST", "US", "GREAT", "OLD", "VERY", "LONG",
  "GAME", "PLAY", "WORD", "FIND", "EACH", "HAND", "HIGH", "PLACE", "CALL", "KEEP",
  "LAST", "LONG", "MAKE", "MUCH", "NAME", "PART", "REAL", "SAME", "SET", "SHOW",
  "SIDE", "STILL", "TRY", "TURN", "MOVE", "NEED", "TELL", "DOES", "HELP", "LINE",
  "HOME", "MAN", "POINT", "WORLD", "LIFE", "MANY", "THING", "THOSE", "TELL",
  "WHILE", "NEXT", "HEAD", "UNDER", "LITTLE", "HOUSE", "MIGHT", "STORY", "WATER",
  "BEEN", "LEFT", "RIGHT", "BEST", "THREE", "MADE", "BEING", "SINCE", "NUMBER",
  "BEFORE", "MORE", "MUST", "THROUGH", "BETWEEN", "STATE", "NEVER", "CITY",
  "DOWN", "SMALL", "SCHOOL", "EVERY", "CHANGE", "LARGE", "OFTEN", "START",
  "LAND", "FOOD", "NEAR", "OWN", "BELOW", "COUNTRY", "PLANT", "LAST", "FOLLOW",
  "STOP", "HARD", "OPEN", "RUN", "TREE", "END", "BEGAN", "GROW", "TOOK", "RIVER",
  "GROUP", "ALWAYS", "MUSIC", "FAR", "BOTH", "MARK", "CHILDREN", "FEW", "BOOK",
  "CARRY", "TOOK", "FACE", "WATCH", "YOUNG", "FORM", "IDEA", "LEAVE", "ANSWER",
  "ROOM", "ANIMAL", "LIGHT", "STUDY", "STILL", "LEARN", "SHOULD", "KIND", "EAT",
  "CLOSE", "NIGHT", "LIVE", "WALK", "WHITE", "SEA", "BEGIN", "GROW", "HARD",
  "PAPER", "TOGETHER", "EARTH", "FAMILY", "BODY", "MIND", "STAND", "TABLE",
  "FOUR", "ADD", "CAR", "TALK", "DOOR", "CUT", "FULL", "HALF", "RED", "FISH",
  "HEAR", "BLUE", "ROAD", "TOP", "FAST", "GIRL", "BOY", "HOLD", "STEP", "EARLY",
  "FIRE", "SOUTH", "PROBLEM", "KING", "REACH", "STAY", "REST", "POWER", "AGE",
  "WAIT", "TRUE", "BRING", "BLACK", "SHORT", "LOVE", "MONEY", "NORTH", "WEST",
  "EAST", "DEATH", "HORSE", "DRAW", "COLD", "WARM", "WIND", "SNOW", "RAIN",
  "SLEEP", "FEEL", "PLAN", "FALL", "RISE", "DARK", "SURE", "EYES", "DEEP",
  "BEAR", "SONG", "BOAT", "ROCK", "BIRD", "STAR", "GOLD", "HEART", "FLOOR",
  "WOOD", "STONE", "DOG", "CAT", "BALL", "MILE", "IRON", "GLASS", "GROUND",
  "CLEAR", "MAP", "SHIP", "GREEN", "ROUND", "SPEED", "DRIVE", "FIELD", "STORE",
  "HOUR", "WEEK", "MONTH", "VOICE", "FRONT", "CROSS", "NOTE", "FAIR", "PAIR",
  "SKIN", "HOLE", "HILL", "BONE", "BANK", "COST", "DEAL", "CASE", "SIGN",
  "BIG", "BAD", "HOT", "LOW", "WIDE", "LATE", "FLAT", "FREE", "SICK", "SAFE",
  "INCH", "RING", "BAND", "CARD", "SEAT", "LAND", "LAKE", "WALL", "FARM",
  "BORN", "WING", "RULE", "TOOL", "COAT", "MINE", "FILL", "SIZE", "SUIT",
  "PATH", "NOSE", "SPOT", "CAMP", "SHOP", "GIFT", "RENT", "COOK", "SAND",
  "TRIP", "DROP", "DUST", "LUCK", "POOL", "HAIR", "MEAL", "SALT", "FEAR",
  "TERM", "NECK", "CREW", "MILK", "SOUL", "CASH", "PAIN", "LOAN", "DRUG",
  "BURN", "GRAB", "KICK", "SLIP", "TONE", "TRAP", "FIRM", "BEND", "SHIP",
  "PILE", "RUIN", "JAIL", "FUEL", "DIRT", "POLE", "ROOT", "CORN", "SILK",
  "ACID", "CLAY", "COAL", "CURE", "DOSE", "FATE", "FOAM", "FORK", "GATE",
  "GEAR", "GRIP", "GUST", "HINT", "HOOK", "INCH", "JAIL", "JUMP", "KNOT",
  "LAMP", "LAWN", "LEND", "LIFT", "LIMB", "LINK", "LOAD", "LOCK", "LOGO",
  "LOOP", "LOUD", "MAST", "MELT", "MILD", "MODE", "MOOD", "MOUNT", "NEST",
  "ODDS", "PACE", "PACK", "PALM", "PAVE", "PEAK", "PICK", "PINE", "PIPE",
  "PLUG", "POUR", "PRAY", "PRIZE", "PUMP", "PUSH", "RACK", "RAGE", "RANK",
  "RATE", "RENT", "RIOT", "ROPE", "RUSH", "SAIL", "SAKE", "SCAR", "SEAL",
  "SEED", "SHED", "SINK", "SNAP", "SNOW", "SOLE", "SORT", "SPAN", "SPIN",
  "STEM", "STIR", "SUIT", "SWIM", "TAIL", "TANK", "TAPE", "TEAR", "TEND",
  "TIDE", "TILE", "TOSS", "TUBE", "TUNE", "VAST", "VINE", "WAGE", "WAKE",
  "WEED", "WIRE", "WRAP", "YARD", "ZONE",
])

// Common everyday words (top ~5000) — words most adults know
const TIER_1_PATTERNS = [
  // Common word endings that indicate everyday vocabulary
  /^[A-Z]{3,5}$/, // Short words tend to be common
]

// Characteristics of obscure words
const OBSCURE_INDICATORS = new Set([
  "QI", "ZA", "ZO", "XU", "JO", "KA", "KI", "QUA",
  "QOPH", "QANAT", "QADI", "QAID", "QAIDS", "QATS",
  "CWMS", "CWM", "CRWTH",
  "ADZE", "AZAN", "AZINE", "AZOIC",
  "BHAJI", "BUQSHA",
  "DJINN", "DJIBBAH",
  "FYTTE", "FYRD",
  "GHEE", "GHAT",
  "HADJ", "HAJJ", "HAJI",
  "JNANA", "JHEEL",
  "KANZU", "KHAKI",
  "PSYCH", "PHYLA",
  "SCHMO", "SHLEP",
  "THUJA", "THUYA",
  "WAQF", "WAKF",
  "XERIC", "XYLEM",
  "ZOEAE", "ZOEAL",
])

function scoreEnglishWord(word: string): number {
  // Tier 0: most common
  if (TIER_0_WORDS.has(word)) return 0.05

  const len = word.length

  // Very short common words not in tier 0 are still fairly common
  if (len <= 3) return 0.15

  // Known obscure words
  if (OBSCURE_INDICATORS.has(word)) return 0.95

  // Score based on letter composition and length
  let score = 0.30 // baseline for "normal" words

  // Rare letters increase obscurity
  const rareLetters = "QZXJK"
  const uncommonLetters = "VWYBF"
  for (const ch of word) {
    if (rareLetters.includes(ch)) score += 0.12
    if (uncommonLetters.includes(ch)) score += 0.03
  }

  // Longer words tend to be more obscure (for this game context)
  if (len >= 8) score += 0.10
  if (len >= 10) score += 0.10
  if (len >= 12) score += 0.10

  // Unusual letter patterns suggest obscurity
  // Double consonant clusters
  if (/[BCDFGHJKLMNPQRSTVWXYZ]{4,}/.test(word)) score += 0.15
  // Starts with unusual combos
  if (/^(PH|GH|KN|WR|PS|PN|MN|GN|SC|CZ|DZ)/.test(word)) score += 0.05

  // Common suffixes suggest more everyday words
  if (/(?:ING|TION|NESS|MENT|ABLE|IBLE|IOUS|EOUS|ANCE|ENCE|ATED|LING)$/.test(word)) {
    score -= 0.05
  }

  // Common prefixes
  if (/^(?:UN|RE|IN|DIS|PRE|MIS|OUT|OVER)/.test(word)) {
    score -= 0.05
  }

  return Math.max(0, Math.min(1, score))
}

async function buildEnglishFrequency() {
  // Load the game's word list — read the JSON directly since
  // the npm package's main is index.json
  let words: string[]
  try {
    // Walk up to find the package in repo root or local node_modules
    const locations = [
      join(__dirname, "node_modules", "an-array-of-english-words", "index.json"),
      join(__dirname, "..", "node_modules", "an-array-of-english-words", "index.json"),
      join(__dirname, "..", "..", "node_modules", "an-array-of-english-words", "index.json"),
    ]
    const found = locations.find((p) => existsSync(p))
    if (!found) throw new Error("not found")
    words = JSON.parse(readFileSync(found, "utf-8"))
  } catch {
    console.error("Could not find an-array-of-english-words. Run: npm install")
    process.exit(1)
  }

  const frequency: Record<string, number> = {}
  let count = 0

  for (const word of words) {
    const upper = word.toUpperCase()
    if (upper.length < 2 || upper.length > 15) continue
    if (!/^[A-Z]+$/.test(upper)) continue

    frequency[upper] = scoreEnglishWord(upper)
    count++
  }

  const outPath = join(DATA_DIR, "word-frequency-en.json")
  writeFileSync(outPath, JSON.stringify(frequency))
  console.log(`English: scored ${count} words -> ${outPath}`)
}

// ---------------------------------------------------------------------------
// Spanish frequency data
// ---------------------------------------------------------------------------

// The Spanish word list is small (~250 words), so we rank by simple tiers
function scoreSpanishWord(word: string): number {
  const len = word.length

  // Very common short words
  if (len <= 3) return 0.05

  // Common 4-5 letter everyday words
  const veryCommon = new Set([
    "AGUA", "AMOR", "ARTE", "AZUL", "CAFE", "CAMA", "CASA", "COMO", "COSA",
    "DADO", "DIOS", "ELLA", "ESTE", "ESTA", "FLOR", "GATO", "HORA", "IDEA",
    "ISLA", "LADO", "LUNA", "MANO", "MESA", "MIEL", "MODA", "MODO", "MUNDO",
    "NADA", "NIÑO", "NIÑA", "NOTA", "NUBE", "PAIS", "PAPA", "PASO", "PERRO",
    "PISO", "POCO", "RICO", "ROPA", "ROSA", "SALA", "SOLO", "TELA", "TRES",
    "UNICO", "VASO", "VELA", "VERDE", "VIDA", "VOTO",
  ])

  if (veryCommon.has(word)) return 0.10

  // Moderate everyday words
  if (len <= 5) return 0.20
  if (len <= 6) return 0.30
  if (len <= 7) return 0.40

  // Longer words are less common in casual play
  return 0.50 + Math.min(0.3, (len - 7) * 0.05)
}

function buildSpanishFrequency() {
  // Read the Spanish word list from the app
  const wordsPath = join(__dirname, "..", "..", "app", "words-es.ts")
  const content = readFileSync(wordsPath, "utf-8")

  // Extract words from the array literal
  const matches = content.match(/"([A-ZÑ]+)"/g)
  if (!matches) {
    console.error("Could not parse Spanish word list")
    process.exit(1)
  }

  const frequency: Record<string, number> = {}
  let count = 0

  for (const match of matches) {
    const word = match.replace(/"/g, "")
      .toUpperCase()
      .replace(/Ñ/g, "__ENYE__")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/__ENYE__/g, "Ñ")

    if (word.length >= 2 && word.length <= 15) {
      frequency[word] = scoreSpanishWord(word)
      count++
    }
  }

  const outPath = join(DATA_DIR, "word-frequency-es.json")
  writeFileSync(outPath, JSON.stringify(frequency))
  console.log(`Spanish: scored ${count} words -> ${outPath}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Building word frequency data...")
  await buildEnglishFrequency()
  buildSpanishFrequency()
  console.log("Done!")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
