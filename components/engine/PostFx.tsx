// The klossete realism stack, tuned for the white studio: ambient occlusion
// grounds the blocks, SMAA cleans edges. Tone mapping is NOT done here — it
// runs in the renderer (Khronos neutral, per material) so the slab tops and
// backdrop can opt out with toneMapped=false and clamp at exact #ffffff.
import { EffectComposer, N8AO, SMAA } from "@react-three/postprocessing"

export function PostFx() {
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={0.8} intensity={1.3} distanceFalloff={1} halfRes color="#000000" />
      <SMAA />
    </EffectComposer>
  )
}
