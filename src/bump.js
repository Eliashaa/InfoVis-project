import d3 from './d3.js'
import { COUNTRIES, visibleCountries, selectedCountry } from './countries.js'
import { BABYNAMES_CSV } from './paths.js'

// The panel draws rank paths two ways, and the toggle in its header picks which - not
// the selection, because the two answer different questions about the same name and a
// reader wants both.
//
// "Top 10 over time" is one country's whole list: every name that held a place, with
// the selected name picked out of the field. It takes one country and one sex, because
// the source lists are ranked per country and per sex - rank 1 means "the most common
// girls' name in Norway", never "the most common name". Stacking two sexes or three
// countries on one axis would put six different names at rank 1 at once.
//
// "Across countries" drops the field and follows the selected name alone, one line per
// country it reached. The diffusion timeline above marks only each country's peak, so
// the shape of the climb and the fall is not visible anywhere else.
const RANKS = 10

// Unselected trajectories are recessive but still legible; the selected name takes its
// country's colour, so identity never rests on line weight alone.
const LINE = '#d7d5da'
const LINE_HOVER = '#8c8694'
const INK = '#08060d'

export function setupRankBump(panel, sunburstPanel, filterBar) {
  const chart = panel.querySelector('.bump-chart')
  const subtitle = panel.querySelector('.bump-subtitle')
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

  function gender() {
    return filterBar.querySelector('input[name="gender"]:checked').value
  }

  function view() {
    return panel.querySelector('input[name="bump-view"]:checked').value
  }

  // A name that drops out of the top 10 and returns later leaves a real gap, so the
  // rank is held as null for those years and the line breaks rather than cutting a
  // straight path across years the name was never listed.
  function pointsFrom(scoped, years) {
    const byYear = new Map(scoped.map((row) => [row.year, row]))
    return years.map((year) => {
      const row = byYear.get(year)
      return { year, rank: row ? row.rank : null, count: row ? row.count : null }
    })
  }

  // One line per country, for the selected name. Every name in the dataset belongs to
  // exactly one sex, so the gender filter would only ever hide the name outright - the
  // name itself already settles which list it is ranked in.
  function nameSeries(years) {
    return visibleCountries(filterBar).map((country) => {
      const scoped = rows.filter((row) =>
        row.name === selectedName && row.country === country.name &&
        row.year >= years[0] && row.year <= years[years.length - 1])

      return {
        key: country.name,
        label: country.code,
        color: country.color,
        name: selectedName,
        country: country.name,
        points: pointsFrom(scoped, years),
      }
    }).filter((entry) => entry.points.some((point) => point.rank !== null))
  }

  // One line per name, for a single country and sex.
  function listSeries(country, sex, years) {
    const scoped = rows.filter((row) =>
      row.country === country && row.sex === sex &&
      row.year >= years[0] && row.year <= years[years.length - 1])

    return Array.from(new Set(scoped.map((row) => row.name))).sort().map((name) => ({
      key: name,
      label: name,
      color: null,
      name,
      country,
      points: pointsFrom(scoped.filter((row) => row.name === name), years),
    }))
  }

  function showMessage(text) {
    const message = document.createElement('p')
    message.className = 'bump-empty'
    message.textContent = text
    chart.append(message)
  }

  function render() {
    const width = Math.floor(chart.clientWidth)
    const height = Math.floor(chart.clientHeight)
    if (width < 1 || height < 1) return

    chart.replaceChildren()
    if (!dataLoaded) return showMessage('Loading names…')

    const [startYear, endYear] = yearInterval()
    const years = d3.range(startYear, endYear + 1)
    const country = selectedCountry(filterBar)
    const sex = gender()
    const byName = view() === 'countries'

    let series
    if (byName) {
      if (selectedName === null) {
        subtitle.textContent = 'One line per country, for a single name'
        return showMessage('Select a name to follow it across Denmark, Norway and Sweden')
      }
      series = nameSeries(years)
      if (!series.length) {
        subtitle.textContent = `${selectedName} across Denmark, Norway and Sweden`
        return showMessage(`${selectedName} held no top-10 place in ${startYear}–${endYear}`)
      }
      const reached = series.length === 1
        ? series[0].country
        : `${series.length} countries`
      subtitle.textContent =
        `Where ${selectedName} ranked, ${startYear}–${endYear} — ${reached}`
    } else {
      // Both scopes are required, and the message names the one that is missing rather
      // than saying "no data" - the fix is one click away in the filter bar.
      if (country === 'all' || sex === 'all') {
        const missing = []
        if (country === 'all') missing.push('a country')
        if (sex === 'all') missing.push('Female or Male')
        subtitle.textContent = 'Ranks run separately for each country and sex'
        return showMessage(
          `Pick ${missing.join(' and ')} — or switch to Across countries to follow one name`)
      }
      series = listSeries(country, sex, years)
      if (!series.length) return showMessage('No names match these filters')
      const sexLabel = sex === 'female' ? 'Girls' : 'Boys'
      const held = `${series.length} held a top-10 place`
      const picked = series.some((entry) => entry.name === selectedName)
      subtitle.textContent = picked
        ? `${sexLabel}' names in ${country}, ${startYear}–${endYear} — ${selectedName} marked among ${held}`
        : `${sexLabel}' names in ${country}, ${startYear}–${endYear} — ${held}`
    }

    // The right margin carries the closing labels, so it is sized for them; the left
    // only has to fit a rank number.
    const margin = { top: 12, right: byName ? 42 : 96, bottom: 26, left: 26 }
    const x = d3.scalePoint().domain(years).range([margin.left, width - margin.right])
    const y = d3.scalePoint()
      .domain(d3.range(1, RANKS + 1))
      .range([margin.top, height - margin.bottom])

    const svg = d3.select(chart)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('aria-label', byName
        ? `Rank of ${selectedName} per country, ${startYear} to ${endYear}`
        : `Rank trajectories of ${sex} names in ${country}, ${startYear} to ${endYear}`)

    // Rank gridlines, recessive: they place a line vertically without competing with it
    svg.append('g')
      .selectAll('line')
      .data(d3.range(1, RANKS + 1))
      .join('line')
      .attr('class', 'bump-grid')
      .attr('x1', margin.left)
      .attr('x2', width - margin.right)
      .attr('y1', (rank) => y(rank))
      .attr('y2', (rank) => y(rank))

    svg.append('g')
      .selectAll('text')
      .data(d3.range(1, RANKS + 1))
      .join('text')
      .attr('class', 'bump-rank')
      .attr('x', margin.left - 8)
      .attr('y', (rank) => y(rank))
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .text((rank) => rank)

    // Year labels thin out on narrow panels rather than overlapping each other
    const inner = Math.max(1, width - margin.left - margin.right)
    const yearStep = Math.max(1, Math.ceil(years.length / Math.max(1, Math.floor(inner / 46))))
    svg.append('g')
      .selectAll('text')
      .data(years.filter((year, index) => index % yearStep === 0))
      .join('text')
      .attr('class', 'bump-year')
      .attr('x', (year) => x(year))
      .attr('y', height - margin.bottom + 18)
      .attr('text-anchor', 'middle')
      .text((year) => year)

    const line = d3.line()
      .defined((point) => point.rank !== null)
      .x((point) => x(point.year))
      .y((point) => y(point.rank))
      .curve(d3.curveMonotoneX)

    // In name mode every line is the selected name, so all of them are foreground.
    const isLit = (entry) => byName || entry.name === selectedName
    const strokeFor = (entry) => entry.color ?? (isLit(entry) ? highlightColor(entry) : LINE)

    function highlightColor(entry) {
      return COUNTRIES.find((item) => item.name === entry.country)?.color ?? INK
    }

    // With a name picked out of a field of 25, the rest recede rather than disappear:
    // the field is the context that makes one trajectory worth looking at.
    const faded = !byName && selectedName !== null
    const fadeFor = (entry) => faded && !isLit(entry) ? 0.35 : 1

    const lines = svg.append('g')
      .selectAll('path')
      .data(series)
      .join('path')
      .attr('class', 'bump-line')
      .attr('d', (entry) => line(entry.points))
      .attr('stroke', strokeFor)
      .attr('stroke-width', (entry) => isLit(entry) ? 3 : 2)
      .attr('opacity', fadeFor)

    // The lit line goes last, so a crossing never hides the one being followed
    lines.filter(isLit).raise()

    const nodes = series.flatMap((entry) =>
      entry.points.filter((point) => point.rank !== null)
        .map((point) => ({ ...point, entry })))

    svg.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('class', 'bump-node')
      .attr('cx', (point) => x(point.year))
      .attr('cy', (point) => y(point.rank))
      .attr('r', (point) => isLit(point.entry) ? 4 : 3)
      .attr('fill', (point) => strokeFor(point.entry))
      .attr('opacity', (point) => fadeFor(point.entry))

    // In name mode each line ends with its country code. In list mode only the closing
    // year is labelled: labelling both ends of 25 lines doubles the ink for names the
    // reader can reach by hovering or selecting.
    const endLabels = series.map((entry) => {
      const last = [...entry.points].reverse().find((point) => point.rank !== null)
      return last ? { entry, point: last } : null
    }).filter(Boolean)
      .filter((item) => byName || item.point.year === years[years.length - 1])

    svg.append('g')
      .selectAll('text')
      .data(endLabels)
      .join('text')
      .attr('class', 'bump-label')
      .attr('x', (item) => x(item.point.year) + 8)
      .attr('y', (item) => y(item.point.rank))
      .attr('dy', '0.35em')
      .attr('fill', (item) => item.entry.color ?? (isLit(item.entry) ? highlightColor(item.entry) : INK))
      .attr('opacity', (item) => fadeFor(item.entry))
      .text((item) => item.entry.label)

    const tooltip = document.createElement('div')
    tooltip.className = 'bump-tooltip'
    tooltip.hidden = true
    chart.append(tooltip)

    // Hit targets are wider than the marks, so following a line does not demand pixel
    // accuracy on a 3px dot.
    svg.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('class', byName ? 'bump-hit bump-hit-static' : 'bump-hit')
      .attr('cx', (point) => x(point.year))
      .attr('cy', (point) => y(point.rank))
      .attr('r', 9)
      .on('pointerenter', (event, point) => {
        lines.attr('stroke', (entry) =>
          entry === point.entry && !isLit(entry) ? LINE_HOVER : strokeFor(entry))
        tooltip.hidden = false
        tooltip.replaceChildren()
        const heading = document.createElement('strong')
        heading.textContent = byName ? `${point.entry.name} · ${point.entry.country}` : point.entry.name
        const detail = document.createElement('span')
        detail.textContent =
          `${point.year} · rank ${point.rank} · ${point.count.toLocaleString()} births`
        tooltip.append(heading, detail)
        const cx = x(point.year)
        const onRight = cx > width / 2
        tooltip.style.left = onRight ? 'auto' : `${cx + 14}px`
        tooltip.style.right = onRight ? `${width - cx + 14}px` : 'auto'
        tooltip.style.top = `${Math.max(4, y(point.rank) - 14)}px`
      })
      .on('pointerleave', () => {
        lines.attr('stroke', strokeFor)
        tooltip.hidden = true
      })
      .on('click', (event, point) => {
        if (!byName) selectName(point.entry.name)
      })
  }

  // Clicking a trajectory selects that name everywhere, the same contract the lifecycle
  // scatter uses: the sunburst owns the selection and fans it back out. Clicking the
  // name already selected clears it, returning the field to an even weight.
  function selectName(name) {
    const next = name === selectedName ? null : name
    sunburstPanel.dispatchEvent(new CustomEvent('selectname', { detail: { name: next } }))
  }

  sunburstPanel.addEventListener('namechange', (event) => {
    selectedName = event.detail.name
    render()
  })
  panel.querySelectorAll('input[name="bump-view"]')
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
    count: Number(row.count) || 0,
  })).then((loaded) => {
    rows = loaded
    dataLoaded = true
    render()
  }).catch(() => {
    chart.replaceChildren()
    showMessage('Dataset unavailable')
  })
}
