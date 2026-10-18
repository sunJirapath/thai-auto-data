# Data sources

## 1. Registrations: กรมการขนส่งทางบก, สถิติการจดทะเบียนรถใหม่ จำแนกตามยี่ห้อรถ รุ่นรถ และจังหวัด

| | |
|---|---|
| Publisher | กรมการขนส่งทางบก (Department of Land Transport, DLT), กลุ่มสถิติการขนส่ง กองแผนงาน |
| Where | [web.dlt.go.th/statistics](https://web.dlt.go.th/statistics/) → ข้อมูลด้านทะเบียนรถ → สถิติการจดทะเบียนรถใหม่ → "รถใหม่ (พ.ร.บ.รถยนต์) จำแนกตามยี่ห้อรถ รุ่นรถ และจังหวัด" |
| Format | One xlsx with every month since January 2021: year (BE), month, vehicle category, province, brand, model, count |
| Counts | New vehicles only. Used vehicles registered again are excluded (note in the file). |
| Update frequency | Monthly. The file in use covers January 2021 to September 2026 and was processed by the DLT on 5 October 2026. |
| License | Not stated on the page. The same statistics are published on the DLT open-data portal under the Thai government "Open Data Common" license; see below. |
| Used for | `data/registrations/`, `summaries/` |
| Exact file used | Listed in [`data/sources.csv`](data/sources.csv) with the download URL, retrieval date and SHA-256 |

### What we keep

- **New vehicles only** (สถิติการจดทะเบียนรถใหม่). The DLT's other series, สถิติการจดทะเบียนรถ, also counts used vehicles registered again and is not used anywhere in this project.
- Categories รย.1 (`RY1`), รย.2 (`RY2`) and รย.3 (`RY3`) only. Motorcycles, tractors, trailers and commercial categories are dropped at import.
- National totals per month, category, brand and model (`data/registrations/`).
- The same rows split by province (`data/registrations_by_province/`). Summed over provinces, every month, category, brand and model string equals the national file exactly; `validate.py` checks this. Province totals and per-area brand/model tables in `summaries/` are generated from it.
- The DLT's brand and model strings are kept unchanged (`brand_raw`, `model_raw`) next to the matched IDs.

### Checks applied to every import

The whole file is rejected, logged in `data/sources.csv` with the reason, and nothing is changed if:

1. any month between the first and last month is missing;
2. the last month in the data does not match the period stated in the file's title;
3. any month has fewer rows than half the median month, which suggests a truncated file;
4. for any month in the DLT's separate monthly totals file (สถิติการจดทะเบียนรถใหม่ ทั่วประเทศ, linked on the same site), our RY1, RY2 or RY3 total differs from the DLT's own total by even one vehicle;
5. a count is negative or not a whole number.

The import also reports which already-published months changed, so DLT revisions are visible in review.

### Verification (13–14 October 2026)

- Every month from January 2024 to September 2026 matches, for RY1, RY2 and RY3, the "ทั่วประเทศ" column of the DLT's yearly new-registration-by-province files (newcar_2024, newcar_2025, newcar_2026). The 2021, 2022 and 2023 annual totals match the DLT's yearly files for those years.
- 2025 and 2026 months also match the DLT's monthly totals file used as the import gate.

### Patterns that look odd but are in the DLT data

- **January is almost double December, every year.** For example, December 2025 had 42,309 and January 2026 had 90,733, and the jump is spread across almost every brand. The same December dip and January jump appear in every year since 2021. These are registrations, not sales, so registration timing shows up directly.
- **Many pickups are รย.1.** Four-door and other passenger-configured pickups are often registered as รย.1 (private car, up to 7 seats), not รย.3. About half of D-Max, Hilux, Ranger and Triton registrations are รย.1, and pickups are about 11% of all รย.1 in the latest 12 months. So รย.1 does not mean "sedans and SUVs" and รย.3 does not mean "all pickups".
- **Bangkok is more than half the country.** Vehicles are counted in the province where they are registered. Company, fleet and leasing vehicles registered in Bangkok inflate Bangkok and understate other provinces compared with where the cars are actually used.

### Why not the DLT open-data portal

The DLT also publishes this dataset on its CKAN portal ([`stat_1_1_01_first_regis_vehicles_car`](https://gdcatalog.dlt.go.th/dataset/stat_1_1_01_first_regis_vehicles_car), "Open Data Common"). Until October 2026 this project used that portal. As of 13 October 2026:

- every statistics dataset on the portal stopped updating after the February 2026 files, which were uploaded on 17 March 2026;
- the February 2026 file has only 6 rows;
- the resource titled December 2023 actually contains December 2022 data.

Those portal files are still listed in `data/sources.csv` with status `superseded` or `rejected`. For the 48 months both sources cover, the RY1, RY2 and RY3 totals match exactly. Model strings differ slightly, because the DLT cleaned some names in the newer file: `GLC250` became `GLC 250`, and several truck chassis codes became `ไม่ระบุ` (unspecified).

### License status

The statistics web page does not state a license. The same DLT statistics appear on the DLT open-data portal labeled "Open Data Common", the Thai government open-data license for data.go.th catalogs. Thai open government data is published under open, non-exclusive licenses that allow reuse ([data.go.th FAQ](https://data.go.th/pages/about-open-data)). **The full text of "Open Data Common" has not been located yet.** This project treats the data as redistributable with attribution and always credits the DLT. For commercial use, confirm with the DLT (itc@dlt.mail.go.th) or the Digital Government Development Agency (di@dga.or.th).

## 1b. Fuel type: กรมการขนส่งทางบก, สถิติการจดทะเบียนรถใหม่ จำแนกตามยี่ห้อรถ ชนิดเชื้อเพลิง และจังหวัด

| | |
|---|---|
| Where | Same DLT page as section 1: "รถใหม่ (พ.ร.บ.รถยนต์) จำแนกตามยี่ห้อรถ ชนิดเชื้อเพลิง และจังหวัด" |
| Fields | Year (BE), month, category, province, brand, fuel type, count |
| Used for | `data/registrations_by_fuel/`, fuel rows (`kind` `f` and `bf`) in `summaries/areas/` |
| Check | Imported only if, for every month, category and brand, it adds up exactly to `data/registrations/`. It did for all 69 months on 14 October 2026. |

The DLT's fuel names are kept as published and mapped to six groups in `data/fuel_types.csv`: ไฟฟ้า = BEV; เบนซิน/ดีเซล-ไฟฟ้าแบบเสียบปลั๊ก = PHEV; เบนซิน/ดีเซล-ไฟฟ้า = HEV; เบนซิน; ดีเซล; and LPG/CNG combinations as gas. The DLT does not separate full hybrids from mild hybrids, or range extenders from plug-in hybrids, so neither does this dataset. Fuel is recorded per brand, not per model.

## 2. Prices: official manufacturer websites

| | |
|---|---|
| Sources | Each row of [`data/prices.csv`](data/prices.csv) links to the exact official page or press release it came from (currently toyota.co.th, honda.co.th, isuzu-tis.com, mitsubishi-motors.co.th, reverautomotive.com (BYD distributor), gwm.co.th, changan.co.th, chery-thailand.com, ford.co.th, mgcars.com, omodajaecoo.co.th and wulingthai.com) |
| Collected | By reading each official page (with AI agents that only read pages and return rows), then reviewed and spot-checked against the page before being added. There is no automated scraping, because no manufacturer offers a sanctioned machine-readable price list. Pages that are inconsistent with themselves (for example a "special" price higher than the regular price) are not used. |
| `price_type` | `list` = the price shown on the official model or grade page, or announced as a new price in an official press release. `promo` = a price the source itself calls introductory or promotional, with its end date. |
| Dates | `effective_from` / `effective_to` only when the source states them. `published_on` is the source's own date (for press releases). `observed_on` is the date we read the page. |
| History | Append-only. A price change is a new row; old rows are never edited or deleted. A correction adds a row and explains it in `note`. |

Notes:

- Toyota's grade pages show prices as "฿729,000 +" and Honda's model pages show plain prices. **Neither page says whether the figure is a suggested retail price**, so `price_type=list` means "the price on the official page", not a confirmed MSRP.
- Price history only starts from the first observation. For example, Honda's press release of 1 August 2024 gives the City e:HEV RS at 799,000 baht, and the Honda City page on 13 October 2026 shows 769,000 baht. What happened in between is not recorded.
- Third-party price sites are not used as sources. They often disagree with each other and with the manufacturer.
- Dealer discounts are out of scope.

## Population: กรมการปกครอง

| | |
|---|---|
| Publisher | กรมการปกครอง (Department of Provincial Administration, DOPA) |
| Dataset | "สถิติจำนวนประชากร" on [catalog.dopa.go.th](https://catalog.dopa.go.th/dataset/dopa-star), Open Data Common |
| Used | Registered population (ทะเบียนราษฎร) per province, December 2024 (BE 2567), the latest year in the catalog on 14 October 2026 |
| Used for | `data/population.csv` and the "per 1,000 people" view of the website map |
| Check | 77 provinces that add up to the national row of the same file (65,951,210) |

Registered population counts people by house registration, not where they actually live, and vehicles are counted where they are registered, so per-capita figures for Bangkok and some industrial provinces are high.

## Brand parent-company country

`data/brands.csv` has a `parent_country` column: the ISO 3166-1 alpha-2 code of the country where the brand's parent company is headquartered, as of 2026. It answers "whose company is this brand?", not where the car is built or where the brand was founded. So MG (SAIC) and Volvo (Geely Holding) are `CN`, Mini and Rolls-Royce (BMW) are `DE`, Jeep and Peugeot (Stellantis) are `NL`, and Land Rover and Jaguar (Tata) are `IN`. It is filled for 109 of 164 brands, which together cover 99.97% of registrations; small brands we could not confirm are left empty. Corrections with a source are welcome.

## Provinces and regions

`data/provinces.csv` lists the 77 provinces with their ISO 3166-2 code (`TH-10` = Bangkok), Thai and English names, and region. Regions follow Thailand's six-region geographic system (ภาคกลาง, ภาคตะวันออก, ภาคตะวันออกเฉียงเหนือ, ภาคเหนือ, ภาคตะวันตก, ภาคใต้), in which Bangkok is part of ภาคกลาง. The website shows Bangkok on its own because it is so large.

The website map uses province boundaries from [geoBoundaries](https://www.geoboundaries.org/) (gbOpen THA ADM1, built 12 December 2023), which are derived from OpenStreetMap: © OpenStreetMap contributors, licensed under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The simplified copy in `site/th-provinces.geojson` keeps that license; it is not covered by this repository's CC BY 4.0.

## Brand and model identities

`data/brands.csv`, `data/models.csv` and `data/aliases.csv` are original work of this project (CC BY 4.0).

- **Brands:** every DLT brand string in scope maps to one `brand_id`. These spellings are merged:
  - `BENZ`, `MERCEDES`, `MERCEDES BENZ`, `MERCEDES-AMG` and `MERCEDESBENZ-MAYBACH` → `mercedes-benz`
  - `GWM TANK` → `gwm`
  - `RANGE ROVER` → `land-rover`
  - `LUMIN` → `changan`
  - `ZX AUTO` → `zxauto`
  - `DSFK` (a misspelling) → `dfsk`
- **Models:** a DLT string is linked to a `model_id` only through an exact row in `aliases.csv`, after upper-casing and collapsing spaces. There is no fuzzy matching. New or unclear strings stay unmatched until someone reviews them. Examples left unmatched on purpose: Land Cruiser strings (DLT mixes Land Cruiser, Prado and 70-series pickups), `DEEPAL S07 L`, `JAECOO 6T EV LONG RANGE 4WD` (registered since January 2026, before the 6T REEV launch, so it may be the Jaecoo 6), GWM `H6` strings (the Haval H6 under the GWM brand name; an alias cannot point to another brand's model), and `ไม่ระบุ` (unspecified).
- **Coverage:** 98.4% of RY1 to RY3 units from January 2021 to September 2026 are matched to a model. September 2026 is 98.1%; a new model can be lower in the month it first appears, until its alias is added.
- **Body type** (`body_type` in `models.csv`) is assigned per model by this project, not by the DLT: `pickup`, `ppv` (SUV on a pickup chassis), `suv`, `sedan`, `hatchback`, `mpv`, `van`, `wagon` or `sports`. It is empty for models sold in more than one body style (Mazda2, Mazda3, Mercedes A-Class, BMW 4 Series) and for models not yet confirmed (Chery Q, Wuling Darion, Wuling Porta EV). It describes the body, not the DLT category: many four-door pickups are registered as RY1.
- **Model status** is `unverified` for every model. Registration data says nothing about whether a model is still on sale.

## Not included (yet)

- Sales figures (Federation of Thai Industries, manufacturers). Sales are a different metric from registrations and will be stored separately if added.
- Specifications.
- Province-level registrations. They are in the DLT file and could be added.
