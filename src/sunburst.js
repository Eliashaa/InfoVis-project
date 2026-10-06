import * as d3 from 'd3'
import { selectedCountry } from './countries.js'

const LENGTH_BUCKETS = ['3', '4', '5', '6', '7+']

// Twelve colours, all validated against the white chart surface: five hues for the
// length ring, their five outer-ring tints, one neutral for dimmed arcs and one ink.
// The bucket order IS the encoding - the rings are circles, so only neighbouring
// groups touch, and this order was picked for the best adjacent separation
// (parents CVD dE 17.6 / normal 29.0, tints CVD dE 14.3 / normal 20.5).
const LETTER_LABEL_MIN = 7.5

// Radial bands, as a fraction of the chart radius. With nothing focused the letter
// ring fills out to the rim; focusing a length pulls the OTHER groups inward, so the
// chart never carries a band of dead space.
const RING_HOLE = 0.34
const RING_LENGTH_OUT = 0.64
const RING_LETTER_OUT = 1
const RING_LETTER_MUTED = 0.8
const INK = '#08060d'
const DIMMED = '#f0efec'
const LENGTH_COLORS = new Map([
  ['3', { arc: '#eda100', tint: '#f2ba45', ink: INK }],
  ['4', { arc: '#2a78d6', tint: '#649ce1', ink: '#fff' }],
  ['5', { arc: '#008300', tint: '#45a445', ink: '#fff' }],
  ['6', { arc: '#e87ba4', tint: '#ee9fbd', ink: INK }],
  ['7+', { arc: '#4a3aa7', tint: '#7b6fbf', ink: '#fff' }],
])

function colorSlot(node) {
  return LENGTH_COLORS.get(node.data.length ?? node.data.name)
}

function lengthBucket(name) {
  const length = Array.from(name.normalize('NFC')).length
  return length >= 7 ? '7+' : String(length)
}

function textSpan(className, text) {
  const part = document.createElement('span')
  part.className = className
  part.textContent = text
  return part
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
        nameCount: namesInBucket.length,
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
  const resetButton = filterBar.querySelector('.filter-reset')
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
  let emittedName = null
  let root
  let focusLength = null
  // Which of the two focusable things the user touched last, so a segment click and
  // a name pick can disagree about where the ring should open without fighting
  let focusSource = null
  let partitionRoot
  let arcShape
  let renderedFocus

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
    const country = selectedCountry(filterBar)
    const matchingRows = rows.filter((row) => {
      const year = Number(row.year)
      return year >= startYear && year <= endYear &&
        (gender === 'all' || row.sex === gender) &&
        (country === 'all' || row.country === country)
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

    renderChart()
  }

  function updateYearRange(changedHandle) {
    let startYear = Number(startYearInput.value)
    let endYear = Number(endYearInput.value)

    // Push the other handle along instead of blocking, so a handle can always move
    if (startYear > endYear) {
      if (changedHandle === startYearInput) endYear = startYear
      else startYear = endYear
    }

    startYearInput.value = String(startYear)
    endYearInput.value = String(endYear)
    // When the handles overlap, put the one with room to move on top
    const midYear = (Number(startYearInput.min) + Number(startYearInput.max)) / 2
    startYearInput.style.zIndex = startYear === endYear && startYear > midYear ? '4' : ''
    yearOutput.textContent = `${startYear}–${endYear}`
    yearTrack.style.setProperty('--range-start', `${((startYear - 2000) / 22) * 100}%`)
    yearTrack.style.setProperty('--range-end', `${((endYear - 2000) / 22) * 100}%`)
    applyGlobalFilters()
  }

  function selectNode(node) {
    if (node.type === 'length') {
      selectedLength = node.length
      selectedInitial = null
    } else if (node.type === 'letter') {
      selectedLength = node.length
      selectedInitial = node.initial
    }

    // The highlighted name outlives browsing: only the names list, the search
    // box or Clear can drop it
    focusSource = 'segment'
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

  function inSelectedSegment(node) {
    if (!selectedLength || node.data.length !== selectedLength) return false
    return node.data.type === 'length' || !selectedInitial || node.data.initial === selectedInitial
  }

  function outerBand(node) {
    if (node.depth === 1) return RING_LENGTH_OUT
    if (!focusLength) return RING_LETTER_OUT
    return node.data.length === focusLength ? RING_LETTER_OUT : RING_LETTER_MUTED
  }

  // Angles are strictly proportional to how many names each group holds, and never
  // change with the selection: inflating the focused wedge would make the chart
  // misreport the very distribution it exists to show. Focus is radial only.
  function layoutAngles() {
    partitionRoot.sum((node) => node.type === 'letter' ? node.nameCount : 0)
    d3.partition().size([2 * Math.PI, 3])(partitionRoot)
  }

  function targetState(node) {
    return {
      x0: node.x0,
      x1: node.x1,
      inner: root.radius * (node.depth === 1 ? RING_HOLE : RING_LENGTH_OUT),
      outer: root.radius * outerBand(node) - 1,
    }
  }

  function labelTransform(state) {
    const [x, y] = arcShape.centroid(state)
    const angle = (state.x0 + state.x1) / 2 * 180 / Math.PI - 90
    return `translate(${x},${y}) rotate(${angle > 90 ? angle + 180 : angle})`
  }

  function arcAlpha(node, searchActive, highlights) {
    if (!searchActive) return arcOpacity(node)
    if (isSearchHighlight(node, highlights)) return 1
    return inSelectedSegment(node) ? arcOpacity(node) : 0.16
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
        selectedName = entry.name
        focusSource = 'name'
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
    const slot = colorSlot(node)
    return node.depth === 1 ? slot.arc : slot.tint
  }

  // Labels sit on the arc, so the ink follows the fill underneath: white on the
  // dark length hues, dark on the light tints and on anything dimmed to neutral
  function labelInk(node, searchActive, highlights) {
    if (node.depth !== 1) return INK
    const dimmed = searchActive && !isSearchHighlight(node, highlights) && !inSelectedSegment(node)
    return dimmed ? INK : colorSlot(node).ink
  }

  // Letters appear only for the length you picked: the full ring is too crowded to
  // label, and the reveal doubles as the cue for which group is selected. Labels are
  // radial, so the arc has to be at least as wide as the glyph is tall.
  function labelFor(node, radius) {
    if (node.data.type === 'length') return node.data.name
    if (node.data.length !== focusLength) return ''
    const labelBand = (RING_LENGTH_OUT + RING_LETTER_OUT) / 2
    return (node.x1 - node.x0) * radius * labelBand > LETTER_LABEL_MIN ? node.data.initial : ''
  }

  function updateSelection() {
    const matches = matchingNames()
    const search = searchInput.value.trim().toLocaleLowerCase('sv-SE')
    const exactNameSelected = selectedName &&
      selectedName.toLocaleLowerCase('sv-SE') === search
    // Matched against all available names rather than the selected segment: the
    // name stays lit even while you browse a segment it does not belong to
    const searchMatches = search
      ? names.filter((entry) => exactNameSelected
        ? entry.name === selectedName
        : entry.name.toLocaleLowerCase('sv-SE').includes(search))
      : []
    const highlightedNames = new Set(searchMatches.map((entry) => entry.name))
    const listedNames = new Set(matches.map((entry) => entry.name))
    const listSearchMatches = searchMatches.filter((entry) => listedNames.has(entry.name))
    const highlights = searchHighlights(searchMatches)
    // Dimming only makes sense when there is something left highlighted
    const searchActive = Boolean(search) && searchMatches.length > 0
    const searchFocus = searchActive && highlights.lengths.size === 1
      ? [...highlights.lengths][0]
      : null
    focusLength = focusSource === 'name'
      ? searchFocus ?? selectedLength
      : selectedLength ?? searchFocus
    updateSearchSuggestions()
    const filters = [
      selectedLength ? `${selectedLength} letters` : null,
      selectedInitial ?? null,
      selectedName ?? null,
    ].filter(Boolean)

    // A filter can remove the selected name from the data. Keeping it and saying so
    // matches the timeline, which reports the same gap as "Not in the top 10"
    const nameOutOfRange = Boolean(selectedName) &&
      !names.some((entry) => entry.name === selectedName)

    filterText.replaceChildren(filters.length ? filters.join(' · ') : 'All names')
    if (nameOutOfRange) {
      filterText.append(textSpan('sunburst-outside', 'Not in the top 10 for these filters'))
    }
    const countParts = [
      textSpan('sunburst-count-value', String(matches.length)),
      textSpan('sunburst-count-unit', matches.length === 1 ? 'name' : 'names'),
    ]
    if (search && !nameOutOfRange) {
      countParts.push(textSpan('sunburst-count-highlight', `${listSearchMatches.length} highlighted`))
    }
    countText.replaceChildren(...countParts)
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
      const isSearchMatch = highlightedNames.has(entry.name)
      button.classList.toggle(
        'search-match',
        isSearchMatch
      )
      if (isSearchMatch && !firstSearchMatch) firstSearchMatch = button
      button.addEventListener('click', () => {
        selectedName = entry.name
        searchInput.value = entry.name
        focusSource = 'name'
        suggestionsOpen = false
        activeSuggestionIndex = -1
        updateSelection()
      })
      nameList.append(button)
    })

    firstSearchMatch?.scrollIntoView({ block: 'nearest' })

    if (root) {
      const focusChanged = renderedFocus !== focusLength
      renderedFocus = focusLength
      const arcs = root.selectAll('.sunburst-arc')
      const labels = root.selectAll('.sunburst-label')

      if (focusChanged) {
        arcs.transition().duration(260).attrTween('d', (node) => {
          const step = d3.interpolate(node.current ?? targetState(node), targetState(node))
          return (t) => arcShape(node.current = step(t))
        })
        labels.transition().duration(260)
          .attrTween('transform', (node) => () => labelTransform(node.current ?? targetState(node)))
      } else {
        arcs.attr('d', (node) => arcShape(node.current = targetState(node)))
        labels.attr('transform', (node) => labelTransform(node.current ?? targetState(node)))
      }

      arcs
        .attr('opacity', (node) => arcAlpha(node, searchActive, highlights))
        .attr('fill', (node) => {
          if (isSearchHighlight(node, highlights) || inSelectedSegment(node)) return baseArcColor(node)
          return searchActive ? DIMMED : baseArcColor(node)
        })
        .attr('stroke', '#fff')
        .attr('stroke-width', (node) => {
          const isSelectedLength = node.data.type === 'length' && node.data.length === selectedLength
          const isSelectedLetter = node.data.type === 'letter' &&
            node.data.length === selectedLength && node.data.initial === selectedInitial
          return isSelectedLength || isSelectedLetter ? 2 : 1
        })
      labels
        .classed('search-highlight-label', (node) => isSearchHighlight(node, highlights))
        .attr('fill', (node) => labelInk(node, searchActive, highlights))
        .attr('opacity', (node) => arcAlpha(node, searchActive, highlights))
        .text((node) => labelFor(node, root.radius))
      const hasSelection = Boolean(selectedLength || selectedInitial || selectedName || search)
      root.select('.sunburst-center')
        .attr('y', hasSelection ? -6 : 0)
        .text(selectedInitial ?? selectedLength ?? 'ALL')
      root.select('.sunburst-center-clear')
        .attr('display', hasSelection ? null : 'none')
      root.select('.sunburst-center-hit')
        .classed('is-clearable', hasSelection)
    }

    if (selectedName !== emittedName) {
      emittedName = selectedName
      panel.dispatchEvent(new CustomEvent('namechange', { detail: { name: selectedName } }))
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
    partitionRoot = d3.hierarchy(buildHierarchy(names))

    const svg = d3.select(chart)
      .append('svg')
      .attr('viewBox', `0 0 ${size} ${size}`)
      .attr('role', 'img')
      .attr('aria-label', 'Sunburst filter: inner ring name length, outer ring first letter')

    root = svg.append('g')
      .attr('transform', `translate(${size / 2},${size / 2})`)
    root.radius = radius

    // The accessors read an interpolatable state object rather than the node, so
    // the focus change can be tweened
    arcShape = d3.arc()
      .startAngle((state) => state.x0)
      .endAngle((state) => state.x1)
      .innerRadius((state) => Math.max(0, state.inner))
      .outerRadius((state) => Math.max(0, state.outer))

    layoutAngles()
    renderedFocus = null
    const nodes = partitionRoot.descendants().filter((node) => node.depth > 0)
    const paths = root.selectAll('.sunburst-arc')
      .data(nodes)
      .join('path')
      .attr('class', 'sunburst-arc')
      .attr('fill', baseArcColor)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
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
        : `${node.data.length} letters · ${node.data.nameCount} names`
    })

    root.selectAll('.sunburst-label')
      .data(nodes)
      .join('text')
      .attr('class', 'sunburst-label')
      .classed('is-length', (node) => node.depth === 1)
      .classed('is-letter', (node) => node.depth === 2)
      .attr('fill', (node) => labelInk(node, false, { lengths: new Set(), letters: new Set() }))

    // The hole doubles as a Clear button, so clicking the middle resets the selection
    root.append('circle')
      .attr('class', 'sunburst-center-hit')
      .attr('r', radius * RING_HOLE)
      .attr('role', 'button')
      .attr('tabindex', 0)
      .attr('aria-label', 'Clear sunburst selection')
      .on('click', clearSelection)
      .on('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          clearSelection()
        }
      })
      .append('title')
      .text('Clear selection')

    root.append('text')
      .attr('class', 'sunburst-center')
      .attr('dy', '0.35em')

    root.append('text')
      .attr('class', 'sunburst-center-clear')
      .attr('dy', '0.35em')
      .attr('y', 13)
      .text('Clear ×')

    updateSelection()
  }

  function clearSelection() {
    selectedLength = null
    selectedInitial = null
    selectedName = null
    searchInput.value = ''
    suggestionsOpen = false
    activeSuggestionIndex = -1
    focusSource = null
    updateSelection()
  }

  function resetAll() {
    startYearInput.value = startYearInput.min
    endYearInput.value = endYearInput.max
    updateYearRange(startYearInput)
    startYearInput.dispatchEvent(new Event('input', { bubbles: true }))
    endYearInput.dispatchEvent(new Event('input', { bubbles: true }))

    ;['gender', 'country'].forEach((group) => {
      const all = filterBar.querySelector(`input[name="${group}"][value="all"]`)
      if (!all.checked) {
        all.checked = true
        all.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })

    clearSelection()
  }

  resetButton.addEventListener('click', resetAll)

  // Other panels select a name by asking the sunburst rather than holding their own
  // copy of the selection, so namechange keeps fanning out from one place
  panel.addEventListener('selectname', (event) => {
    selectedName = event.detail.name
    searchInput.value = event.detail.name
    focusSource = 'name'
    suggestionsOpen = false
    activeSuggestionIndex = -1
    updateSelection()
  })

  searchInput.addEventListener('input', () => {
    selectedName = null
    focusSource = 'name'
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
  filterBar.querySelectorAll('input[name="country"]')
    .forEach((input) => input.addEventListener('change', applyGlobalFilters))
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