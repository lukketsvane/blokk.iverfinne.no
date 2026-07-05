"use client"

// bl.okk — a sliding-block puzzle (Unblock Me mechanics) built from the same
// five wooden blocks, camera, room and post stack as kl.oss.ete. The board is
// a grid of 15 mm cells inside a beige tray; planks slide only along their
// length, the square pieces slide both ways, and the red cylinder must be
// steered out through the gap in the top wall.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useThree, useFrame } from "@react-three/fiber"
import { ContactShadows, useGLTF, useTexture } from "@react-three/drei"
import * as THREE from "three"
import { LayoutGrid, Lock, RotateCcw, Undo2, Volume2, VolumeX, X } from "lucide-react"
import { audioReady, playImpact, playTone, primeBlocks, setMuted, unlockAudio } from "@/lib/impact-sound"
import { CELL, KINDS, MESH_FIT, S, footprint, kindBaseFreq, type PieceKind } from "@/lib/blocks"
import { GAP_CELLS, LEVELS, type Level } from "@/lib/levels"
import { getProgress, markSolved, setCurrent } from "@/lib/progression"
import { PostFx } from "@/components/engine/PostFx"

/* ------------------------------------------------------------------ */
/*  Room look — lifted from klossete's tutorial rooms                   */
/* ------------------------------------------------------------------ */
const BG = "#cdc6b8"
const FLOOR_COLOR = "#c7c0b1"
const WALL_COLOR = "#b3ab9b"
const KEY = { x: -6, y: 18, z: -5 } // warm key light from the top of the page
const CAM_FOV = 36
const WALL_HALF_T = 0.4
const WALL_HEIGHT = 3.0
const EXIT_TONGUE = 2.6 // how far the exit slot's floor reaches past the wall

const EPS = 1e-4

type Piece = { kind: PieceKind; rot: 0 | 1; x: number; y: number }

const boardHalf = (level: Level) => ({
  hx: (level.cols * CELL) / 2,
  hz: (level.rows * CELL) / 2,
})

/* ------------------------------------------------------------------ */
/*  Camera — straight down, framing the tray on any aspect ratio       */
/* ------------------------------------------------------------------ */
function CameraRig({ level }: { level: Level }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  useEffect(() => {
    const { hx, hz } = boardHalf(level)
    const aspect = size.width / size.height
    const tanV = Math.tan(((CAM_FOV / 2) * Math.PI) / 180)
    // frame the whole composition — tray plus the exit slot reaching up-screen —
    // with a little breathing room, centred on any aspect ratio
    const slot = 2 * WALL_HALF_T + EXIT_TONGUE
    const cz = -slot / 2 // composition centre (the slot pulls it up-screen)
    const halfZ = hz + slot / 2 + 0.75
    const halfX = hx + 2 * WALL_HALF_T + 0.55
    const dist = Math.max(halfZ / tanV, halfX / (tanV * aspect)) + 0.5

    const cam = camera as THREE.PerspectiveCamera
    cam.up.set(0, 0, -1) // screen-up maps to -z (row 0 / the exit reads "up")
    cam.position.set(0, dist, cz)
    cam.lookAt(0, 0, cz)
    cam.fov = CAM_FOV
    cam.aspect = aspect
    cam.updateProjectionMatrix()
  }, [camera, size, level])

  return null
}

/* ------------------------------------------------------------------ */
/*  The tray: floor, faint cell grid, walls with the exit gap          */
/* ------------------------------------------------------------------ */
function Room({ level }: { level: Level }) {
  const { hx, hz } = boardHalf(level)
  const t = WALL_HALF_T
  const h = WALL_HEIGHT / 2
  const gapW = GAP_CELLS * CELL
  const gapX0 = level.gapX * CELL - hx
  const gapCx = gapX0 + gapW / 2

  // faint cell grid so the sliding lattice reads on the plain floor
  const grid = useMemo(() => {
    const pts: number[] = []
    for (let c = 1; c < level.cols; c++) {
      const x = c * CELL - hx
      pts.push(x, 0, -hz, x, 0, hz)
    }
    for (let r = 1; r < level.rows; r++) {
      const z = r * CELL - hz
      pts.push(-hx, 0, z, hx, 0, z)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [level.cols, level.rows, hx, hz])

  const sil = useTexture("/silhouettes/cylinder-circle.png")
  useMemo(() => {
    sil.colorSpace = THREE.SRGBColorSpace
    sil.anisotropy = 4
    sil.generateMipmaps = false
    sil.minFilter = THREE.LinearFilter
    sil.needsUpdate = true
  }, [sil])

  // top wall split around the exit gap; side + bottom walls run full length
  const leftLen = gapX0 + hx // from -hx to the gap
  const rightLen = hx - (gapX0 + gapW)
  const tongueLen = 2 * t + EXIT_TONGUE

  return (
    <>
      {/* warm fill, as in klossete's tutorial rooms */}
      <ambientLight intensity={0.5} color="#fff3e3" />
      <pointLight position={[0, 11, 2]} intensity={14} distance={50} decay={2} color="#fff0d8" />

      {/* tray floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[hx * 2, hz * 2]} />
        <meshStandardMaterial color={FLOOR_COLOR} roughness={0.95} metalness={0} />
      </mesh>
      <lineSegments geometry={grid} position={[0, 0.006, 0]}>
        <lineBasicMaterial color="#8f8776" transparent opacity={0.12} />
      </lineSegments>

      {/* the exit slot: floor tongue reaching out through the gap, with the
          hero's crayon silhouette marking where the cylinder should end up */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[gapCx, 0.001, -hz - tongueLen / 2]} receiveShadow>
        <planeGeometry args={[gapW, tongueLen]} />
        <meshStandardMaterial color={FLOOR_COLOR} roughness={0.95} metalness={0} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[gapCx, 0.02, -hz - 2 * t - EXIT_TONGUE * 0.55]} receiveShadow>
        <planeGeometry args={[gapW * 0.92, gapW * 0.92]} />
        <meshStandardMaterial
          map={sil}
          color={KINDS.cylinder.color}
          transparent
          alphaTest={0.7}
          roughness={0.95}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>

      {/* walls — the top wall leaves the 2-cell exit gap open */}
      {leftLen > EPS && (
        <mesh position={[-hx + leftLen / 2, h, -(hz + t)]} castShadow receiveShadow>
          <boxGeometry args={[leftLen, WALL_HEIGHT, 2 * t]} />
          <meshStandardMaterial color={WALL_COLOR} roughness={0.92} metalness={0} />
        </mesh>
      )}
      {rightLen > EPS && (
        <mesh position={[hx - rightLen / 2, h, -(hz + t)]} castShadow receiveShadow>
          <boxGeometry args={[rightLen, WALL_HEIGHT, 2 * t]} />
          <meshStandardMaterial color={WALL_COLOR} roughness={0.92} metalness={0} />
        </mesh>
      )}
      <mesh position={[0, h, hz + t]} castShadow receiveShadow>
        <boxGeometry args={[hx * 2 + 4 * t, WALL_HEIGHT, 2 * t]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.92} metalness={0} />
      </mesh>
      <mesh position={[-(hx + t), h, 0]} castShadow receiveShadow>
        <boxGeometry args={[2 * t, WALL_HEIGHT, hz * 2 + 4 * t]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.92} metalness={0} />
      </mesh>
      <mesh position={[hx + t, h, 0]} castShadow receiveShadow>
        <boxGeometry args={[2 * t, WALL_HEIGHT, hz * 2 + 4 * t]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.92} metalness={0} />
      </mesh>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  One block: the klossete GLB, cloned so instances don't share state */
/* ------------------------------------------------------------------ */
function PieceMesh({ kind, onPointerDown }: { kind: PieceKind; onPointerDown: (e: PointerEvent & { point: THREE.Vector3; stopPropagation: () => void }) => void }) {
  const gltf = useGLTF(KINDS[kind].url)
  const model = useMemo(() => {
    const clone = gltf.scene.clone(true)
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    return clone
  }, [gltf.scene])

  return (
    <group onPointerDown={onPointerDown as never} scale={MESH_FIT}>
      <primitive object={model} dispose={null} />
    </group>
  )
}

for (const k of Object.values(KINDS)) useGLTF.preload(k.url)

/* ------------------------------------------------------------------ */
/*  Sliding logic                                                       */
/* ------------------------------------------------------------------ */
// The free interval a piece may occupy along one axis, given every other piece
// and the walls — plus the hero's special cases: it may leave through the gap
// when aligned, and while it's inside the gap it's rail-locked to the gap column.
function freeInterval(pieces: Piece[], idx: number, axis: "x" | "y", level: Level): [number, number] {
  const p = pieces[idx]
  const [w, h] = footprint(p.kind, p.rot)
  const isHero = idx === 0
  let lo: number
  let hi: number
  if (axis === "x") {
    if (isHero && p.y < -EPS * 10) return [level.gapX, level.gapX] // in the slot: rail-locked
    lo = 0
    hi = level.cols - w
  } else {
    const aligned = isHero && Math.abs(p.x - level.gapX) < 0.05
    lo = aligned ? -(h + (2 * WALL_HALF_T) / CELL + EXIT_TONGUE / CELL) : 0
    hi = level.rows - h
  }
  for (let j = 0; j < pieces.length; j++) {
    if (j === idx) continue
    const q = pieces[j]
    const [qw, qh] = footprint(q.kind, q.rot)
    if (axis === "x") {
      const overlap = p.y < q.y + qh - EPS && p.y + h > q.y + EPS
      if (!overlap) continue
      if (q.x >= p.x + w - EPS) hi = Math.min(hi, q.x - w)
      else if (q.x + qw <= p.x + EPS) lo = Math.max(lo, q.x + qw)
    } else {
      const overlap = p.x < q.x + qw - EPS && p.x + w > q.x + EPS
      if (!overlap) continue
      if (q.y >= p.y + h - EPS) hi = Math.min(hi, q.y - h)
      else if (q.y + qh <= p.y + EPS) lo = Math.max(lo, q.y + qh)
    }
  }
  return [lo, hi]
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

type DragState = {
  idx: number
  grab: THREE.Vector3 // pointer world point at grab time
  px: number // piece cell pos at grab time
  py: number
  moved: boolean
  lastImpact: number
}

type SceneApi = { undo: () => void; reset: () => void }

function Scene({
  level,
  onMoves,
  onWin,
  apiRef,
}: {
  level: Level
  onMoves: (n: number) => void
  onWin: (moves: number) => void
  apiRef: React.MutableRefObject<SceneApi | null>
}) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const { hx, hz } = boardHalf(level)

  // live piece positions (cell floats) — mutated during drags, rendered per frame
  const pieces = useRef<Piece[]>(level.pieces.map((p) => ({ ...p }))).current
  const groupRefs = useRef<(THREE.Group | null)[]>([])
  const history = useRef<number[][]>([level.pieces.flatMap((p) => [p.x, p.y])])
  const drag = useRef<DragState | null>(null)
  const winning = useRef(false)
  const done = useRef(false)

  const dims = useMemo(() => level.pieces.map((p) => footprint(p.kind, p.rot)), [level])

  const syncMoves = useCallback(() => onMoves(history.current.length - 1), [onMoves])

  const applySnapshot = useCallback(
    (snap: number[]) => {
      pieces.forEach((p, i) => {
        p.x = snap[i * 2]
        p.y = snap[i * 2 + 1]
      })
    },
    [pieces],
  )

  useEffect(() => {
    apiRef.current = {
      undo: () => {
        if (drag.current || winning.current || history.current.length <= 1) return
        history.current.pop()
        applySnapshot(history.current[history.current.length - 1])
        syncMoves()
      },
      reset: () => {
        if (winning.current) return
        drag.current = null
        history.current = [history.current[0]]
        applySnapshot(history.current[0])
        syncMoves()
      },
    }
    return () => {
      apiRef.current = null
    }
  }, [apiRef, applySnapshot, syncMoves])

  // pointer -> a point on the floor plane
  const ray = useMemo(() => new THREE.Raycaster(), [])
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const worldPoint = useCallback(
    (clientX: number, clientY: number, out: THREE.Vector3) => {
      const rect = gl.domElement.getBoundingClientRect()
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1
      const ny = -((clientY - rect.top) / rect.height) * 2 + 1
      ray.setFromCamera(new THREE.Vector2(nx, ny), camera)
      return ray.ray.intersectPlane(floorPlane, out)
    },
    [gl, camera, ray, floorPlane],
  )

  const grabPiece = useCallback(
    (idx: number) => (e: { point: THREE.Vector3; stopPropagation: () => void }) => {
      if (winning.current || drag.current) return
      e.stopPropagation()
      const p = pieces[idx]
      drag.current = {
        idx,
        grab: e.point.clone(),
        px: p.x,
        py: p.y,
        moved: false,
        lastImpact: 0,
      }
      gl.domElement.style.cursor = "grabbing"
    },
    [pieces, gl],
  )

  // window-level move/up so a fast drag never escapes the piece
  useEffect(() => {
    const tmp = new THREE.Vector3()

    const onMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d || winning.current) return
      if (!worldPoint(e.clientX, e.clientY, tmp)) return
      const p = pieces[d.idx]
      const [w, h] = dims[d.idx]
      const spec = KINDS[p.kind]
      // wanted position in cell floats
      let dx = (tmp.x - d.grab.x) / CELL
      let dy = (tmp.z - d.grab.z) / CELL
      if (spec.axisLocked) {
        // planks ride their long axis only
        if (h > w) dx = 0
        else dy = 0
      }
      let wantX = d.px + dx
      let wantY = d.py + dy

      // advance in sub-steps so a fast pointer can't cut corners; each step
      // clamps one axis at a time against the live free intervals
      let guard = 0
      let hitStrength = 0
      while (guard++ < 64) {
        const remX = wantX - p.x
        const remY = wantY - p.y
        if (Math.abs(remX) < EPS && Math.abs(remY) < EPS) break
        const stepX = clamp(remX, -0.45, 0.45)
        const stepY = clamp(remY, -0.45, 0.45)
        const order: ("x" | "y")[] = Math.abs(remX) >= Math.abs(remY) ? ["x", "y"] : ["y", "x"]
        let progress = 0
        for (const axis of order) {
          const step = axis === "x" ? stepX : stepY
          if (Math.abs(step) < EPS) continue
          const [lo, hi] = freeInterval(pieces, d.idx, axis, level)
          const cur = axis === "x" ? p.x : p.y
          const next = clamp(cur + step, lo, hi)
          const blockedBy = Math.abs(cur + step - next)
          if (blockedBy > 0.001) {
            hitStrength = Math.max(hitStrength, Math.min(1, blockedBy * 1.6))
            if (axis === "x") wantX = next
            else wantY = next
          }
          progress += Math.abs(next - cur)
          if (axis === "x") p.x = next
          else p.y = next
        }
        if (progress < EPS) break
      }

      // near the exit, magnet the hero onto the gap column so sliding out never
      // needs pixel-perfect alignment (only when that column is actually free)
      if (d.idx === 0 && p.y < 0.75 && Math.abs(p.x - level.gapX) < 0.34 && Math.abs(p.x - level.gapX) > EPS) {
        const [lo, hi] = freeInterval(pieces, d.idx, "x", level)
        if (level.gapX >= lo - EPS && level.gapX <= hi + EPS) p.x = level.gapX
      }

      // a firm knock when the slide is stopped by a wall or another block
      const now = performance.now()
      if (hitStrength > 0.12 && now - d.lastImpact > 140) {
        d.lastImpact = now
        playImpact(p.kind, 0.25 + hitStrength * 0.5)
        if (navigator.vibrate) navigator.vibrate(8)
      }

      if (Math.abs(p.x - d.px) > 0.08 || Math.abs(p.y - d.py) > 0.08) d.moved = true

      // hero far enough into the slot: let go and glide it out. The exit drag
      // counts as a move unless the hero already sat solved at the gap mouth
      // (matches the solver, whose win state is the hero AT the gap, not out).
      if (d.idx === 0 && p.y < -h * 0.5) {
        drag.current = null
        winning.current = true
        if (d.px !== level.gapX || d.py !== 0) {
          history.current.push(pieces.flatMap((q) => [q.x, q.y]))
          syncMoves()
        }
        gl.domElement.style.cursor = "grab"
      }
    }

    const onUp = () => {
      const d = drag.current
      if (!d) return
      drag.current = null
      gl.domElement.style.cursor = "grab"
      const p = pieces[d.idx]
      // snap to the lattice (the hero may snap into the slot => win)
      const [w, h] = dims[d.idx]
      void w
      let sx = Math.round(p.x)
      let sy = Math.round(p.y)
      const [lox, hix] = freeInterval(pieces, d.idx, "x", level)
      sx = clamp(sx, Math.ceil(lox - EPS), Math.floor(hix + EPS))
      const [loy, hiy] = freeInterval(pieces, d.idx, "y", level)
      sy = clamp(sy, Math.ceil(loy - EPS), Math.floor(hiy + EPS))
      if (d.idx === 0 && sy <= -1) {
        winning.current = true
        if (d.px !== level.gapX || d.py !== 0) {
          history.current.push(pieces.flatMap((q) => [q.x, q.y]))
          syncMoves()
        }
        return
      }
      p.x = sx
      p.y = sy
      if (sx !== d.px || sy !== d.py) {
        playImpact(p.kind, 0.16)
        history.current.push(pieces.flatMap((q) => [q.x, q.y]))
        syncMoves()
      }
      void h
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [pieces, dims, level, worldPoint, gl, syncMoves])

  // place the meshes every frame; run the win glide
  useFrame((_, delta) => {
    if (winning.current && !done.current) {
      const hero = pieces[0]
      const [, h] = dims[0]
      const end = -(h + (2 * WALL_HALF_T) / CELL + EXIT_TONGUE / CELL / 2)
      hero.x = level.gapX
      hero.y = Math.max(end, hero.y - delta * 9)
      if (hero.y <= end + EPS) {
        done.current = true
        // a little rising two-note "you did it"
        playTone(523.25, 0.7)
        setTimeout(() => playTone(783.99, 0.8), 130)
        onWin(history.current.length - 1)
      }
    }
    pieces.forEach((p, i) => {
      const g = groupRefs.current[i]
      if (!g) return
      const [w, h] = dims[i]
      g.position.set((p.x + w / 2) * CELL - hx, (KINDS[p.kind].heightMm * S) / 2, (p.y + h / 2) * CELL - hz)
    })
  })

  return (
    <>
      <directionalLight
        position={[KEY.x, KEY.y, KEY.z]}
        intensity={3.0}
        color="#fff1df"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={70}
        shadow-camera-left={-(hx + 3)}
        shadow-camera-right={hx + 3}
        shadow-camera-top={hz + 3}
        shadow-camera-bottom={-(hz + 3)}
        shadow-bias={-0.00015}
        shadow-normalBias={0.04}
      />
      <ContactShadows
        position={[0, 0.001, 0]}
        scale={Math.max(hx, hz) * 2 + 4}
        resolution={1024}
        far={4}
        blur={2.4}
        opacity={0.42}
        color="#332b20"
      />

      <Room level={level} />

      {pieces.map((p, i) => (
        <group
          key={i}
          ref={(g) => {
            groupRefs.current[i] = g
          }}
          rotation={[0, p.rot === 1 ? Math.PI / 2 : 0, 0]}
        >
          <PieceMesh kind={p.kind} onPointerDown={grabPiece(i) as never} />
        </group>
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Shell: canvas + HUD + overlays                                      */
/* ------------------------------------------------------------------ */
export default function SlidingBlocks() {
  const [levelIdx, setLevelIdx] = useState(0)
  const [moves, setMoves] = useState(0)
  const [won, setWon] = useState<null | { moves: number }>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [muted, setMutedState] = useState(false)
  const [unlocked, setUnlocked] = useState(0)
  const [best, setBest] = useState<Record<string, number>>({})
  const apiRef = useRef<SceneApi | null>(null)
  const level = LEVELS[Math.min(levelIdx, LEVELS.length - 1)]

  // resume where you left off (effect, so server + client first paint agree)
  useEffect(() => {
    const p = getProgress()
    setLevelIdx(Math.min(p.current, LEVELS.length - 1))
    setUnlocked(Math.min(p.current, LEVELS.length - 1))
    setBest(p.best)
  }, [])

  // audio unlock: retried across gesture types until the context runs (iOS)
  useEffect(() => {
    const unlock = () => {
      unlockAudio()
      primeBlocks(
        (Object.keys(KINDS) as PieceKind[]).map((k) => ({ id: k, freq: kindBaseFreq(k) })),
      )
      if (audioReady()) cleanup()
    }
    const cleanup = () => {
      window.removeEventListener("pointerdown", unlock)
      window.removeEventListener("touchend", unlock)
      window.removeEventListener("click", unlock)
    }
    window.addEventListener("pointerdown", unlock, { passive: true })
    window.addEventListener("touchend", unlock, { passive: true })
    window.addEventListener("click", unlock, { passive: true })
    return cleanup
  }, [])

  const gotoLevel = useCallback((i: number) => {
    const idx = Math.max(0, Math.min(i, LEVELS.length - 1))
    setLevelIdx(idx)
    setMoves(0)
    setWon(null)
    setPickerOpen(false)
    setCurrent(idx)
  }, [])

  const onWin = useCallback(
    (m: number) => {
      markSolved(level.id, m)
      const next = Math.min(levelIdx + 1, LEVELS.length - 1)
      setCurrent(Math.max(getProgress().current, next))
      setUnlocked((u) => Math.max(u, next))
      setBest(getProgress().best)
      setWon({ moves: m })
      setTimeout(() => {
        if (levelIdx < LEVELS.length - 1) gotoLevel(levelIdx + 1)
        else setPickerOpen(true)
      }, 2400)
    },
    [level.id, levelIdx, gotoLevel],
  )

  const toggleMute = useCallback(() => {
    setMutedState((m) => {
      setMuted(!m)
      return !m
    })
  }, [])

  return (
    <div className="relative h-dvh w-full overflow-hidden" style={{ backgroundColor: BG }}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true, preserveDrawingBuffer: false, powerPreference: "high-performance" }}
        camera={{ position: [0, 30, 0], fov: CAM_FOV, near: 0.1, far: 200 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NoToneMapping // ACES runs in the post stack
          gl.domElement.style.cursor = "grab"
        }}
        style={{ touchAction: "none" }}
      >
        <color attach="background" args={[BG]} />
        <CameraRig level={level} />
        <Suspense fallback={null}>
          <Scene key={level.id} level={level} onMoves={setMoves} onWin={onWin} apiRef={apiRef} />
        </Suspense>
        <PostFx />
      </Canvas>

      {/* control cluster — klossete's quiet top-left column */}
      <div
        className="pointer-events-auto absolute z-10 flex flex-col gap-2 p-1 text-[#2a251c] opacity-55"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 0.5rem)",
          left: "calc(env(safe-area-inset-left, 0px) + 0.5rem)",
        }}
      >
        <button
          type="button"
          aria-label="Nivå"
          onClick={() => setPickerOpen((o) => !o)}
          className="flex h-11 w-11 items-center justify-center transition active:scale-95"
        >
          <LayoutGrid className="h-5 w-5" strokeWidth={2.4} />
        </button>
        <button
          type="button"
          aria-label={muted ? "Slå på lyd" : "Demp lyd"}
          aria-pressed={muted}
          onClick={toggleMute}
          className="flex h-11 w-11 items-center justify-center transition active:scale-95"
        >
          {muted ? <VolumeX className="h-5 w-5" strokeWidth={2.4} /> : <Volume2 className="h-5 w-5" strokeWidth={2.4} />}
        </button>
        <button
          type="button"
          aria-label="Angre"
          onClick={() => apiRef.current?.undo()}
          className="flex h-11 w-11 items-center justify-center transition active:scale-95 disabled:opacity-30"
          disabled={moves === 0 || !!won}
        >
          <Undo2 className="h-5 w-5" strokeWidth={2.4} />
        </button>
        <button
          type="button"
          aria-label="Start nivået på nytt"
          onClick={() => apiRef.current?.reset()}
          className="flex h-11 w-11 items-center justify-center transition active:scale-95 disabled:opacity-30"
          disabled={!!won}
        >
          <RotateCcw className="h-5 w-5" strokeWidth={2.4} />
        </button>
      </div>

      {/* moves counter, top right */}
      <div
        className="pointer-events-none absolute z-10 flex flex-col items-end text-[#2a251c]"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 0.9rem)",
          right: "calc(env(safe-area-inset-right, 0px) + 1.1rem)",
        }}
      >
        <span className="font-mono text-3xl font-semibold leading-none tabular-nums opacity-70">{moves}</span>
        <span className="mt-1 text-[11px] uppercase tracking-widest opacity-45">
          minst {level.minMoves}
        </span>
      </div>

      {/* level name, bottom left */}
      <div
        className="pointer-events-none absolute z-10 text-[#2a251c]"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.9rem)", left: "calc(env(safe-area-inset-left, 0px) + 1.1rem)" }}
      >
        <span className="text-[11px] uppercase tracking-widest opacity-45">
          {levelIdx + 1} · {level.name}
        </span>
      </div>

      {/* first-level hint until the first move */}
      {levelIdx === 0 && moves === 0 && !won && (
        <div
          className="pointer-events-none absolute inset-x-0 z-10 flex justify-center px-8 text-center"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 3rem)" }}
        >
          <p className="max-w-xs text-sm leading-snug text-[#2a251c] opacity-60">
            Skyv klossane til side og før den raude sylinderen ut gjennom opninga øvst.
          </p>
        </div>
      )}

      {/* win overlay */}
      {won && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center">
          <span className="font-klossete text-6xl text-[#2a251c] drop-shadow-sm">Løyst!</span>
          <span className="mt-3 text-sm uppercase tracking-widest text-[#2a251c] opacity-60">
            {won.moves} trekk · minst {level.minMoves}
          </span>
        </div>
      )}

      {/* level picker */}
      {pickerOpen && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-[#cdc6b8]/95 px-6 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Lukk"
            onClick={() => setPickerOpen(false)}
            className="absolute flex h-11 w-11 items-center justify-center text-[#2a251c] opacity-55 transition active:scale-95"
            style={{
              top: "calc(env(safe-area-inset-top, 0px) + 0.5rem)",
              right: "calc(env(safe-area-inset-right, 0px) + 0.5rem)",
            }}
          >
            <X className="h-5 w-5" strokeWidth={2.4} />
          </button>
          <h1 className="font-klossete text-5xl text-[#2a251c]">bl.okk</h1>
          <div className="grid w-full max-w-sm grid-cols-3 gap-3">
            {LEVELS.map((l, i) => {
              const locked = i > unlocked
              const b = best[l.id]
              return (
                <button
                  key={l.id}
                  type="button"
                  disabled={locked}
                  onClick={() => gotoLevel(i)}
                  className={`flex aspect-square flex-col items-center justify-center rounded-xl border transition active:scale-95 ${
                    i === levelIdx
                      ? "border-[#2a251c]/50 bg-[#c7c0b1]"
                      : "border-[#2a251c]/15 bg-[#c7c0b1]/60"
                  } ${locked ? "opacity-35" : ""}`}
                >
                  {locked ? (
                    <Lock className="h-4 w-4 text-[#2a251c] opacity-60" strokeWidth={2.2} />
                  ) : (
                    <>
                      <span className="font-klossete text-2xl text-[#2a251c] opacity-80">{i + 1}</span>
                      <span className="mt-0.5 text-[9px] uppercase tracking-wider text-[#2a251c] opacity-45">
                        {b !== undefined ? `${b} trekk` : l.name}
                      </span>
                    </>
                  )}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] uppercase tracking-widest text-[#2a251c] opacity-40">
            få den raude sylinderen ut
          </p>
        </div>
      )}
    </div>
  )
}
