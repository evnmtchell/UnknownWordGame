-- =============================================
-- Share Link Tracking
-- =============================================

-- Each share action creates a link
CREATE TABLE IF NOT EXISTS share_links (
    id          SERIAL PRIMARY KEY,
    ref_code    TEXT UNIQUE NOT NULL,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    puzzle_date DATE NOT NULL,
    puzzle_mode TEXT NOT NULL CHECK (puzzle_mode IN ('easy', 'hard')),
    best_score  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_links_user ON share_links(user_id);
CREATE INDEX IF NOT EXISTS idx_share_links_ref ON share_links(ref_code);

-- Each click on a share link
CREATE TABLE IF NOT EXISTS share_clicks (
    id          SERIAL PRIMARY KEY,
    ref_code    TEXT NOT NULL REFERENCES share_links(ref_code) ON DELETE CASCADE,
    visitor_id  UUID,
    clicked_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_clicks_ref ON share_clicks(ref_code);

-- Track if a click led to the clicker sharing (viral chain)
-- parent_ref is the link they arrived from, child_ref is the link they created
CREATE TABLE IF NOT EXISTS share_chains (
    id          SERIAL PRIMARY KEY,
    parent_ref  TEXT NOT NULL REFERENCES share_links(ref_code) ON DELETE CASCADE,
    child_ref   TEXT NOT NULL REFERENCES share_links(ref_code) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(parent_ref, child_ref)
);

CREATE INDEX IF NOT EXISTS idx_share_chains_parent ON share_chains(parent_ref);
