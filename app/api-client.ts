const API_BASE = "https://api-lexicon.plantos.co"
const VISITOR_ID_KEY = "daily-word-game-visitor-id"

function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(VISITOR_ID_KEY, id)
  }
  return id
}

export async function saveSession(data: {
  date: string
  mode: string
  attempts_left: number
  best_score: number
  attempt_history: unknown[]
  hint_used: boolean
  hint_level: number
  completed: boolean
  rating: string | null
  submitted_words: unknown[]
  submitted_score: number
  message: string
}): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, visitor_id: getVisitorId() }),
    })
  } catch {
    // Silent fail — localStorage is the primary store for now
  }
}

export async function saveStats(data: {
  games_played: number
  current_streak: number
  max_streak: number
  perfect_current_streak: number
  perfect_max_streak: number
  last_played_date: string | null
  last_perfect_date: string | null
  rating_counts: Record<string, number>
}): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/stats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, visitor_id: getVisitorId() }),
    })
  } catch {
    // Silent fail — localStorage is the primary store for now
  }
}
