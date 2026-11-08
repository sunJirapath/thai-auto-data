# Dashboard UX and SEO update

This update puts the latest complete national registration total above Explore, makes filtered rankings shareable, and keeps the dashboard usable when map geometry or area data fails to load. It combines the map branch at `6230f4a`, the SEO work at `37a464d`, and dashboard changes UX-01 through UX-10.

## What changed

| Item | Previous behavior | Updated behavior |
| --- | --- | --- |
| UX-01 · Share Ranking | A shared Model ranking reopened in Brand mode. A Thai link could also follow the recipient's saved language. | Ranking stores `rank=brand` or `rank=model` and an explicit `lang`. Copy, reload, and browser history restore the selected mode and scope. Legacy links and invalid ranking modes fall back to Brand. |
| UX-02 · Map loading | A failed GeoJSON request could stop the whole dashboard during startup. | Overview loads geometry only when it needs the map. One request is shared while it is in flight. A failure shows a local retry while the national totals, region chart, province table, and other routes stay usable. A successful retry uses the active filters. |
| UX-03 · Keyboard and focus | Tab could move behind the mobile drawer. The map added 77 tab stops and lost focus on selection. | The drawer traps Tab and Shift+Tab, Escape returns focus to Menu, and route changes focus the destination heading. A skip link reaches the main content. The map area button opens the native area selector. Compare restores focus after adding or removing an item. |
| UX-04 · Latest complete month | On a 390×844 viewport, Explore and filters appeared above the latest-month KPI. | Overview puts the latest complete national month, count, named comparison month, and DLT source first. A newer provisional national total is shown separately. The local area analysis follows its own filters below. |
| UX-05 · Mobile filters | The full filter panel used screen space before results, and the applied scope was easy to miss. | Mobile starts with filters collapsed and the applied scope visible. Filters apply immediately. Reset restores only the filters used by the current route and preserves Ranking mode. |
| UX-06 · Price bands | The chart left the relationship between the registration period and the price date implicit. | Copy beside the chart explains that registrations come from the selected period, while bands use the latest recorded official starting list prices. Observation dates vary by model. Promotional prices are excluded from the bands. |
| UX-07 · Chart downloads | Ranking CSVs had a generic value header and filenames lacked the area. Chart images lacked a standalone caption. | Chart CSVs identify dimensions, units, and applicable scope. Filenames include the chart and relevant identifiers. PNGs include the chart title, scope, units, and source. Compare retains its table download and the Data page retains raw CSV downloads. |
| UX-08 · Map scale | The map branch combined regional hues with five intensity classes, which made it harder to compare shades across regions. | The province map uses one sequential scale for either counts or registrations per 1,000 people. The selected area has an outline. The province table gives exact values and region names. The regional bar chart retains its region colors. |
| UX-09 · Failed area request | A failed Bangkok CSV request could leave Chiang Mai figures visible under a Bangkok label. | The dashboard hides results for the previous area while the new scope loads. A failed request shows a scoped retry and is evicted from the cache. Responses from earlier selections are ignored. An empty Ranking gets its own message. |
| UX-10 · Narrow screens | Ranking could expand the page to 357 CSS px at a 320 px viewport. | The grid can shrink to 320 CSS px in both languages. Wide tables scroll within their containers. |

## Data and URL behavior

- The headline reads the latest complete national month from [market_monthly.csv](../summaries/market_monthly.csv). The October 2026 test fixture shows **53,750 registrations**, down **10.6%** from September. A simulated newer provisional month remains separate from the headline and is excluded from province analysis.
- Regions always compares all regions for the selected period and categories. Seasonality uses the full available period for the selected area and categories. Data keeps only the language in its URL.
- Preset date ranges follow the dataset as it updates. Custom ranges store explicit start and end months. Use a custom range when you need a fixed reporting period.
- The per-capita map uses registered population from December 2024. The Chiang Mai fixture totals **23,850 registrations**, or **13.3 per 1,000 people**, for November 2025 through October 2026. [Province registrations](../summaries/areas/TH-50.csv) · [Population data](../data/population.csv)
- The repository's datasets and their CSV schemas remain the source for analysis. Chart downloads are a separate presentation format. [Data sources](../DATA_SOURCES.md)

## Implementation

| File | Responsibility |
| --- | --- |
| [index.html](../index.html) | Main landmark, mobile controls, map and area recovery states, price explanation, and generated Overview headline. |
| [site/app.js](../site/app.js) | URL state, data loading and retry, focus management, province map, Ranking empty state, and chart export context. |
| [site/style.css](../site/style.css) and [site/i18n-th.js](../site/i18n-th.js) | Responsive layouts, focus styling, light and dark contrast, and Thai interface copy. |
| [scripts/build_seo.py](../scripts/build_seo.py) | Generates the crawlable latest-complete-month summary and separately labels a newer provisional month. |
| [brands](../brands/index.html), [models](../models/index.html), and [EV](../ev/index.html) | Static landing pages updated by the SEO branch. |

The landing page retains static summary content when JavaScript or Chart.js is unavailable. After a data update, regenerate the SEO output with `python scripts/build_seo.py`.

## Verification

The implementation review passed 13 headless Chrome test groups, including 14 routes in Thai and English. It covered 320 px reflow, 390×844 and 1440×900 layouts, a 768 px tablet viewport, light and dark themes, keyboard focus, clipboard, browser history, CSV, and PNG.

| Check | Observed result |
| --- | --- |
| Chiang Mai, September to October 2026, RY1 | Brand Ranking reopened on Toyota at 979. Model Ranking reopened on Toyota Yaris ATIV at 377. Compare showed Yaris ATIV at 377 and Honda City at 153. |
| Blocked or delayed GeoJSON | Compare and the Overview data views loaded. Retrying the map used the latest area, and a delayed response did not render on another route. |
| Blocked Bangkok CSV | Chiang Mai's previous value of 9,478 disappeared. Retrying returned the expected Bangkok Toyota count of 119,638 for November 2025 through October 2026. |
| Historical price bands | January to March 2021 retained 91.5% price coverage across 233,669 registrations. |
| Empty and incomplete data | Empty Ranking, missing monthly data, a newer provisional month, and required CSV startup errors each displayed their own state. |

Run these checks from the repository root:

```sh
node --check site/app.js
node --check site/i18n-th.js
python scripts/build_seo.py --check
git diff --check
```

For a browser smoke test, run `python -m http.server 8000 --bind 127.0.0.1`, then open [Thai Overview](http://127.0.0.1:8000/#/?lang=th), [Chiang Mai Model Ranking](http://127.0.0.1:8000/#/ranking?range=custom&from=2026-09&to=2026-10&cats=RY1&area=prov%3ATH-50&rank=model&lang=en), and [historical Price bands](http://127.0.0.1:8000/#/prices?range=custom&from=2021-01&to=2021-03&lang=en).

## Release review

The weighted UX review scored the local candidate **8.65/10**, compared with **6.775/10** for the earlier hosted baseline. The product assessment was **conditional go**. Real touch devices, screen readers, Thai participant comprehension, and a smoke test of the deployed build are still pending. Keyboard, reflow, and contrast results cover the tested browser paths.
