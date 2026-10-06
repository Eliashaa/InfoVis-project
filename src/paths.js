// Files in public/ are served from the site root by Vite, but a plain static
// server (VS Code Live Server) serves the repo as-is, so they stay under
// public/. import.meta.env only exists under Vite, which tells the two apart.
const PUBLIC_BASE = import.meta.env?.BASE_URL ?? './public/'

export const BABYNAMES_CSV = PUBLIC_BASE + 'scandinavia_top10_babynames_2000_2022.csv'
