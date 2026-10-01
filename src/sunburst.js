import * as d3 from 'd3'

const LENGTH_BUCKETS = ['3', '4', '5', '6', '7+']
const LENGTH_COLORS = new Map([
  ['3', '#167c72'],
  ['4', '#3974a5'],
  ['5', '#c46c36'],
  ['6', '#a74f68'],
  ['7+', '#737d39'],
])

function lengthBucket(name) {
  const length = Array.from(name.normalize('NFC')).length
  return length >= 7 ? '7+' : String(length)
}

function buildHierarchy(names) {
  return {
    name: 'All names',
    type: 'root',
    children: LENGTH_BUCKETS.map((length) => {
      const namesInBucket = names.filter((entry) => entry.length === length)
      const initials = d3.groups(namesInBucket, (entry) => entry.initial)
        .sort(([left], [right]) => left.localeCompare(right, 'sv'))

      return {
        name: length,
        type: 'length',
        length,
        children: initials.map(([initial, entries]) => ({
          name: initial,
          type: 'letter',
          length,
          initial,
          nameCount: entries.length,
        })),
      }
    }),
  }
}

export function setupNameSunburst(panel, filterBar) {
  const chart = panel.querySelector('.sunburst-chart')
  const filterText = panel.querySelector('.sunburst-filter')
  const countText = panel.querySelector('.sunburst-count')
  const nameList = panel.querySelector('.sunburst-name-list')
  const resetButton = panel.querySelector('.sunburst-reset')
  const searchInput = filterBar.querySelector('#name-query')
  const suggestionList = filterBar.querySelector('#name-suggestions')
  const startYearInput = filterBar.querySelector('#year-start')
  const endYearInput = filterBar.querySelector('#year-end')
  const yearOutput = filterBar.querySelector('#year-output')
  const yearTrack = filterBar.querySelector('.year-range-track')
  const genderInputs = filterBar.querySelectorAll('input[name="gender"]')
  let rows = []
  let dataLoaded = false
  let names = []
  let selectedLength = null
  let selectedInitial = null
  let selectedName = null
  let suggestionsOpen = false
  let activeSuggestionIndex = -1
  let root

  function matchingNames() {
    return names.filter((entry) =>
      (!selectedLength || entry.length === selectedLength) &&
      (!selectedInitial || entry.initial === selectedInitial)
    )
  }

  function applyGlobalFilters() {
    if (!dataLoaded) return

    const startYear = Number(startYearInput.value)
    const endYear = Number(endYearInput.value)
    const gender = filterBar.querySelector('input[name="gender"]:checked').value
    const matchingRows = rows.filter((row) => {
      const year = Number(row.year)
      return year >= startYear && year <= endYear &&
        (gender === 'all' || row.sex === gender)
    })

    const totals = d3.rollups(
      matchingRows,
      (items) => d3.sum(items, (item) => Number(item.count) || 0),
      (item) => item.name.normalize('NFC')
    )

    names = totals.map(([name, totalCount]) => {
      const characters = Array.from(name)
      return {
        name,
        totalCount,
        length: lengthBucket(name),
        initial: characters[0].toLocaleUpperCase('sv-SE'),
      }
    }).sort((left, right) => left.name.localeCompare(right.name, 'sv'))

    if (selectedName && !names.some((entry) => entry.name === selectedName)) {
      selectedName = null
    }

    renderChart()
  }

  function updateYearRange(changedHandle) {
    let startYear = Number(startYearInput.value)
    let endYear = Number(endYearInput.value)

    if (startYear > endYear) {
      if (changedHandle === startYearInput) startYear = endYear
      else endYear = startYear
    }

    startYearInput.value = String(startYear)
    endYearInput.value = String(endYear)
    yearOutput.textContent = `${startYear}–${endYear}`
    yearTrack.style.setProperty('--range-start', `${((startYear - 2000) / 22) * 100}%`)
    yearTrack.style.setProperty('--range-end', `${((endYear - 2000) / 22) * 100}%`)
    applyGlobalFilters()
  }

  function selectNode(node) {
    if (node.type === 'length') {
      selectedLength = node.length
      selectedInitial = null
      selectedName = null
    } else if (node.type === 'letter') {
      selectedLength = node.length
      selectedInitial = node.initial
      selectedName = null
    }

    updateSelection()
  }

  function arcOpacity(node) {
    if (node.data.type === 'length') return 1
    if (selectedLength && node.data.length !== selectedLength) return 0.1
    if (
      selectedInitial &&
      node.data.type === 'letter' &&
      node.data.initial !== selectedInitial
    ) return 0.14
    return 1
  }

  function searchHighlights(searchMatches) {
    return {
      lengths: new Set(searchMatches.map((entry) => entry.length)),
      letters: new Set(searchMatches.map((entry) => `${entry.length}:${entry.initial}`)),
    }
  }

  function isSearchHighlight(node, highlights) {
    if (node.data.type === 'length') return highlights.lengths.has(node.data.length)
    return highlights.letters.has(`${node.data.length}:${node.data.initial}`)
  }

  function updateSearchSuggestions() {
    const query = searchInput.value.trim().toLocaleLowerCase('sv-SE')
    const suggestions = query
      ? names.filter((entry) => entry.name.toLocaleLowerCase('sv-SE').includes(query)).slice(0, 12)
      : []

    suggestionList.replaceChildren()
    suggestions.forEach((entry, index) => {
      const option = document.createElement('button')
      option.type = 'button'
      option.className = 'name-suggestion'
      option.id = `name-suggestion-${index}`
      option.setAttribute('role', 'option')
      option.setAttribute('aria-selected', String(index === activeSuggestionIndex))
      option.textContent = entry.name
      option.addEventListener('pointerdown', (event) => event.preventDefault())
      option.addEventListener('click', () => {
        searchInput.value = entry.name
        suggestionsOpen = false
        activeSuggestionIndex = -1
        updateSelection()
        searchInput.focus()
      })
      suggestionList.append(option)
    })

    const visible = suggestionsOpen && suggestions.length > 0
    suggestionList.hidden = !visible
    searchInput.setAttribute('aria-expanded', String(visible))
    if (visible && activeSuggestionIndex >= 0) {
      searchInput.setAttribute('aria-activedescendant', `name-suggestion-${activeSuggestionIndex}`)
    } else {
      searchInput.removeAttribute('aria-activedescendant')
    }
  }

  function baseArcColor(node) {
    const base = d3.color(LENGTH_COLORS.get(node.data.length ?? node.data.name))
    return (node.depth === 1 ? base : base.brighter(0.65)).formatHex()
  }

  function labelFor(node, radius, highlights) {
    if (node.data.type === 'length') return node.data.name
    if (
      node.data.type === 'letter' &&
      (selectedLength === node.data.length || isSearchHighlight(node, highlights)) &&
      (node.x1 - node.x0) * radius * 0.82 > 10
    ) return node.data.initial
    return ''
  }

  function updateSelection() {
    const matches = matchingNames()
    const search = searchInput.value.trim().toLocaleLowerCase('sv-SE')
    const searchMatches = search
      ? matches.filter((entry) => entry.name.toLocaleLowerCase('sv-SE').includes(search))
      : []
    const listSearchMatches = searchMatches
    const highlights = searchHighlights(searchMatches)
    updateSearchSuggestions()
    const filters = [
      selectedLength ? `${selectedLength} letters` : null,
      selectedInitial ?? null,
      selectedName ?? null,
    ].filter(Boolean)

    filterText.textContent = filters.length ? filters.join(' · ') : 'All names'
    const nameLabel = `${matches.length} ${matches.length === 1 ? 'name' : 'names'}`
    countText.textContent = search
      ? `${nameLabel} · ${listSearchMatches.length} highlighted`
      : nameLabel
    nameList.replaceChildren()
    let firstSearchMatch = null

    matches.forEach((entry) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = entry.name
      button.title = `${entry.name}: ${entry.totalCount.toLocaleString()} registrations`
      button.setAttribute('aria-pressed', String(entry.name === selectedName))
      button.setAttribute('role', 'option')
      button.setAttribute('aria-selected', String(entry.name === selectedName))
      const isSearchMatch = Boolean(
        search && entry.name.toLocaleLowerCase('sv-SE').includes(search)
      )
      button.classList.toggle(
        'search-match',
        isSearchMatch
      )
      if (isSearchMatch && !firstSearchMatch) firstSearchMatch = button
      button.addEventListener('click', () => {
        selectedName = entry.name
        updateSelection()
      })
      nameList.append(button)
    })

    firstSearchMatch?.scrollIntoView({ block: 'nearest' })

    if (root) {
      root.selectAll('.sunburst-arc')
        .attr('opacity', (node) =>
          search
            ? isSearchHighlight(node, highlights) ? 1 : 0.16
            : arcOpacity(node)
        )
        .attr('fill', (node) => {
          if (isSearchHighlight(node, highlights)) {
            return node.data.type === 'length' ? '#e8ad26' : '#d75a30'
          }
          return search ? '#d5dcda' : baseArcColor(node)
        })
        .attr('stroke', (node) => isSearchHighlight(node, highlights) ? '#713515' : '#fff')
        .attr('stroke-width', (node) => {
          if (isSearchHighlight(node, highlights)) return 4
          const isSelectedLength = node.data.type === 'length' && node.data.length === selectedLength
          const isSelectedLetter = node.data.type === 'letter' &&
            node.data.length === selectedLength && node.data.initial === selectedInitial
          return isSelectedLength || isSelectedLetter ? 2.5 : 1
        })
      root.selectAll('.sunburst-label')
        .classed('search-highlight-label', (node) => isSearchHighlight(node, highlights))
        .text((node) => labelFor(node, root.radius, highlights))
      root.select('.sunburst-center')
        .text(selectedInitial ?? selectedLength ?? 'ALL')
    }
  }

  function renderChart() {
    const size = Math.floor(Math.min(chart.clientWidth, chart.clientHeight))
    if (size < 1) return

    chart.replaceChildren()
    root = null
    if (!names.length) {
      const emptyMessage = document.createElement('p')
      emptyMessage.className = 'sunburst-empty'
      emptyMessage.textContent = 'No names match these filters'
      chart.append(emptyMessage)
      updateSelection()
      return
    }

    const radius = size / 2 - 4
    const partitionRoot = d3.hierarchy(buildHierarchy(names))
      .sum((node) => node.type === 'letter' ? node.nameCount : 0)
    d3.partition().size([2 * Math.PI, 3])(partitionRoot)

    const svg = d3.select(chart)
      .append('svg')
      .attr('viewBox', `0 0 ${size} ${size}`)
      .attr('role', 'img')
      .attr('aria-label', 'Sunburst filter: inner ring name length, outer ring first letter')

    root = svg.append('g')
      .attr('transform', `translate(${size / 2},${size / 2})`)
    root.radius = radius

    const arc = d3.arc()
      .startAngle((node) => node.x0)
      .endAngle((node) => node.x1)
      .padAngle((node) => Math.min((node.x1 - node.x0) / 2, 0.007))
      .padRadius(radius * 1.6)
      .innerRadius((node) => Math.max(0, node.y0 * radius / 3))
      .outerRadius((node) => Math.max(0, node.y1 * radius / 3 - 1))

    const nodes = partitionRoot.descendants().filter((node) => node.depth > 0)
    const paths = root.selectAll('.sunburst-arc')
      .data(nodes)
      .join('path')
      .attr('class', 'sunburst-arc')
      .attr('d', arc)
      .attr('fill', baseArcColor)
      .attr('role', 'button')
      .attr('tabindex', 0)
      .attr('aria-label', (node) => {
        if (node.data.type === 'letter') {
          return `First letter ${node.data.initial}, ${node.data.nameCount} names, ${node.data.length} letters`
        }
        return `${node.data.length} letters`
      })
      .on('click', (_event, node) => selectNode(node.data))
      .on('keydown', (event, node) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          selectNode(node.data)
        }
      })

    paths.append('title').text((node) => {
      return node.data.type === 'letter'
        ? `${node.data.length} letters · ${node.data.initial} · ${node.data.nameCount} names`
        : `${node.data.length} letters · ${node.value} names`
    })

    root.selectAll('.sunburst-label')
      .data(nodes)
      .join('text')
      .attr('class', 'sunburst-label')
      .attr('transform', (node) => {
        const [x, y] = arc.centroid(node)
        const angle = (node.x0 + node.x1) / 2 * 180 / Math.PI - 90
        return `translate(${x},${y}) rotate(${angle > 90 ? angle + 180 : angle})`
      })
      .text((node) => labelFor(node, radius, { lengths: new Set(), letters: new Set() }))

    root.append('text')
      .attr('class', 'sunburst-center')
      .attr('dy', '0.35em')

    updateSelection()
  }

  resetButton.addEventListener('click', () => {
    selectedLength = null
    selectedInitial = null
    selectedName = null
    updateSelection()
  })

  searchInput.addEventListener('input', () => {
    suggestionsOpen = true
    activeSuggestionIndex = -1
    updateSelection()
  })
  searchInput.addEventListener('keydown', (event) => {
    const options = suggestionList.querySelectorAll('[role="option"]')
    if (event.key === 'ArrowDown' && options.length) {
      event.preventDefault()
      suggestionsOpen = true
      activeSuggestionIndex = (activeSuggestionIndex + 1) % options.length
      updateSelection()
    } else if (event.key === 'ArrowUp' && options.length) {
      event.preventDefault()
      suggestionsOpen = true
      activeSuggestionIndex = activeSuggestionIndex <= 0 ? options.length - 1 : activeSuggestionIndex - 1
      updateSelection()
    } else if (event.key === 'Enter' && suggestionsOpen && activeSuggestionIndex >= 0) {
      event.preventDefault()
      options[activeSuggestionIndex].click()
    } else if (event.key === 'Escape') {
      suggestionsOpen = false
      activeSuggestionIndex = -1
      updateSearchSuggestions()
    }
  })
  searchInput.addEventListener('blur', () => {
    suggestionsOpen = false
    activeSuggestionIndex = -1
    updateSearchSuggestions()
  })
  startYearInput.addEventListener('input', () => updateYearRange(startYearInput))
  endYearInput.addEventListener('input', () => updateYearRange(endYearInput))
  genderInputs.forEach((input) => input.addEventListener('change', applyGlobalFilters))
  updateYearRange()

  const resizeObserver = new ResizeObserver(renderChart)
  resizeObserver.observe(chart)

  d3.csv('/scandinavia_top10_babynames_2000_2022.csv').then((loadedRows) => {
    rows = loadedRows
    dataLoaded = true
    applyGlobalFilters()
  }).catch(() => {
    filterText.textContent = 'Dataset unavailable'
    countText.textContent = ''
  })
}