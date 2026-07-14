/**
 * Local founder flag — set `VITE_FOUNDER_SKIN=1` in `.env.local` (gitignored,
 * never committed). Gates the original Batman-era skins and strings on the
 * founder's machine only. The env var is replaced statically at build time,
 * so in commercial builds everything behind this flag tree-shakes away.
 */
export const FOUNDER = import.meta.env.VITE_FOUNDER_SKIN === '1'
