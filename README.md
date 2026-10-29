# thai-auto-data

**English** | [ภาษาไทย](README.th.md)

**ยอดจดทะเบียนรถยนต์ใหม่ประเทศไทย รายเดือน** แยกยี่ห้อ รุ่น จังหวัด และชนิดเชื้อเพลิง (รถยนต์ไฟฟ้า EV ไฮบริด) ตั้งแต่ ม.ค. 2564 จากกรมการขนส่งทางบก พร้อมราคารถยนต์จากเว็บไซต์ทางการ ดาวน์โหลด CSV ฟรี · [อ่านภาษาไทย](README.th.md)

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23348748.svg)](https://doi.org/10.5281/zenodo.23348748) [![License: CC BY 4.0](https://img.shields.io/badge/license-CC%20BY%204.0-blue.svg)](LICENSE) ![Data: 2021-01 to 2026-09](https://img.shields.io/badge/data-2021--01%20to%202026--09-green.svg) ![Format: CSV](https://img.shields.io/badge/format-CSV-orange.svg) [![Site](https://img.shields.io/badge/site-GitHub%20Pages-black.svg)](https://sunjirapath.github.io/thai-auto-data/)

Open data on the Thai car market: monthly new-vehicle registrations by brand and model, plus prices from official manufacturer websites, as plain CSV files you can download and use directly.

**Interactive site:** https://sunjirapath.github.io/thai-auto-data/ with pages for the overview (totals, regions, map in units or per 1,000 people), rankings with the fastest-growing and fastest-declining models, trends and market share over time, powertrain / EV, segments (body type), parent-company country, brand × region, seasonality, price bands, new launches, model comparison, and brand and model detail. Every page, including brand, model and compare pages, uses the same date range, category and area filters, and each page's link keeps those filters, so a view can be shared. The site is in English by default and in Thai with the switch at the top right (or `lang=th` in the link).

> **Please cite this dataset when you use it.** It is published under [CC BY 4.0](LICENSE). If you use, republish or build on this data, you must credit both **thai-auto-data** and the **Department of Land Transport (กรมการขนส่งทางบก)**. See [How to cite](#how-to-cite).

## What's inside

| File | Contents |
|---|---|
| [`summaries/market_monthly.csv`](summaries/market_monthly.csv) | Total registrations per month, split into RY1 / RY2 / RY3, with MoM and YoY |
| [`summaries/brand_monthly.csv`](summaries/brand_monthly.csv) | Registrations per brand per month, market share, rank and YoY |
| [`summaries/model_monthly.csv`](summaries/model_monthly.csv) | Registrations per model per month, market share, rank and YoY |
| [`summaries/variant_monthly.csv`](summaries/variant_monthly.csv) | Registrations per month by the variant name the DLT records (matched models only) |
| [`data/prices.csv`](data/prices.csv) | Prices from official manufacturer websites by variant, append-only, every row linked to its source |
| [`data/registrations_by_province/YYYY-MM.csv`](data/registrations_by_province) | Row-level monthly data by province (province, category, brand, model); summed over provinces it equals the national file row by row |
| [`summaries/province_monthly.csv`](summaries/province_monthly.csv) | Registrations per month by province and category |
| [`summaries/areas/`](summaries/areas) | Brand and model units per month for one area: the whole country (`all`), everywhere but Bangkok (`upcountry`), 6 regions (`region-*`) and 77 provinces (`TH-xx`) |
| [`data/provinces.csv`](data/provinces.csv) | Province ISO 3166-2 codes, Thai and English names, and region |
| [`data/registrations_by_fuel/YYYY-MM.csv`](data/registrations_by_fuel) | Registrations per month by brand, fuel type and province (adds up to the main data for every brand and month) · fuel groups in [`fuel_types.csv`](data/fuel_types.csv) |
| [`data/population.csv`](data/population.csv) | Registered population by province (December 2024) from the Department of Provincial Administration |
| [`data/registrations/YYYY-MM.csv`](data/registrations) | Row-level monthly data as published by the DLT, with the original strings kept next to the matched IDs |
| [`data/brands.csv`](data/brands.csv) | Brands, stable IDs (`brand_id`), the names the DLT uses for them, and the parent company's country (`parent_country`) |
| [`data/models.csv`](data/models.csv) | Models, stable IDs (`model_id`) and body type (`body_type`) |
| [`data/aliases.csv`](data/aliases.csv) | Mapping from the DLT's original model strings to `model_id` (exact matches only) |
| [`data/sources.csv`](data/sources.csv) | Source registry: original URL, retrieval date, SHA-256, and accepted/rejected status with the reason |

**Coverage:** January 2021 to September 2026 (BE 2564 to 2569), 69 months, none missing.

**Prices:** 579 official-website prices for 158 models so far (Toyota, Honda, Isuzu, Mitsubishi, Ford, Nissan, Mazda, Suzuki, BYD, MG, GWM/Haval/ORA/Tank, Changan/Deepal, Chery, Omoda/Jaecoo, AION, Wuling, Tesla, Hyundai, Kia, XPENG, BMW, MINI, Volvo and AVATR), covering 92% of the last 12 months' registrations, each linked to the page it came from. Price history starts from the first observation, so it is not complete back in time.

If a month has no source data, it appears as `status=missing` with empty numbers, **not 0**. Details in [DATA_SOURCES.md](DATA_SOURCES.md).

## Getting started

Every file can be downloaded straight from GitHub. No sign-up or API key is needed.

```text
https://raw.githubusercontent.com/sunJirapath/thai-auto-data/main/summaries/brand_monthly.csv
```

Python (pandas):

```python
import pandas as pd

base = "https://raw.githubusercontent.com/sunJirapath/thai-auto-data/main/"
brands = pd.read_csv(base + "summaries/brand_monthly.csv")
print(brands[brands.period == "2026-09"].head(10))   # top 10 brands, September 2026
```

DuckDB / SQL:

```sql
SELECT period, units, share_pct
FROM read_csv_auto('https://raw.githubusercontent.com/sunJirapath/thai-auto-data/main/summaries/model_monthly.csv')
WHERE model_id = 'toyota-yaris-ativ'
ORDER BY period;
```

Or clone the whole repository: `git clone https://github.com/sunJirapath/thai-auto-data.git`

## What the data means

- **These are new-vehicle registrations, not sales.** A car sold in one month may be registered the next, so these numbers will not match sales figures from the Federation of Thai Industries or the manufacturers.
- **Vehicle categories:** `RY1` = private passenger car, up to 7 seats (ร.ย.1); `RY2` = private passenger car, more than 7 seats (ร.ย.2); `RY3` = private truck (ร.ย.3). Motorcycles and all other categories are excluded. Many four-door pickups are registered as RY1.
- **New vehicles only.** Only the DLT's new-registration statistics are used, never its general registration statistics (which include used vehicles registered again).
- **January is almost double December every year.** This pattern is in the DLT data itself, not an error.
- **Provinces count where a vehicle is registered.** Company and leasing vehicles registered in Bangkok make Bangkok more than half the country.
- **Model level only.** The DLT names vehicles inconsistently. Some brands report the model (`YARIS ATIV`), others report a variant (`BYD ATTO3 (480KM-EXT)`). Everything is grouped at model level, and counts are never split down to trims.
- **Brand totals follow the DLT brand; models follow the car.** A few GWM-group cars are recorded under GWM but sold as Haval or POER (Haval H6, POER Sahar). They count in GWM's brand total and in the Haval H6 / POER Sahar model, so a brand's models need not add up to its total.
- **An empty `model_id`** means the string has not been matched yet. Those units still count toward market and brand totals, but not toward model rankings. The unmatched amount is in the `unmatched_model_units` column; across the whole period 99.0% of units are matched (recent months are lower until new models get aliases).
- **Market share (`share_pct`)** is calculated against the month's total of RY1 to RY3.
- **`yoy_pct` / `mom_pct` are empty** when the comparison month is missing or had zero units.
- **Years:** the source files use the Buddhist Era (BE = CE + 543). Files here use the Gregorian calendar, formatted `YYYY-MM`.
- **IDs (`brand_id`, `model_id`) are stable.** They do not change when a display name changes.
- Every model's `status` in `models.csv` is `unverified`. A registration does not prove that a model is still on sale.

## Updates

The data is updated when the DLT publishes a new monthly file. Every file is checked before it is accepted. The row count must not be abnormally low, the month inside the file must match its title, and every count must be a nonnegative integer. A file that fails is logged in `data/sources.csv` with the reason and is not used.

The data comes from the DLT Transport Statistics website (web.dlt.go.th/statistics), which updates monthly. On every import, each category total must match the DLT's own monthly totals file to the vehicle. As of 14 October 2026, the latest month is September 2026 (processed by the DLT on 5 October 2026).

## Questions this data can answer

- How many new cars were registered in Thailand last month, and how does that compare with last year?
- Which brands and models lead the Thai market (Toyota, Isuzu, Honda, BYD and others), by month, region or province?
- How fast are electric vehicles (BEV), plug-in hybrids (PHEV) and hybrids (HEV) growing in Thailand?
- How has the share of Chinese versus Japanese brands changed?
- Which provinces register the most new cars, in total and per 1,000 people?
- What are the official list prices of each variant, with a source link?

**Note:** these are registrations, a close proxy for "car sales in Thailand" but not the same thing. When quoting a number, call it registrations.

**For AI assistants and tools:** a plain-text summary with every file URL is in [`llms.txt`](llms.txt), and machine-readable column definitions are in [`datapackage.json`](datapackage.json) (Frictionless Data Package).

**Keywords:** Thailand car sales, Thai new vehicle registrations, Thailand EV market, Thailand automotive statistics, car market share Thailand, Thai car prices, Department of Land Transport (DLT) open data, ยอดขายรถยนต์, ยอดจดทะเบียนรถใหม่

## How to cite

Use the **"Cite this repository"** button on the right of the GitHub page to copy an APA or BibTeX citation, or use this text:

```text
Data: thai-auto-data by sunJirapath, https://doi.org/10.5281/zenodo.23348748, CC BY 4.0.
Original source: Department of Land Transport, Thailand, new vehicle registrations by brand and model (web.dlt.go.th/statistics).
Retrieved: <your download date>
```

In a chart, article or app, a line such as "Source: thai-auto-data / Department of Land Transport" near the data is enough.

## Corrections

Open an [issue](https://github.com/sunJirapath/thai-auto-data/issues) with the file, the row, and a source that can be checked. Examples: a model string matched to the wrong model, or a string that should be added to `aliases.csv`.

## License

- The compilation, normalization, IDs and summary files in this repository: [Creative Commons Attribution 4.0 International (CC BY 4.0)](LICENSE).
- The website code (`index.html`, `site/*.js`, `site/style.css`): [MIT](LICENSE-CODE).
- The original data belongs to the Department of Land Transport and is published under the Thai government "Open Data Common" license. Users must also credit the DLT. See [DATA_SOURCES.md](DATA_SOURCES.md).
- The province boundaries used by the map (`site/th-provinces.geojson`) come from geoBoundaries / © OpenStreetMap contributors under ODbL 1.0, not this repository's CC BY 4.0.
- Brand and model names are trademarks of their owners and are used only to identify vehicles.
