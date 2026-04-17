import express from "express"
import cors from "cors"
import pg from "pg"
import jwt from "jsonwebtoken"
import bcrypt from "bcrypt"
import { readFileSync } from "fs"

const { Pool } = pg

const pool = new Pool({
  user: "lexicon",
  database: "lexicon",
  host: "localhost",
  port: 5432,
  password: process.env.POSTGRES_PASSWORD || "lexicon",
})

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.error("JWT_SECRET environment variable is required")
  process.exit(1)
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const FRONTEND_URL = process.env.FRONTEND_URL || "https://dinkdaddy.org"

const ALLOWED_ORIGINS = [
  "https://dinkdaddy.org",
  "https://unknown-word-game.pages.dev",
  "https://lexicon.plantos.co",
  "http://localhost:3000",
]

const app = express()

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true)
    callback(new Error("Not allowed by CORS"))
  },
  credentials: true,
}))

app.use(express.json())

// ==========================================
// JWT HELPERS
// ==========================================

function signToken(user) {
  return jwt.sign(
    { user_id: user.id, username: user.username, anon: user.anon || false },
    JWT_SECRET,
    { expiresIn: "30d" }
  )
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization required" })
  }

  try {
    const token = header.slice(7)
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = payload
    next()
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" })
  }
}

// ==========================================
// AUTH ROUTES (no auth required)
// ==========================================

// GET /auth/token — issue anonymous JWT
app.get("/auth/token", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (username) VALUES ($1) RETURNING *`,
      [`anon-${crypto.randomUUID().slice(0, 8)}`]
    )
    const user = rows[0]
    const token = signToken({ ...user, anon: true })
    res.json({ token, user_id: user.id, username: user.username, anon: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /auth/register
app.post("/auth/register", async (req, res) => {
  const { username, email, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" })
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10)
    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, created_at`,
      [username, email || null, passwordHash]
    )
    const user = rows[0]
    const token = signToken({ ...user, anon: false })
    res.json({ token, user_id: user.id, username: user.username, anon: false })
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Username or email already taken" })
    }
    res.status(500).json({ error: err.message })
  }
})

// POST /auth/login
app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" })
  }

  try {
    const { rows } = await pool.query(
      "SELECT id, username, email, password_hash FROM users WHERE username = $1",
      [username]
    )

    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid username or password" })
    }

    const user = rows[0]
    if (!user.password_hash) {
      return res.status(401).json({ error: "This is an anonymous account. Please register." })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ error: "Invalid username or password" })
    }

    const token = signToken({ ...user, anon: false })
    res.json({ token, user_id: user.id, username: user.username, anon: false })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /auth/upgrade — upgrade anonymous account to registered
app.post("/auth/upgrade", authMiddleware, async (req, res) => {
  const { username, email, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" })
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10)
    const { rows } = await pool.query(
      `UPDATE users SET username = $1, email = $2, password_hash = $3, updated_at = now()
       WHERE id = $4
       RETURNING id, username, email, created_at`,
      [username, email || null, passwordHash, req.user.user_id]
    )

    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found" })
    }

    const user = rows[0]
    const token = signToken({ ...user, anon: false })
    res.json({ token, user_id: user.id, username: user.username, anon: false })
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Username or email already taken" })
    }
    res.status(500).json({ error: err.message })
  }
})

// ==========================================
// GOOGLE SSO
// ==========================================

// GET /auth/google — redirect to Google consent screen
app.get("/auth/google", (_req, res) => {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: "https://api-lexicon.plantos.co/auth/google/callback",
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
  })
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
})

// GET /auth/google/callback — handle Google OAuth callback
app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query
  if (!code) return res.status(400).send("Missing code")

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: "https://api-lexicon.plantos.co/auth/google/callback",
        grant_type: "authorization_code",
      }),
    })
    const tokens = await tokenRes.json()
    if (!tokens.id_token) throw new Error("No id_token from Google")

    // Decode the ID token to get user info
    const payload = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString())
    const { email, name, sub: googleId } = payload

    // Find or create user
    let { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email])

    if (rows.length === 0) {
      const result = await pool.query(
        `INSERT INTO users (username, email) VALUES ($1, $2) RETURNING *`,
        [name || email.split("@")[0], email]
      )
      rows = result.rows
    }

    const user = rows[0]
    const jwtToken = signToken({ ...user, anon: false })

    // Redirect back to frontend with token
    res.redirect(`${FRONTEND_URL}?token=${encodeURIComponent(jwtToken)}&username=${encodeURIComponent(user.username)}&user_id=${user.id}`)
  } catch (err) {
    console.error("Google auth error:", err)
    res.redirect(`${FRONTEND_URL}?auth_error=${encodeURIComponent("Google sign in failed")}`)
  }
})

// ==========================================
// APPLE SSO
// ==========================================

let applePrivateKey = null
try {
  applePrivateKey = readFileSync("/var/lib/secrets/apple-key.p8", "utf8")
} catch {
  console.warn("Apple private key not found at /var/lib/secrets/apple-key.p8 — Apple SSO disabled")
}

function generateAppleClientSecret() {
  const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID
  const APPLE_KEY_ID = process.env.APPLE_KEY_ID
  const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID

  if (!applePrivateKey) throw new Error("Apple private key not configured")

  return jwt.sign({}, applePrivateKey, {
    algorithm: "ES256",
    expiresIn: "180d",
    audience: "https://appleid.apple.com",
    issuer: APPLE_TEAM_ID,
    subject: APPLE_CLIENT_ID,
    keyid: APPLE_KEY_ID,
  })
}

// GET /auth/apple — redirect to Apple consent screen
app.get("/auth/apple", (_req, res) => {
  const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID
  const params = new URLSearchParams({
    client_id: APPLE_CLIENT_ID,
    redirect_uri: "https://api-lexicon.plantos.co/auth/apple/callback",
    response_type: "code",
    scope: "name email",
    response_mode: "form_post",
  })
  res.redirect(`https://appleid.apple.com/auth/authorize?${params}`)
})

// POST /auth/apple/callback — handle Apple OAuth callback
app.post("/auth/apple/callback", express.urlencoded({ extended: true }), async (req, res) => {
  const { code, user: appleUser } = req.body
  if (!code) return res.status(400).send("Missing code")

  try {
    const clientSecret = generateAppleClientSecret()
    const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID

    // Exchange code for tokens
    const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: APPLE_CLIENT_ID,
        client_secret: clientSecret,
        redirect_uri: "https://api-lexicon.plantos.co/auth/apple/callback",
        grant_type: "authorization_code",
      }),
    })
    const tokens = await tokenRes.json()
    if (!tokens.id_token) throw new Error("No id_token from Apple")

    // Decode the ID token
    const payload = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString())
    const { email, sub: appleId } = payload

    // Apple only sends name on first auth — parse it if available
    let name = null
    if (appleUser) {
      try {
        const parsed = typeof appleUser === "string" ? JSON.parse(appleUser) : appleUser
        name = [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean).join(" ")
      } catch { /* ignore */ }
    }

    // Find or create user
    let { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email])

    if (rows.length === 0) {
      const username = name || (email ? email.split("@")[0] : `apple-${appleId.slice(0, 8)}`)
      const result = await pool.query(
        `INSERT INTO users (username, email) VALUES ($1, $2) RETURNING *`,
        [username, email]
      )
      rows = result.rows
    }

    const user = rows[0]
    const jwtToken = signToken({ ...user, anon: false })

    // Redirect back to frontend with token
    res.redirect(`${FRONTEND_URL}?token=${encodeURIComponent(jwtToken)}&username=${encodeURIComponent(user.username)}&user_id=${user.id}`)
  } catch (err) {
    console.error("Apple auth error:", err)
    res.redirect(`${FRONTEND_URL}?auth_error=${encodeURIComponent("Apple sign in failed")}`)
  }
})

// ==========================================
// HEALTH CHECK (no auth)
// ==========================================

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1")
    res.json({ status: "ok" })
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message })
  }
})

// ==========================================
// PROTECTED API ROUTES (JWT required)
// ==========================================

app.use("/api", authMiddleware)

// GET /api/puzzles — list available puzzle dates
app.get("/api/puzzles", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT date, mode, board_size, optimal_score FROM puzzles WHERE date <= CURRENT_DATE ORDER BY date DESC"
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/puzzles/:date — fetch puzzle by date
app.get("/api/puzzles/:date", async (req, res) => {
  const { date } = req.params
  const mode = req.query.mode || "easy"

  try {
    const { rows } = await pool.query(
      "SELECT * FROM puzzles WHERE date = $1 AND mode = $2",
      [date, mode]
    )

    if (rows.length === 0) {
      return res.status(404).json({ error: "Puzzle not found" })
    }

    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/puzzles — insert/update a puzzle (admin only)
app.post("/api/puzzles", async (req, res) => {
  const adminKey = req.headers["x-admin-key"]
  if (adminKey !== process.env.JWT_SECRET) {
    return res.status(403).json({ error: "Admin access required" })
  }

  const body = req.body

  if (!body.date || !body.mode) {
    return res.status(400).json({ error: "date and mode required" })
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO puzzles (date, mode, board_size, rack, filled_cells, bonus_cells, optimal_score, optimal_words)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (date, mode)
       DO UPDATE SET
         board_size = $3,
         rack = $4,
         filled_cells = $5,
         bonus_cells = $6,
         optimal_score = $7,
         optimal_words = $8
       RETURNING *`,
      [
        body.date,
        body.mode,
        body.board_size,
        JSON.stringify(body.rack),
        JSON.stringify(body.filled_cells),
        JSON.stringify(body.bonus_cells),
        body.optimal_score,
        JSON.stringify(body.optimal_words),
      ]
    )

    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/sessions — load game session
app.get("/api/sessions", async (req, res) => {
  const { date, mode } = req.query
  const userId = req.user.user_id

  if (!date) {
    return res.status(400).json({ error: "date required" })
  }

  try {
    const { rows } = await pool.query(
      `SELECT gs.* FROM game_sessions gs
       JOIN puzzles p ON gs.puzzle_id = p.id
       WHERE gs.user_id = $1 AND p.date = $2 AND p.mode = $3`,
      [userId, date, mode || "easy"]
    )

    res.json(rows[0] || null)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/sessions — save game session
app.post("/api/sessions", async (req, res) => {
  const body = req.body
  const userId = req.user.user_id

  if (!body.date) {
    return res.status(400).json({ error: "date required" })
  }

  try {
    const puzzleResult = await pool.query(
      "SELECT id FROM puzzles WHERE date = $1 AND mode = $2",
      [body.date, body.mode || "easy"]
    )

    if (puzzleResult.rows.length === 0) {
      return res.status(404).json({ error: "Puzzle not found" })
    }

    const puzzleId = puzzleResult.rows[0].id

    const { rows } = await pool.query(
      `INSERT INTO game_sessions (user_id, puzzle_id, attempts_left, best_score, attempt_history, hint_used, hint_level, completed, rating, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id, puzzle_id)
       DO UPDATE SET
         attempts_left = $3,
         best_score = $4,
         attempt_history = $5,
         hint_used = $6,
         hint_level = $7,
         completed = $8,
         rating = $9,
         completed_at = $10
       RETURNING *`,
      [
        userId,
        puzzleId,
        body.attempts_left,
        body.best_score,
        JSON.stringify(body.attempt_history),
        body.hint_used,
        body.hint_level,
        body.completed,
        body.rating,
        body.completed ? new Date().toISOString() : null,
      ]
    )

    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/stats — load user stats
app.get("/api/stats", async (req, res) => {
  const userId = req.user.user_id

  try {
    const { rows } = await pool.query(
      "SELECT * FROM user_stats WHERE user_id = $1",
      [userId]
    )

    res.json(rows[0] || null)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/stats — save user stats
app.post("/api/stats", async (req, res) => {
  const body = req.body
  const userId = req.user.user_id

  try {
    const { rows } = await pool.query(
      `INSERT INTO user_stats (user_id, games_played, current_streak, max_streak, perfect_current_streak, perfect_max_streak, last_played_date, last_perfect_date, rating_counts, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (user_id)
       DO UPDATE SET
         games_played = $2,
         current_streak = $3,
         max_streak = $4,
         perfect_current_streak = $5,
         perfect_max_streak = $6,
         last_played_date = $7,
         last_perfect_date = $8,
         rating_counts = $9,
         updated_at = now()
       RETURNING *`,
      [
        userId,
        body.games_played,
        body.current_streak,
        body.max_streak,
        body.perfect_current_streak,
        body.perfect_max_streak,
        body.last_played_date,
        body.last_perfect_date,
        JSON.stringify(body.rating_counts),
      ]
    )

    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

const port = process.env.PORT || 3100
app.listen(port, "0.0.0.0", () => {
  console.log(`Lexicon API listening on port ${port}`)
})
