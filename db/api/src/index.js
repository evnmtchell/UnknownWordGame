import express from "express"
import cors from "cors"
import pg from "pg"

const { Pool } = pg

const pool = new Pool({
  user: "lexicon",
  database: "lexicon",
  host: "localhost",
  port: 5432,
  password: process.env.POSTGRES_PASSWORD || "lexicon",
})

const app = express()
app.use(cors())
app.use(express.json())

// Health check
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1")
    res.json({ status: "ok" })
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message })
  }
})

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

// POST /api/puzzles — insert/update a puzzle
app.post("/api/puzzles", async (req, res) => {
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
  const { visitor_id, date, mode } = req.query

  if (!visitor_id || !date) {
    return res.status(400).json({ error: "visitor_id and date required" })
  }

  try {
    const { rows } = await pool.query(
      `SELECT gs.* FROM game_sessions gs
       JOIN puzzles p ON gs.puzzle_id = p.id
       WHERE gs.user_id = $1 AND p.date = $2 AND p.mode = $3`,
      [visitor_id, date, mode || "easy"]
    )

    res.json(rows[0] || null)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/sessions — save game session
app.post("/api/sessions", async (req, res) => {
  const body = req.body

  if (!body.visitor_id || !body.date) {
    return res.status(400).json({ error: "visitor_id and date required" })
  }

  try {
    // Ensure visitor exists in users table
    await pool.query(
      `INSERT INTO users (id, username)
       VALUES ($1, $1)
       ON CONFLICT (id) DO NOTHING`,
      [body.visitor_id]
    )

    // Get puzzle id
    const puzzleResult = await pool.query(
      "SELECT id FROM puzzles WHERE date = $1 AND mode = $2",
      [body.date, body.mode || "easy"]
    )

    if (puzzleResult.rows.length === 0) {
      return res.status(404).json({ error: "Puzzle not found" })
    }

    const puzzleId = puzzleResult.rows[0].id

    // Upsert game session
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
        body.visitor_id,
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
  const { visitor_id } = req.query

  if (!visitor_id) {
    return res.status(400).json({ error: "visitor_id required" })
  }

  try {
    const { rows } = await pool.query(
      "SELECT * FROM user_stats WHERE user_id = $1",
      [visitor_id]
    )

    res.json(rows[0] || null)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/stats — save user stats
app.post("/api/stats", async (req, res) => {
  const body = req.body

  if (!body.visitor_id) {
    return res.status(400).json({ error: "visitor_id required" })
  }

  try {
    // Ensure visitor exists
    await pool.query(
      `INSERT INTO users (id, username)
       VALUES ($1, $1)
       ON CONFLICT (id) DO NOTHING`,
      [body.visitor_id]
    )

    // Upsert stats
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
        body.visitor_id,
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
