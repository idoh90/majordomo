import type { ConsoleModule } from '../core/module'
import { capitalConsole } from '../modules/capital'
import { studyConsole } from '../modules/study'
import { trainingConsole } from '../modules/training'
import { watchConsole } from '../modules/watch'
import { workshopConsole } from '../modules/workshop'

// registry order = tab order after the Manor, and it also decides the mobile
// split: the first INLINE_WINGS ride the bar, the rest fold behind WINGS.
export const CONSOLES: ConsoleModule[] = [
  trainingConsole,
  workshopConsole,
  capitalConsole,
  studyConsole,
  watchConsole,
]
