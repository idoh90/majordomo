import type { ConsoleModule } from '../core/module'
import { capitalConsole } from '../modules/capital'
import { trainingConsole } from '../modules/training'
import { watchConsole } from '../modules/watch'

// registry order = tab order after the Manor
export const CONSOLES: ConsoleModule[] = [watchConsole, trainingConsole, capitalConsole]
