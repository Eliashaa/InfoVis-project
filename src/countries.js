// One country, one colour, shared by every panel that draws per-country marks.
//
// These come from the validated categorical palette. The original set
// (#2f6db5 / #d4692a / #3d8b40) failed the colourblind gate outright: Norway and
// Denmark sat at CVD dE 2.8, effectively the same colour to a red-blind reader.
//
// Blue / red / aqua passes, but Norway and Denmark land in the CVD warn band
// (dE 6.9 deutan), which is only legal alongside a second cue. Every panel has one:
// row labels on the timeline, end-of-line labels on the turnover chart, and country
// labels on the selected dots in the scatter.
export const COUNTRIES = [
  { name: 'Sweden', code: 'SE', color: '#2a78d6' },
  { name: 'Norway', code: 'NO', color: '#e34948' },
  { name: 'Denmark', code: 'DK', color: '#1baf7a' },
]

export function selectedCountry(filterBar) {
  return filterBar.querySelector('input[name="country"]:checked')?.value ?? 'all'
}

// The country filter subsets the list every per-country panel iterates, so one choice
// drives the timeline's rows, the turnover lines and the scatter's dots alike.
export function visibleCountries(filterBar) {
  const value = selectedCountry(filterBar)
  return value === 'all' ? COUNTRIES : COUNTRIES.filter((country) => country.name === value)
}
