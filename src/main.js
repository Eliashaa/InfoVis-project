import { setupNameSunburst } from './sunburst.js'
import { setupDiffusionTimeline } from './timeline.js'
import { setupTurnoverChart } from './turnover.js'
import { setupLifecycleScatter } from './lifecycle.js'
import { setupRankBump } from './bump.js'
import { setupPeakScatter } from './peak.js'

document.querySelector('#app').innerHTML = `
<header class="topbar">
  <div class="topbar-title">
    <h1>Scandinavian Baby Names</h1>
    <p>Sources: Top 10 names from SSB (Norway), Statistics Denmark, SCB (Sweden) · 1,385 records · 2000–2022</p>
  </div>
  <div class="topbar-filters" id="global-filters" aria-label="Name filters">
    <div class="filter-control name-control">
      <label class="filter-label" for="name-query">Name search</label>
      <input id="name-query" type="search" placeholder="Search names" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="name-suggestions">
      <div class="name-suggestions" id="name-suggestions" role="listbox" aria-label="Available matching names" hidden></div>
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
</header>
<main class="content-slots">
  <section class="content-slot turnover-panel" id="name-turnover" aria-label="Naming turnover">
    <header>
      <h2>Naming turnover</h2>
      <p class="turnover-subtitle"></p>
    </header>
    <div class="turnover-chart"></div>
    <div class="turnover-legend" aria-hidden="true"></div>
  </section>
  <section class="content-slot sunburst-panel" id="name-sunburst" aria-label="Name characteristics">
    <header class="sunburst-header">
      <div>
        <h2>Name characteristics</h2>
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
      <h2>Cross-country diffusion</h2>
      <p class="timeline-subtitle"></p>
    </header>
    <div class="timeline-chart"></div>
    <div class="timeline-legend" aria-hidden="true">
      <span><i class="legend-dot legend-peak"></i>Peak rank</span>
      <span><i class="legend-bar"></i>In top 10</span>
      <span><i class="legend-bar legend-out"></i>Not in top 10</span>
    </div>
  </section>
  <section class="content-slot lifecycle-panel" id="name-lifecycle" aria-label="Name lifecycle landscape">
    <header>
      <h2>Name lifecycle landscape</h2>
      <p class="lifecycle-subtitle"></p>
    </header>
    <div class="lifecycle-chart"></div>
    <div class="lifecycle-footnote"></div>
  </section>
  <section class="content-slot bump-panel" id="name-bump" aria-label="Rank trajectories">
    <header class="bump-header">
      <div class="bump-heading">
        <h2>Rank trajectories</h2>
        <p class="bump-subtitle"></p>
      </div>
      <fieldset class="bump-view" aria-label="Rank trajectories view">
        <div class="choice-options">
          <label><input type="radio" name="bump-view" value="list" checked><span>Top 10 over time</span></label>
          <label><input type="radio" name="bump-view" value="countries"><span>Across countries</span></label>
        </div>
      </fieldset>
    </header>
    <div class="bump-chart"></div>
  </section>
  <section class="content-slot peak-panel" id="name-peak" aria-label="Peak against longevity">
    <header class="peak-header">
      <div class="peak-heading">
        <h2>Peak against longevity</h2>
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

setupLifecycleScatter(
  document.querySelector('#name-lifecycle'),
  document.querySelector('#name-sunburst'),
  document.querySelector('#global-filters')
)

setupRankBump(
  document.querySelector('#name-bump'),
  document.querySelector('#name-sunburst'),
  document.querySelector('#global-filters')
)

setupPeakScatter(
  document.querySelector('#name-peak'),
  document.querySelector('#name-sunburst'),
  document.querySelector('#global-filters')
)
