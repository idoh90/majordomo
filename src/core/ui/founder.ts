/**
 * Founder-only asset bundle: the seven original skin directions and their
 * typefaces. Loaded via dynamic import from main.tsx only when
 * VITE_FOUNDER_SKIN=1 — commercial builds tree-shake all of this away.
 * (Loading is async, so a founder machine may flash default-styled for a
 * frame on a founder skin; acceptable for a single local machine.)
 */
import '@fontsource/rajdhani/500.css'
import '@fontsource/rajdhani/600.css'
import '@fontsource/rajdhani/700.css'
import '@fontsource/chakra-petch/500.css'
import '@fontsource/chakra-petch/600.css'
import '@fontsource/chakra-petch/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource/saira/200.css'
import '@fontsource/saira/300.css'
import '@fontsource/saira/400.css'
import '@fontsource/saira/500.css'
import '@fontsource/saira/600.css'
import '@fontsource/anton/400.css'
import './founder-skins.css'
