import { EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing"
import { ToneMappingMode } from "postprocessing"

// The klossete realism stack: ambient occlusion grounds the blocks, a gentle
// vignette adds depth, ACES tone mapping seats the contrast, SMAA cleans edges.
export function PostFx() {
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={0.8} intensity={1.3} distanceFalloff={1} halfRes color="#1c160e" />
      <Vignette offset={0.35} darkness={0.24} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  )
}
