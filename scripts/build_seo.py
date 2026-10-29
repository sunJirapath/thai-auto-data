#!/usr/bin/env python3
"""Regenerate the crawlable parts of index.html and sitemap.xml from the CSVs.

Run from anywhere after each data refresh (no dependencies, standard library only):

    python scripts/build_seo.py          # rewrite index.html, brands/ models/ ev/ and sitemap.xml
    python scripts/build_seo.py --check  # exit 1 if any of them is out of date (no writes)

In index.html it rewrites only the regions between  <!-- seo:NAME:start --> ... <!-- seo:NAME:end -->,
plus the JSON-LD "description"/"temporalCoverage" values. brands/, models/ and ev/ are generated whole.
"""
import csv
import json
import re
import sys
from collections import Counter
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
                   key=lambda r: int(r["rank"]))[:25]
    top_m = sorted((r for r in rows("summaries/model_monthly.csv") if r["period"] == per),
                   key=lambda r: int(r["rank"]))[:25]
    y, m = (int(p) for p in per.split("-"))
    return dict(per=per, first=first["period"], total=int(last["total"]), mom=last["mom_pct"],
                yoy=last["yoy_pct"], th=f"{TH_MONTHS[m - 1]} {y + 543}", en=f"{EN_MONTHS[m - 1]} {y}",
                brands=brands, models=models, top_b=top_b, top_m=top_m)


def pct(v):
    return f"{float(v):+.1f}%" if v else "–"


def table(caption, head, body):
    th = "".join(f"<th scope=\"col\"{' class=\"n\"' if i >= len(head) - 2 else ''}>{h}</th>" for i, h in enumerate(head))
    return (f"<div class=\"table-wrap\"><table><caption>{caption}</caption><thead><tr>{th}</tr></thead>"
            f"<tbody>{body}</tbody></table></div>")


def b_rows(f, rs):
    return "".join(
        f"<tr><td>{r['rank']}</td><td>{escape(f['brands'].get(r['brand_id'], r['brand_id']))}</td>"
        f"<td class=\"n\">{n(r['units'])}</td><td class=\"n\">{float(r['share_pct']):.1f}%</td></tr>" for r in rs)


def m_rows(f, rs):
    return "".join(
        f"<tr><td>{r['rank']}</td><td>{escape(f['models'].get(r['model_id'], r['model_id']))}</td>"
        f"<td>{escape(f['brands'].get(r['brand_id'], r['brand_id']))}</td>"
        f"<td class=\"n\">{n(r['units'])}</td><td class=\"n\">{float(r['share_pct']):.1f}%</td></tr>" for r in rs)


def static_html(f):
    b_body, m_body = b_rows(f, f["top_b"][:10]), m_rows(f, f["top_m"][:10])
    return f"""<section class="card" id="seoStatic" data-page="overview" aria-labelledby="seoStaticH">
    <h2 id="seoStaticH">ยอดจดทะเบียนรถยนต์ใหม่ล่าสุด: {f['th']} <span class="sub" lang="en">{f['en']}</span></h2>
    <p>ชุดข้อมูลเปิดนี้รวบรวมยอดจดทะเบียนรถยนต์ใหม่ในประเทศไทยรายเดือน (ร.ย.1–3) แยกตามยี่ห้อ รุ่น จังหวัด และประเภทเชื้อเพลิง รวมถึงรถยนต์ไฟฟ้า EV ตั้งแต่ {f['first']} จากกรมการขนส่งทางบก พร้อมราคาจากเว็บไซต์ผู้ผลิต ดาวน์โหลด CSV ได้ฟรี (CC BY 4.0) <b>ตัวเลขทั้งหมดเป็นยอดจดทะเบียน ไม่ใช่ยอดขาย</b></p>
    <p lang="en">Monthly new-vehicle registrations in Thailand (DLT categories RY1–3) by brand, model, province and fuel type since {f['first']}, with official manufacturer prices. Latest month: {f['en']}, {n(f['total'])} new registrations (month on month {pct(f['mom'])}, year on year {pct(f['yoy'])}). <b>All figures are registrations, not sales.</b></p>
    <div class="two">
      <div>{table(f"Top 10 brands, {f['per']} · 10 อันดับยี่ห้อ", ["#", "Brand · ยี่ห้อ", "Units · คัน", "Share · ส่วนแบ่ง"], b_body)}</div>
      <div>{table(f"Top 10 models, {f['per']} · 10 อันดับรุ่น", ["#", "Model · รุ่น", "Brand · ยี่ห้อ", "Units · คัน", "Share · ส่วนแบ่ง"], m_body)}</div>
    </div>
    <p class="note">Source: Department of Land Transport (กรมการขนส่งทางบก), new registrations RY1–3, counted in the province of registration. · <a href="#/data">Cite &amp; download</a></p>
    <p class="note"><a href="brands/">ยี่ห้อ · Brands</a> · <a href="models/">รุ่น · Models</a> · <a href="ev/">รถยนต์ไฟฟ้า · EV and fuel</a></p>
  </section>"""


def json_str(s):
    return json.dumps(s, ensure_ascii=False)


def description(f):
    return (f"ยอดจดทะเบียนรถยนต์ใหม่ในประเทศไทยรายเดือน (ร.ย.1–3) แยกยี่ห้อ รุ่น จังหวัด และเชื้อเพลิง ตั้งแต่ {f['first']} ถึง {f['per']} "
            f"จากกรมการขนส่งทางบก พร้อมราคารถจากเว็บไซต์ผู้ผลิต เป็นยอดจดทะเบียน ไม่ใช่ยอดขาย. "
            f"Monthly new vehicle registrations in Thailand (DLT categories RY1-RY3) by brand, model, province and fuel type "
            f"from {f['first']} to {f['per']}, with prices from official manufacturer websites. Registrations, not sales. "
            f"Missing data is left empty, never 0.")


RAW = "https://raw.githubusercontent.com/sunJirapath/thai-auto-data/main/"


def fuel_mix(f):
    codes = {r["fuel_th"]: r for r in rows("data/fuel_types.csv")}  # KeyError = a new fuel string: add it to fuel_types.csv
    mix, bev = Counter(), Counter()
    for r in rows(f"data/registrations_by_fuel/{f['per']}.csv"):
        k, c = codes[r["fuel"]], int(r["count"])
        mix[k["label_th"], k["label_en"]] += c
        if k["fuel_code"] == "bev":
            bev[r["brand_raw"]] += c
    t, b = sum(mix.values()), sum(bev.values())
    assert t == f["total"], "fuel file does not add up to the market total"
    fuel = "".join(f"<tr><td>{th} <span class=\"sub\" lang=\"en\">{en}</span></td><td class=\"n\">{n(u)}</td>"
                   f"<td class=\"n\">{u / t * 100:.1f}%</td></tr>" for (th, en), u in mix.most_common())
    top = "".join(f"<tr><td>{i}</td><td>{escape(name)}</td><td class=\"n\">{n(u)}</td><td class=\"n\">{u / b * 100:.1f}%</td></tr>"
                  for i, (name, u) in enumerate(bev.most_common(10), 1))
    per = f["per"]
    t1 = table(f"Registrations by fuel, {per} · แยกตามเชื้อเพลิง", ["Fuel · เชื้อเพลิง", "Units · คัน", "Share · ส่วนแบ่ง"], fuel)
    t2 = table(f"Top 10 BEV brands, {per} · 10 อันดับยี่ห้อ EV", ["#", "Brand · ยี่ห้อ", "Units · คัน", "Share of BEV · ส่วนแบ่ง"], top)
    return f"<div class=\"two\"><div>{t1}</div><div>{t2}</div></div>"


def pages(f):
    def one(h1, what_th, what_en, desc, body, app, csv):
        return dict(h1=h1, app=app, csv=csv, body=body, desc=desc,
                    th=f"{what_th} {f['th']} จากทั้งหมด {n(f['total'])} คัน (ร.ย.1–3) เป็นยอดจดทะเบียน ไม่ใช่ยอดขาย",
                    en=f"{what_en} in {f['en']}, out of {n(f['total'])} new vehicles (DLT categories RY1–3). Registrations, not sales.")
    cap = lambda s: f"{s}, {f['per']}"
    return {
        "brands": one("ยี่ห้อรถยนต์ใหม่ยอดนิยม · Top car brands", "25 ยี่ห้อที่จดทะเบียนใหม่มากที่สุดในเดือน", "The 25 brands with the most new registrations",
                      f"อันดับ 25 ยี่ห้อรถยนต์ใหม่ที่จดทะเบียนมากที่สุดในไทย {f['th']} · Top 25 car brands by new registrations, {f['en']}",
                      table(cap("Top 25 brands · 25 อันดับยี่ห้อ"), ["#", "Brand · ยี่ห้อ", "Units · คัน", "Share · ส่วนแบ่ง"], b_rows(f, f["top_b"])),
                      "#/ranking", ["summaries/brand_monthly.csv", "data/brands.csv"]),
        "models": one("รุ่นรถยนต์ใหม่ยอดนิยม · Top car models", "25 รุ่นที่จดทะเบียนใหม่มากที่สุดในเดือน", "The 25 models with the most new registrations",
                      f"อันดับ 25 รุ่นรถยนต์ใหม่ที่จดทะเบียนมากที่สุดในไทย {f['th']} · Top 25 car models by new registrations, {f['en']}",
                      table(cap("Top 25 models · 25 อันดับรุ่น"), ["#", "Model · รุ่น", "Brand · ยี่ห้อ", "Units · คัน", "Share · ส่วนแบ่ง"], m_rows(f, f["top_m"])),
                      "#/ranking", ["summaries/model_monthly.csv", "data/models.csv"]),
        "ev": one("รถยนต์ไฟฟ้า EV และเชื้อเพลิง · EV and fuel mix", "สัดส่วนรถยนต์ใหม่ตามเชื้อเพลิง (BEV, HEV, PHEV, ดีเซล, เบนซิน) ในเดือน", "New registrations by fuel type, with the leading EV brands",
                  f"รถยนต์ใหม่จดทะเบียนตามเชื้อเพลิง (BEV, HEV, PHEV, ดีเซล, เบนซิน) และยี่ห้อ EV อันดับต้น {f['th']} · Thai registrations by fuel, {f['en']}",
                  fuel_mix(f), "#/powertrain", [f"data/registrations_by_fuel/{f['per']}.csv", "data/fuel_types.csv"]),
    }


def page_html(slug, p):
    url, title = f"{SITE}{slug}/", f"{p['h1']} · thai-auto-data"
    ld = json_str({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "thai-auto-data", "item": SITE},
        {"@type": "ListItem", "position": 2, "name": p["h1"], "item": url}]})
    csv = " · ".join(f"<a href=\"{RAW}{c}\">{c}</a>" for c in p["csv"])
    return f"""<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)}</title>
<meta name="description" content="{escape(p['desc'])}">
<link rel="canonical" href="{url}">
<link rel="alternate" hreflang="th" href="{url}">
<link rel="alternate" hreflang="en" href="{url}">
<link rel="alternate" hreflang="x-default" href="{url}">
<meta property="og:title" content="{escape(title)}">
<meta property="og:url" content="{url}">
<meta property="og:locale" content="th_TH">
<meta property="og:locale:alternate" content="en_US">
<link rel="stylesheet" href="../site/style.css">
<script type="application/ld+json">{ld}</script>
</head>
<body>
<main style="max-width:1000px;margin:0 auto;padding:16px">
<section class="card">
  <h1>{p['h1']}</h1>
  <p>{p['th']}</p>
  <p lang="en">{p['en']}</p>
  {p['body']}
  <p class="note">Source: Department of Land Transport (กรมการขนส่งทางบก), new registrations RY1–3 · CC BY 4.0 · CSV: {csv}</p>
  <p class="note"><a href="../{p['app']}">ดูแบบโต้ตอบ · Open in the interactive app</a> · <a href="../">← thai-auto-data</a></p>
</section>
</main>
</body>
</html>
"""


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


def build_sitemap(xml, urls, changed, today):
    # Only indexable pages. Hash routes (#/…) are one URL to Google, llms.txt is not a page.
    # A URL keeps its old lastmod unless its content changed (or it is new).
    old = dict(re.findall(r"<loc>([^<]*)</loc>\s*<lastmod>([^<]*)</lastmod>", xml))
    body = "".join(f"  <url>\n    <loc>{u}</loc>\n    <lastmod>{today if u in changed or u not in old else old[u]}</lastmod>\n"
                   f"    <changefreq>monthly</changefreq>\n  </url>\n" for u in urls)
    return re.sub(r"(<urlset[^>]*>\n).*?(</urlset>)", lambda m: m.group(1) + body + m.group(2), xml, count=1, flags=re.S)


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
    out = {idx_p: new_idx}
    urls = {idx_p: SITE}
    for slug, p in pages(f).items():
        out[ROOT / slug / "index.html"] = h = page_html(slug, p)
        urls[ROOT / slug / "index.html"] = f"{SITE}{slug}/"
        assert json.loads(re.search(r'ld\+json">(.*?)</script>', h, re.S).group(1))["@type"] == "BreadcrumbList"
        assert h.count("<h1") == 1 and "<table>" in h and 'href="../"' in h, f"{slug}: h1/table/home link"
    for h in out.values():
        desc = re.search(r'<meta name="description" content="([^"]*)"', h)
        assert desc and len(desc.group(1)) <= 160, f"meta description missing or over 160 chars: {desc and len(desc.group(1))}"
    old = {p_: p_.read_text(encoding="utf-8") if p_.exists() else "" for p_ in out}
    # lastmod = data month's release date is unknown here, so use the build date; only touch it when content changed
    changed = {urls[p_] for p_ in out if out[p_] != old[p_]}
    sm = map_p.read_text(encoding="utf-8")
    out[map_p], old[map_p] = build_sitemap(sm, list(urls.values()), changed, date.today().isoformat()), sm
    stale = [p_.relative_to(ROOT).as_posix() for p_ in out if out[p_] != old[p_]]
    if check:
        if stale:
            print("seo: out of date: " + ", ".join(stale), file=sys.stderr)
        sys.exit(1 if stale else 0)
    for p_ in map(ROOT.joinpath, stale):
        p_.parent.mkdir(exist_ok=True)
        p_.write_text(out[p_], encoding="utf-8", newline="\n")
    print(f"seo: latest month {f['per']}, {f['total']:,} registrations; updated: {', '.join(stale) or 'nothing'}")


if __name__ == "__main__":
    main()
