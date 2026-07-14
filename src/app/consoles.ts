import type { ConsoleModule } from '../core/module'
import { capitalConsole } from '../modules/capital'
import { trainingConsole } from '../modules/training'

export const CONSOLES: ConsoleModule[] = [trainingConsole, capitalConsole]
