// Grow the level set: generate the specs below (random scatter + BFS under a
// per-spec time budget, same machinery as generate-levels.mjs), append them to
// the existing lib/levels.json, then re-sort the whole set by verified minimum
// moves and renumber — so the in-game ramp stays one smooth difficulty curve.
//
// This is the ongoing way to add levels; generate-levels.mjs rebuilds the
// original set from scratch and its spec ids no longer match the sorted file.
//
// Usage: node scripts/expand-levels.mjs   (env: BUDGET_MS per spec, default 90000)

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

function solve(level, cap = 150000) {
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
  if (isWin(start)) return 0
  const seen = new Set([key(start)])
  let frontier = [start]
  let depth = 0
  let nodes = 0
  while (frontier.length) {
    depth++
    const next = []
    for (const s of frontier) {
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
          for (;;) {
            x += dx
            y += dy
            if (x < 0 || y < 0 || x + w > cols || y + h > rows) break
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
              if (isWin(child)) return depth
              seen.add(k2)
              next.push(child)
              if (++nodes > cap) return -1
            }
          }
        }
      }
    }
    frontier = next
  }
  return -1
}

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

// ---- the new specs --------------------------------------------------------
const PL = "plank-long"
const PS = "plank-short"
const CU = "cube"
const OR = "orange"
const SPECS = [
  { id: "n01", cols: 6, rows: 8, gap: "left", mix: [PS, CU], band: [5, 6], seed: 301 },
  { id: "n02", cols: 6, rows: 8, gap: "right", mix: [PL, PS], band: [6, 7], seed: 312 },
  { id: "n03", cols: 7, rows: 9, mix: [PS, PS, CU, CU], band: [8, 9], seed: 323 },
  { id: "n04", cols: 7, rows: 9, gap: "right", mix: [PL, PL, CU, OR], band: [9, 11], seed: 334 },
  { id: "n05", cols: 7, rows: 10, gap: "left", mix: [PL, PS, PS, CU, OR], band: [11, 13], seed: 345 },
  { id: "n06", cols: 8, rows: 9, mix: [PL, PL, PS, CU, CU], band: [12, 14], seed: 356 },
  { id: "n07", cols: 8, rows: 10, gap: "left", mix: [PL, PS, PS, PS, CU, OR], band: [13, 15], seed: 367 },
  { id: "n08", cols: 8, rows: 10, mix: [PL, PL, PL, PS, PS, CU], band: [15, 17], seed: 378 },
  { id: "n09", cols: 8, rows: 10, gap: "right", mix: [PL, PL, PS, PS, CU, CU, OR], band: [16, 18], seed: 389 },
  { id: "n10", cols: 9, rows: 10, gap: "left", mix: [PL, PL, PS, PS, CU, CU, OR], band: [17, 19], seed: 400 },
  { id: "n11", cols: 8, rows: 11, gap: "right", mix: [PL, PL, PL, PS, PS, CU, OR], band: [18, 21], seed: 411 },
  { id: "n12", cols: 9, rows: 11, gap: "left", mix: [PL, PL, PS, PS, PS, CU, CU, OR], band: [19, 22], seed: 422 },
  { id: "n13", cols: 9, rows: 11, gap: "right", mix: [PL, PL, PL, PS, PS, PS, CU, OR], band: [21, 24], seed: 433 },
  { id: "n14", cols: 8, rows: 11, gap: "left", mix: [PL, PL, PL, PS, PS, CU, CU, OR], band: [23, 26], seed: 444 },
  { id: "n15", cols: 9, rows: 12, gap: "right", mix: [PL, PL, PL, PS, PS, PS, CU, CU, OR], band: [25, 30], seed: 455 },
  { id: "n16", cols: 9, rows: 11, mix: [PL, PL, PL, PL, PS, PS, CU, OR], band: [26, 32], seed: 466 },
  { id: "n17", cols: 9, rows: 12, gap: "left", mix: [PL, PL, PL, PL, PS, PS, PS, CU, OR], band: [28, 45], seed: 477 },
]

const BUDGET_MS = Number(process.env.BUDGET_MS ?? 90000)

const fresh = []
for (const spec of SPECS) {
  const rnd = mulberry(spec.seed)
  const gapX =
    spec.gap === "left" ? 1 : spec.gap === "right" ? spec.cols - 3 : Math.floor(spec.cols / 2) - 1
  let best = null
  let under = null
  let over = null
  const t0 = Date.now()
  let trials = 0
  while (Date.now() - t0 < BUDGET_MS) {
    trials++
    const pieces = randomLayout(spec, rnd)
    if (!pieces) continue
    const level = { cols: spec.cols, rows: spec.rows, gapX, pieces }
    const moves = solve(level)
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
  if (!best && over && over.moves <= spec.band[1] + 6) best = over
  if (!best) best = under ?? (over && over.moves <= spec.band[1] + 12 ? over : null)
  if (!best) {
    console.error(`FAILED to generate ${spec.id}`)
    process.exit(1)
  }
  console.log(`${spec.id}: min ${best.moves} (band ${spec.band[0]}–${spec.band[1]}), ${best.pieces.length} pieces, ${trials} trials, ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  fresh.push({ cols: best.cols, rows: best.rows, gapX: best.gapX, minMoves: best.moves, pieces: best.pieces })
}

// append, sort by difficulty, renumber
const here = dirname(fileURLToPath(import.meta.url))
const file = join(here, "../lib/levels.json")
const existing = JSON.parse(readFileSync(file, "utf8"))
const all = [...existing, ...fresh]
all.sort((a, b) => a.minMoves - b.minMoves)
all.forEach((l, i) => {
  l.id = `l${String(i + 1).padStart(2, "0")}`
})
writeFileSync(file, JSON.stringify(all, null, 2))
console.log(`\nwrote lib/levels.json: ${all.length} levels`)
console.log(all.map((l) => `${l.id}:${l.minMoves}`).join(" "))
