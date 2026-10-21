import d3 from './d3.js'
import { visibleCountries } from './countries.js'
import { BABYNAMES_CSV } from './paths.js'
import { jitter, namePoints } from './namePoints.js'
import { MUTED } from './theme.js'

// The lifecycle scatter asks how FAST a name climbed; this one asks how HIGH it got,
// against the same longevity axis. That turns the cloud into four readable corners:
// top left is the name that reached number one and stayed for years, bottom right the
// one that scraped rank 10 for a season and vanished. Same derivation as the lifecycle
// panel - see namePoints.js - so the two can never disagree about a name.
const MUTED_COLOR = MUTED
const RANKS = 10
// Line height of the selected-dot labels, used to stack labels that would collide
const LABEL_LINE = 11

// Density ramp for the honeycomb view: the sunburst's purple, so the dashboard carries
// one fewer hue and the country colours stay the only identity colours on screen.
//
// Four steps, not five. A single hue cannot hold five bands far enough apart to be read
// off a small mark - the five-step version put its two palest steps at dE 10.5, under
// the 15 floor and flagged as hard to tell apart even with full colour vision. Four
// steps clear it at dE 18.5 normal and 17.6 under colourblindness, and the data has
// only four groups worth naming anyway: 44 cells hold one name, 28 hold two, 11 hold
// three or four, and 2 hold more.
//
// This is a SEQUENTIAL scale, not an ordinal one, so the palest step is allowed to
// recede toward the white surface - "one name here" should sit quietly while the
// crowded cells carry the weight. The hairline stroke in the CSS keeps it locatable.
const DENSITY = ['#dcd5f0', '#a995dc', '#6b55b6', '#2e2270']
const DENSITY_BANDS = [3, 7, 13]
const DENSITY_LABELS = ['1–2', '3–6', '7–12', '13+']

// Cells the selected name is not in go grey, the same way the names view mutes the
// dots around a selection. A grey RAMP rather than one flat grey, matched step for
// step in lightness, so the rest of the honeycomb still reports where the crowd is -
// the point of picking a name out is seeing the field it sits in.
const DENSITY_MUTED = ['#e9e2d4', '#c3b9a7', '#857a69', '#3f372d']

// The density view groups the longevity axis. 23 separate year-rows left each one
// about 12px tall while the hexagons ran to 32px, so most of them hid behind their
// neighbours - the view was drawing cells it could not show. Six bands give each row
// roughly 33px, enough for the largest hexagon to sit clear, and collapse 85 occupied
// cells into 41 fuller ones. The bands are narrow where the names are crowded and wide
// where they thin out.
// The axis stays in years - the same scale as the names view, so toggling between them
// compares like with like - and a group simply sits at the middle of the years it
// covers. The bands are chosen so those midpoints are far enough apart (27px at the
// tightest) that the hexagons clear each other.
const LONGEVITY_BANDS = [
  { lo: 1, hi: 2, mid: 1.5, label: '1–2' },
  { lo: 3, hi: 5, mid: 4, label: '3–5' },
  { lo: 6, hi: 9, mid: 7.5, label: '6–9' },
  { lo: 10, hi: 14, mid: 12, label: '10–14' },
  { lo: 15, hi: Infinity, mid: 19, label: '15+' },
]

function bandOf(years) {
  return LONGEVITY_BANDS.findIndex((band) => years >= band.lo && years <= band.hi)
}

// The largest hexagon a cell can carry, as a radius - held under half the tightest gap
// between two band midpoints so neighbours never collide. The plot is inset by this
// much in the density view so marks at the extremes are not sliced by the clip.
const HEX_MAX = 13

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

const listFormat = new Intl.ListFormat('en', { type: 'conjunction' })

export function setupPeakScatter(panel, sunburstPanel, filterBar) {
  const chart = panel.querySelector('.peak-chart')
  const subtitle = panel.querySelector('.peak-subtitle')
  const startYearInput = filterBar.querySelector('#year-start')
  const endYearInput = filterBar.querySelector('#year-end')
  let rows = []
  let dataLoaded = false
  let selectedNames = new Set()
  let tooltip = null

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

  function renderLegend(density) {
    const legend = panel.querySelector('.peak-legend')
    legend.replaceChildren()

    if (density) {
      const scale = document.createElement('span')
      scale.className = 'peak-scale'
      scale.append('Names per cell:')
      DENSITY.forEach((fill, index) => {
        const swatch = document.createElement('i')
        swatch.style.background = fill
        scale.append(swatch, DENSITY_LABELS[index])
      })
      legend.append(scale)
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
    subtitle.textContent = selectedNames.size
      ? `${listFormat.format([...selectedNames])}, marked in each country`
      : ''

    const margin = { top: 8, right: 12, bottom: 30, left: 34 }
    // A dot is 3.5px and sits comfortably inside the plot, but a hexagon runs to 26px
    // across and a cell at 23 years or at rank 1 sits hard against the edge, so half of
    // it would fall outside the clip and be sliced off. The plot is inset by one
    // hexagon to make room, which keeps the domain honest and the marks whole.
    //
    // The inset applies in BOTH views, not just the density one. Making it conditional
    // gave the two views the same domain over a different range, so every tick shifted
    // when the toggle was flipped and the chart appeared to jump.
    const padX = HEX_MAX * Math.sqrt(3) / 2
    const padY = HEX_MAX
    // The rank axis runs backwards - 10 at the left, 1 at the right - so that "higher
    // peak" and "longer run" both mean "further up and to the right". The relationship
    // is strong and positive, and this is the orientation that lets it read that way:
    // the dynasties climb into the top-right corner, the one-season names fall to the
    // bottom-left, and the off-diagonal names are the ones worth looking at.
    const x = d3.scaleLinear()
      .domain([RANKS + 0.6, 0.4])
      .range([margin.left + padX, width - margin.right - padX])
    const y = d3.scaleLinear()
      .domain([0.4, d3.max(points, (point) => point.longevity) + 0.6])
      .range([height - margin.bottom - padY, margin.top + padY])

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
      .text('Peak position reached (best at the right)')

    svg.append('text')
      .attr('class', 'peak-axis-title')
      .attr('transform', `translate(11,${(margin.top + height - margin.bottom) / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text('Years in top 10')

    const isSelected = (point) => selectedNames.has(point.name)
    const muted = (point) => selectedNames.size > 0 && !isSelected(point)
    // Jittered positions are kept in DATA space, not pixels, so zooming can re-project
    // them without the offsets drifting. Both axes are small integers, so without this
    // the whole cloud would collapse onto ten columns.
    //
    // Both axes are nudged by about a quarter of a step and no more. A dot pushed a
    // third of the way towards the next whole number stops reading as the value it
    // actually holds - it looks like it peaked at 5 when it peaked at 6, or lasted 10
    // years when it lasted 11. A quarter-step keeps every clump sitting visibly on its
    // own gridline while still pulling overlapping names apart.
    //
    // The cost is that the crowded cells pack tighter: thirteen names share peak #10 at
    // one year, and no amount of nudging separates those honestly. That is what the
    // density view is for.
    const placed = points.map((point) => ({
      ...point,
      jx: point.peakRank + jitter(point.name + point.country.code, 13) * 0.26,
      jy: point.longevity + jitter(point.name + point.country.code, 101) * 0.3,
    }))
    // The selected dots are drawn last so they are never buried under the cloud
    placed.sort((left, right) => Number(isSelected(left)) - Number(isSelected(right)))

    const clipId = 'peak-clip'
    svg.append('clipPath').attr('id', clipId).append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', Math.max(0, width - margin.left - margin.right))
      .attr('height', Math.max(0, height - margin.top - margin.bottom))

    const plot = svg.append('g').attr('clip-path', `url(#${clipId})`)

    // One entry per occupied lattice cell, carrying the names that share it.
    const cells = Array.from(
      d3.group(points, (point) => `${point.peakRank},${bandOf(point.longevity)}`),
      ([key, group]) => ({
        peakRank: group[0].peakRank,
        row: bandOf(group[0].longevity),
        band: LONGEVITY_BANDS[bandOf(group[0].longevity)],
        names: group,
        share: group.length / points.length,
      }))
      .sort((left, right) => left.names.length - right.names.length)
    const maxCount = d3.max(cells, (cell) => cell.names.length) ?? 1
    // Fixed thresholds, not a scale stretched to the data. The counts are tiny and
    // lopsided - 44 cells hold one name, 28 hold two, and a single cell holds 13 - so
    // spreading five steps evenly across 1..13 would paint 93% of the honeycomb the
    // same palest shade. These bands put the steps where the cells actually are.
    // Holding them fixed also means a colour keeps its meaning when the filters change.
    const stepFor = d3.scaleThreshold().domain(DENSITY_BANDS).range(d3.range(DENSITY.length))
    const litCell = (cell) => !selectedNames.size || cell.names.some(isSelected)
    const fillFor = (cell) =>
      (litCell(cell) ? DENSITY : DENSITY_MUTED)[stepFor(cell.names.length)]

    const hexes = plot.append('g').selectAll('polygon')
      .data(density ? cells : [])
      .join('polygon')
      .attr('class', (cell) =>
        cell.names.some(isSelected) ? 'peak-hex peak-hex-selected' : 'peak-hex')
      .attr('fill', fillFor)
      .on('click', (_event, cell) => {
        if (cell.names.length === 1) selectName(cell.names[0].name)
      })
    hexes.filter(litCell).raise()

    const dots = plot.append('g').selectAll('circle').data(density ? [] : placed).join('circle')
      .attr('class', 'peak-dot')
      .attr('r', (point) => isSelected(point) ? 6 : 3.5)
      .attr('fill', (point) => muted(point) ? MUTED_COLOR : point.country.color)
      .attr('stroke', (point) => muted(point) ? MUTED_COLOR : point.country.color)
      .attr('stroke-width', (point) => isSelected(point) ? 2 : 1.5)
      .attr('opacity', (point) => {
        if (muted(point)) return 0.45
        return isSelected(point) ? 1 : 0.8
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

    // One name needs only the country code beside each dot; with several, the label
    // has to say whose dot it is as well
    const labels = plot.append('g').selectAll('text')
      .data(density ? [] : placed.filter(isSelected))
      .join('text')
      .attr('class', 'peak-label')
      .attr('dy', '0.35em')
      .attr('fill', (point) => point.country.color)
      .text((point) => selectedNames.size > 1
        ? `${point.name} ${point.country.code}`
        : point.country.code)

    // --- zoom: the clusters are what this chart is for, so they have to be openable
    let zx = x
    let zy = y

    function draw() {
      const xTicks = zx.ticks(RANKS).filter(Number.isInteger).filter((tick) => tick >= 1)
      const yTicks = zy.ticks(5).filter(Number.isInteger)

      // A line per whole year, matching the rank lines: the labelled ticks every few
      // years are too sparse for a clump to sit on. Kept at the faintest weight so 23
      // of them read as a lattice rather than as stripes.
      const yearLines = d3.range(Math.ceil(zy.domain()[0]), Math.floor(zy.domain()[1]) + 1)
      gridGroup.selectAll('line.peak-grid-year').data(yearLines).join('line')
        .attr('class', 'peak-grid-year')
        .attr('x1', margin.left)
        .attr('x2', width - margin.right)
        .attr('y1', (value) => zy(value))
        .attr('y2', (value) => zy(value))

      gridGroup.selectAll('line.peak-grid-y').data(yTicks).join('line')
        .attr('class', 'peak-grid-y')
        .attr('x1', margin.left)
        .attr('x2', width - margin.right)
        .attr('y1', (value) => zy(value))
        .attr('y2', (value) => zy(value))

      // One per whole rank: the dots cluster around these, so the reader can see that
      // a clump belongs to 6 rather than guessing from its centre of mass.
      gridGroup.selectAll('line.peak-grid-x').data(xTicks).join('line')
        .attr('class', 'peak-grid-x')
        .attr('y1', margin.top)
        .attr('y2', height - margin.bottom)
        .attr('x1', (value) => zx(value))
        .attr('x2', (value) => zx(value))

      xAxisGroup.call(d3.axisBottom(zx).tickValues(xTicks).tickFormat(d3.format('d')).tickSizeOuter(0))
      yAxisGroup.call(d3.axisLeft(zy).tickValues(yTicks).tickFormat(d3.format('d')).tickSizeOuter(0))

      // Sizing a hexagon to fit its cell does not work here: the lattice is 10 wide and
      // 23 tall, so a cell is roughly 67px across but only 9px high, and fitting both
      // leaves a 4px speck that throws away all the horizontal room. The hexagons are
      // given a floor instead and grow with the count, so the crowded cells - the ones
      // the view exists to show - are the biggest things on screen. They overlap
      // vertically, which is why the denser ones are drawn last.
      const cellWidth = Math.abs(zx(1) - zx(2))
      const radiusFor = (cell) => {
        const share = maxCount > 1
          ? Math.sqrt((cell.names.length - 1) / (maxCount - 1))
          : 0
        return Math.min(cellWidth / Math.sqrt(3), HEX_MAX, 6 + 7 * share)
      }
      hexes.attr('points', (cell) =>
        hexPoints(zx(cell.peakRank), zy(cell.band.mid), radiusFor(cell)))

      dots.attr('cx', (point) => zx(point.jx)).attr('cy', (point) => zy(point.jy))
      // A label near the right edge would run out of the plot, so it flips to the left.
      // Two selected dots can share a cell - Emma peaked at #1 for 23 years in both
      // Norway and Denmark - so a label that would land on one already placed steps
      // down a line instead of printing over it.
      const taken = []
      labels.each(function placeLabel(point) {
        const flip = zx(point.jx) > width - margin.right - 70
        const x = zx(point.jx) + (flip ? -9 : 9)
        // Measured when laid out; estimated if the chart is still being sized
        const textWidth = this.getComputedTextLength() || this.textContent.length * 6
        const [left, right] = flip ? [x - textWidth, x] : [x, x + textWidth]
        let y = zy(point.jy)
        for (let step = 0; step < 6; step += 1) {
          // Half a pixel of slack, or a label stepped exactly one line down still
          // reads as clashing through floating-point noise and never moves on
          const clash = taken.find((box) =>
            Math.abs(box.y - y) < LABEL_LINE - 0.5 && left < box.right && right > box.left)
          if (!clash) break
          y = clash.y + LABEL_LINE
        }
        taken.push({ left, right, y })
        d3.select(this)
          .attr('x', x)
          .attr('y', y)
          .attr('text-anchor', flip ? 'end' : 'start')
      })
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

    tooltip = document.createElement('div')
    tooltip.className = 'peak-tooltip'
    tooltip.hidden = true
    chart.append(tooltip)

    hexes.on('pointerenter', (event, cell) => {
      tooltip.hidden = false
      tooltip.replaceChildren()
      const heading = document.createElement('strong')
      heading.textContent = `Peak #${cell.peakRank}, ${cell.band.label} ` +
        `${cell.band.label === '1' ? 'year' : 'years'} in the top 10`
      const detail = document.createElement('span')
      detail.textContent = `${cell.names.length} ` +
        `${cell.names.length === 1 ? 'name' : 'names'}, ${(cell.share * 100).toFixed(1)}% of the field`
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
      // Just whose dot it is and the two values it is plotted by
      const heading = document.createElement('strong')
      heading.textContent = `${point.name}, ${point.country.name}`
      const detail = document.createElement('span')
      detail.textContent = `Peak #${point.peakRank}, ${point.longevity} ` +
        `${point.longevity === 1 ? 'year' : 'years'} in top 10`
      tooltip.append(heading, detail)

      const cx = zx(point.jx)
      const cy = zy(point.jy)
      const onRight = cx > width / 2
      tooltip.style.left = onRight ? 'auto' : `${cx + 12}px`
      tooltip.style.right = onRight ? `${width - cx + 12}px` : 'auto'
      tooltip.style.top = `${Math.max(4, cy - 10)}px`
    }).on('pointerleave', () => { tooltip.hidden = true })

    renderLegend(density)
  }

  function selectName(name) {
    sunburstPanel.dispatchEvent(new CustomEvent('togglename', { detail: { name } }))
  }

  sunburstPanel.addEventListener('namechange', (event) => {
    selectedNames = new Set(event.detail.names)
    render()
  })
  // A mark only hears pointerleave if the pointer leaves IT. Sweep the cursor out of
  // the panel quickly, or let a re-render swap the marks out mid-move, and that event
  // never arrives - leaving the tooltip stranded on screen. The chart clears it on the
  // way out regardless of which mark the pointer was over. Bound once, not per render,
  // because replaceChildren() empties the chart but leaves its own listeners intact.
  chart.addEventListener('pointerleave', () => {
    if (tooltip) tooltip.hidden = true
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
