# thai-auto-data

**English** | [ภาษาไทย](README.md)

Open data on the Thai car market: monthly first registrations of new vehicles by brand and model, as plain CSV files you can download and use directly.

**Interactive charts and rankings:** https://sunjirapath.github.io/thai-auto-data/

> **Please cite this dataset when you use it.** It is published under [CC BY 4.0](LICENSE). If you use, republish or build on this data, you must credit both **thai-auto-data** and the **Department of Land Transport (กรมการขนส่งทางบก)**. See [How to cite](#how-to-cite).

## What's inside

| File | Contents |
|---|---|
| [`summaries/market_monthly.csv`](summaries/market_monthly.csv) | Total registrations per month, split into RY1 / RY2 / RY3, with MoM and YoY |
| [`summaries/brand_monthly.csv`](summaries/brand_monthly.csv) | Registrations per brand per month, market share, rank and YoY |
| [`summaries/model_monthly.csv`](summaries/model_monthly.csv) | Registrations per model per month, market share, rank and YoY |
| [`data/registrations/YYYY-MM.csv`](data/registrations) | Row-level monthly data as published by the DLT, with the original strings kept next to the matched IDs |
| [`data/brands.csv`](data/brands.csv) | Brands, stable IDs (`brand_id`) and the names the DLT uses for them |
| [`data/models.csv`](data/models.csv) | Models and stable IDs (`model_id`) |
| [`data/aliases.csv`](data/aliases.csv) | Mapping from the DLT's original model strings to `model_id` (exact matches only) |
| [`data/sources.csv`](data/sources.csv) | Source registry: original URL, retrieval date, SHA-256, and accepted/rejected status with the reason |

**Coverage:** January 2022 to January 2026 (BE 2565 to 2569), 48 months.

**Missing months:** December 2023 (the file the DLT published under that title contains December 2022 data) and February 2026 (the published file has only 6 rows). Both appear as `status=missing` with empty numbers, **not 0**. Details in [DATA_SOURCES.md](DATA_SOURCES.md).

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
print(brands[brands.period == "2026-01"].head(10))   # top 10 brands, January 2026
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

- **These are first registrations, not sales.** A car sold in one month may be registered the next, so these numbers will not match sales figures from the Federation of Thai Industries or the manufacturers.
- **Vehicle categories:** `RY1` = private passenger car, up to 7 seats (ร.ย.1); `RY2` = private passenger car, more than 7 seats (ร.ย.2); `RY3` = private pickup / truck (ร.ย.3). Motorcycles and all other categories are excluded.
- **Model level only.** The DLT names vehicles inconsistently. Some brands report the model (`YARIS ATIV`), others report a variant (`BYD ATTO3 (480KM-EXT)`). Everything is grouped at model level, and counts are never split down to trims.
- **An empty `model_id`** means the string has not been matched yet. Those units still count toward market and brand totals, but not toward model rankings. The unmatched amount is in the `unmatched_model_units` column; across the whole period 98.1% of units are matched.
- **Market share (`share_pct`)** is calculated against the month's total of RY1 to RY3.
- **`yoy_pct` / `mom_pct` are empty** when the comparison month is missing or had zero units.
- **Years:** the source files use the Buddhist Era (BE = CE + 543). Files here use the Gregorian calendar, formatted `YYYY-MM`.
- **IDs (`brand_id`, `model_id`) are stable.** They do not change when a display name changes.
- Every model's `status` in `models.csv` is `unverified`. A registration does not prove that a model is still on sale.

## Updates

The data is updated when the DLT publishes a new monthly file. Every file is checked before it is accepted. The row count must not be abnormally low, the month inside the file must match its title, and every count must be a nonnegative integer. A file that fails is logged in `data/sources.csv` with the reason and is not used.

As of 13 October 2026, the latest file published by the DLT is February 2026 (uploaded 17 March 2026).

## How to cite

Use the **"Cite this repository"** button on the right of the GitHub page to copy an APA or BibTeX citation, or use this text:

```text
Data: thai-auto-data by sunJirapath (https://github.com/sunJirapath/thai-auto-data), CC BY 4.0.
Original source: Department of Land Transport, Thailand, first vehicle registrations by brand and model (gdcatalog.dlt.go.th).
Retrieved: <your download date>
```

In a chart, article or app, a line such as "Source: thai-auto-data / Department of Land Transport" near the data is enough.

## Corrections

Open an [issue](https://github.com/sunJirapath/thai-auto-data/issues) with the file, the row, and a source that can be checked. Examples: a model string matched to the wrong model, or a string that should be added to `aliases.csv`.

## License

- The compilation, normalization, IDs and summary files in this repository: [Creative Commons Attribution 4.0 International (CC BY 4.0)](LICENSE).
- The original data belongs to the Department of Land Transport and is published under the Thai government "Open Data Common" license. Users must also credit the DLT. See [DATA_SOURCES.md](DATA_SOURCES.md).
- Brand and model names are trademarks of their owners and are used only to identify vehicles.
