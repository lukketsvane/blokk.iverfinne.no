// Linear level progression — tracks which puzzle you're on, which you've
// solved, and your best (fewest-move) solution per level, persisted to
// localStorage so progress survives reloads. Pure + framework-agnostic.

const STORAGE_KEY = "blokk:progress:v1"

export type Progress = {
  current: number // index into the level order
  solved: string[] // ids of solved levels
  best: Record<string, number> // fewest moves per solved level id
}

const EMPTY: Progress = { current: 0, solved: [], best: {} }

function load(): Progress {
  if (typeof window === "undefined") return { ...EMPTY, best: {} }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<Progress>
      return {
        current: p.current ?? 0,
        solved: Array.isArray(p.solved) ? p.solved : [],
        best: p.best && typeof p.best === "object" ? p.best : {},
      }
    }
  } catch {
    // ignore corrupt/blocked storage
  }
  return { ...EMPTY, best: {} }
}

function save(p: Progress) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    // ignore quota/privacy errors
  }
}

export function getProgress(): Progress {
  return load()
}

export function isSolved(id: string): boolean {
  return load().solved.includes(id)
}

/** Record a solve (idempotent) and keep the fewest-move count. */
export function markSolved(id: string, moves: number) {
  const p = load()
  if (!p.solved.includes(id)) p.solved.push(id)
  const prev = p.best[id]
  if (prev === undefined || moves < prev) p.best[id] = moves
  save(p)
}

/** Set the active level index (clamped by the caller to the level count). */
export function setCurrent(index: number) {
  const p = load()
  p.current = Math.max(0, index)
  save(p)
}

export function resetProgress() {
  save({ ...EMPTY, best: {} })
}
