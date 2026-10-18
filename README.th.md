# thai-auto-data

[English](README.md) | **ภาษาไทย**

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23348748.svg)](https://doi.org/10.5281/zenodo.23348748) [![License: CC BY 4.0](https://img.shields.io/badge/license-CC%20BY%204.0-blue.svg)](LICENSE) ![Data: 2021-01 to 2026-09](https://img.shields.io/badge/data-2021--01%20to%202026--09-green.svg) ![Format: CSV](https://img.shields.io/badge/format-CSV-orange.svg) [![Site](https://img.shields.io/badge/site-GitHub%20Pages-black.svg)](https://sunjirapath.github.io/thai-auto-data/)

*Thailand new car registration open data (monthly, by brand, model, province and fuel type, 2021 to now) with official car prices, as CSV. English: [README.md](README.md)*

ข้อมูลเปิด (open data) ตลาดรถยนต์ไทย: ยอดรถจดทะเบียนใหม่รายเดือน แยกยี่ห้อและรุ่น และราคาจากเว็บไซต์ทางการของค่ายรถ ในรูปแบบ CSV ที่ดาวน์โหลดและนำไปใช้ต่อได้ทันที

**ดูกราฟออนไลน์:** https://sunjirapath.github.io/thai-auto-data/ มีหน้า ภาพรวม (ยอดรวม ภูมิภาค แผนที่ทั้งแบบจำนวนคันและต่อประชากร), อันดับ รุ่นมาแรงและรุ่นที่ยอดลดลง, เทรนด์และส่วนแบ่งตามเวลา, พลังงาน/EV, กลุ่มรถ (ประเภทตัวถัง), สัญชาติแบรนด์, ยี่ห้อ×ภูมิภาค, ฤดูกาล, ช่วงราคา, รุ่นใหม่, เปรียบเทียบรุ่น และหน้ารายละเอียดยี่ห้อ/รุ่น ทุกหน้า (รวมหน้ายี่ห้อ รุ่น และเปรียบเทียบ) ใช้ตัวกรองช่วงเวลา ประเภทรถ และพื้นที่ชุดเดียวกัน และลิงก์ของแต่ละหน้าจำตัวกรองไว้ จึงแชร์มุมมองเดียวกันให้คนอื่นได้ หน้าเว็บมีภาษาอังกฤษ (ค่าเริ่มต้น) และภาษาไทย สลับได้ที่มุมขวาบน หรือเพิ่ม `lang=th` ในลิงก์

> **กรุณาอ้างอิงเมื่อนำไปใช้** ข้อมูลชุดนี้เผยแพร่ภายใต้ [CC BY 4.0](LICENSE) หากนำข้อมูลไปใช้ เผยแพร่ต่อ หรือนำไปสร้างงานใหม่ ต้องระบุที่มาทั้ง **thai-auto-data** และ **กรมการขนส่งทางบก** ดู [การอ้างอิง](#การอ้างอิง)

## มีอะไรบ้าง

| ไฟล์ | เนื้อหา |
|---|---|
| [`summaries/market_monthly.csv`](summaries/market_monthly.csv) | ยอดจดทะเบียนรวมรายเดือน แยกประเภท ร.ย.1 / ร.ย.2 / ร.ย.3 พร้อม MoM และ YoY |
| [`summaries/brand_monthly.csv`](summaries/brand_monthly.csv) | ยอดรายยี่ห้อต่อเดือน ส่วนแบ่งตลาด อันดับ และ YoY |
| [`summaries/model_monthly.csv`](summaries/model_monthly.csv) | ยอดรายรุ่น (ระดับ model) ต่อเดือน ส่วนแบ่งตลาด อันดับ และ YoY |
| [`summaries/variant_monthly.csv`](summaries/variant_monthly.csv) | ยอดรายเดือนแยกตามชื่อรุ่นย่อยที่กรมฯ บันทึก (เฉพาะชื่อที่จับคู่กับรุ่นได้) |
| [`data/prices.csv`](data/prices.csv) | ราคาจากเว็บไซต์ทางการของค่ายรถ แยกรุ่นย่อย บันทึกแบบต่อท้าย (ไม่ลบประวัติ) ทุกแถวมีลิงก์แหล่งที่มา |
| [`data/registrations_by_province/YYYY-MM.csv`](data/registrations_by_province) | ข้อมูลรายเดือนระดับแถวแยกจังหวัด (จังหวัด ประเภท ยี่ห้อ รุ่น) รวมทุกจังหวัดแล้วเท่ากับไฟล์ระดับประเทศทุกแถว |
| [`summaries/province_monthly.csv`](summaries/province_monthly.csv) | ยอดรายเดือนแยกจังหวัดและประเภทรถ |
| [`summaries/areas/`](summaries/areas) | ยอดรายยี่ห้อและรายรุ่นต่อเดือนแยกพื้นที่: ทั้งประเทศ (`all`), ต่างจังหวัด (`upcountry`), 6 ภาค (`region-*`) และ 77 จังหวัด (`TH-xx`) |
| [`data/provinces.csv`](data/provinces.csv) | รหัสจังหวัด ISO 3166-2 ชื่อไทย/อังกฤษ และภูมิภาค |
| [`data/registrations_by_fuel/YYYY-MM.csv`](data/registrations_by_fuel) | ยอดรายเดือนตามยี่ห้อ ชนิดเชื้อเพลิง และจังหวัด (ตรงกับข้อมูลหลักทุกยี่ห้อทุกเดือน) · กลุ่มเชื้อเพลิงใน [`fuel_types.csv`](data/fuel_types.csv) |
| [`data/population.csv`](data/population.csv) | ประชากรรายจังหวัด (ทะเบียนราษฎร ธ.ค. 2567) จากกรมการปกครอง |
| [`data/registrations/YYYY-MM.csv`](data/registrations) | ข้อมูลรายเดือนระดับแถว ตามที่กรมการขนส่งทางบกเผยแพร่ เก็บชื่อต้นฉบับไว้คู่กับรหัสที่จับคู่แล้ว |
| [`data/brands.csv`](data/brands.csv) | รายชื่อยี่ห้อ รหัสถาวร (`brand_id`) ชื่อที่กรมการขนส่งทางบกใช้ และประเทศที่ตั้งบริษัทแม่ (`parent_country`) |
| [`data/models.csv`](data/models.csv) | รายชื่อรุ่น รหัสถาวร (`model_id`) และประเภทตัวถัง (`body_type`) |
| [`data/aliases.csv`](data/aliases.csv) | ตารางจับคู่ชื่อรุ่นต้นฉบับของกรมการขนส่งทางบก กับ `model_id` (จับคู่แบบตรงตัวเท่านั้น) |
| [`data/sources.csv`](data/sources.csv) | ทะเบียนแหล่งข้อมูล: URL ต้นฉบับ, วันที่ดึง, SHA-256, สถานะรับ/ปฏิเสธ พร้อมเหตุผล |

**ช่วงข้อมูล:** มกราคม 2564 ถึง กันยายน 2569 (2021-01 ถึง 2026-09), 69 เดือน ครบทุกเดือน

**ราคา:** ตอนนี้มีราคาจากเว็บไซต์ทางการ 36 รุ่น 170 รายการ (Toyota, Honda, Isuzu D-Max/MU-X, Ford Ranger/Ranger Raptor/Everest, Mitsubishi Triton/Xforce, BYD Atto 3/Dolphin/Sealion 6/Sealion 7, MG4/MG Urban, Jaecoo 5/6/6T, Deepal S05, Wuling Air EV/Binguo/Darion, GWM ORA 5, Changan Nevo Q05, Chery V23/Q) ทุกแถวมีลิงก์หน้าเว็บที่ใช้อ้างอิง ประวัติราคาเริ่มจากวันที่บันทึก จึงไม่ครบย้อนหลัง

ถ้าเดือนใดไม่มีข้อมูลจากต้นทาง จะแสดงเป็น `status=missing` และเว้นตัวเลขว่าง **ไม่ใช่ 0** รายละเอียดอยู่ใน [DATA_SOURCES.md](DATA_SOURCES.md)

## เริ่มใช้งาน

ทุกไฟล์ดาวน์โหลดตรงจาก GitHub ได้ ไม่ต้องสมัครหรือใช้ API key

```text
https://raw.githubusercontent.com/sunJirapath/thai-auto-data/main/summaries/brand_monthly.csv
```

Python (pandas):

```python
import pandas as pd

base = "https://raw.githubusercontent.com/sunJirapath/thai-auto-data/main/"
brands = pd.read_csv(base + "summaries/brand_monthly.csv")
print(brands[brands.period == "2026-09"].head(10))   # 10 ยี่ห้อแรก ก.ย. 2569
```

DuckDB / SQL:

```sql
SELECT period, units, share_pct
FROM read_csv_auto('https://raw.githubusercontent.com/sunJirapath/thai-auto-data/main/summaries/model_monthly.csv')
WHERE model_id = 'toyota-yaris-ativ'
ORDER BY period;
```

หรือ clone ทั้ง repo: `git clone https://github.com/sunJirapath/thai-auto-data.git`

## ความหมายของข้อมูล

- **เป็นยอดจดทะเบียนรถใหม่ ไม่ใช่ยอดขาย** รถที่ขายแล้วอาจจดทะเบียนในเดือนถัดไป ตัวเลขนี้จึงไม่ตรงกับยอดขายของ ส.อ.ท. หรือของค่ายรถ
- **ประเภทรถ:** `RY1` = รถยนต์นั่งส่วนบุคคลไม่เกิน 7 คน (ร.ย.1), `RY2` = รถยนต์นั่งส่วนบุคคลเกิน 7 คน (ร.ย.2), `RY3` = รถยนต์บรรทุกส่วนบุคคล (ร.ย.3) ไม่รวมรถจักรยานยนต์และรถประเภทอื่น กระบะ 4 ประตูจำนวนมากจดเป็น ร.ย.1
- **เฉพาะรถใหม่** ใช้สถิติการจดทะเบียนรถใหม่เท่านั้น ไม่ใช้สถิติการจดทะเบียนรถ (ซึ่งรวมรถใช้แล้วที่นำมาจดใหม่)
- **ยอดมกราคมสูงกว่าธันวาคมเกือบเท่าตัวทุกปี** เป็นรูปแบบในข้อมูลของกรมฯ เอง ไม่ใช่ความผิดพลาด
- **รายจังหวัดนับตามจังหวัดที่จดทะเบียน** รถบริษัทและลีสซิ่งที่จดในกรุงเทพฯ ทำให้กรุงเทพฯ มีมากกว่าครึ่งประเทศ
- **ระดับรุ่น (model) เท่านั้น** กรมการขนส่งทางบกใช้ชื่อไม่สม่ำเสมอ บางค่ายแจ้งระดับรุ่น (`YARIS ATIV`) บางค่ายแจ้งระดับรุ่นย่อย (`BYD ATTO3 (480KM-EXT)`) เราจึงรวมเป็นระดับ model และไม่แบ่งยอดลงระดับรุ่นย่อย (trim)
- **`model_id` ว่าง** หมายถึงยังไม่ได้จับคู่ชื่อนั้น ยอดเหล่านี้ยังนับรวมในยอดทั้งตลาดและยอดรายยี่ห้อ แต่ไม่อยู่ในอันดับรายรุ่น สัดส่วนที่ยังไม่จับคู่แสดงในคอลัมน์ `unmatched_model_units` (รวมทั้งช่วงจับคู่ได้ 98.9% ของยอด เดือนล่าสุดต่ำกว่าเพราะมีรุ่นใหม่ที่ยังไม่ได้เพิ่มชื่อ)
- **ส่วนแบ่งตลาด (`share_pct`)** คิดจากยอดรวม ร.ย.1 ถึง ร.ย.3 ของเดือนนั้นทั้งหมด
- **`yoy_pct` / `mom_pct` ว่าง** เมื่อเดือนที่ใช้เปรียบเทียบไม่มีข้อมูล หรือเดือนนั้นยอดเป็นศูนย์
- **ปี:** ไฟล์ต้นฉบับใช้ พ.ศ. ไฟล์ในนี้ใช้ ค.ศ. รูปแบบ `YYYY-MM`
- **รหัส (`brand_id`, `model_id`) ถาวร** ไม่เปลี่ยนแม้ชื่อแสดงผลจะเปลี่ยน
- สถานะรุ่นใน `models.csv` เป็น `unverified` ทั้งหมด การมีรถจดทะเบียนไม่ได้แปลว่ารุ่นนั้นยังวางขายอยู่

## การอัปเดต

ข้อมูลจะอัปเดตเมื่อกรมการขนส่งทางบกเผยแพร่ไฟล์รายเดือนใหม่ ทุกไฟล์ผ่านการตรวจก่อนรับเข้า: จำนวนแถวต้องไม่น้อยผิดปกติ, เดือนในเนื้อหาต้องตรงกับชื่อไฟล์, ตัวเลขต้องเป็นจำนวนเต็มไม่ติดลบ ไฟล์ที่ไม่ผ่านจะถูกบันทึกใน `data/sources.csv` พร้อมเหตุผลและไม่นำมาใช้

ข้อมูลมาจากเว็บไซต์กลุ่มสถิติการขนส่ง กรมการขนส่งทางบก (web.dlt.go.th/statistics) ซึ่งอัปเดตทุกเดือน ทุกครั้งที่นำเข้า ยอดรวมแต่ละประเภทรถต้องตรงกับไฟล์ยอดรวมรายเดือนของกรมฯ ทุกคัน ณ วันที่ 14 ต.ค. 2569 ข้อมูลล่าสุดคือเดือนกันยายน 2569 (กรมฯ ประมวลผล 5 ต.ค. 2569)

## ใช้ตอบคำถามแบบไหนได้บ้าง

- ยอดจดทะเบียนรถใหม่เดือนล่าสุดเท่าไร เพิ่มหรือลดจากปีก่อน
- ยี่ห้อหรือรุ่นไหนขายดี (จดทะเบียนมาก) ที่สุด เช่น Toyota, Isuzu, Honda, BYD
- รถยนต์ไฟฟ้า (EV, BEV) ไฮบริด (HEV, PHEV) มีสัดส่วนเท่าไร และโตเร็วแค่ไหน
- แบรนด์จีนกับแบรนด์ญี่ปุ่น ส่วนแบ่งตลาดเปลี่ยนไปอย่างไร
- จังหวัดหรือภาคไหนจดทะเบียนรถใหม่มาก ต่อประชากรเท่าไร
- ราคารถจากเว็บไซต์ทางการของแต่ละรุ่นย่อย พร้อมลิงก์ที่มา

**หมายเหตุ:** ข้อมูลนี้เป็นยอดจดทะเบียน ใช้แทน "ยอดขายรถยนต์" ได้โดยประมาณเท่านั้น ถ้าอ้างอิงตัวเลข ให้เรียกว่ายอดจดทะเบียน

**สำหรับ AI และเครื่องมืออัตโนมัติ:** สรุปชุดข้อมูลและ URL ของทุกไฟล์อยู่ใน [`llms.txt`](llms.txt) และคำอธิบายคอลัมน์แบบเครื่องอ่านได้อยู่ใน [`datapackage.json`](datapackage.json) (Frictionless Data Package)

**คำค้น:** ยอดขายรถยนต์ไทย, ยอดจดทะเบียนรถใหม่, สถิติรถยนต์, ส่วนแบ่งตลาดรถยนต์, รถยนต์ไฟฟ้า, ราคารถยนต์, กรมการขนส่งทางบก, ข้อมูลเปิด · Thailand car sales, Thai vehicle registrations, Thailand EV market, car market share Thailand, DLT open data

## การอ้างอิง

กดปุ่ม **"Cite this repository"** ทางขวาของหน้า GitHub เพื่อคัดลอกรูปแบบ APA หรือ BibTeX หรือใช้ข้อความนี้ (ภาษาไทยหรืออังกฤษ):

```text
ข้อมูลจาก thai-auto-data โดย sunJirapath, https://doi.org/10.5281/zenodo.23348748, สัญญาอนุญาต CC BY 4.0
ข้อมูลต้นฉบับ: กรมการขนส่งทางบก, สถิติการจดทะเบียนรถใหม่ จำแนกตามยี่ห้อรถและรุ่นรถ (web.dlt.go.th/statistics)
ดึงข้อมูลเมื่อ: <วันที่ที่คุณดาวน์โหลด>
```

```text
Data: thai-auto-data by sunJirapath, https://doi.org/10.5281/zenodo.23348748, CC BY 4.0.
Original source: Department of Land Transport, Thailand, new vehicle registrations by brand and model (web.dlt.go.th/statistics).
Retrieved: <your download date>
```

ในกราฟ บทความ หรือแอป ใส่บรรทัด "ที่มา: thai-auto-data / กรมการขนส่งทางบก" ใกล้กับข้อมูลที่แสดงก็เพียงพอ

## พบข้อมูลผิด

เปิด [Issue](https://github.com/sunJirapath/thai-auto-data/issues) พร้อมระบุไฟล์ แถว และแหล่งอ้างอิงที่ตรวจสอบได้ เช่น ชื่อรุ่นที่จับคู่ผิด หรือชื่อรุ่นที่ควรเพิ่มใน `aliases.csv`

## สัญญาอนุญาต

- งานรวบรวม จัดระเบียบ รหัส และไฟล์สรุปในที่นี้: [Creative Commons Attribution 4.0 International (CC BY 4.0)](LICENSE)
- ข้อมูลต้นฉบับเป็นของกรมการขนส่งทางบก เผยแพร่ภายใต้สัญญาอนุญาต "Open Data Common" ของภาครัฐ ผู้ใช้ต้องอ้างอิงกรมการขนส่งทางบกด้วย ดู [DATA_SOURCES.md](DATA_SOURCES.md)
- ขอบเขตจังหวัดบนแผนที่ (`site/th-provinces.geojson`) มาจาก geoBoundaries / © ผู้ร่วมพัฒนา OpenStreetMap สัญญาอนุญาต ODbL 1.0 ไม่อยู่ภายใต้ CC BY 4.0 ของ repo นี้
- ชื่อยี่ห้อและรุ่นรถเป็นเครื่องหมายการค้าของเจ้าของ ใช้เพื่อระบุตัวรถเท่านั้น

