// Order lib/levels.json by verified minimum moves (easiest first) and renumber
// the ids, so the in-game progression is one smooth difficulty ramp no matter
// which spec produced which layout.
//
// Usage: node scripts/sort-levels.mjs

import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const file = join(here, "../lib/levels.json")
const levels = JSON.parse(readFileSync(file, "utf8"))

levels.sort((a, b) => a.minMoves - b.minMoves)
levels.forEach((l, i) => {
  l.id = `l${String(i + 1).padStart(2, "0")}`
})

writeFileSync(file, JSON.stringify(levels, null, 2))
console.log(levels.map((l) => `${l.id}: ${l.minMoves}`).join("\n"))
