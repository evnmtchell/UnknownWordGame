-- =============================================
-- Lexicon Word Game - Initial Database Schema
-- =============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================
-- USERS
-- =====================
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT UNIQUE NOT NULL,
    email         TEXT UNIQUE,
    password_hash TEXT,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- PUZZLES
-- =====================
CREATE TABLE IF NOT EXISTS puzzles (
    id            SERIAL PRIMARY KEY,
    date          DATE NOT NULL,
    mode          TEXT NOT NULL CHECK (mode IN ('easy', 'hard')),
    board_size    INT NOT NULL,
    rack          JSONB NOT NULL,
    filled_cells  JSONB NOT NULL,
    bonus_cells   JSONB NOT NULL,
    optimal_score INT NOT NULL,
    optimal_words JSONB NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE (date, mode)
);

CREATE INDEX IF NOT EXISTS idx_puzzles_date ON puzzles(date);

-- =====================
-- GAME SESSIONS
-- =====================
CREATE TABLE IF NOT EXISTS game_sessions (
    id              SERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    puzzle_id       INT NOT NULL REFERENCES puzzles(id),
    attempts_left   INT NOT NULL DEFAULT 3,
    best_score      INT NOT NULL DEFAULT 0,
    attempt_history JSONB NOT NULL DEFAULT '[]',
    hint_used       BOOLEAN DEFAULT FALSE,
    hint_level      INT DEFAULT 0,
    completed       BOOLEAN DEFAULT FALSE,
    rating          TEXT,
    started_at      TIMESTAMPTZ DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_user_puzzle
    ON game_sessions(user_id, puzzle_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user
    ON game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_completed
    ON game_sessions(completed_at) WHERE completed = TRUE;

-- =====================
-- USER STATS
-- =====================
CREATE TABLE IF NOT EXISTS user_stats (
    user_id                UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    games_played           INT DEFAULT 0,
    current_streak         INT DEFAULT 0,
    max_streak             INT DEFAULT 0,
    perfect_current_streak INT DEFAULT 0,
    perfect_max_streak     INT DEFAULT 0,
    last_played_date       DATE,
    last_perfect_date      DATE,
    rating_counts          JSONB DEFAULT '{}',
    updated_at             TIMESTAMPTZ DEFAULT now()
);
