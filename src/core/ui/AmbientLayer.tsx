import { useShellStore } from '../store/shell'
import { SKINS } from './skins'

/**
 * Per-preset living background — Midnight's rain, Terminal's scanline,
 * Aurora's drifting blobs. Whisper-quiet (≤5% opacity), pointer-transparent,
 * killable from the gear menu. Sits at -z-10 so it paints above the body
 * background but under all content; reduced-motion freezes it to a static
 * texture, which is fine — it never carries content.
 */
export function AmbientLayer() {
  const skin = useShellStore((s) => s.skin)
  const ambient = useShellStore((s) => s.ambient)
  const kind = SKINS[skin]?.ambient
  if (!ambient || !kind) return null
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {kind === 'rain' && (
        <>
          <div className="amb-rain-a" />
          <div className="amb-rain-b" />
        </>
      )}
      {kind === 'scan' && <div className="amb-scan" />}
      {kind === 'blobs' && (
        <>
          <div className="amb-blob-a" />
          <div className="amb-blob-b" />
        </>
      )}
    </div>
  )
}
