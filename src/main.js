import './style.css'
import { setupNameSunburst } from './sunburst.js'

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
    <fieldset class="gender-control">
      <legend class="filter-label">Gender</legend>
      <div class="gender-options">
        <label><input type="radio" name="gender" value="all" checked><span>All</span></label>
        <label><input type="radio" name="gender" value="female"><span>Female</span></label>
        <label><input type="radio" name="gender" value="male"><span>Male</span></label>
      </div>
    </fieldset>
  </div>
</header>
<main class="content-slots">
  <section class="content-slot" aria-label="Visualization one"></section>
  <section class="content-slot sunburst-panel" id="name-sunburst" aria-label="Name filter sunburst">
    <header class="sunburst-header">
      <div>
        <p class="sunburst-eyebrow">SCANDINAVIA · 2000–2022</p>
        <h2>Browse names</h2>
      </div>
      <button class="sunburst-reset" type="button">Clear</button>
    </header>
    <div class="sunburst-legend" aria-hidden="true">
      <span>Length</span><span>First letter</span>
    </div>
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
  <section class="content-slot" aria-label="Visualization three"></section>
  <section class="content-slot" aria-label="Visualization four"></section>
</main>
`

setupNameSunburst(
  document.querySelector('#name-sunburst'),
  document.querySelector('#global-filters')
)
