import { setupNameSunburst } from './sunburst.js'
import { setupDiffusionTimeline } from './timeline.js'
import { setupTurnoverChart } from './turnover.js'
import { setupPeakScatter } from './peak.js'

document.querySelector('#app').innerHTML = `
<header class="topbar">
  <div class="brand">
    <svg class="brand-mark" viewBox="0 0 64 54" aria-hidden="true">
      <circle cx="11" cy="29" r="5" fill="#f6cfae"/>
      <circle cx="53" cy="29" r="5" fill="#f6cfae"/>
      <circle cx="32" cy="29" r="21" fill="#ffe1c6"/>
      <path d="M28.5 10c-1.8-4.8 4.2-7.6 7.2-4.2 1.9 2.2.4 5.1-2.1 4.6" fill="none" stroke="#8a5a3c" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M21 27q3 3 6 0M37 27q3 3 6 0" fill="none" stroke="#08060d" stroke-width="2" stroke-linecap="round"/>
      <circle cx="19" cy="34" r="3.4" fill="#f39ac2" opacity="0.75"/>
      <circle cx="45" cy="34" r="3.4" fill="#f39ac2" opacity="0.75"/>
      <ellipse cx="32" cy="38.5" rx="6.4" ry="4.6" fill="#7fb2f0"/>
      <circle cx="32" cy="38.5" r="2.2" fill="#ffe1c6"/>
    </svg>
    <div class="brand-text">
      <h1 class="brand-name">Book of Names</h1>
      <span class="brand-flags" aria-label="Norway, Sweden and Denmark">
        <svg viewBox="0 0 22 16" role="img" aria-label="Norway"><rect width="22" height="16" rx="2" fill="#ba0c2f"/><path d="M0 8h22M8 0v16" stroke="#fff" stroke-width="4"/><path d="M0 8h22M8 0v16" stroke="#00205b" stroke-width="2"/></svg>
        <svg viewBox="0 0 22 16" role="img" aria-label="Sweden"><rect width="22" height="16" rx="2" fill="#006aa7"/><path d="M0 8h22M8 0v16" stroke="#fecc00" stroke-width="3"/></svg>
        <svg viewBox="0 0 22 16" role="img" aria-label="Denmark"><rect width="22" height="16" rx="2" fill="#c8102e"/><path d="M0 8h22M8 0v16" stroke="#fff" stroke-width="3"/></svg>
        <span class="brand-years">Top <span class="brand-ten">10</span> names, 2000–2022</span>
      </span>
    </div>
  </div>
  <div class="topbar-filters" id="global-filters" aria-label="Name filters">
    <div class="filter-control name-control">
      <label class="filter-label" for="name-query">Name search <span class="filter-hint">up to 2</span></label>
      <div class="name-field">
        <ul class="name-chips" aria-label="Selected names" hidden></ul>
        <input id="name-query" type="search" placeholder="Search names" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="name-suggestions">
      </div>
      <div class="name-suggestions" id="name-suggestions" role="listbox" aria-label="Available matching names" hidden></div>
      <p class="name-limit" role="status" hidden></p>
    </div>
    <div class="filter-control year-control">
      <div class="filter-label-row">
        <span class="filter-label">Year interval</span>
        <output id="year-output" for="year-start year-end">2000–2022</output>
      </div>
      <div class="year-range-track">
        <input id="year-start" type="range" min="2000" max="2022" value="2000" aria-label="Start year">
        <input id="year-end" type="range" min="2000" max="2022" value="2022" aria-label="End year">
      </div>
    </div>
    <div class="filter-group">
      <fieldset class="choice-control">
        <legend class="filter-label">Gender</legend>
        <div class="choice-options">
          <label><input type="radio" name="gender" value="all" checked><span>All</span></label>
          <label><input type="radio" name="gender" value="female"><span>Female</span></label>
          <label><input type="radio" name="gender" value="male"><span>Male</span></label>
        </div>
      </fieldset>
      <fieldset class="choice-control">
        <legend class="filter-label">Country</legend>
        <div class="choice-options">
          <label><input type="radio" name="country" value="all" checked><span>All</span></label>
          <label><input type="radio" name="country" value="Norway"><span>NO</span></label>
          <label><input type="radio" name="country" value="Sweden"><span>SE</span></label>
          <label><input type="radio" name="country" value="Denmark"><span>DK</span></label>
        </div>
      </fieldset>
      <button class="filter-reset" type="button">Reset all</button>
    </div>
  </div>
</header>
<main class="content-slots">
  <span class="book-folio book-left" aria-hidden="true">10</span>
  <span class="book-folio book-right" aria-hidden="true">11</span>
  <section class="content-slot turnover-panel" id="name-turnover" aria-label="Naming turnover">
    <header>
      <h2><span class="chapter">I</span>Naming turnover</h2>
      <p class="turnover-subtitle"></p>
    </header>
    <div class="turnover-chart"></div>
    <div class="turnover-legend" aria-hidden="true"></div>
  </section>
  <section class="content-slot sunburst-panel" id="name-sunburst" aria-label="Name characteristics">
    <header class="sunburst-header">
      <div>
        <h2><span class="chapter">III</span>Name characteristics</h2>
        <p class="sunburst-subtitle">Top-10 names grouped by length, then by first letter</p>
      </div>
    </header>
    <div class="sunburst-main">
      <div class="sunburst-chart" aria-label="Interactive name sunburst"></div>
      <aside class="sunburst-results">
        <div class="sunburst-results-header">
          <h3>Names</h3>
          <p class="sunburst-count"></p>
        </div>
        <p class="sunburst-filter" aria-live="polite">Loading names…</p>
        <div class="sunburst-name-list" role="listbox" aria-label="Matching names"></div>
      </aside>
    </div>
  </section>
  <section class="content-slot timeline-panel" id="name-timeline" aria-label="Cross-country timeline">
    <header>
      <h2><span class="chapter">II</span>Cross-country diffusion</h2>
      <p class="timeline-subtitle"></p>
    </header>
    <div class="timeline-chart"></div>
    <div class="timeline-legend" aria-hidden="true">
      <span><i class="legend-dot legend-peak"></i>Peak rank</span>
      <span><i class="legend-bar"></i>In top 10</span>
      <span><i class="legend-bar legend-out"></i>Not in top 10</span>
    </div>
  </section>
  <section class="content-slot peak-panel" id="name-peak" aria-label="Peak against longevity">
    <header class="peak-header">
      <div class="peak-heading">
        <h2><span class="chapter">IV</span>Peak against longevity</h2>
        <p class="peak-subtitle"></p>
      </div>
      <fieldset class="peak-view" aria-label="Peak against longevity view">
        <div class="choice-options">
          <label><input type="radio" name="peak-view" value="names" checked><span>Names</span></label>
          <label><input type="radio" name="peak-view" value="density"><span>Density</span></label>
        </div>
      </fieldset>
    </header>
    <div class="peak-chart"></div>
    <div class="peak-legend"></div>
  </section>
</main>
`

setupNameSunburst(
  document.querySelector('#name-sunburst'),
  document.querySelector('#global-filters')
)

setupDiffusionTimeline(
  document.querySelector('#name-timeline'),
  document.querySelector('#name-sunburst'),
  document.querySelector('#global-filters')
)

setupTurnoverChart(
  document.querySelector('#name-turnover'),
  document.querySelector('#name-sunburst'),
  document.querySelector('#global-filters')
)

setupPeakScatter(
  document.querySelector('#name-peak'),
  document.querySelector('#name-sunburst'),
  document.querySelector('#global-filters')
)

// Set the initial selection after all panels have registered their listeners.
document.querySelector('#name-sunburst').dispatchEvent(
  new CustomEvent('togglename', { detail: { name: 'Elias' } })
)
