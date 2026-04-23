-- =============================================
-- 004: Puzzle Generator Support
-- Adds locale, difficulty scoring, and mini mode
-- =============================================

-- 1. Add locale column (existing rows default to 'en')
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en';

-- 2. Update mode constraint to allow 'mini'
ALTER TABLE puzzles DROP CONSTRAINT IF EXISTS puzzles_mode_check;
ALTER TABLE puzzles ADD CONSTRAINT puzzles_mode_check
    CHECK (mode IN ('easy', 'hard', 'mini'));

-- 3. Replace unique constraint: (date, mode) -> (date, mode, locale)
ALTER TABLE puzzles DROP CONSTRAINT IF EXISTS puzzles_date_mode_key;
ALTER TABLE puzzles ADD CONSTRAINT puzzles_date_mode_locale_key
    UNIQUE (date, mode, locale);

-- 4. Difficulty tracking columns
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS difficulty_score REAL;
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS difficulty_breakdown JSONB;
ALTER TABLE puzzles ADD COLUMN IF NOT EXISTS generator_version INT DEFAULT 1;

-- 5. Index for efficient lookup by date + locale
CREATE INDEX IF NOT EXISTS idx_puzzles_date_locale
    ON puzzles(date, locale);
