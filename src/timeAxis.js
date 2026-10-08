import d3 from './d3.js'

// The turnover chart and the diffusion timeline sit one above the other in the left
// column, so they share their horizontal geometry: the same margins and the same
// domain mean a given year lands on the same pixel in both. That is what lets the two
// be read as one picture - a churn spike above, the year a name arrived below.
//
// The left margin is set by the timeline's country labels, the right by the turnover
// chart's end-of-line labels; each panel gives up some space so the pair lines up.
export const TIME_MARGIN = { left: 74, right: 62 }

// Half a year of padding at each end keeps marks off the panel edges
export function timeDomain(startYear, endYear) {
  return [startYear - 0.5, endYear + 0.5]
}

export function timeTicks(startYear, endYear, innerWidth) {
  const maxTicks = Math.max(1, Math.floor(innerWidth / 50))
  return d3.ticks(startYear, endYear, Math.min(endYear - startYear + 1, maxTicks))
    .filter(Number.isInteger)
}
