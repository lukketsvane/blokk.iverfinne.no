// Re-validate lib/levels.json: BFS-solve every level and assert the stored
// minimum-move count still matches (guards against hand-edits breaking a level).
//
// Usage: node scripts/check-levels.mjs

import { readFileSync } from "node:fs"
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

function fp(kind, rot) {
  const [w, h] = CELLS[kind]
  return rot ? [h, w] : [w, h]
}

function solve(level, cap = 800000) {
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

const here = dirname(fileURLToPath(import.meta.url))
const levels = JSON.parse(readFileSync(join(here, "../lib/levels.json"), "utf8"))

let ok = true
for (const level of levels) {
  // structural checks: hero first, no overlaps, everything inside the board
  const occ = new Set()
  level.pieces.forEach((p, i) => {
    const [w, h] = fp(p.kind, p.rot)
    if (i === 0 && p.kind !== "cylinder") {
      console.error(`${level.id}: piece 0 must be the cylinder`)
      ok = false
    }
    if (p.x < 0 || p.y < 0 || p.x + w > level.cols || p.y + h > level.rows) {
      console.error(`${level.id}: piece ${i} out of bounds`)
      ok = false
    }
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) {
        const c = `${p.x + dx},${p.y + dy}`
        if (occ.has(c)) {
          console.error(`${level.id}: overlap at ${c}`)
          ok = false
        }
        occ.add(c)
      }
  })
  const min = solve(level)
  const match = min === level.minMoves
  if (!match) ok = false
  console.log(`${level.id}: solver ${min}, stored ${level.minMoves} ${match ? "✓" : "✗"}`)
}

if (!ok) {
  console.error("\nvalidation FAILED")
  process.exit(1)
}
console.log(`\nall ${levels.length} levels valid`)
