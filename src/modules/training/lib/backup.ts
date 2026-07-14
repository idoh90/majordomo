import type { ExportFile, MuscleId, Workout } from '../types'
import { voice } from '../../../core/voice'
import { MUSCLES } from '../data/muscles'

export function buildExport(workouts: Workout[]): ExportFile {
  return {
    app: 'majordomo-training',
    version: 1,
    exportedAt: new Date().toISOString(),
    workouts,
  }
}

export function serializeExport(workouts: Workout[]): string {
  return JSON.stringify(buildExport(workouts), null, 2)
}

function isMuscleId(x: unknown): x is MuscleId {
  return typeof x === 'string' && x in MUSCLES
}

function isScore(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 10
}

function isWorkout(x: unknown): x is Workout {
  if (typeof x !== 'object' || x === null) return false
  const w = x as Record<string, unknown>
  return (
    typeof w.id === 'string' &&
    typeof w.performedAt === 'string' &&
    !Number.isNaN(Date.parse(w.performedAt)) &&
    typeof w.createdAt === 'string' &&
    (w.method === 'ppl' || w.method === 'custom') &&
    (w.ppl === undefined || w.ppl === 'push' || w.ppl === 'pull' || w.ppl === 'legs') &&
    (w.repStyle === undefined ||
      w.repStyle === 'light' ||
      w.repStyle === 'mixed' ||
      w.repStyle === 'heavy') &&
    Array.isArray(w.primary) &&
    w.primary.every(isMuscleId) &&
    Array.isArray(w.secondary) &&
    w.secondary.every(isMuscleId) &&
    isScore(w.effort) &&
    isScore(w.strainFeel)
  )
}

export type ImportResult = { ok: true; workouts: Workout[] } | { ok: false; error: string }

/** Never trust pasted or uploaded JSON — validate every record. */
export function parseImport(json: string): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return { ok: false, error: 'That is not valid JSON.' }
  }
  if (typeof data !== 'object' || data === null) {
    return { ok: false, error: 'Unexpected file format.' }
  }
  const d = data as Record<string, unknown>
  // 'batman-workouts' is the pre-pivot tag — files exported before the rename
  // live on people's disks, so it stays accepted forever
  if (d.app !== 'majordomo-training' && d.app !== 'batman-workouts') {
    return { ok: false, error: voice.backup.notExportFile }
  }
  if (!Array.isArray(d.workouts)) {
    return { ok: false, error: 'The file has no workout list.' }
  }
  const badIndex = d.workouts.findIndex((w) => !isWorkout(w))
  if (badIndex !== -1) {
    return { ok: false, error: `Workout #${badIndex + 1} in the file is malformed.` }
  }
  return { ok: true, workouts: d.workouts as Workout[] }
}

export function downloadJson(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
