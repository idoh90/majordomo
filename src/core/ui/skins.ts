/**
 * App skins. The three commercial presets (Midnight / Terminal / Aurora) come
 * from the "Majordomo: Calendar OS" design project (`Majordomo Tokens.dc.html`);
 * the seven original design directions live on behind the founder flag: their
 * defs sit in a build-time-false branch below and their CSS loads from
 * founder-skins.css, so commercial builds carry neither the styles nor the
 * strings. Colors, borders, radii, shadows and fonts live in CSS as per-skin
 * variable bundles (`html[data-skin=…]`); this module only holds identity +
 * the few flags that need JS (heat ramp, structural extras, picker metadata).
 */

import { FOUNDER } from '../founder'

type PresetSkinId = 'midnight' | 'terminal' | 'aurora'
type FounderSkinId =
  | 'gotham'
  | 'gotham-day'
  | 'tacops'
  | 'noir'
  | 'ghost'
  | 'ironworks'
  | 'ironworks-paper'

export type SkinId = PresetSkinId | FounderSkinId

export interface SkinDef {
  id: SkinId
  name: string
  tagline: string
  /** <meta name="theme-color"> value (browser chrome tint) */
  themeColor: string
  /** which strain→color ramp the body map + legend use */
  heatRamp: 'standard' | 'noir' | 'daylight'
  /** multiplier on the body-map glow layer (light skins damp it) */
  glowScale?: number
  /** hologram floor reflection under the body map */
  reflection?: boolean
  /** body-map caption reads like a printed figure caption */
  figCaption?: boolean
  /** swatch dots for the skin picker: [bg, panel, accent, ink] */
  swatches: [string, string, string, string]
}

const PRESET_SKINS: Record<PresetSkinId, SkinDef> = {
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    tagline: 'Near-black blue-grey, steel-blue accent — a quiet house at night',
    themeColor: '#0c1017',
    heatRamp: 'standard',
    swatches: ['#0c1017', '#131926', '#7da7d0', '#e6ebf2'],
  },
  terminal: {
    id: 'terminal',
    name: 'Terminal',
    tagline: 'True black, green phosphor — for the OLED shift at 03:00',
    themeColor: '#000000',
    heatRamp: 'standard',
    swatches: ['#000000', '#0a0f0c', '#3fe0a8', '#d9efe2'],
  },
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    tagline: 'Deep navy-purple, purple-gold — the estate under strange skies',
    themeColor: '#131022',
    heatRamp: 'standard',
    swatches: ['#131022', '#1a1630', '#b294f5', '#ece7f7'],
  },
}

/** Founder-era skin defs — referenced only inside a build-time-false branch
 *  in commercial builds, so the ids and names below never ship. */
const FOUNDER_SKINS: Record<FounderSkinId, SkinDef> = {
  gotham: {
    id: 'gotham',
    name: 'Gotham Gold',
    tagline: 'Layered gunmetal, hairline gold, cinematic heat glow',
    themeColor: '#0a0b0e',
    heatRamp: 'standard',
    swatches: ['#0a0b0e', '#14171d', '#f5b301', '#e8eaed'],
  },
  'gotham-day': {
    id: 'gotham-day',
    name: 'Gotham Gold — Daylight',
    tagline: 'The refined identity at noon — porcelain, white panels, ink type',
    themeColor: '#f4f2ec',
    heatRamp: 'daylight',
    glowScale: 0.55,
    swatches: ['#f4f2ec', '#ffffff', '#d99b00', '#1d2129'],
  },
  tacops: {
    id: 'tacops',
    name: 'Tac-Ops Console',
    tagline: 'Armored field terminal — blueprint grid, mono, optic green',
    themeColor: '#0b0d0a',
    heatRamp: 'standard',
    swatches: ['#0b0d0a', '#0e120b', '#9ee22e', '#dbe4d2'],
  },
  noir: {
    id: 'noir',
    name: 'Noir Ledger',
    tagline: 'Printed dossier — soot paper, ivory serif, vermilion duotone',
    themeColor: '#161211',
    heatRamp: 'noir',
    figCaption: true,
    swatches: ['#161211', '#1d1916', '#e8481f', '#ece5da'],
  },
  ghost: {
    id: 'ghost',
    name: 'Ghost Protocol',
    tagline: 'Pure-OLED void — hairlines, thin numerals, ice cyan',
    themeColor: '#000000',
    heatRamp: 'standard',
    reflection: true,
    swatches: ['#000000', '#0b0d10', '#79d3ff', '#f2f3f5'],
  },
  ironworks: {
    id: 'ironworks',
    name: 'Ironworks',
    tagline: 'Brutalist gym poster — slab type, hard shadows, molten orange',
    themeColor: '#191714',
    heatRamp: 'standard',
    swatches: ['#191714', '#1f1c18', '#ff5a1f', '#ede6dc'],
  },
  'ironworks-paper': {
    id: 'ironworks-paper',
    name: 'Ironworks — Paper',
    tagline: 'The poster screen-printed on bone paper — ink frames, print-ink heat',
    themeColor: '#ece7db',
    heatRamp: 'daylight',
    glowScale: 0.5,
    swatches: ['#ece7db', '#f6f2e9', '#e8490f', '#211d18'],
  },
}

/**
 * The live registry. In commercial builds the founder spread folds to `{}`,
 * so legacy ids simply aren't registered: `isSkinId('gotham')` is false and
 * everything normalizes to the default. On founder machines all ten exist.
 */
export const SKINS = {
  ...PRESET_SKINS,
  ...(FOUNDER ? FOUNDER_SKINS : ({} as Record<FounderSkinId, SkinDef>)),
} as Record<SkinId, SkinDef>

export const SKIN_IDS = Object.keys(SKINS) as SkinId[]

/** the commercial trio, for surfaces that only ever show presets (header dots) */
export const PRESET_SKIN_IDS: readonly SkinId[] = ['midnight', 'terminal', 'aurora']

export const DEFAULT_SKIN: SkinId = 'midnight'

export function isSkinId(v: unknown): v is SkinId {
  return typeof v === 'string' && v in SKINS
}

/** Coerce any persisted/URL value to a registered skin (default fallback). */
export function normalizeSkin(v: unknown): SkinId {
  return isSkinId(v) ? v : DEFAULT_SKIN
}

/** Stamp the active skin onto <html> + keep the browser chrome tint in sync. */
export function applySkin(id: SkinId): void {
  document.documentElement.dataset.skin = id
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', SKINS[id].themeColor)
}
