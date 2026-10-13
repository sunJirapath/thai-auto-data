# Data sources

## กรมการขนส่งทางบก: สถิติจำนวนรถจดทะเบียนครั้งแรก จำแนกตามยี่ห้อและรุ่น

| | |
|---|---|
| Publisher | กรมการขนส่งทางบก (Department of Land Transport, DLT), ศูนย์เทคโนโลยีสารสนเทศ |
| Dataset | [`stat_1_1_01_first_regis_vehicles_car`](https://gdcatalog.dlt.go.th/dataset/stat_1_1_01_first_regis_vehicles_car) |
| Access | CKAN API on gdcatalog.dlt.go.th, CSV download, no login |
| Fields | ปี พ.ศ., เดือน, ประเภทรถ, ยี่ห้อ, รุ่น, จำนวน (unit: คัน) |
| Stated frequency | Monthly. In practice uploads come in batches; the latest file (Feb 2026) was uploaded 17 Mar 2026. |
| License (as labeled on the portal) | "Open Data Common" |
| Used for | `data/registrations/`, `summaries/` |
| Every file used | Listed in [`data/sources.csv`](data/sources.csv) with URL, retrieval date and SHA-256 |

### License status

The portal labels this dataset "Open Data Common", the Thai government open data license used on data.go.th catalogs. Thai open government data is published under open, non-exclusive licenses that allow reuse ([data.go.th FAQ](https://data.go.th/pages/about-open-data)). **The full text of "Open Data Common" has not been located yet.** Until it is, this project treats it as permitting redistribution with attribution, and always credits the DLT. If you need certainty for commercial use, confirm with the DLT (itc@dlt.mail.go.th) or the Digital Government Development Agency (di@dga.or.th).

### What we keep

- Categories ร.ย.1 (`RY1`), ร.ย.2 (`RY2`) and ร.ย.3 (`RY3`) only. Motorcycles, tractors, trailers and commercial categories are dropped at import.
- Monthly files only. The annual files are used to check the monthly ones (below), not stored.
- Original brand and model strings are kept unchanged (`brand_raw`, `model_raw`) next to the matched IDs.

### Checks applied to every file

A file is rejected, recorded in `data/sources.csv` with the reason, and not used if:

1. the month and year inside the file do not match the month and year in the resource title;
2. it has fewer rows than half the median of the previous six accepted months (minimum 100);
3. it contains more than one month, or a count that is not a nonnegative integer.

### Problems found in the published data (checked 13 Oct 2026)

| Month | Problem | Effect here |
|---|---|---|
| 2023-12 | The resource titled "ธันวาคม 2566" contains December 2022 data (file name `sttt_car_new_reg_mm_2565_12.csv`, contents say 2565) | Rejected. December 2023 is missing. |
| 2026-02 | The file has 6 rows (AION and ASTON MARTIN only) instead of about 1,400 | Rejected as incomplete. February 2026 is missing. |
| several | One HONDA row and some MITSUBISHI rows have an empty model name | Kept with an empty `model_id`. |

### Reconciliation with DLT annual files

Sum of accepted monthly files compared with the DLT annual file for the same year:

| Year | Category | Annual file | Sum of months | Difference |
|---|---|---:|---:|---:|
| 2022 | RY1 / RY2 / RY3 | 610,130 / 16,516 / 215,263 | same | 0 |
| 2023 | RY1 / RY2 / RY3 | 630,881 / 14,575 / 150,222 | 596,125 / 13,675 / 143,441 | 34,756 / 900 / 6,781 (December missing) |
| 2024 | RY1 / RY2 / RY3 | 486,963 / 14,791 / 98,427 | same | 0 |
| 2025 | RY1 / RY2 / RY3 | 506,439 / 15,284 / 78,650 | same | 0 |

## Brand and model identities

`data/brands.csv`, `data/models.csv` and `data/aliases.csv` are original work of this project (CC BY 4.0).

- **Brands:** every DLT brand string in scope maps to one `brand_id`. A few spellings are merged: `BENZ`, `MERCEDES`, `MERCEDES BENZ`, `MERCEDES-AMG` and `MERCEDESBENZ-MAYBACH` become `mercedes-benz`; `GWM TANK` becomes `gwm`; `RANGE ROVER` becomes `land-rover`; and `LUMIN` becomes `changan`.
- **Models:** a DLT string is linked to a `model_id` only through an exact row in `aliases.csv`, after upper-casing and collapsing spaces. There is no fuzzy matching. New or unclear strings stay unmatched until someone reviews them. For example, Land Cruiser strings are left unmatched because DLT mixes Land Cruiser, Prado and 70-series pickups.
- **Model status** is `unverified` for every model. Registration data says nothing about whether a model is still on sale.

## Not included (yet)

- Sales figures (Federation of Thai Industries, manufacturers). Sales are a different metric from registrations and will be stored separately if added.
- Specifications and prices.
