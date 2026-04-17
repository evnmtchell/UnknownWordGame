const API_BASE = "https://api-lexicon.plantos.co"
const TOKEN_KEY = "lexicon-auth-token"
const USER_KEY = "lexicon-auth-user"

type AuthState = {
  token: string
  user_id: string
  username: string
  anon: boolean
}

let authState: AuthState | null = null

function getStoredAuth(): AuthState | null {
  if (authState) return authState
  try {
    const stored = localStorage.getItem(TOKEN_KEY)
    if (stored) {
      authState = JSON.parse(stored)
      return authState
    }
  } catch {
    // ignore
  }
  return null
}

function storeAuth(auth: AuthState) {
  authState = auth
  localStorage.setItem(TOKEN_KEY, JSON.stringify(auth))
}

function clearAuth() {
  authState = null
  localStorage.removeItem(TOKEN_KEY)
}

async function ensureAuth(): Promise<AuthState> {
  const existing = getStoredAuth()
  if (existing) return existing

  // Get anonymous token
  const res = await fetch(`${API_BASE}/auth/token`)
  if (!res.ok) throw new Error("Failed to get auth token")
  const data = await res.json()
  const auth: AuthState = {
    token: data.token,
    user_id: data.user_id,
    username: data.username,
    anon: data.anon,
  }
  storeAuth(auth)
  return auth
}

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const auth = await ensureAuth()
  const headers = {
    ...options.headers as Record<string, string>,
    Authorization: `Bearer ${auth.token}`,
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  // If token expired, get a new one and retry once
  if (res.status === 401) {
    clearAuth()
    const newAuth = await ensureAuth()
    const retryHeaders = {
      ...options.headers as Record<string, string>,
      Authorization: `Bearer ${newAuth.token}`,
    }
    return fetch(`${API_BASE}${path}`, { ...options, headers: retryHeaders })
  }

  return res
}

// ==========================================
// AUTH FUNCTIONS
// ==========================================

export async function register(username: string, email: string, password: string): Promise<AuthState> {
  const auth = getStoredAuth()
  const endpoint = auth?.anon ? "/auth/upgrade" : "/auth/register"
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (auth?.token) headers.Authorization = `Bearer ${auth.token}`

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ username, email, password }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || "Registration failed")
  }

  const data = await res.json()
  const newAuth: AuthState = {
    token: data.token,
    user_id: data.user_id,
    username: data.username,
    anon: false,
  }
  storeAuth(newAuth)
  return newAuth
}

export async function login(username: string, password: string): Promise<AuthState> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || "Login failed")
  }

  const data = await res.json()
  const newAuth: AuthState = {
    token: data.token,
    user_id: data.user_id,
    username: data.username,
    anon: false,
  }
  storeAuth(newAuth)
  return newAuth
}

export function logout() {
  clearAuth()
}

export function getAuthState(): AuthState | null {
  return getStoredAuth()
}

export function isLoggedIn(): boolean {
  const auth = getStoredAuth()
  return auth !== null && !auth.anon
}

export function loginWithGoogle() {
  window.location.href = `${API_BASE}/auth/google`
}

export function loginWithApple() {
  window.location.href = `${API_BASE}/auth/apple`
}

export function handleOAuthCallback(): AuthState | null {
  const params = new URLSearchParams(window.location.search)
  const token = params.get("token")
  const username = params.get("username")
  const userId = params.get("user_id")
  const authError = params.get("auth_error")

  if (authError) {
    // Clean URL
    window.history.replaceState({}, "", window.location.pathname)
    return null
  }

  if (token && username && userId) {
    const auth: AuthState = { token, user_id: userId, username, anon: false }
    storeAuth(auth)
    // Clean URL
    window.history.replaceState({}, "", window.location.pathname)
    return auth
  }

  return null
}

// ==========================================
// DATA FUNCTIONS
// ==========================================

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
    await authFetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
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
    await authFetch("/api/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
  } catch {
    // Silent fail — localStorage is the primary store for now
  }
}
