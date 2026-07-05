import { EffectComposer, N8AO, SMAA, ToneMapping } from "@react-three/postprocessing"
import { ToneMappingMode } from "postprocessing"

// The klossete realism stack, tuned for the white studio: ambient occlusion
// grounds the blocks, SMAA cleans edges. Khronos-neutral tone mapping instead
// of ACES so unlit white surfaces stay paper-white (ACES greys 1.0 down to
// ~0.81) — the page must be 100% white except for real shadows. No vignette.
export function PostFx() {
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={0.8} intensity={1.3} distanceFalloff={1} halfRes color="#000000" />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <SMAA />
    </EffectComposer>
  )
}
