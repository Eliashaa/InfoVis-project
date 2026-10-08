import d3 from './d3.js'
import { visibleCountries } from './countries.js'
import { TIME_MARGIN, timeDomain, timeTicks } from './timeAxis.js'
import { BABYNAMES_CSV } from './paths.js'

// A country the selected name never reached still has a churn line worth drawing - it
// is the context the name's own countries are read against - but it is not part of the
// story being told, so it drops to grey.
const ABSENT = '#c9c7cd'

export function setupTurnoverChart(panel, sunburstPanel, filterBar) {
  const chart = panel.querySelector('.turnover-chart')
  const subtitle = panel.querySelector('.turnover-subtitle')
  const legend = panel.querySelector('.turnover-legend')
  const startYearInput = filterBar.querySelector('#year-start')
  const endYearInput = filterBar.querySelector('#year-end')
  let rows = []
  let dataLoaded = false
  let selectedName = null
  let dataYears = [0, 0]

  function yearInterval() {
    const startYear = Number(startYearInput.value)
    const endYear = Number(endYearInput.value)
    return [Math.min(startYear, endYear), Math.max(startYear, endYear)]
  }

  // Turnover is a property of the data, not of the view: a year is compared with the
  // one before it even when that year sits outside the selected interval. Computing
  // it over everything and clipping afterwards keeps the first visible year honest.
  function turnoverByCountry() {
    const gender = filterBar.querySelector('input[name="gender"]:checked').value
    const matching = rows.filter((row) => gender === 'all' || row.sex === gender)

    return visibleCountries(filterBar).map((country) => {
      const namesByYear = d3.rollup(
        matching.filter((row) => row.country === country.name),
        (items) => new Set(items.map((item) => item.name)),
        (row) => row.year
      )
      const years = Array.from(namesByYear.keys()).sort((left, right) => left - right)
      const points = []

      years.forEach((year, index) => {
        // 2000 has nothing to compare against, so turnover starts at 2001
        if (years[index - 1] !== year - 1) return
        const current = namesByYear.get(year)
        const previous = namesByYear.get(year - 1)
        const incoming = Array.from(current).filter((name) => !previous.has(name)).sort()
        points.push({ year, share: incoming.length / current.size, incoming, total: current.size })
      })

      return { ...country, points }
    })
  }

  // Which countries carried the selected name at all inside the chosen years. This is
  // presence, not entries and exits: a name can hold a place for the whole window
  // without ever being seen to arrive or leave, and that country is still part of its
  // story. Null when nothing is selected, which means "colour everything normally".
  function nameCountries() {
    if (!selectedName) return null
    const gender = filterBar.querySelector('input[name="gender"]:checked').value
    const [startYear, endYear] = yearInterval()
    return new Set(rows
      .filter((row) => row.name === selectedName &&
        row.year >= startYear && row.year <= endYear &&
        (gender === 'all' || row.sex === gender))
      .map((row) => row.country))
  }

  // The years the selected name joined or left a country's top 10. An entry is only
  // observed if the name was absent the year before, so a name already listed in the
  // first year of the dataset has no visible entry - the same censoring the lifecycle
  // scatter runs into. Re-entries are reported, not just the first spell.
  function nameEvents(countryName) {
    if (!selectedName) return { entries: [], exits: [] }
    const gender = filterBar.querySelector('input[name="gender"]:checked').value
    const present = new Set(rows
      .filter((row) => row.country === countryName && row.name === selectedName &&
        (gender === 'all' || row.sex === gender))
      .map((row) => row.year))
    const [firstYear, lastYear] = dataYears

    return {
      entries: Array.from(present)
        .filter((year) => year > firstYear && !present.has(year - 1))
        .sort((left, right) => left - right),
      // The exit is the first year the name is gone, which is the year its absence
      // actually shows up in the churn
      exits: Array.from(present)
        .filter((year) => year < lastYear && !present.has(year + 1))
        .map((year) => year + 1)
        .sort((left, right) => left - right),
    }
  }

  function showMessage(text) {
    const message = document.createElement('p')
    message.className = 'turnover-empty'
    message.textContent = text
    chart.append(message)
  }

  function renderLegend() {
    const reached = nameCountries()
    const items = visibleCountries(filterBar).map((country) => {
      const item = document.createElement('span')
      const swatch = document.createElement('i')
      swatch.className = 'turnover-swatch'
      swatch.style.background =
        reached && !reached.has(country.name) ? ABSENT : country.color
      item.append(swatch, country.name)
      return item
    })

    if (selectedName) {
      ;[['turnover-key-in', `${selectedName} entered`], ['turnover-key-out', `${selectedName} left`]]
        .forEach(([className, text]) => {
          const item = document.createElement('span')
          const mark = document.createElement('i')
          mark.className = `turnover-swatch ${className}`
          item.append(mark, text)
          items.push(item)
        })
    }
    legend.replaceChildren(...items)
  }

  function render() {
    renderLegend()
    const width = Math.floor(chart.clientWidth)
    const height = Math.floor(chart.clientHeight)
    if (width < 1 || height < 1) return

    chart.replaceChildren()
    if (!dataLoaded) return showMessage('Loading names…')

    const [startYear, endYear] = yearInterval()
    const series = turnoverByCountry().map((country) => ({
      ...country,
      points: country.points.filter((point) => point.year >= startYear && point.year <= endYear),
    }))
    const shown = series.flatMap((country) => country.points)
    if (shown.length < visibleCountries(filterBar).length * 2) {
      subtitle.textContent = 'How much of each year’s top 10 is new?'
      return showMessage('Widen the year interval to compare at least two years')
    }

    subtitle.textContent = selectedName
      ? `Share of each year’s top 10 that is new, and where ${selectedName} joined or left`
      : 'Share of each year’s top 10 that was not there the year before'

    // 2000 has no turnover value, so this chart starts a year later than the timeline
    // below it. Pushing the left margin in by exactly one year's width keeps the pixels
    // per year identical, so every year the two charts share still lines up.
    const [domainStart, domainEnd] = timeDomain(startYear, endYear)
    const yearWidth =
      (width - TIME_MARGIN.left - TIME_MARGIN.right) / (domainEnd - domainStart)
    const margin = {
      top: 10,
      bottom: 24,
      right: TIME_MARGIN.right,
      left: TIME_MARGIN.left + yearWidth,
    }
    const x = d3.scaleLinear()
      .domain([domainStart + 1, domainEnd])
      .range([margin.left, width - margin.right])
    const y = d3.scaleLinear()
      .domain([0, d3.max(shown, (point) => point.share)])
      .nice()
      .range([height - margin.bottom, margin.top])

    const svg = d3.select(chart)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img')
      .attr('aria-label', `Share of each year's top 10 that is new, by country, ${startYear}–${endYear}`)

    const ticks = timeTicks(startYear, endYear, width - TIME_MARGIN.left - TIME_MARGIN.right)
      .filter((year) => year > startYear)

    svg.append('g')
      .attr('class', 'turnover-grid')
      .selectAll('line')
      .data(y.ticks(4))
      .join('line')
      .attr('x1', margin.left)
      .attr('x2', width - margin.right)
      .attr('y1', (share) => y(share))
      .attr('y2', (share) => y(share))

    svg.append('g')
      .attr('class', 'turnover-axis')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickValues(ticks).tickFormat(d3.format('d')).tickSizeOuter(0))

    svg.append('g')
      .attr('class', 'turnover-axis')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('.0%')).tickSizeOuter(0))

    svg.append('text')
      .attr('class', 'turnover-axis-title')
      .attr('transform', `translate(13,${(margin.top + height - margin.bottom) / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text('Share new')

    const line = d3.line()
      .x((point) => x(point.year))
      .y((point) => y(point.share))

    const drawn = series.filter((country) => country.points.length)
    const reached = nameCountries()
    const inkFor = (country) =>
      reached && !reached.has(country.name) ? ABSENT : country.color
    const rows_ = svg.append('g').selectAll('g').data(drawn).join('g')

    rows_.append('path')
      .attr('class', 'turnover-line')
      .attr('d', (country) => line(country.points))
      .attr('stroke', inkFor)

    // Three series, so they are direct-labelled as well as listed in the legend
    rows_.append('text')
      .attr('class', 'turnover-label')
      .attr('x', (country) => x(country.points.at(-1).year) + 6)
      .attr('y', (country) => y(country.points.at(-1).share))
      .attr('dy', '0.35em')
      .attr('fill', inkFor)
      .text((country) => country.name)

    // --- where the selected name joined or left each country's top 10 ---
    // Only a dot, deliberately: the year itself is the timeline's job, so repeating it
    // here would say nothing new. What the timeline cannot show is the dot's HEIGHT -
    // how busy that country's top 10 was in the year the name arrived or left.
    const events = drawn.flatMap((country) => {
      const { entries, exits } = nameEvents(country.name)
      return [
        ...entries.map((year) => ({ country, year, kind: 'in' })),
        ...exits.map((year) => ({ country, year, kind: 'out' })),
      ]
    }).filter((event) => event.year >= x.domain()[0] && event.year <= x.domain()[1])

    svg.append('g').selectAll('circle').data(events).join('circle')
      .attr('class', 'turnover-event-dot')
      .attr('r', 4)
      .attr('cx', (event) => x(event.year))
      .attr('cy', (event) => {
        const point = event.country.points.find((item) => item.year === event.year)
        return point ? y(point.share) : height - margin.bottom
      })
      .attr('fill', (event) => event.kind === 'in' ? event.country.color : '#fff')
      .attr('stroke', (event) => event.country.color)

    // --- hover layer: one crosshair for the year, all three values at once ---
    const hoverLine = svg.append('line')
      .attr('class', 'turnover-crosshair')
      .attr('y1', margin.top)
      .attr('y2', height - margin.bottom)
      .attr('display', 'none')
    const hoverDots = svg.append('g').attr('display', 'none')
    hoverDots.selectAll('circle')
      .data(drawn)
      .join('circle')
      .attr('class', 'turnover-dot')
      .attr('r', 4)
      .attr('fill', inkFor)

    const tooltip = document.createElement('div')
    tooltip.className = 'turnover-tooltip'
    tooltip.hidden = true
    chart.append(tooltip)

    const years = Array.from(new Set(shown.map((point) => point.year)))
      .sort((left, right) => left - right)

    function moveTo(event) {
      const [pointerX] = d3.pointer(event, svg.node())
      const year = years.reduce((best, candidate) =>
        Math.abs(x(candidate) - pointerX) < Math.abs(x(best) - pointerX) ? candidate : best)
      const at = drawn.map((country) => ({
        country,
        point: country.points.find((point) => point.year === year),
      })).filter((entry) => entry.point)
      if (!at.length) return

      hoverLine.attr('display', null).attr('x1', x(year)).attr('x2', x(year))
      hoverDots.attr('display', null)
        .selectAll('circle')
        .attr('cx', x(year))
        .attr('cy', (country) => {
          const match = at.find((entry) => entry.country.name === country.name)
          return match ? y(match.point.share) : -99
        })

      tooltip.hidden = false
      tooltip.replaceChildren()
      const heading = document.createElement('strong')
      heading.textContent = year
      tooltip.append(heading)
      at.forEach(({ country, point }) => {
        const line_ = document.createElement('span')
        const swatch = document.createElement('i')
        swatch.className = 'turnover-swatch'
        swatch.style.background = country.color
        // Spell out the denominator: it is 20 with both sexes shown, and 21 in the
        // handful of years where SCB reports a tie at rank 10
        line_.append(
          swatch,
          `${country.name}: ${d3.format('.0%')(point.share)} (${point.incoming.length} of ${point.total} new)`
        )
        tooltip.append(line_)
      })
      events.filter((event) => event.year === year).forEach((event) => {
        const note = document.createElement('span')
        note.className = 'turnover-tooltip-event'
        note.textContent =
          `${selectedName} ${event.kind === 'in' ? 'entered' : 'left'} ${event.country.name}`
        tooltip.append(note)
      })

      const onRight = x(year) > width / 2
      tooltip.style.left = onRight ? 'auto' : `${x(year) + 12}px`
      tooltip.style.right = onRight ? `${width - x(year) + 12}px` : 'auto'
    }

    svg.append('rect')
      .attr('class', 'turnover-capture')
      .attr('x', margin.left)
      .attr('y', margin.top)
      .attr('width', Math.max(0, width - margin.left - margin.right))
      .attr('height', Math.max(0, height - margin.top - margin.bottom))
      .on('pointermove', moveTo)
      .on('pointerleave', () => {
        hoverLine.attr('display', 'none')
        hoverDots.attr('display', 'none')
        tooltip.hidden = true
      })
  }

  renderLegend()
  sunburstPanel.addEventListener('namechange', (event) => {
    selectedName = event.detail.name
    render()
  })
  startYearInput.addEventListener('input', render)
  endYearInput.addEventListener('input', render)
  filterBar.querySelectorAll('input[name="gender"]')
    .forEach((input) => input.addEventListener('change', render))
  // This panel reads the country filter through visibleCountries() but never listened
  // for it, so switching country left the chart showing the previous selection until
  // some other filter happened to fire.
  filterBar.querySelectorAll('input[name="country"]')
    .forEach((input) => input.addEventListener('change', render))
  new ResizeObserver(render).observe(chart)

  d3.csv(BABYNAMES_CSV, (row) => ({
    country: row.country,
    year: Number(row.year),
    sex: row.sex,
    name: row.name.normalize('NFC'),
  })).then((loaded) => {
    rows = loaded
    dataYears = d3.extent(loaded, (row) => row.year)
    dataLoaded = true
    render()
  }).catch(() => {
    chart.replaceChildren()
    showMessage('Dataset unavailable')
  })
}
