// Level generator + BFS solver for bl.okk.
//
// The board is a grid of 15 mm cells. Pieces are the five klossete blocks:
//   plank-long  2×5  (axis-locked: slides only along its long axis)
//   plank-short 2×4  (axis-locked)
//   cube        2×2  (free: slides both axes)
//   orange      3×3  (free)
//   cylinder    2×2  (free) — the hero; it must reach the exit gap in the top
//                     wall (row 0) at column `gapX` and slide out.
//
// A move is one slide of one piece any distance in one direction (Unblock Me
// counting). For each level spec we scatter pieces at random, BFS-solve, and
// keep the hardest layout whose minimum solution lands inside the target band.
//
// Usage: node scripts/generate-levels.mjs   (writes lib/levels.json)

import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const CELLS = {
  "plank-long": [2, 5],
  "plank-short": [2, 4],
  cube: [2, 2],
  orange: [3, 3],
  cylinder: [2, 2],
}
const LOCKED = { "plank-long": true, "plank-short": true, cube: false, orange: false, cylinder: false }

// mulberry32 – deterministic randomness so the generated set is reproducible
function mulberry(seed) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function fp(kind, rot) {
  const [w, h] = CELLS[kind]
  return rot ? [h, w] : [w, h]
}

// ---- BFS solver ----------------------------------------------------------
// state: Int8Array of [x,y] per piece; hero is piece 0.
function solve(level, cap = 400000) {
  const { cols, rows, gapX, pieces } = level
  const n = pieces.length
  const dims = pieces.map((p) => fp(p.kind, p.rot))
  const dirsFor = pieces.map((p, i) => {
    const [w, h] = dims[i]
    if (!LOCKED[p.kind]) return [ [1,0], [-1,0], [0,1], [0,-1] ]
    return h > w ? [ [0,1], [0,-1] ] : [ [1,0], [-1,0] ]
  })

  const start = new Int8Array(n * 2)
  pieces.forEach((p, i) => {
    start[i * 2] = p.x
    start[i * 2 + 1] = p.y
  })

  const key = (s) => String.fromCharCode(...s)
  const isWin = (s) => s[1] === 0 && s[0] === gapX

  if (isWin(start)) return { moves: 0 }
  const seen = new Set([key(start)])
  let frontier = [start]
  let depth = 0
  let nodes = 0

  while (frontier.length) {
    depth++
    const next = []
    for (const s of frontier) {
      // occupancy grid for fast slide checks
      const occ = new Int8Array(cols * rows).fill(-1)
      for (let i = 0; i < n; i++) {
        const [w, h] = dims[i]
        for (let dy = 0; dy < h; dy++)
          for (let dx = 0; dx < w; dx++) occ[(s[i * 2 + 1] + dy) * cols + s[i * 2] + dx] = i
      }
      for (let i = 0; i < n; i++) {
        const [w, h] = dims[i]
        for (const [dx, dy] of dirsFor[i]) {
          let x = s[i * 2]
          let y = s[i * 2 + 1]
          for (let step = 1; ; step++) {
            x += dx
            y += dy
            if (x < 0 || y < 0 || x + w > cols || y + h > rows) break
            // the leading edge must be free
            let blocked = false
            if (dx !== 0) {
              const ex = dx > 0 ? x + w - 1 : x
              for (let k = 0; k < h && !blocked; k++) {
                const o = occ[(y + k) * cols + ex]
                if (o !== -1 && o !== i) blocked = true
              }
            } else {
              const ey = dy > 0 ? y + h - 1 : y
              for (let k = 0; k < w && !blocked; k++) {
                const o = occ[ey * cols + x + k]
                if (o !== -1 && o !== i) blocked = true
              }
            }
            if (blocked) break
            const child = new Int8Array(s)
            child[i * 2] = x
            child[i * 2 + 1] = y
            const k2 = key(child)
            if (!seen.has(k2)) {
              if (isWin(child)) return { moves: depth }
              seen.add(k2)
              next.push(child)
              if (++nodes > cap) return { moves: -1 } // too big — treat as unusable
            }
          }
        }
      }
    }
    frontier = next
  }
  return { moves: -1 } // unsolvable
}

// ---- random layout -------------------------------------------------------
function randomLayout(spec, rnd) {
  const { cols, rows, mix } = spec
  const occ = new Int8Array(cols * rows).fill(0)
  const pieces = []

  const canPlace = (x, y, w, h) => {
    if (x < 0 || y < 0 || x + w > cols || y + h > rows) return false
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) if (occ[(y + dy) * cols + x + dx]) return false
    return true
  }
  const place = (kind, x, y, rot) => {
    const [w, h] = fp(kind, rot)
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) occ[(y + dy) * cols + x + dx] = 1
    pieces.push({ kind, x, y, rot })
  }

  // hero first — never spawn already in the winning column's top rows
  for (let tries = 0; ; tries++) {
    if (tries > 200) return null
    const x = Math.floor(rnd() * (cols - 1))
    const y = 2 + Math.floor(rnd() * (rows - 4))
    if (canPlace(x, y, 2, 2)) {
      place("cylinder", x, y, 0)
      break
    }
  }
  for (const kind of mix) {
    let done = false
    for (let tries = 0; tries < 300 && !done; tries++) {
      const rot = LOCKED[kind] ? (rnd() < 0.5 ? 0 : 1) : 0
      const [w, h] = fp(kind, rot)
      const x = Math.floor(rnd() * (cols - w + 1))
      const y = Math.floor(rnd() * (rows - h + 1))
      if (canPlace(x, y, w, h)) {
        place(kind, x, y, rot)
        done = true
      }
    }
    if (!done) return null
  }
  return pieces
}

// ---- level specs ---------------------------------------------------------
// mix = blockers beyond the hero. band = [min,max] acceptable minimum moves.
// gap = where the 2-wide exit sits in the top wall (defaults to centred).
const PL = "plank-long"
const PS = "plank-short"
const CU = "cube"
const OR = "orange"
const SPECS = [
  { id: "l01", cols: 6, rows: 8, mix: [PS], band: [2, 3], seed: 11 },
  { id: "l02", cols: 6, rows: 8, mix: [PL, CU], band: [3, 4], seed: 22 },
  { id: "l03", cols: 6, rows: 8, mix: [PL, PS, CU], band: [5, 6], seed: 33 },
  { id: "l04", cols: 7, rows: 9, mix: [PL, PS, OR], band: [6, 8], seed: 44 },
  { id: "l05", cols: 7, rows: 9, mix: [PL, PL, PS, CU], band: [8, 10], seed: 55 },
  { id: "l06", cols: 7, rows: 9, mix: [PL, PS, PS, CU, OR], band: [10, 12], seed: 66 },
  { id: "l07", cols: 8, rows: 10, mix: [PL, PL, PS, PS, CU, CU], band: [12, 14], seed: 77 },
  { id: "l08", cols: 8, rows: 10, mix: [PL, PL, PS, PS, CU, OR], band: [14, 17], seed: 88 },
  { id: "l09", cols: 8, rows: 10, mix: [PL, PL, PL, PS, CU, CU, OR], band: [17, 20], seed: 99 },
  { id: "l10", cols: 8, rows: 10, mix: [PL, PL, PS, PS, PS, CU, CU, OR], band: [20, 24], seed: 110 },
  { id: "l11", cols: 8, rows: 10, mix: [PL, PL, PL, PS, PS, CU, CU, OR], band: [24, 28], seed: 121 },
  { id: "l12", cols: 8, rows: 11, mix: [PL, PL, PL, PS, PS, PS, CU, OR], band: [28, 40], seed: 132 },
  { id: "l13", cols: 7, rows: 9, gap: "left", mix: [PL, PS, PS, CU, OR], band: [12, 14], seed: 143 },
  { id: "l14", cols: 8, rows: 10, gap: "right", mix: [PL, PL, PS, PS, CU, OR], band: [14, 16], seed: 154 },
  { id: "l15", cols: 8, rows: 10, gap: "left", mix: [PL, PL, PL, PS, CU, CU], band: [15, 17], seed: 165 },
  { id: "l16", cols: 8, rows: 11, mix: [PL, PL, PS, PS, CU, CU, OR], band: [16, 18], seed: 176 },
  { id: "l17", cols: 8, rows: 10, gap: "right", mix: [PL, PL, PL, PS, PS, CU, OR], band: [17, 19], seed: 187 },
  { id: "l18", cols: 8, rows: 11, gap: "left", mix: [PL, PL, PS, PS, PS, CU, CU, OR], band: [18, 20], seed: 198 },
  { id: "l19", cols: 9, rows: 11, mix: [PL, PL, PL, PS, PS, CU, CU, OR], band: [18, 21], seed: 209 },
  { id: "l20", cols: 8, rows: 11, gap: "left", mix: [PL, PL, PL, PS, PS, PS, CU, OR], band: [19, 22], seed: 220 },
  { id: "l21", cols: 9, rows: 11, gap: "right", mix: [PL, PL, PL, PS, PS, CU, CU, OR, OR], band: [20, 23], seed: 231 },
  { id: "l22", cols: 8, rows: 11, mix: [PL, PL, PL, PS, PS, CU, CU, OR], band: [21, 25], seed: 242 },
  { id: "l23", cols: 9, rows: 11, gap: "left", mix: [PL, PL, PL, PL, PS, PS, CU, CU, OR], band: [22, 26], seed: 253 },
  { id: "l24", cols: 9, rows: 12, mix: [PL, PL, PL, PL, PS, PS, PS, CU, CU, OR], band: [24, 40], seed: 264 },
]

// Random scatter + solve under a per-level time budget. Layouts solvable in
// fewer moves than the band are cheap to reject (BFS stops at the first win),
// so the budget is spent probing for the rare deep ones. We keep the hardest
// layout inside the band, falling back to the closest one found — capped a
// little above the band so a freak 100+-move monster never ships.
//
// ONLY=l22,l23 SEED_BUMP=1000 regenerates just those specs, keeping the rest
// from the existing lib/levels.json (ids must still match the spec ids).
const BUDGET_MS = Number(process.env.BUDGET_MS ?? 90000)
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null
const SEED_BUMP = Number(process.env.SEED_BUMP ?? 0)
const here0 = dirname(fileURLToPath(import.meta.url))
const existing = ONLY
  ? JSON.parse(readFileSync(join(here0, "../lib/levels.json"), "utf8"))
  : []

const out = []
for (const spec of SPECS) {
  if (ONLY && !ONLY.includes(spec.id)) {
    const keep = existing.find((l) => l.id === spec.id)
    if (!keep) {
      console.error(`ONLY mode: ${spec.id} missing from lib/levels.json`)
      process.exit(1)
    }
    out.push(keep)
    continue
  }
  const rnd = mulberry(spec.seed + SEED_BUMP)
  const gapX =
    spec.gap === "left" ? 1 : spec.gap === "right" ? spec.cols - 3 : Math.floor(spec.cols / 2) - 1
  let best = null // hardest inside the band
  let under = null // hardest below the band
  let over = null // gentlest above the band (still capped when chosen)
  const t0 = Date.now()
  let trials = 0
  while (Date.now() - t0 < BUDGET_MS) {
    trials++
    const pieces = randomLayout(spec, rnd)
    if (!pieces) continue
    const level = { cols: spec.cols, rows: spec.rows, gapX, pieces }
    const { moves } = solve(level, 150000)
    if (moves <= 0) continue
    if (moves < spec.band[0]) {
      if (!under || moves > under.moves) under = { ...level, moves }
    } else if (moves > spec.band[1]) {
      if (!over || moves < over.moves) over = { ...level, moves }
    } else if (!best || moves > best.moves) {
      best = { ...level, moves }
    }
    if (best && best.moves >= spec.band[1]) break
  }
  // fall back to whichever near-miss sits closest to the band, never shipping
  // anything more than a few moves past its ceiling
  if (!best && over && over.moves <= spec.band[1] + 6) best = over
  if (!best) best = under ?? (over && over.moves <= spec.band[1] + 12 ? over : null)
  if (!best) {
    console.error(`FAILED to generate ${spec.id}`)
    process.exit(1)
  }
  console.log(`  (${trials} trials, ${((Date.now() - t0) / 1000).toFixed(0)}s)`)
  console.log(`${spec.id}: min ${best.moves} moves (band ${spec.band[0]}–${spec.band[1]}), ${best.pieces.length} pieces`)
  out.push({ id: spec.id, cols: spec.cols, rows: spec.rows, gapX, minMoves: best.moves, pieces: best.pieces })
}

const here = dirname(fileURLToPath(import.meta.url))
writeFileSync(join(here, "../lib/levels.json"), JSON.stringify(out, null, 2))
console.log(`\nwrote lib/levels.json (${out.length} levels)`)
