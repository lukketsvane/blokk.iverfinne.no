// The wooden-block catalogue for bl.okk — the same five klossete pieces, mapped
// onto a sliding-puzzle grid. One grid cell is 15 mm, so every piece's real
// millimetre footprint lands exactly on whole cells:
//
//   Dark Blue Plank   30 × 75 × 15 mm  -> 2 × 5 cells (slides along its length)
//   Dark Blue Short   30 × 60 × 15 mm  -> 2 × 4 cells (slides along its length)
//   Light Blue Cube   30 × 30 × 30 mm  -> 2 × 2 cells (slides both ways)
//   Orange Block      45 × 45 × 24 mm  -> 3 × 3 cells (slides both ways)
//   Red Cylinder      Ø 30 · H 60 mm   -> 2 × 2 cells, upright — the hero.

export const S = 0.036 // 1 mm -> scene units (same scale as klossete)
// The GLB meshes were authored for a 0.045 scale; keep the same fit factor so
// the models render at exactly the catalogue's millimetre size.
const MESH_DESIGN_S = 0.045
export const MESH_FIT = S / MESH_DESIGN_S

export const CELL_MM = 15
export const CELL = CELL_MM * S // one grid cell in world units

export type PieceKind = "plank-long" | "plank-short" | "cube" | "orange" | "cylinder"

export type KindSpec = {
  kind: PieceKind
  name: string
  color: string
  dims: string
  url: string
  /** footprint in cells at rotation 0: [across x, along z] */
  cells: [number, number]
  heightMm: number
  /** planks only slide along their long axis, like Unblock Me pieces */
  axisLocked: boolean
  /** largest real dimension in mm — longer pieces knock at a lower pitch */
  maxMm: number
  cylinder?: boolean
}

export const KINDS: Record<PieceKind, KindSpec> = {
  "plank-long": {
    kind: "plank-long",
    name: "Dark Blue Plank",
    color: "#2f63cc",
    dims: "30 × 75 × 15 mm",
    url: "/block_blue_02.glb",
    cells: [2, 5],
    heightMm: 15,
    axisLocked: true,
    maxMm: 75,
  },
  "plank-short": {
    kind: "plank-short",
    name: "Dark Blue Short",
    color: "#2f63cc",
    dims: "30 × 60 × 15 mm",
    url: "/block_blue_01.glb",
    cells: [2, 4],
    heightMm: 15,
    axisLocked: true,
    maxMm: 60,
  },
  cube: {
    kind: "cube",
    name: "Light Blue Cube",
    color: "#3f9ec9",
    dims: "30 × 30 × 30 mm",
    url: "/block_lightblue_cube.glb",
    cells: [2, 2],
    heightMm: 30,
    axisLocked: false,
    maxMm: 30,
  },
  orange: {
    kind: "orange",
    name: "Orange Block",
    color: "#e07b22",
    dims: "45 × 45 × 24 mm",
    url: "/block_orange.glb",
    cells: [3, 3],
    heightMm: 24,
    axisLocked: false,
    maxMm: 45,
  },
  cylinder: {
    kind: "cylinder",
    name: "Red Cylinder",
    color: "#c83a2e",
    dims: "Ø 30 mm · H 60 mm",
    url: "/block_red_cylinder.glb",
    cells: [2, 2],
    heightMm: 60,
    axisLocked: false,
    maxMm: 60,
    cylinder: true,
  },
}

/** Footprint in cells after applying a piece's rotation. */
export function footprint(kind: PieceKind, rot: 0 | 1): [number, number] {
  const [w, h] = KINDS[kind].cells
  return rot === 1 ? [h, w] : [w, h]
}

/** Fundamental impact frequency: bigger piece -> lower knock (klossete's curve). */
export function kindBaseFreq(kind: PieceKind) {
  const f = 2600 / Math.sqrt(KINDS[kind].maxMm)
  return Math.max(230, Math.min(680, f))
}
