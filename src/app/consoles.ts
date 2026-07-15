import type { ConsoleModule } from '../core/module'
import { capitalConsole } from '../modules/capital'
import { studyConsole } from '../modules/study'
import { trainingConsole } from '../modules/training'
import { watchConsole } from '../modules/watch'

// registry order = tab order after the Manor (the Ledger, demoted wing, goes last)
export const CONSOLES: ConsoleModule[] = [watchConsole, trainingConsole, studyConsole, capitalConsole]
