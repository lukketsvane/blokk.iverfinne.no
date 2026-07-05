// Play every level to completion in a real browser: BFS-solve each layout,
// replay the solution as pointer drags, and assert each level is recorded as
// solved. The definitive "all levels are actually solvable in-engine" check.
import { chromium } from "playwright-core"
import { readFileSync } from "node:fs"

const levels = JSON.parse(readFileSync("/home/user/blokk.iverfinne.no/lib/levels.json", "utf8"))

const CELLS = { "plank-long": [2, 5], "plank-short": [2, 4], cube: [2, 2], orange: [3, 3], cylinder: [2, 2] }
const LOCKED = { "plank-long": true, "plank-short": true, cube: false, orange: false, cylinder: false }
const HEIGHTS = { "plank-long": 15, "plank-short": 15, cube: 30, orange: 24, cylinder: 60 }
const fp = (k, r) => (r ? [CELLS[k][1], CELLS[k][0]] : CELLS[k])

function solvePath({ cols, rows, gapX, pieces }) {
  const n = pieces.length
  const dims = pieces.map((p) => fp(p.kind, p.rot))
  const dirsFor = pieces.map((p, i) => {
    const [w, h] = dims[i]
    if (!LOCKED[p.kind]) return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    return h > w ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]]
  })
  const start = pieces.flatMap((p) => [p.x, p.y])
  const key = (s) => s.join(",")
  const isWin = (s) => s[1] === 0 && s[0] === gapX
  const parent = new Map([[key(start), null]])
  let frontier = [start]
  while (frontier.length) {
    const next = []
    for (const s of frontier) {
      const occ = new Int8Array(cols * rows).fill(-1)
      for (let i = 0; i < n; i++) {
        const [w, h] = dims[i]
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) occ[(s[i * 2 + 1] + dy) * cols + s[i * 2] + dx] = i
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
              for (let k = 0; k < h && !blocked; k++) if (occ[(y + k) * cols + ex] !== -1 && occ[(y + k) * cols + ex] !== i) blocked = true
            } else {
              const ey = dy > 0 ? y + h - 1 : y
              for (let k = 0; k < w && !blocked; k++) if (occ[ey * cols + x + k] !== -1 && occ[ey * cols + x + k] !== i) blocked = true
            }
            if (blocked) break
            const c = [...s]
            c[i * 2] = x
            c[i * 2 + 1] = y
            const k2 = key(c)
            if (!parent.has(k2)) {
              parent.set(k2, { prev: key(s), move: { i, x, y } })
              if (isWin(c)) {
                const moves = []
                let cur = k2
                while (parent.get(cur)) {
                  moves.unshift(parent.get(cur).move)
                  cur = parent.get(cur).prev
                }
                return moves
              }
              next.push(c)
            }
          }
        }
      }
    }
    frontier = next
  }
  throw new Error("unsolvable")
}

const W = 390
const H = 844
const CELL = 15 * 0.036
const FOV = 36
const WALL_HALF_T = 0.4
const EXIT_TONGUE = 2.6
function mapper(level) {
  const hx = (level.cols * CELL) / 2
  const hz = (level.rows * CELL) / 2
  const aspect = W / H
  const tanV = Math.tan(((FOV / 2) * Math.PI) / 180)
  const slot = 2 * WALL_HALF_T + EXIT_TONGUE
  const cz = -slot / 2
  const halfZ = hz + slot / 2 + 0.75
  const halfX = hx + 2 * WALL_HALF_T + 0.55
  const dist = Math.max(halfZ / tanV, halfX / (tanV * aspect)) + 0.5
  return (wx, wz, wy = 0) => {
    const depth = dist - wy
    const ndcX = wx / (depth * tanV * aspect)
    const ndcY = -(wz - cz) / (depth * tanV)
    return [((ndcX + 1) / 2) * W, ((1 - ndcY) / 2) * H]
  }
}

// Pick a grab point on a piece's TOP FACE that is actually visible from the
// camera: a taller neighbour (the 60 mm cylinder next to a 15 mm plank) can
// occlude the face centre, and a player would touch the visible part instead.
function grabPoint(level, pos, idx) {
  const hx = (level.cols * CELL) / 2
  const hz = (level.rows * CELL) / 2
  const q = pos[idx]
  const [w, h] = fp(q.kind, q.rot)
  const topY = HEIGHTS[q.kind] * 0.036
  const aspect = W / H
  const tanV = Math.tan(((FOV / 2) * Math.PI) / 180)
  const slot = 2 * WALL_HALF_T + EXIT_TONGUE
  const cz = -slot / 2
  const halfZ = hz + slot / 2 + 0.75
  const halfX = hx + 2 * WALL_HALF_T + 0.55
  const dist = Math.max(halfZ / tanV, halfX / (tanV * aspect)) + 0.5
  const cam = [0, dist, cz]
  const boxes = pos.map((r, j) => {
    const [rw, rh] = fp(r.kind, r.rot)
    return {
      j,
      x0: r.x * CELL - hx, x1: (r.x + rw) * CELL - hx,
      z0: r.y * CELL - hz, z1: (r.y + rh) * CELL - hz,
      top: HEIGHTS[r.kind] * 0.036,
    }
  })
  const occluded = (P) => {
    // segment camera->P; does any OTHER piece's box block it before P?
    for (const bx of boxes) {
      if (bx.j === idx) continue
      // param t where ray height crosses the box top
      const dy = P[1] - cam[1]
      const t = (bx.top - cam[1]) / dy // y = camY + t*dy
      if (!(t > 0 && t < 0.999)) continue
      const x = cam[0] + t * (P[0] - cam[0])
      const z = cam[2] + t * (P[2] - cam[2])
      if (x > bx.x0 && x < bx.x1 && z > bx.z0 && z < bx.z1) return true
    }
    return false
  }
  // sample a 3x3 grid over the top face, centre first, inset from the edges
  const cx = (q.x + w / 2) * CELL - hx
  const czz = (q.y + h / 2) * CELL - hz
  const sx = (w * CELL) / 2 - 0.12
  const sz = (h * CELL) / 2 - 0.12
  const samples = [[0, 0], [0, -0.6], [0, 0.6], [-0.6, 0], [0.6, 0], [-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]
  for (const [ox, oz] of samples) {
    const P = [cx + ox * sx, topY, czz + oz * sz]
    if (!occluded(P)) {
      const depth = dist - topY
      const ndcX = P[0] / (depth * tanV * aspect)
      const ndcY = -(P[2] - cz) / (depth * tanV)
      return { pt: [((ndcX + 1) / 2) * W, ((1 - ndcY) / 2) * H], off: [ox * sx, oz * sz] }
    }
  }
  return null
}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" })
const p = await b.newPage({ viewport: { width: W, height: H } })
p.on("pageerror", (e) => console.log("PAGE ERROR:", e.message))
await p.goto("http://localhost:3100", { waitUntil: "networkidle" })

const drag = async (from, to) => {
  await p.mouse.move(from[0], from[1])
  await p.mouse.down()
  const steps = Math.max(10, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 14))
  for (let s = 1; s <= steps; s++) {
    await p.mouse.move(from[0] + ((to[0] - from[0]) * s) / steps, from[1] + ((to[1] - from[1]) * s) / steps)
    await p.waitForTimeout(10)
  }
  await p.mouse.up()
  await p.waitForTimeout(140)
}

const failures = []
for (let li = 0; li < levels.length; li++) {
  const level = levels[li]
  const toScreen = mapper(level)
  const hx = (level.cols * CELL) / 2
  const hz = (level.rows * CELL) / 2
  const centre = (piece, x, y) => {
    const [w, h] = fp(piece.kind, piece.rot)
    return toScreen((x + w / 2) * CELL - hx, (y + h / 2) * CELL - hz, HEIGHTS[piece.kind] * 0.036)
  }
  const moves = solvePath(level)

  await p.evaluate((i) => {
    const raw = localStorage.getItem("blokk:progress:v1")
    const prog = raw ? JSON.parse(raw) : { current: 0, solved: [], best: {} }
    prog.current = i
    localStorage.setItem("blokk:progress:v1", JSON.stringify(prog))
  }, li)
  await p.reload({ waitUntil: "networkidle" })
  // wait until the right level is mounted AND its drop-in entrance has fully
  // played (the intro clock is frame-capped, so under software GL it runs
  // slower than wall time — poll it instead of guessing)
  const introNeed = level.pieces.length * 0.07 + 0.42 + 0.15
  await p.waitForFunction(
    ([id, need]) => window.__blokk?.level.id === id && window.__blokk.introT.current > need,
    [level.id, introNeed],
    { timeout: 30000 },
  )

  const pos = level.pieces.map((q) => ({ ...q }))
  let ok = true
  for (const m of moves) {
    const q = pos[m.i]
    const gp = grabPoint(level, pos, m.i)
    if (!gp) {
      failures.push(`${level.id}: piece ${m.i} fully occluded — no grab point`)
      ok = false
      break
    }
    const toScreen2 = mapper(level)
    const [w2, h2] = fp(q.kind, q.rot)
    const a = toScreen2((q.x + w2 / 2) * CELL - hx, (q.y + h2 / 2) * CELL - hz, 0)
    const z = toScreen2((m.x + w2 / 2) * CELL - hx, (m.y + h2 / 2) * CELL - hz, 0)
    const to = [gp.pt[0] + (z[0] - a[0]), gp.pt[1] + (z[1] - a[1])]
    await drag(gp.pt, to)
    q.x = m.x
    q.y = m.y
    const live = await p.evaluate(() => window.__blokk?.pieces.map((r) => [r.x, r.y]))
    if (!live || live[m.i][0] !== m.x || live[m.i][1] !== m.y) {
      ok = false
      failures.push(`${level.id}: piece ${m.i} expected (${m.x},${m.y}) got ${JSON.stringify(live?.[m.i])}`)
      await p.screenshot({ path: `fail-${level.id}.png` })
      break
    }
  }
  if (ok) {
    const hero = pos[0]
    const from = centre(hero, hero.x, hero.y)
    await drag(from, [from[0], from[1] - 280])
    await p.waitForFunction(
      (id) => (JSON.parse(localStorage.getItem("blokk:progress:v1") ?? "{}").solved ?? []).includes(id),
      level.id,
      { timeout: 8000 },
    ).catch(() => {})
    const solved = await p.evaluate(() => JSON.parse(localStorage.getItem("blokk:progress:v1") ?? "{}").solved ?? [])
    if (solved.includes(level.id)) {
      console.log(`${level.id}: PASS (${moves.length} moves, min ${level.minMoves})`)
    } else {
      failures.push(`${level.id}: solution replayed but win not recorded`)
      console.log(`${level.id}: FAIL (win not recorded)`)
      await p.screenshot({ path: `fail-${level.id}.png` })
    }
  } else {
    console.log(`${level.id}: FAIL (drag mismatch)`)
  }
}

await b.close()
if (failures.length) {
  console.log("\nFAILURES:\n" + failures.join("\n"))
  process.exit(1)
}
console.log(`\nALL ${levels.length} LEVELS PLAYABLE ✓`)
