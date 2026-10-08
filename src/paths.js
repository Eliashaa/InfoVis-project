// Resolve the bundled dataset relative to this module on any local static server.
export const BABYNAMES_CSV = new URL(
  '../public/scandinavia_top10_babynames_2000_2022.csv',
  import.meta.url,
).href
