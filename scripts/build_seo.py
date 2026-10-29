#!/usr/bin/env python3
"""Regenerate the crawlable parts of index.html and sitemap.xml from the CSVs.

Run from anywhere after each data refresh (no dependencies, standard library only):

    python scripts/build_seo.py          # rewrite index.html + sitemap.xml
    python scripts/build_seo.py --check  # exit 1 if they are out of date (no writes)

Rewrites only the regions between  <!-- seo:NAME:start --> ... <!-- seo:NAME:end -->
in index.html, plus the JSON-LD "description"/"temporalCoverage" values.
"""
import csv
import json
import re
import sys
from datetime import date
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://sunjirapath.github.io/thai-auto-data/"
TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
             "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]
EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July",
             "August", "September", "October", "November", "December"]


def rows(path):
    with open(ROOT / path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def n(x):
    return f"{int(x):,}"


def build_facts():
    market = rows("summaries/market_monthly.csv")
    ok = [r for r in market if r["status"] == "ok"]
    first, last = ok[0], ok[-1]
    per = last["period"]
    brands = {b["brand_id"]: b["name"] for b in rows("data/brands.csv")}
    models = {m["model_id"]: m["name"] for m in rows("data/models.csv")}
    top_b = sorted((r for r in rows("summaries/brand_monthly.csv") if r["period"] == per),
                   key=lambda r: int(r["rank"]))[:10]
    top_m = sorted((r for r in rows("summaries/model_monthly.csv") if r["period"] == per),
                   key=lambda r: int(r["rank"]))[:10]
    y, m = (int(p) for p in per.split("-"))
    return dict(per=per, first=first["period"], total=int(last["total"]), mom=last["mom_pct"],
                yoy=last["yoy_pct"], th=f"{TH_MONTHS[m - 1]} {y + 543}", en=f"{EN_MONTHS[m - 1]} {y}",
                brands=brands, models=models, top_b=top_b, top_m=top_m)


def pct(v):
    return f"{float(v):+.1f}%" if v else "–"


def static_html(f):
    def table(caption, head, body):
        th = "".join(f"<th scope=\"col\"{' class=\"n\"' if i >= len(head) - 2 else ''}>{h}</th>" for i, h in enumerate(head))
        return (f"<div class=\"table-wrap\"><table><caption>{caption}</caption><thead><tr>{th}</tr></thead>"
                f"<tbody>{body}</tbody></table></div>")

    b_body = "".join(
        f"<tr><td>{r['rank']}</td><td>{escape(f['brands'].get(r['brand_id'], r['brand_id']))}</td>"
        f"<td class=\"n\">{n(r['units'])}</td><td class=\"n\">{float(r['share_pct']):.1f}%</td></tr>"
        for r in f["top_b"])
    m_body = "".join(
        f"<tr><td>{r['rank']}</td><td>{escape(f['models'].get(r['model_id'], r['model_id']))}</td>"
        f"<td>{escape(f['brands'].get(r['brand_id'], r['brand_id']))}</td>"
        f"<td class=\"n\">{n(r['units'])}</td><td class=\"n\">{float(r['share_pct']):.1f}%</td></tr>"
        for r in f["top_m"])
    return f"""<section class="card" id="seoStatic" data-page="overview" aria-labelledby="seoStaticH">
    <h2 id="seoStaticH">ยอดจดทะเบียนรถยนต์ใหม่ล่าสุด: {f['th']} <span class="sub" lang="en">{f['en']}</span></h2>
    <p>ชุดข้อมูลเปิดนี้รวบรวมยอดจดทะเบียนรถยนต์ใหม่ในประเทศไทยรายเดือน (ร.ย.1–3) แยกตามยี่ห้อ รุ่น จังหวัด และประเภทเชื้อเพลิง รวมถึงรถยนต์ไฟฟ้า EV ตั้งแต่ {f['first']} จากกรมการขนส่งทางบก พร้อมราคาจากเว็บไซต์ผู้ผลิต ดาวน์โหลด CSV ได้ฟรี (CC BY 4.0) <b>ตัวเลขทั้งหมดเป็นยอดจดทะเบียน ไม่ใช่ยอดขาย</b></p>
    <p lang="en">Monthly new-vehicle registrations in Thailand (DLT categories RY1–3) by brand, model, province and fuel type since {f['first']}, with official manufacturer prices. Latest month: {f['en']}, {n(f['total'])} new registrations (month on month {pct(f['mom'])}, year on year {pct(f['yoy'])}). <b>All figures are registrations, not sales.</b></p>
    <div class="two">
      <div>{table(f"Top 10 brands, {f['per']} · 10 อันดับยี่ห้อ", ["#", "Brand · ยี่ห้อ", "Units · คัน", "Share · ส่วนแบ่ง"], b_body)}</div>
      <div>{table(f"Top 10 models, {f['per']} · 10 อันดับรุ่น", ["#", "Model · รุ่น", "Brand · ยี่ห้อ", "Units · คัน", "Share · ส่วนแบ่ง"], m_body)}</div>
    </div>
    <p class="note">Source: Department of Land Transport (กรมการขนส่งทางบก), new registrations RY1–3, counted in the province of registration. · <a href="#/data">Cite &amp; download</a></p>
  </section>"""


def json_str(s):
    return json.dumps(s, ensure_ascii=False)


def description(f):
    return (f"ยอดจดทะเบียนรถยนต์ใหม่ในประเทศไทยรายเดือน (ร.ย.1–3) แยกยี่ห้อ รุ่น จังหวัด และเชื้อเพลิง ตั้งแต่ {f['first']} ถึง {f['per']} "
            f"จากกรมการขนส่งทางบก พร้อมราคารถจากเว็บไซต์ผู้ผลิต เป็นยอดจดทะเบียน ไม่ใช่ยอดขาย. "
            f"Monthly new vehicle registrations in Thailand (DLT categories RY1-RY3) by brand, model, province and fuel type "
            f"from {f['first']} to {f['per']}, with prices from official manufacturer websites. Registrations, not sales. "
            f"Missing data is left empty, never 0.")


def region(html, name, body):
    pat = re.compile(rf"(<!-- seo:{name}:start -->).*?(<!-- seo:{name}:end -->)", re.S)
    assert pat.search(html), f"marker seo:{name} missing in index.html"
    return pat.sub(lambda m: f"{m.group(1)}\n  {body}\n  {m.group(2)}", html, count=1)


def build_index(html, f):
    html = region(html, "static", static_html(f))
    html = re.sub(r'("description": )"[^"\n]*(?:\\.[^"\n]*)*"(,\n "url")',
                  lambda m: m.group(1) + json_str(description(f)) + m.group(2), html, count=1)
    html, k = re.subn(r'"temporalCoverage": "[^"]*"', f'"temporalCoverage": "{f["first"]}/{f["per"]}"', html, count=1)
    assert k == 1, "temporalCoverage not found"
    return html


def build_sitemap(xml, today):
    # Only indexable pages: the home URL. Hash routes (#/…) are one URL to Google, llms.txt is not a page.
    return re.sub(r"<lastmod>[^<]*</lastmod>", f"<lastmod>{today}</lastmod>", xml)


def main():
    check = "--check" in sys.argv
    f = build_facts()
    idx_p, map_p = ROOT / "index.html", ROOT / "sitemap.xml"
    idx = idx_p.read_text(encoding="utf-8")
    new_idx = build_index(idx, f)
    # self-checks: output must stay valid and carry what crawlers need without JS
    ld = re.search(r'<script type="application/ld\+json">(.*?)</script>', new_idx, re.S).group(1)
    j = json.loads(ld)
    assert j["@type"] == "Dataset" and j["temporalCoverage"] == f"{f['first']}/{f['per']}"
    assert new_idx.count("<table>") >= 2 and f["en"] in new_idx
    desc = re.search(r'<meta name="description" content="([^"]*)"', new_idx).group(1)
    assert len(desc) <= 160, f"meta description is {len(desc)} chars (max 160)"
    # lastmod = data month's release date is unknown here, so use the build date; only touch it when content changed
    sm = map_p.read_text(encoding="utf-8")
    new_sm = build_sitemap(sm, date.today().isoformat()) if new_idx != idx else sm
    if check:
        sys.exit(0 if (new_idx, new_sm) == (idx, sm) else 1)
    idx_p.write_text(new_idx, encoding="utf-8", newline="\n")
    map_p.write_text(new_sm, encoding="utf-8", newline="\n")
    print(f"seo: latest month {f['per']}, {f['total']:,} registrations; index.html + sitemap.xml updated")


if __name__ == "__main__":
    main()
