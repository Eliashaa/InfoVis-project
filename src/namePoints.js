import d3 from './d3.js'
import { visibleCountries } from './countries.js'

// What a name did in one country, reduced to the handful of numbers the two scatter
// panels plot. Both read the same derivation so they can never disagree about how long
// a name lasted or where it peaked - they only differ in which pair they put on the
// axes.

// Stable per-name offset, so dots do not jump between renders. 112 names land on only
// ~76 integer cells - 15 of them share (0, 1) alone - so without this the charts would
// read as far emptier than they are.
export function jitter(name, salt) {
  let hash = salt
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0
  }
  return ((hash >>> 0) % 1000) / 1000 - 0.5
}

// One point per name AND country: a name rises and fades on its own schedule in each
// country, so pooling them would average away the very differences these charts and
// the diffusion timeline exist to show. Emma is three points, not one.
export function namePoints(rows, filterBar, [startYear, endYear]) {
  const gender = filterBar.querySelector('input[name="gender"]:checked').value
  const inWindow = rows.filter((row) =>
    row.year >= startYear && row.year <= endYear &&
    (gender === 'all' || row.sex === gender))

  return visibleCountries(filterBar).flatMap((country) => {
    const forCountry = inWindow.filter((row) => row.country === country.name)
    return Array.from(d3.group(forCountry, (row) => row.name), ([name, items]) => {
      const years = Array.from(new Set(items.map((item) => item.year)))
        .sort((left, right) => left - right)
      const best = d3.least(items, (left, right) =>
        left.rank - right.rank || left.year - right.year)
      const firstYear = years[0]
      const lastYear = years[years.length - 1]

      return {
        name,
        country,
        rise: best.year - firstYear,
        longevity: years.length,
        peakRank: best.rank,
        peakYear: best.year,
        firstYear,
        lastYear,
        // Already listed when the window opens, or still listed when it closes: we
        // never saw it arrive or leave, so both numbers are lower bounds
        censored: firstYear === startYear || lastYear === endYear,
      }
    })
  })
}
