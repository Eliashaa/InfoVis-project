import * as d3 from 'd3'
import { visibleCountries } from './countries.js'
import { TIME_MARGIN, timeDomain, timeTicks } from './timeAxis.js'

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

export function setupDiffusionTimeline(panel, sunburstPanel, filterBar) {
  const chart = panel.querySelector('.timeline-chart')
  const subtitle = panel.querySelector('.timeline-subtitle')
  const startYearInput = filterBar.querySelector('#year-start')
  const endYearInput = filterBar.querySelector('#year-end')
  let rowsByName = new Map()
  let dataLoaded = false
  let selectedName = null

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
    subtitle.textContent = selectedName
      ? `When was ${selectedName} in the top 10 in each country?`
      : 'Pick a name to compare its top-10 years across countries'

    if (!dataLoaded) return showMessage('Loading names…')
    if (!selectedName) return showMessage('Select a name in the search or names list')

    const [startYear, endYear] = yearInterval()
    const series = countrySeries(selectedName, startYear, endYear)
    const margin = { top: 4, bottom: 24, ...TIME_MARGIN }

    const x = d3.scaleLinear()
      .domain(timeDomain(startYear, endYear))
      .range([margin.left, width - margin.right])
    const y = d3.scaleBand()
      .domain(visibleCountries(filterBar).map((country) => country.name))
      .range([margin.top, height - margin.bottom])
      .paddingInner(0.15)
    const barCenter = (country) => y(country) + y.bandwidth() / 2

    // Runs are drawn tick to tick, so a bar begins and ends exactly on the years the
    // name entered and last appeared, instead of overhanging by half a year each side
    const runBox = (run) => {
      const left = x(run.start)
      const span = x(run.end) - left
      if (span >= BAR_HEIGHT) return { x: left, width: span }
      // A single-year run would otherwise be zero-wide: centre a dot on its tick
      return { x: left - (BAR_HEIGHT - span) / 2, width: BAR_HEIGHT }
    }

    const svg = d3.select(chart)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img')
      .attr('aria-label', `Years ${selectedName} was in the top 10 in Sweden, Norway and Denmark, ${startYear}–${endYear}`)

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

    const rowGroups = svg.selectAll('.timeline-row')
      .data(series)
      .join('g')
      .attr('class', 'timeline-row')
      .attr('transform', (country) => `translate(0,${barCenter(country.name)})`)

    rowGroups.append('text')
      .attr('class', 'timeline-country')
      .attr('x', margin.left - 12)
      .attr('dy', '0.35em')
      .text((country) => country.name)

    rowGroups.append('rect')
      .attr('class', 'timeline-track')
      .attr('x', x(startYear))
      .attr('y', -TRACK_HEIGHT / 2)
      .attr('width', x(endYear) - x(startYear))
      .attr('height', TRACK_HEIGHT)
      .attr('rx', TRACK_HEIGHT / 2)

    rowGroups.each(function drawRow(country) {
      const row = d3.select(this)

      if (!country.entries.length) {
        row.append('text')
          .attr('class', 'timeline-absent')
          .attr('x', (x(startYear) + x(endYear)) / 2)
          .attr('y', -BAR_HEIGHT)
          .text('Not in the top 10')
        return
      }

      row.selectAll('.timeline-run')
        .data(country.runs)
        .join('rect')
        .attr('class', 'timeline-run')
        .attr('x', (run) => runBox(run).x)
        .attr('y', -BAR_HEIGHT / 2)
        .attr('width', (run) => runBox(run).width)
        .attr('height', BAR_HEIGHT)
        .attr('rx', BAR_HEIGHT / 2)
        .attr('fill', country.color)
        .append('title')
        .text((run) => [
          `${country.name} · ${run.start === run.end ? run.start : `${run.start}–${run.end}`}`,
          ...run.entries.map((entry) => `${entry.year}: #${entry.rank} (${entry.count.toLocaleString()} babies)`),
        ].join('\n'))

      const { peak } = country
      const peakColor = d3.color(country.color).darker(1.2).formatHex()
      row.append('circle')
        .attr('class', 'timeline-marker')
        .attr('cx', x(peak.year))
        .attr('r', 6.5)
        .attr('fill', peakColor)
        .append('title')
        .text(`${country.name} peak: #${peak.rank} in ${peak.year}`)

      // Nudge the label inwards so it stays readable when the peak sits at either end
      row.append('text')
        .attr('class', 'timeline-peak-label')
        .attr('x', Math.min(Math.max(x(peak.year), margin.left + 12), width - margin.right - 12))
        .attr('y', -BAR_HEIGHT - 2)
        .attr('fill', peakColor)
        .text(`#${peak.rank}`)
    })
  }

  sunburstPanel.addEventListener('namechange', (event) => {
    selectedName = event.detail.name
    render()
  })

  startYearInput.addEventListener('input', render)
  endYearInput.addEventListener('input', render)
  filterBar.querySelectorAll('input[name="country"]')
    .forEach((input) => input.addEventListener('change', render))
  new ResizeObserver(render).observe(chart)

  d3.csv('/scandinavia_top10_babynames_2000_2022.csv', (row) => ({
    country: row.country,
    year: Number(row.year),
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
