# Scandinavian Baby Names

An information visualization project for exploring popular baby names in Denmark, Norway, and Sweden from 2000 to 2022. The dataset contains top-10 records sourced from SSB, Statistics Denmark, and SCB.

## Requirements

- Node.js and npm, for the development server and the production build
- Or just VS Code with the Live Server extension, for the no-build route below

## Run locally

1. Open a terminal in the project directory.
2. Install the dependencies:

	```sh
	npm install
	```

3. Start the development server:

	```sh
	npm run dev
	```

4. Open the local URL printed in the terminal, usually `http://localhost:5173/`.

## Run with Live Server

The app also runs on the VS Code Live Server extension, with no Node, no `npm install`
and no build step.

1. Install the **Live Server** extension in VS Code.
2. Right-click `index.html` and choose **Open with Live Server**.

Two things differ from `npm run dev`:

- d3 is loaded from a CDN instead of `node_modules`, through the import map in
  `index.html`, so this route needs an internet connection. Any npm dependency added
  later needs an entry in that import map before Live Server can resolve it.
- Edits reload the whole page, without Vite's hot module replacement.

## Other commands

Create a production build:

```sh
npm run build
```

Preview the production build locally after building:

```sh
npm run preview
```

## Using the visualization

The dashboard is four linked panels sharing one set of filters. Selecting a name in
any panel updates all of them.

### Filters

- **Name search** — type to highlight matching names, or pick one from the suggestions.
- **Year interval** — the two-handle slider sets the period every panel reports on.
- **Gender** and **Country** — narrow the dataset; `All` is the default for both.
- **Reset all** — clears the selection and returns the year, gender and country filters
  to their defaults.

### Panels

- **Naming turnover** — the share of each year's top 10 that was not there the year
  before, one line per country. Starts at 2001, since 2000 has no previous year to
  compare against. With a name selected, a dot marks each year it joined or left a
  country's top 10, placed at that year's churn level.
- **Name characteristics** — a sunburst of the available names, grouped by name length
  (inner ring) then first letter (outer ring). Select a segment to narrow the names
  list; the chosen group expands outward and reveals its letters. Click the middle to
  clear the sunburst's own selection.
- **Cross-country diffusion** — for the selected name, the years it held a place in
  each country's top 10, with its peak rank marked.
- **Name lifecycle landscape** — one dot per name and country, plotting how fast a name
  rose (years from entry to peak) against how long it lasted (years in the top 10).
  Scroll to zoom, drag to pan, double-click to reset. Click a dot to select that name.

The two left-hand panels share an x-axis scale, so a given year sits at the same
position in both and they can be read together.

The CSV dataset is located at `public/scandinavia_top10_babynames_2000_2022.csv` and is loaded by the app at runtime.

## A note on the data

The source lists are top 10 per country, per sex, per year, so with `Gender: All` each
country contributes 20 names a year. A handful of Swedish years have 21, because SCB
reports ties at rank 10 rather than breaking them.

Lifecycle figures are bounded by the selected period: a name already listed when the
period opens, or still listed when it closes, has no observable entry or exit, so its
rise and longevity are minimums rather than exact values.

## Project flow

```mermaid
flowchart TD
	A[Scandinavian top-10 CSV] --> B[Normalize gender labels]
	B --> C[Load names in the app]
	C --> D[Apply year, gender and country filters]
	D --> E[Four linked panels]
	E --> F{Choose an interaction}
	F -->|Type or pick a name| G[Select a name]
	F -->|Select a sunburst segment| H[Filter by length or first letter]
	F -->|Click a lifecycle dot| G
	H --> E
	G --> I[Highlight across all panels]
	I --> J[Diffusion, turnover markers and lifecycle dot follow]
```
