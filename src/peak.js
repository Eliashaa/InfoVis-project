import * as d3 from 'd3'
import { visibleCountries } from './countries.js'
import { BABYNAMES_CSV } from './paths.js'
import { jitter, namePoints } from './namePoints.js'

// The lifecycle scatter asks how FAST a name climbed; this one asks how HIGH it got,
// against the same longevity axis. That turns the cloud into four readable corners:
// top left is the name that reached number one and stayed for years, bottom right the
// one that scraped rank 10 for a season and vanished. Same derivation as the lifecycle
// panel - see namePoints.js - so the two can never disagree about a name.
const MUTED_COLOR = '#c9c7cd'
const RANKS = 10

// Density ramp for the honeycomb view: one hue, light to dark, in an orange no other
// panel uses. This is a SEQUENTIAL scale, not an ordinal one, so the palest step is
// allowed to recede toward the white surface - "one name here" should sit quietly
// while the crowded cells carry the weight. The hairline stroke in the CSS is what
// keeps those pale cells locatable.
const DENSITY = ['#fbe3d5', '#f6bb9b', '#ef8c5d', '#d9612b', '#9c4019']
const DENSITY_BANDS = [2, 3, 4, 6]
const DENSITY_LABELS = ['1', '2', '3', '4–5', '6+']

// Both axes are whole numbers, so every point lands on one of 10 x 23 lattice cells.
// The honeycomb draws those cells directly: one hexagon per occupied cell, centred on
// its true coordinates. Real hex binning offsets alternate rows by half a cell to make
// them tessellate, which would shift names off the rank they actually reached - so the
// hexagons here sit on the lattice and simply do not interlock.
function hexPoints(cx, cy, radius) {
  return d3.range(6).map((corner) => {
    const angle = (Math.PI / 180) * (60 * corner - 30)
    return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`
  }).join(' ')
}

export function setupPeakScatter(panel, sunburstPanel, filterBar) {
  const chart = panel.querySelector('.peak-chart')
  const subtitle = panel.querySelector('.peak-subtitle')
  const startYearInput = filterBar.querySelector('#year-start')
  const endYearInput = filterBar.querySelector('#year-end')
  let rows = []
  let dataLoaded = false
  let selectedName = null

  function yearInterval() {
    const startYear = Number(startYearInput.value)
    const endYear = Number(endYearInput.value)
    return [Math.min(startYear, endYear), Math.max(startYear, endYear)]
  }

  function view() {
    return panel.querySelector('input[name="peak-view"]:checked').value
  }

  function showMessage(text) {
    const message = document.createElement('p')
    message.className = 'peak-empty'
    message.textContent = text
    chart.append(message)
  }

  function renderLegend(bands) {
    const legend = panel.querySelector('.peak-legend')
    legend.replaceChildren()

    if (bands) {
      const scale = document.createElement('span')
      scale.className = 'peak-scale'
      scale.append('Names in cell:')
      DENSITY.forEach((fill, index) => {
        const swatch = document.createElement('i')
        swatch.style.background = fill
        scale.append(swatch, DENSITY_LABELS[index])
      })
      scale.append(`· busiest cell holds ${bands.topShare} of the field`)
      legend.append(scale)
      const ridgeKey = document.createElement('span')
      const ridgeMark = document.createElement('i')
      ridgeMark.className = 'peak-ridge-key'
      ridgeKey.append(ridgeMark, 'Median run at each peak')
      legend.append(ridgeKey)
      return
    }

    visibleCountries(filterBar).forEach((country) => {
      const item = document.createElement('span')
      const swatch = document.createElement('i')
      swatch.className = 'peak-swatch'
      swatch.style.background = country.color
      item.append(swatch, country.name)
      legend.append(item)
    })
    const ridgeKey = document.createElement('span')
    const ridgeMark = document.createElement('i')
    ridgeMark.className = 'peak-ridge-key'
    ridgeKey.append(ridgeMark, 'Median run at each peak')
    legend.append(ridgeKey)
  }

  function render() {
    const width = Math.floor(chart.clientWidth)
    const height = Math.floor(chart.clientHeight)
    if (width < 1 || height < 1) return

    chart.replaceChildren()
    if (!dataLoaded) return showMessage('Loading names…')

    const [startYear, endYear] = yearInterval()
    const points = namePoints(rows, filterBar, [startYear, endYear])
    if (!points.length) return showMessage('No names match these filters')

    const density = view() === 'density'
    const toppers = points.filter((point) => point.peakRank === 1).length
    subtitle.textContent = density
      ? `How high a name got against how long it lasted — ${points.length} names over ${new Set(points.map((point) => `${point.peakRank},${point.longevity}`)).size} occupied cells`
      : selectedName
        ? `How high a name got against how long it lasted — ${selectedName} marked in each country`
        : `How high a name got against how long it lasted. ${toppers} of ${points.length} reached number one`

    const margin = { top: 10, right: 14, bottom: 34, left: 42 }
    // The rank axis runs backwards - 10 at the left, 1 at the right - so that "higher
    // peak" and "longer run" both mean "further up and to the right". The relationship
    // is strong and positive, and this is the orientation that lets it read that way:
    // the dynasties climb into the top-right corner, the one-season names fall to the
    // bottom-left, and the off-diagonal names are the ones worth looking at.
    const x = d3.scaleLinear()
      .domain([RANKS + 0.6, 0.4])
      .range([margin.left, width - margin.right])
    const y = d3.scaleLinear()
      .domain([0.4, d3.max(points, (point) => point.longevity) + 0.6])
      .range([height - margin.bottom, margin.top])

    const svg = d3.select(chart)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img')
      .attr('aria-label',
        `Each name plotted by its best rank against years in the top 10. ${points.length} names.`)

    const gridGroup = svg.append('g').attr('class', 'peak-grid')
    const xAxisGroup = svg.append('g')
      .attr('class', 'peak-axis')
      .attr('transform', `translate(0,${height - margin.bottom})`)
    const yAxisGroup = svg.append('g')
      .attr('class', 'peak-axis')
      .attr('transform', `translate(${margin.left},0)`)

    svg.append('text')
      .attr('class', 'peak-axis-title')
      .attr('x', (margin.left + width - margin.right) / 2)
      .attr('y', height - 4)
      .attr('text-anchor', 'middle')
      .text('Peak position reached — best at the right')

    svg.append('text')
      .attr('class', 'peak-axis-title')
      .attr('transform', `translate(11,${(margin.top + height - margin.bottom) / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text('Years in top 10')

    const muted = (point) => Boolean(selectedName) && point.name !== selectedName
    // Jittered positions are kept in DATA space, not pixels, so zooming can re-project
    // them without the offsets drifting. Both axes are small integers, so without this
    // the whole cloud would collapse onto ten columns.
    const placed = points.map((point) => ({
      ...point,
      jx: point.peakRank + jitter(point.name + point.country.code, 13) * 0.6,
      jy: point.longevity + jitter(point.name + point.country.code, 101) * 0.55,
    }))
    // The selected dot is drawn last so it is never buried under the cloud
    placed.sort((left, right) =>
      Number(left.name === selectedName) - Number(right.name === selectedName))

    const clipId = 'peak-clip'
    svg.append('clipPath').attr('id', clipId).append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', Math.max(0, width - margin.left - margin.right))
      .attr('height', Math.max(0, height - margin.top - margin.bottom))

    const plot = svg.append('g').attr('clip-path', `url(#${clipId})`)

    // The median run at each peak position. Without it the reader has to infer the
    // trend before they can see a departure from it, and the departures are the point:
    // the names well above this line lasted years without ever getting near the top,
    // the ones below it were brief at the summit.
    const ridge = Array.from(
      d3.rollup(points, (group) => d3.median(group, (point) => point.longevity),
        (point) => point.peakRank),
      ([peakRank, longevity]) => ({ peakRank, longevity }))
      .sort((left, right) => left.peakRank - right.peakRank)

    const ridgePath = plot.append('path').attr('class', 'peak-ridge')

    // One entry per occupied lattice cell, carrying the names that share it.
    const cells = Array.from(
      d3.group(points, (point) => `${point.peakRank},${point.longevity}`),
      ([key, group]) => ({
        peakRank: group[0].peakRank,
        longevity: group[0].longevity,
        names: group,
        share: group.length / points.length,
      }))
    const maxCount = d3.max(cells, (cell) => cell.names.length) ?? 1
    // Fixed thresholds, not a scale stretched to the data. The counts are tiny and
    // lopsided - 44 cells hold one name, 28 hold two, and a single cell holds 13 - so
    // spreading five steps evenly across 1..13 would paint 93% of the honeycomb the
    // same palest shade. These bands put the steps where the cells actually are.
    // Holding them fixed also means a colour keeps its meaning when the filters change.
    const fillFor = d3.scaleThreshold().domain(DENSITY_BANDS).range(DENSITY)

    const hexes = plot.append('g').selectAll('polygon')
      .data(density ? cells : [])
      .join('polygon')
      .attr('class', (cell) =>
        cell.names.some((point) => point.name === selectedName)
          ? 'peak-hex peak-hex-selected' : 'peak-hex')
      .attr('fill', (cell) => fillFor(cell.names.length))
      .on('click', (_event, cell) => {
        if (cell.names.length === 1) selectName(cell.names[0].name)
      })

    const dots = plot.append('g').selectAll('circle').data(density ? [] : placed).join('circle')
      .attr('class', 'peak-dot')
      .attr('r', (point) => point.name === selectedName ? 6 : 3.5)
      .attr('fill', (point) => muted(point) ? MUTED_COLOR : point.country.color)
      .attr('stroke', (point) => muted(point) ? MUTED_COLOR : point.country.color)
      .attr('stroke-width', (point) => point.name === selectedName ? 2 : 1.5)
      .attr('opacity', (point) => {
        if (muted(point)) return 0.45
        return point.name === selectedName ? 1 : 0.8
      })
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', (point) =>
        `${point.name} in ${point.country.name}: peaked at rank ${point.peakRank}, ` +
        `${point.longevity} years in the top 10`)
      .on('click', (_event, point) => selectName(point.name))
      .on('keydown', (event, point) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          selectName(point.name)
        }
      })

    const labels = plot.append('g').selectAll('text')
      .data(density ? [] : placed.filter((point) => point.name === selectedName))
      .join('text')
      .attr('class', 'peak-label')
      .attr('dy', '0.35em')
      .attr('fill', (point) => point.country.color)
      .text((point) => point.country.code)

    // --- zoom: the clusters are what this chart is for, so they have to be openable
    let zx = x
    let zy = y

    function draw() {
      const xTicks = zx.ticks(RANKS).filter(Number.isInteger).filter((tick) => tick >= 1)
      const yTicks = zy.ticks(5).filter(Number.isInteger)

      gridGroup.selectAll('line').data(yTicks).join('line')
        .attr('x1', margin.left)
        .attr('x2', width - margin.right)
        .attr('y1', (value) => zy(value))
        .attr('y2', (value) => zy(value))

      xAxisGroup.call(d3.axisBottom(zx).tickValues(xTicks).tickFormat(d3.format('d')).tickSizeOuter(0))
      yAxisGroup.call(d3.axisLeft(zy).tickValues(yTicks).tickFormat(d3.format('d')).tickSizeOuter(0))

      ridgePath.attr('d', d3.line()
        .x((step) => zx(step.peakRank))
        .y((step) => zy(step.longevity))
        .curve(d3.curveMonotoneX)(ridge))

      // A pointy-top hexagon is sqrt(3)*r wide and 2r tall, so it is sized to whichever
      // of the two cell dimensions is tighter and left a hair short of touching.
      const cellWidth = Math.abs(zx(1) - zx(2))
      const cellHeight = Math.abs(zy(1) - zy(2))
      const radius = Math.min(cellWidth / Math.sqrt(3), cellHeight / 2) * 0.96
      hexes.attr('points', (cell) =>
        hexPoints(zx(cell.peakRank), zy(cell.longevity), radius))

      dots.attr('cx', (point) => zx(point.jx)).attr('cy', (point) => zy(point.jy))
      labels.attr('x', (point) => zx(point.jx) + 9).attr('y', (point) => zy(point.jy))
    }

    const plotExtent = [[margin.left, margin.top], [width - margin.right, height - margin.bottom]]
    const zoom = d3.zoom()
      .scaleExtent([1, 12])
      .extent(plotExtent)
      .translateExtent(plotExtent)
      .on('zoom', (event) => {
        zx = event.transform.rescaleX(x)
        zy = event.transform.rescaleY(y)
        draw()
      })

    svg.call(zoom)
    // d3 binds double-click to zoom in; reset is far more useful here
    svg.on('dblclick.zoom', null)
    svg.on('dblclick', () => svg.transition().duration(220).call(zoom.transform, d3.zoomIdentity))
    draw()

    const tooltip = document.createElement('div')
    tooltip.className = 'peak-tooltip'
    tooltip.hidden = true
    chart.append(tooltip)

    hexes.on('pointerenter', (event, cell) => {
      tooltip.hidden = false
      tooltip.replaceChildren()
      const heading = document.createElement('strong')
      heading.textContent = `Peak #${cell.peakRank} · ${cell.longevity} ` +
        `${cell.longevity === 1 ? 'year' : 'years'} in the top 10`
      const detail = document.createElement('span')
      detail.textContent = `${cell.names.length} ` +
        `${cell.names.length === 1 ? 'name' : 'names'} · ${(cell.share * 100).toFixed(1)}% of the field`
      tooltip.append(heading, detail)

      const who = document.createElement('span')
      who.className = 'peak-tooltip-note'
      const listed = cell.names.slice(0, 6).map((point) => `${point.name} (${point.country.code})`)
      who.textContent = listed.join(', ') +
        (cell.names.length > listed.length ? ` +${cell.names.length - listed.length} more` : '')
      tooltip.append(who)

      const cx = zx(cell.peakRank)
      const cy = zy(cell.longevity)
      const onRight = cx > width / 2
      tooltip.style.left = onRight ? 'auto' : `${cx + 12}px`
      tooltip.style.right = onRight ? `${width - cx + 12}px` : 'auto'
      tooltip.style.top = `${Math.max(4, cy - 10)}px`
    }).on('pointerleave', () => { tooltip.hidden = true })

    dots.on('pointerenter', (event, point) => {
      tooltip.hidden = false
      tooltip.replaceChildren()
      const heading = document.createElement('strong')
      heading.textContent = `${point.name} · ${point.country.name}`
      const detail = document.createElement('span')
      detail.textContent =
        `peaked at #${point.peakRank} in ${point.peakYear} · ${point.longevity} ` +
        `${point.longevity === 1 ? 'year' : 'years'} in the top 10`
      tooltip.append(heading, detail)

      if (point.censored) {
        const note = document.createElement('span')
        note.className = 'peak-tooltip-note'
        note.textContent = 'ran past the edge of the period, so the count is a minimum'
        tooltip.append(note)
      }

      const cx = zx(point.jx)
      const cy = zy(point.jy)
      const onRight = cx > width / 2
      tooltip.style.left = onRight ? 'auto' : `${cx + 12}px`
      tooltip.style.right = onRight ? `${width - cx + 12}px` : 'auto'
      tooltip.style.top = `${Math.max(4, cy - 10)}px`
    }).on('pointerleave', () => { tooltip.hidden = true })

    renderLegend(density
      ? { topShare: `${(maxCount / points.length * 100).toFixed(1)}%` }
      : null)
  }

  function selectName(name) {
    const next = name === selectedName ? null : name
    sunburstPanel.dispatchEvent(new CustomEvent('selectname', { detail: { name: next } }))
  }

  sunburstPanel.addEventListener('namechange', (event) => {
    selectedName = event.detail.name
    render()
  })
  panel.querySelectorAll('input[name="peak-view"]')
    .forEach((input) => input.addEventListener('change', render))
  startYearInput.addEventListener('input', render)
  endYearInput.addEventListener('input', render)
  filterBar.querySelectorAll('input[name="gender"]')
    .forEach((input) => input.addEventListener('change', render))
  filterBar.querySelectorAll('input[name="country"]')
    .forEach((input) => input.addEventListener('change', render))
  new ResizeObserver(render).observe(chart)

  d3.csv(BABYNAMES_CSV, (row) => ({
    country: row.country,
    year: Number(row.year),
    sex: row.sex,
    rank: Number(row.rank),
    name: row.name.normalize('NFC'),
  })).then((loaded) => {
    rows = loaded
    dataLoaded = true
    render()
  }).catch(() => {
    chart.replaceChildren()
    showMessage('Dataset unavailable')
  })
}
