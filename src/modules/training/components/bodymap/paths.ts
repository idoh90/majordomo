import type { MuscleId } from '../../types'

// All shapes live in a 200 x 440 viewBox per view.
// Paired muscles are authored as LEFT-half paths only (x < 100) and rendered
// twice — once as-is, once inside transform="translate(200 0) scale(-1 1)" —
// which guarantees perfect symmetry. Central muscles (abs, traps-back,
// lower-back) are authored full-width with mirror: false.
//
// Landmarks: crown y=12, chin y=48, shoulder y=66, armpit y=98, elbow y=148,
// wrist y=204, hip y=215, crotch y=230, knee y=310, ankle y=412, toes y=432.

export interface PlateDef {
  muscle: MuscleId
  d: string
  /** render a mirrored right-side copy (default true for paired muscles) */
  mirror: boolean
}

/**
 * Left half of the body silhouette, closed along the centerline (x=100).
 * Shared by front and back views. The right half is the mirrored copy;
 * both use the same fill so the centerline seam is invisible.
 */
export const SILHOUETTE_HALF = [
  'M 100 12',
  'C 90 12 84 20 84 30', // skull left
  'C 84 38 88 44 93 48', // jaw
  'L 92 58', // neck
  'C 82 62 68 63 58 66', // trap slope to shoulder
  'C 46 70 40 78 39 88', // deltoid cap
  'C 36 104 34 124 35 146', // upper arm outer
  'C 32 168 29 186 27 202', // forearm outer
  'C 24 210 23 220 26 228', // hand outer
  'C 28 234 33 234 35 228', // fingertips
  'C 37 222 38 214 38 206', // hand inner
  'C 41 188 44 172 47 152', // forearm inner
  'C 50 132 52 116 54 98', // upper arm inner to armpit
  'C 56 93 58 91 61 93', // armpit notch
  'C 63 104 64 122 66 140', // lat line to waist
  'C 66 158 62 176 60 194', // waist to hip
  'C 58 204 58 210 60 218', // hip corner
  'C 63 244 65 276 67 306', // outer thigh
  'C 68 316 68 322 69 330', // knee outer
  'C 72 342 73 358 71 376', // calf outer
  'C 70 390 70 400 71 410', // ankle outer
  'L 66 424', // heel
  'C 66 430 70 432 76 432', // toes
  'L 86 430',
  'L 88 416', // ankle inner
  'C 90 400 90 386 88 372', // inner calf
  'C 86 356 85 342 86 330',
  'C 87 322 87 316 88 310', // knee inner
  'C 90 290 93 260 96 238', // inner thigh
  'C 97 234 99 232 100 230', // crotch
  'Z',
].join(' ')

export const FRONT_PLATES: PlateDef[] = [
  // neck → shoulder slope sliver
  { muscle: 'traps', mirror: true, d: 'M 79 54 L 90 51 L 94 61 L 70 64 Z' },
  { muscle: 'front-delts', mirror: true, d: 'M 56 66 L 66 65 L 62 80 L 50 78 Z' },
  { muscle: 'side-delts', mirror: true, d: 'M 48 68 L 54 84 L 48 98 L 41 92 L 40 78 Z' },
  {
    muscle: 'chest',
    mirror: true,
    d: 'M 98 70 L 74 68 L 64 78 L 65 92 L 74 104 L 98 106 Z',
  },
  { muscle: 'biceps', mirror: true, d: 'M 43 100 L 50 104 L 48 142 L 38 140 L 37 114 Z' },
  { muscle: 'forearms', mirror: true, d: 'M 35 154 L 44 156 L 41 198 L 31 196 Z' },
  {
    muscle: 'abs',
    mirror: false,
    d: [
      'M 90 112 L 110 112 L 110 130 L 90 130 Z',
      'M 90 134 L 110 134 L 110 152 L 90 152 Z',
      'M 91 156 L 109 156 L 106 188 L 100 194 L 94 188 Z',
    ].join(' '),
  },
  {
    muscle: 'obliques',
    mirror: true,
    d: 'M 86 116 L 86 160 L 80 168 L 72 150 L 68 134 L 74 114 Z',
  },
  {
    muscle: 'quads',
    mirror: true,
    d: 'M 92 238 L 64 222 L 62 258 L 68 302 L 84 308 L 91 268 Z',
  },
]

export const BACK_PLATES: PlateDef[] = [
  // central kite between the shoulder blades
  { muscle: 'traps', mirror: false, d: 'M 100 50 L 78 60 L 100 98 L 122 60 Z' },
  { muscle: 'rear-delts', mirror: true, d: 'M 58 66 L 44 70 L 40 86 L 48 96 L 58 88 L 62 72 Z' },
  { muscle: 'triceps', mirror: true, d: 'M 43 100 L 50 106 L 47 144 L 37 142 L 37 112 Z' },
  { muscle: 'forearms', mirror: true, d: 'M 35 154 L 44 156 L 41 198 L 31 196 Z' },
  {
    muscle: 'lats',
    mirror: true,
    d: 'M 96 104 L 74 96 L 62 100 L 64 124 L 70 150 L 88 162 L 95 132 Z',
  },
  {
    muscle: 'lower-back',
    mirror: false,
    d: 'M 87 167 L 113 167 L 115 178 L 108 200 L 92 200 L 85 178 Z',
  },
  {
    muscle: 'glutes',
    mirror: true,
    d: 'M 97 204 L 76 202 L 66 214 L 66 234 L 76 248 L 95 246 L 99 224 Z',
  },
  {
    muscle: 'hamstrings',
    mirror: true,
    d: 'M 93 254 L 68 250 L 64 280 L 68 306 L 84 310 L 91 278 Z',
  },
  { muscle: 'calves', mirror: true, d: 'M 85 328 L 72 326 L 69 350 L 72 382 L 80 392 L 86 360 Z' },
]
