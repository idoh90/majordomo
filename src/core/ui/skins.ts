/**
 * App skins — the five visual directions from the Claude Design doc
 * ("Design Directions.dc.html"). Colors, borders, radii, shadows and fonts
 * live in CSS as per-skin variable bundles (`html[data-skin=…]` in
 * `src/index.css`); this module only holds identity + the few flags that
 * need JS (heat ramp, structural extras, picker metadata).
 */

export type SkinId =
  | 'gotham'
  | 'gotham-day'
  | 'tacops'
  | 'noir'
  | 'ghost'
  | 'ironworks'
  | 'ironworks-paper'

export interface SkinDef {
  id: SkinId
  name: string
  tagline: string
  /** <meta name="theme-color"> value (browser chrome tint) */
  themeColor: string
  /** which strain→color ramp the body map + legend use */
  heatRamp: 'standard' | 'noir' | 'daylight'
  /** header layout variant rendered by App */
  header: 'gotham' | 'tacops' | 'noir' | 'ghost' | 'ironworks'
  /** multiplier on the body-map glow layer (light skins damp it) */
  glowScale?: number
  /** Ghost Protocol: mirrored "hologram" floor reflection under the body map */
  reflection?: boolean
  /** Tac-Ops: terminal status strip above the header */
  statusStrip?: boolean
  /** Noir: body-map caption reads like a printed figure caption */
  figCaption?: boolean
  /** swatch dots for the skin picker: [bg, panel, accent, ink] */
  swatches: [string, string, string, string]
}

export const SKINS: Record<SkinId, SkinDef> = {
  gotham: {
    id: 'gotham',
    name: 'Gotham Gold',
    tagline: 'Layered gunmetal, hairline gold, cinematic heat glow',
    themeColor: '#0a0b0e',
    heatRamp: 'standard',
    header: 'gotham',
    swatches: ['#0a0b0e', '#14171d', '#f5b301', '#e8eaed'],
  },
  'gotham-day': {
    id: 'gotham-day',
    name: 'Gotham Gold — Daylight',
    tagline: 'The refined identity at noon — porcelain, white panels, ink type',
    themeColor: '#f4f2ec',
    heatRamp: 'daylight',
    header: 'gotham',
    glowScale: 0.55,
    swatches: ['#f4f2ec', '#ffffff', '#d99b00', '#1d2129'],
  },
  tacops: {
    id: 'tacops',
    name: 'Tac-Ops Console',
    tagline: 'Armored field terminal — blueprint grid, mono, optic green',
    themeColor: '#0b0d0a',
    heatRamp: 'standard',
    header: 'tacops',
    statusStrip: true,
    swatches: ['#0b0d0a', '#0e120b', '#9ee22e', '#dbe4d2'],
  },
  noir: {
    id: 'noir',
    name: 'Noir Ledger',
    tagline: 'Printed dossier — soot paper, ivory serif, vermilion duotone',
    themeColor: '#161211',
    heatRamp: 'noir',
    header: 'noir',
    figCaption: true,
    swatches: ['#161211', '#1d1916', '#e8481f', '#ece5da'],
  },
  ghost: {
    id: 'ghost',
    name: 'Ghost Protocol',
    tagline: 'Pure-OLED void — hairlines, thin numerals, ice cyan',
    themeColor: '#000000',
    heatRamp: 'standard',
    header: 'ghost',
    reflection: true,
    swatches: ['#000000', '#0b0d10', '#79d3ff', '#f2f3f5'],
  },
  ironworks: {
    id: 'ironworks',
    name: 'Ironworks',
    tagline: 'Brutalist gym poster — slab type, hard shadows, molten orange',
    themeColor: '#191714',
    heatRamp: 'standard',
    header: 'ironworks',
    swatches: ['#191714', '#1f1c18', '#ff5a1f', '#ede6dc'],
  },
  'ironworks-paper': {
    id: 'ironworks-paper',
    name: 'Ironworks — Paper',
    tagline: 'The poster screen-printed on bone paper — ink frames, print-ink heat',
    themeColor: '#ece7db',
    heatRamp: 'daylight',
    header: 'ironworks',
    glowScale: 0.5,
    swatches: ['#ece7db', '#f6f2e9', '#e8490f', '#211d18'],
  },
}

export const SKIN_IDS = Object.keys(SKINS) as SkinId[]

export const DEFAULT_SKIN: SkinId = 'gotham'

export function isSkinId(v: unknown): v is SkinId {
  return typeof v === 'string' && v in SKINS
}

/** Stamp the active skin onto <html> + keep the browser chrome tint in sync. */
export function applySkin(id: SkinId): void {
  document.documentElement.dataset.skin = id
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', SKINS[id].themeColor)
}
