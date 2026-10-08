import d3 from './d3.js'
import { BABYNAMES_CSV } from './paths.js'
import { jitter, namePoints } from './namePoints.js'

// Country colour by default, so the cloud itself is readable. Picking a name does not
// recolour it - it mutes everything else, which keeps the selected dots in their own
// country colours and lets the eye find them without a second hue to learn.
const MUTED_COLOR = '#c9c7cd'

export function setupLifecycleScatter(panel, sunburstPanel, filterBar) {
  const chart = panel.querySelector('.lifecycle-chart')
  const subtitle = panel.querySelector('.lifecycle-subtitle')
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

  function lifecyclePoints() {
    return namePoints(rows, filterBar, yearInterval())
  }

  function showMessage(text) {
    const message = document.createElement('p')
    message.className = 'lifecycle-empty'
    message.textContent = text
    chart.append(message)
  }

  function render() {
    const width = Math.floor(chart.clientWidth)
    const height = Math.floor(chart.clientHeight)
    if (width < 1 || height < 1) return

    chart.replaceChildren()
    if (!dataLoaded) return showMessage('Loading names…')

    const points = lifecyclePoints()
    if (!points.length) return showMessage('No names match these filters')

    subtitle.textContent = selectedName
      ? `How long names stay in the top 10, and how fast they rise — ${selectedName} marked in each country`
      : 'How long do names stay in the top 10, and how fast do they rise? One dot per name and country'

    const margin = { top: 10, right: 14, bottom: 34, left: 42 }
    const x = d3.scaleLinear()
      .domain([-0.6, d3.max(points, (point) => point.rise) + 0.6])
      .range([margin.left, width - margin.right])
    const y = d3.scaleLinear()
      .domain([0.4, d3.max(points, (point) => point.longevity) + 0.6])
      .range([height - margin.bottom, margin.top])

    const svg = d3.select(chart)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img')
      .attr('aria-label',
        `Each name plotted by years from entry to peak against years in the top 10. ${points.length} names.`)

    const gridGroup = svg.append('g').attr('class', 'lifecycle-grid')
    const xAxisGroup = svg.append('g')
      .attr('class', 'lifecycle-axis')
      .attr('transform', `translate(0,${height - margin.bottom})`)
    const yAxisGroup = svg.append('g')
      .attr('class', 'lifecycle-axis')
      .attr('transform', `translate(${margin.left},0)`)

    svg.append('text')
      .attr('class', 'lifecycle-axis-title')
      .attr('x', (margin.left + width - margin.right) / 2)
      .attr('y', height - 4)
      .attr('text-anchor', 'middle')
      .text('Years from entry to peak')

    svg.append('text')
      .attr('class', 'lifecycle-axis-title')
      .attr('transform', `translate(11,${(margin.top + height - margin.bottom) / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text('Years in top 10')

    const muted = (point) => Boolean(selectedName) && point.name !== selectedName
    // Jittered positions are kept in DATA space, not pixels, so zooming can re-project
    // them without the offsets drifting
    const placed = points.map((point) => ({
      ...point,
      jx: point.rise + jitter(point.name + point.country.code, 7) * 0.55,
      jy: point.longevity + jitter(point.name + point.country.code, 101) * 0.55,
    }))
    // The selected dot is drawn last so it is never buried under the cloud
    placed.sort((left, right) =>
      Number(left.name === selectedName) - Number(right.name === selectedName))

    // Clip so zoomed-out-of-range dots do not spill over the axes
    const clipId = 'lifecycle-clip'
    svg.append('clipPath').attr('id', clipId).append('rect')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', Math.max(0, width - margin.left - margin.right))
      .attr('height', Math.max(0, height - margin.top - margin.bottom))

    const plot = svg.append('g').attr('clip-path', `url(#${clipId})`)
    const dots = plot.append('g').selectAll('circle').data(placed).join('circle')
      .attr('class', 'lifecycle-dot')
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
        `${point.name} in ${point.country.name}: ${point.longevity} years in the top 10, ` +
        `peak ${point.rise} years after entry`)
      .on('click', (_event, point) => selectName(point.name))
      .on('keydown', (event, point) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          selectName(point.name)
        }
      })

    const labels = plot.append('g').selectAll('text')
      .data(placed.filter((point) => point.name === selectedName))
      .join('text')
      .attr('class', 'lifecycle-label')
      .attr('dy', '0.35em')
      .attr('fill', (point) => point.country.color)
      .text((point) => point.country.code)

    // --- zoom: wheel or drag to explore the cloud, double-click to reset ---
    let zx = x
    let zy = y

    function draw() {
      const xTicks = zx.ticks(6).filter(Number.isInteger)
      const yTicks = zy.ticks(5).filter(Number.isInteger)

      gridGroup.selectAll('line').data(yTicks).join('line')
        .attr('x1', margin.left)
        .attr('x2', width - margin.right)
        .attr('y1', (value) => zy(value))
        .attr('y2', (value) => zy(value))

      xAxisGroup.call(d3.axisBottom(zx).tickValues(xTicks).tickFormat(d3.format('d')).tickSizeOuter(0))
      yAxisGroup.call(d3.axisLeft(zy).tickValues(yTicks).tickFormat(d3.format('d')).tickSizeOuter(0))

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

    // --- hover ---
    const tooltip = document.createElement('div')
    tooltip.className = 'lifecycle-tooltip'
    tooltip.hidden = true
    chart.append(tooltip)

    dots.on('pointerenter', (event, point) => {
      tooltip.hidden = false
      tooltip.replaceChildren()
      const heading = document.createElement('strong')
      heading.textContent = `${point.name} · ${point.country.name}`
      const detail = document.createElement('span')
      detail.textContent =
        `${point.longevity} years in top 10 · peak #${point.peakRank} in ${point.peakYear}`
      const rise = document.createElement('span')
      rise.textContent = `Entered ${point.firstYear}, peaked ${point.rise} years later`
      tooltip.append(heading, detail, rise)
      if (point.censored) {
        const note = document.createElement('span')
        note.className = 'lifecycle-tooltip-note'
        note.textContent = 'Runs past the selected years — these are minimums'
        tooltip.append(note)
      }
      const cx = zx(point.jx)
      const cy = zy(point.jy)
      const onRight = cx > width / 2
      tooltip.style.left = onRight ? 'auto' : `${cx + 12}px`
      tooltip.style.right = onRight ? `${width - cx + 12}px` : 'auto'
      tooltip.style.top = `${Math.max(4, cy - 10)}px`
    }).on('pointerleave', () => { tooltip.hidden = true })

    const legend = document.createElement('div')
    legend.className = 'lifecycle-legend'
    visibleCountries(filterBar).forEach((country) => {
      const item = document.createElement('span')
      const swatch = document.createElement('i')
      swatch.className = 'lifecycle-swatch'
      swatch.style.background = country.color
      item.append(swatch, country.name)
      legend.append(item)
    })
    panel.querySelector('.lifecycle-footnote').replaceChildren(legend)
  }

  function selectName(name) {
    sunburstPanel.dispatchEvent(new CustomEvent('selectname', { detail: { name } }))
  }

  sunburstPanel.addEventListener('namechange', (event) => {
    selectedName = event.detail.name
    render()
  })
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
