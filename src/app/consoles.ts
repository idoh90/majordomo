import type { ConsoleModule } from '../core/module'
import { capitalConsole } from '../modules/capital'
import { studyConsole } from '../modules/study'
import { trainingConsole } from '../modules/training'
import { watchConsole } from '../modules/watch'
import { workshopConsole } from '../modules/workshop'

// The house's own order, and the DEFAULT tab order after the Manor. What a
// household has since done with it — reordered, switched some off — lives in
// `app/wings.ts`, and that is what both navs read. Adding a wing here still
// puts it on the navs: an id no saved order mentions is appended, never lost.
export const CONSOLES: ConsoleModule[] = [
  trainingConsole,
  workshopConsole,
  capitalConsole,
  studyConsole,
  watchConsole,
]
