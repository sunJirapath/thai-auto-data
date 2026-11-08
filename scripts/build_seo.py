#!/usr/bin/env python3
"""Regenerate the crawlable parts of index.html and sitemap.xml from the CSVs.

Run from anywhere after each data refresh (no dependencies, standard library only):

    python scripts/build_seo.py          # rewrite index.html, brands/ models/ ev/ and sitemap.xml
    python scripts/build_seo.py --check  # exit 1 if any of them is out of date (no writes)

In index.html it rewrites only the regions between <!-- seo:NAME:start --> ... <!-- seo:NAME:end -->,
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


def month_names(period):
    y, m = (int(p) for p in period.split("-"))
    return f"{TH_MONTHS[m - 1]} {y + 543}", f"{EN_MONTHS[m - 1]} {y}"


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
    latest = max((r for r in market if r["status"] in ("ok", "provisional")), key=lambda r: r["period"])
    th, en = month_names(per)
    return dict(per=per, first=first["period"], total=int(last["total"]), th=th, en=en, latest=latest, complete=last,
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


def locale_copy(th, en):
    return f'<span class="locale-copy" lang="th">{escape(th)}</span><span class="locale-copy" lang="en">{escape(en)}</span>'


def static_html(f):
    b_body, m_body = b_rows(f, f["top_b"][:10]), m_rows(f, f["top_m"][:10])
    columns = [locale_copy("ยี่ห้อ", "Brand"), locale_copy("คัน", "Vehicles"), locale_copy("ส่วนแบ่ง", "Share")]
    brand_table = table(locale_copy("10 อันดับยี่ห้อ", "Top 10 brands"), ["#", *columns], b_body)
    model_table = table(locale_copy("10 อันดับรุ่น", "Top 10 models"), ["#", locale_copy("รุ่น", "Model"), *columns], m_body)
    complete, latest = f["complete"], f["latest"]
    per, th, en = f["per"], f["th"], f["en"]
    total = n(complete["total"])
    previous = f"{int(per[:4]) - 1}{per[4:]}"
    prev_th, prev_en = month_names(previous)
    yoy = pct(complete["yoy_pct"])
    compare_th = f"{yoy} เทียบกับ {prev_th}" if complete["yoy_pct"] else "ไม่มีข้อมูลเทียบกับปีก่อน"
    compare_en = f"{yoy} vs {prev_en}" if complete["yoy_pct"] else "Year-over-year comparison unavailable"
    leader = f["top_b"][0]
    leader_name = escape(f["brands"][leader["brand_id"]])
    leader_units = n(leader["units"])
    provisional = ""
    if latest["status"] == "provisional":
        pending_period = latest["period"]
        pending_th, pending_en = month_names(pending_period)
        pending_total = n(latest["total"])
        provisional = f"""
    <div class="latest-provisional">
      <p class="note locale-copy" lang="th"><time datetime="{pending_period}">{pending_th}</time> · ยอดจดทะเบียนเบื้องต้นทั่วประเทศ <strong>{pending_total} คัน</strong> · รอข้อมูลแยกยี่ห้อและรุ่น</p>
      <p class="note locale-copy" lang="en"><time datetime="{pending_period}">{pending_en}</time> · Provisional national total <strong>{pending_total} registrations</strong> · Brand and model detail pending</p>
    </div>"""
    return f"""<section class="card" id="seoStatic" data-page="overview" aria-labelledby="seoStaticH">
    <h2 id="seoStaticH"><span class="locale-copy" lang="th">เดือนล่าสุดที่ข้อมูลครบ · <time datetime="{per}">{th}</time></span><span class="locale-copy" lang="en">Latest complete month · <time datetime="{per}">{en}</time></span></h2>
    <p class="note locale-copy" lang="th"><strong class="latest-count">{total} คัน</strong> จดทะเบียนใหม่ทั่วประเทศ · {compare_th}</p>
    <p class="note locale-copy" lang="en"><strong class="latest-count">{total} vehicles</strong> newly registered nationwide · {compare_en}</p>
    <p class="note locale-copy" lang="th">ที่มา <a href="https://web.dlt.go.th/statistics/">กรมการขนส่งทางบก</a> · <a href="data/sources.csv">ทะเบียนแหล่งข้อมูล</a></p>
    <p class="note locale-copy" lang="en">Source <a href="https://web.dlt.go.th/statistics/">Department of Land Transport</a> · <a href="data/sources.csv">Source register</a></p>{provisional}
    <p class="note locale-copy" lang="th">ยี่ห้อที่จดทะเบียนมากที่สุด <strong>{leader_name} · {leader_units} คัน</strong></p>
    <p class="note locale-copy" lang="en">Most-registered brand <strong>{leader_name} · {leader_units} vehicles</strong></p>
    <div class="controls">
      <a class="btn" href="#/ranking?range=custom&amp;from={per}&amp;to={per}"><span class="locale-copy" lang="th">ดูอันดับ</span><span class="locale-copy" lang="en">View rankings</span></a>
      <a class="btn" href="#/compare/"><span class="locale-copy" lang="th">เปรียบเทียบรุ่น</span><span class="locale-copy" lang="en">Compare models</span></a>
      <a class="btn" href="#/prices"><span class="locale-copy" lang="th">ดูตามช่วงราคา</span><span class="locale-copy" lang="en">Browse by budget</span></a>
      <a class="btn" href="#/powertrain"><span class="locale-copy" lang="th">สัดส่วนรถไฟฟ้า</span><span class="locale-copy" lang="en">Electric vehicle share</span></a>
    </div>
    <details>
      <summary><span class="locale-copy" lang="th">10 อันดับยี่ห้อและรุ่น เดือน{f['th']}</span><span class="locale-copy" lang="en">Top 10 brands and models in {f['en']}</span></summary>
      <p class="note locale-copy" lang="th"><a href="brands/">อันดับยี่ห้อ</a> · <a href="models/">อันดับรุ่น</a> · <a href="ev/">ยอดจดทะเบียน EV</a> · <a href="summaries/market_monthly.csv">ยอดรายเดือน CSV</a></p>
      <p class="note locale-copy" lang="en"><a href="#/ranking?rank=brand&amp;range=custom&amp;from={per}&amp;to={per}&amp;lang=en">Brand rankings</a> · <a href="#/ranking?rank=model&amp;range=custom&amp;from={per}&amp;to={per}&amp;lang=en">Model rankings</a> · <a href="#/powertrain?range=custom&amp;from={per}&amp;to={per}&amp;lang=en">EV registrations</a> · <a href="summaries/market_monthly.csv">Monthly totals CSV</a></p>
      <div class="two">
        <div>{brand_table}</div>
        <div>{model_table}</div>
      </div>
    </details>
  </section>"""


def home_meta(f):
    latest = f["latest"]
    th, _ = month_names(latest["period"])
    title = escape(f"ยอดจดทะเบียนรถยนต์ล่าสุด {th} | thai-auto-data")
    coverage = ("ยอดรวมเบื้องต้น รอข้อมูลยี่ห้อและรุ่น" if latest["status"] == "provisional"
                else "ดูอันดับยี่ห้อ รุ่น และยอดจดทะเบียน EV")
    desc = escape(f"{th} ไทยจดทะเบียนรถยนต์ใหม่ {n(latest['total'])} คัน (ร.ย.1–3) "
                  f"จากกรมการขนส่งทางบก {coverage} พร้อม CSV")
    return f"""<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">"""


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
    period = f"{f['th']} · {f['en']}"
    t1 = table(f"แยกตามเชื้อเพลิง · Registrations by fuel · {period}", ["Fuel · เชื้อเพลิง", "Units · คัน", "Share · ส่วนแบ่ง"], fuel)
    t2 = table(f"10 อันดับยี่ห้อ EV · Top 10 BEV brands · {period}", ["#", "Brand · ยี่ห้อ", "Units · คัน", "Share of BEV · ส่วนแบ่ง"], top)
    return f"<div class=\"two\"><div>{t1}</div><div>{t2}</div></div>"


def pages(f):
    def one(h1, what_th, what_en, desc, body, app, csv):
        return dict(h1=h1, app=app, csv=csv, body=body, desc=desc,
                    th=f"{what_th} {f['th']} จากทั้งหมด {n(f['total'])} คัน (ร.ย.1–3) เป็นยอดจดทะเบียน ไม่ใช่ยอดขาย",
                    en=f"{what_en} in {f['en']}, out of {n(f['total'])} new vehicles (DLT categories RY1–3). Registrations, not sales.")
    cap = lambda s: f"{s} · {f['th']} · {f['en']}"
    return {
        "brands": one("ยี่ห้อรถยนต์ใหม่ยอดนิยม · Top car brands", "25 ยี่ห้อที่จดทะเบียนใหม่มากที่สุดในเดือน", "The 25 brands with the most new registrations",
                      f"อันดับ 25 ยี่ห้อรถยนต์ใหม่ที่จดทะเบียนมากที่สุดในไทย {f['th']} · Top 25 car brands by new registrations, {f['en']}",
                      table(cap("Top 25 brands · 25 อันดับยี่ห้อ"), ["#", "Brand · ยี่ห้อ", "Units · คัน", "Share · ส่วนแบ่ง"], b_rows(f, f["top_b"])),
                      f"#/ranking?range=custom&amp;from={f['per']}&amp;to={f['per']}", ["summaries/brand_monthly.csv", "data/brands.csv"]),
        "models": one("รุ่นรถยนต์ใหม่ยอดนิยม · Top car models", "25 รุ่นที่จดทะเบียนใหม่มากที่สุดในเดือน", "The 25 models with the most new registrations",
                      f"อันดับ 25 รุ่นรถยนต์ใหม่ที่จดทะเบียนมากที่สุดในไทย {f['th']} · Top 25 car models by new registrations, {f['en']}",
                      table(cap("Top 25 models · 25 อันดับรุ่น"), ["#", "Model · รุ่น", "Brand · ยี่ห้อ", "Units · คัน", "Share · ส่วนแบ่ง"], m_rows(f, f["top_m"])),
                      f"#/ranking?rank=model&amp;range=custom&amp;from={f['per']}&amp;to={f['per']}", ["summaries/model_monthly.csv", "data/models.csv"]),
        "ev": one("รถยนต์ไฟฟ้า EV และเชื้อเพลิง · EV and fuel mix", "สัดส่วนรถยนต์ใหม่ตามเชื้อเพลิง (BEV, HEV, PHEV, ดีเซล, เบนซิน) ในเดือน", "New registrations by fuel type, with the leading EV brands",
                  f"รถยนต์ใหม่จดทะเบียนตามเชื้อเพลิง (BEV, HEV, PHEV, ดีเซล, เบนซิน) และยี่ห้อ EV อันดับต้น {f['th']} · Thai registrations by fuel, {f['en']}",
                  fuel_mix(f), f"#/powertrain?range=custom&amp;from={f['per']}&amp;to={f['per']}", [f"data/registrations_by_fuel/{f['per']}.csv", "data/fuel_types.csv"]),
    }


def page_html(slug, p):
    url, title = f"{SITE}{slug}/", f"{p['h1']} · thai-auto-data"
    ld = json_str({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "thai-auto-data", "item": SITE},
        {"@type": "ListItem", "position": 2, "name": p["h1"], "item": url}]})
    csv = " · ".join(f"<a href=\"{RAW}{c}\">{c}</a>" for c in p["csv"])
    share_script = ('<script>if (location.hash.startsWith("#/ranking?")) location.replace("../" + location.hash);</script>'
                    if slug in {"brands", "models"} else "")
    social_desc = escape({
        "brands": "อันดับยี่ห้อรถจดทะเบียนใหม่ในไทย · Thai car brand rankings by new registrations. Source: DLT.",
        "models": "อันดับรุ่นรถจดทะเบียนใหม่ในไทย · Thai car model rankings by new registrations. Source: DLT.",
        "ev": p["desc"],
    }[slug])
    return f"""<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)}</title>
<meta name="description" content="{escape(p['desc'])}">
<link rel="canonical" href="{url}">
<link rel="alternate" hreflang="th" href="{url}">
<link rel="alternate" hreflang="x-default" href="{url}">
<meta property="og:type" content="website">
<meta property="og:title" content="{escape(title)}">
<meta property="og:description" content="{social_desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}site/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Thai new-vehicle registrations · ยอดจดทะเบียนรถใหม่ในไทย">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{escape(title)}">
<meta name="twitter:description" content="{social_desc}">
<meta name="twitter:image" content="{SITE}site/og-image.png">
<meta name="twitter:image:alt" content="Thai new-vehicle registrations · ยอดจดทะเบียนรถใหม่ในไทย">
<meta property="og:locale" content="th_TH">
<link rel="stylesheet" href="../site/style.css?v=27">
{share_script}
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
  <p class="note"><a href="../">ยอดจดทะเบียนรถยนต์ล่าสุดทั่วประเทศ</a> · <a href="../{p['app']}">ดูแบบโต้ตอบ · Open in the interactive app</a></p>
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
    html = region(html, "head", home_meta(f))
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
    assert f'<time datetime="{f["latest"]["period"]}">' in new_idx
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
