import d3 from './d3.js'
import { visibleCountries } from './countries.js'
import { TIME_MARGIN, timeDomain, timeTicks } from './timeAxis.js'
import { BABYNAMES_CSV } from './paths.js'
import { genderColor } from './genders.js'

const BAR_HEIGHT = 10
// The empty rail is deliberately thin: at the same height as the bar it reads as one
// continuous object no matter what colour it is
const TRACK_HEIGHT = 3

function consecutiveRuns(entries) {
  const runs = []
  entries.forEach((entry) => {
    const last = runs[runs.length - 1]
    if (last && entry.year === last.end + 1) {
      last.end = entry.year
      last.entries.push(entry)
    } else {
      runs.push({ start: entry.year, end: entry.year, entries: [entry] })
    }
  })
  return runs
}

const listFormat = new Intl.ListFormat('en', { type: 'conjunction' })

export function setupDiffusionTimeline(panel, sunburstPanel, filterBar) {
  const chart = panel.querySelector('.timeline-chart')
  const subtitle = panel.querySelector('.timeline-subtitle')
  const startYearInput = filterBar.querySelector('#year-start')
  const endYearInput = filterBar.querySelector('#year-end')
  let rowsByName = new Map()
  let dataLoaded = false
  let selectedNames = []

  function yearInterval() {
    const startYear = Number(startYearInput.value)
    const endYear = Number(endYearInput.value)
    return [Math.min(startYear, endYear), Math.max(startYear, endYear)]
  }

  function countrySeries(name, startYear, endYear) {
    const rows = (rowsByName.get(name) ?? [])
      .filter((row) => row.year >= startYear && row.year <= endYear)
    return visibleCountries(filterBar).map((country) => {
      // Best rank per year, in case a name is listed for both sexes in one year
      const byYear = d3.rollup(
        rows.filter((row) => row.country === country.name),
        (items) => d3.least(items, (item) => item.rank),
        (row) => row.year
      )
      const entries = Array.from(byYear.values()).sort((left, right) => left.year - right.year)
      return {
        ...country,
        entries,
        runs: consecutiveRuns(entries),
        peak: d3.least(entries, (left, right) => left.rank - right.rank || left.year - right.year),
      }
    })
  }

  function showMessage(text) {
    const message = document.createElement('p')
    message.className = 'timeline-empty'
    message.textContent = text
    chart.append(message)
  }

  function render() {
    const width = Math.floor(chart.clientWidth)
    const height = Math.floor(chart.clientHeight)
    if (width < 1 || height < 1) return

    chart.replaceChildren()
    subtitle.textContent = selectedNames.length
      ? `When ${selectedNames.length === 1 ? 'was' : 'were'} ${listFormat.format(selectedNames)} in the top 10 in each country?`
      : 'Pick up to two names to compare their top-10 years across countries'

    if (!dataLoaded) return showMessage('Loading names…')
    if (!selectedNames.length) return showMessage('Select a name in the search or names list')

    const [startYear, endYear] = yearInterval()
    const countries = visibleCountries(filterBar)
    const multiple = selectedNames.length > 1
    // With several names the country rows open into one sub-row per name, always in
    // the order they were picked, so a name sits at the same height in every country
    const seriesByName = new Map(selectedNames.map((name) =>
      [name, countrySeries(name, startYear, endYear)]))
    const series = countries.map((country) => ({
      ...country,
      rows: selectedNames.map((name) => {
        const { entries, runs, peak } = seriesByName.get(name)
          .find((item) => item.name === country.name)
        return {
          name,
          sex: rowsByName.get(name)?.[0]?.sex,
          country: country.name,
          color: country.color,
          entries,
          runs,
          peak,
        }
      }),
    }))
    const margin = { top: 4, bottom: 24, ...TIME_MARGIN }

    const x = d3.scaleLinear()
      .domain(timeDomain(startYear, endYear))
      .range([margin.left, width - margin.right])
    const y = d3.scaleBand()
      .domain(countries.map((country) => country.name))
      .range([margin.top, height - margin.bottom])
      .paddingInner(multiple ? 0.18 : 0.15)
    const sub = d3.scaleBand()
      .domain(selectedNames)
      .range([0, y.bandwidth()])
    // The bar and its peak label have to fit the sub-row, which is a third as tall
    // with two names picked on a short screen
    const barHeight = Math.max(5, Math.min(BAR_HEIGHT, sub.bandwidth() * 0.32))
    const markerRadius = barHeight * 0.65
    const labelSize = Math.max(9, Math.min(11, sub.bandwidth() * 0.4))

    // Runs are drawn tick to tick, so a bar begins and ends exactly on the years the
    // name entered and last appeared, instead of overhanging by half a year each side
    const runBox = (run) => {
      const left = x(run.start)
      const span = x(run.end) - left
      if (span >= barHeight) return { x: left, width: span }
      // A single-year run would otherwise be zero-wide: centre a dot on its tick
      return { x: left - (barHeight - span) / 2, width: barHeight }
    }

    const svg = d3.select(chart)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img')
      .attr('aria-label', `Years ${listFormat.format(selectedNames)} ${multiple ? 'were' : 'was'} in the top 10 in ${listFormat.format(countries.map((country) => country.name))}, ${startYear}–${endYear}`)

    // A quiet band behind each country holds its sub-rows together as one group
    if (multiple) {
      svg.append('g')
        .attr('class', 'timeline-groups')
        .selectAll('rect')
        .data(countries)
        .join('rect')
        .attr('class', 'timeline-group')
        .attr('x', margin.left - 6)
        .attr('y', (country) => y(country.name))
        .attr('width', width - margin.left - margin.right + 12)
        .attr('height', y.bandwidth())
        .attr('rx', 4)
    }

    const ticks = timeTicks(startYear, endYear, width - margin.left - margin.right)
    svg.append('g')
      .attr('class', 'timeline-grid')
      .selectAll('line')
      .data(ticks)
      .join('line')
      .attr('x1', (year) => x(year))
      .attr('x2', (year) => x(year))
      .attr('y1', margin.top)
      .attr('y2', height - margin.bottom)

    svg.append('g')
      .attr('class', 'timeline-axis')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickValues(ticks).tickFormat(d3.format('d')).tickSizeOuter(0))

    const countryGroups = svg.selectAll('.timeline-country-group')
      .data(series)
      .join('g')
      .attr('class', 'timeline-country-group')
      .attr('transform', (country) => `translate(0,${y(country.name)})`)

    countryGroups.append('text')
      .attr('class', 'timeline-country')
      .attr('x', margin.left - 12)
      .attr('y', y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .text((country) => country.name)

    const rowGroups = countryGroups.selectAll('.timeline-row')
      .data((country) => country.rows)
      .join('g')
      .attr('class', 'timeline-row')
      .attr('transform', (row) => `translate(0,${sub(row.name) + sub.bandwidth() / 2})`)

    // Countries label the left edge, names the right: each axis of the grid gets its
    // own margin, and the name keeps its gender colour from the search chips
    if (multiple) {
      rowGroups.append('text')
        .attr('class', 'timeline-name')
        .attr('x', width - margin.right + 10)
        .attr('dy', '0.35em')
        .attr('fill', (row) => genderColor(row.sex))
        .text((row) => row.name)
    }

    rowGroups.append('rect')
      .attr('class', 'timeline-track')
      .attr('x', x(startYear))
      .attr('y', -TRACK_HEIGHT / 2)
      .attr('width', x(endYear) - x(startYear))
      .attr('height', TRACK_HEIGHT)
      .attr('rx', TRACK_HEIGHT / 2)

    rowGroups.each(function drawRow(row) {
      const group = d3.select(this)

      // An empty rail already reads as "not in the top 10", and the legend says so
      if (!row.entries.length) return

      group.selectAll('.timeline-run')
        .data(row.runs)
        .join('rect')
        .attr('class', 'timeline-run')
        .attr('x', (run) => runBox(run).x)
        .attr('y', -barHeight / 2)
        .attr('width', (run) => runBox(run).width)
        .attr('height', barHeight)
        .attr('rx', barHeight / 2)
        .attr('fill', row.color)
        .append('title')
        .text((run) => [
          `${row.name} in ${row.country}, ${run.start === run.end ? run.start : `${run.start}–${run.end}`}`,
          ...run.entries.map((entry) => `${entry.year}: #${entry.rank} (${entry.count.toLocaleString()} babies)`),
        ].join('\n'))

      const { peak } = row
      const peakColor = d3.color(row.color).darker(1.2).formatHex()
      group.append('circle')
        .attr('class', 'timeline-marker')
        .attr('cx', x(peak.year))
        .attr('r', markerRadius)
        .attr('fill', peakColor)
        .append('title')
        .text(`${row.name} in ${row.country} peaked at #${peak.rank} in ${peak.year}`)

      // Nudge the label inwards so it stays readable when the peak sits at either end
      group.append('text')
        .attr('class', 'timeline-peak-label')
        .attr('x', Math.min(Math.max(x(peak.year), margin.left + 12), width - margin.right - 12))
        .attr('y', -markerRadius - 2)
        .attr('fill', peakColor)
        .style('font-size', `${labelSize}px`)
        .text(`#${peak.rank}`)
    })
  }

  sunburstPanel.addEventListener('namechange', (event) => {
    selectedNames = event.detail.names
    render()
  })

  startYearInput.addEventListener('input', render)
  endYearInput.addEventListener('input', render)
  filterBar.querySelectorAll('input[name="country"]')
    .forEach((input) => input.addEventListener('change', render))
  new ResizeObserver(render).observe(chart)

  d3.csv(BABYNAMES_CSV, (row) => ({
    country: row.country,
    year: Number(row.year),
    sex: row.sex,
    rank: Number(row.rank),
    count: Number(row.count) || 0,
    name: row.name.normalize('NFC'),
  })).then((rows) => {
    rowsByName = d3.group(rows, (row) => row.name)
    dataLoaded = true
    render()
  }).catch(() => {
    chart.replaceChildren()
    showMessage('Dataset unavailable')
  })
}
