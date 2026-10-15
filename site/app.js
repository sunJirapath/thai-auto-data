/* thai-auto-data dashboard: reads the CSVs in this repo directly, no build step.
   Routes: #/ (market), #/brand/<brand_id>, #/model/<model_id>, #/compare/<model_id>,<model_id>,... */
(function () {
  'use strict';

  // ---------- language: English by default, Thai with ?lang=th or the saved choice ----------
  var LANG = (function () {
    var m = (location.hash || '').match(/[?&]lang=(th|en)\b/);
    if (m) return m[1];
    try { return localStorage.getItem('lang') === 'th' ? 'th' : 'en'; } catch (e) { return 'en'; }
  })();
  // L('ไทย') returns the English text from site/i18n-en.js; L('ไทย', 'English') sets it at the call site
  function L(th, en) {
    if (LANG === 'th') return th;
    if (en !== undefined) return en;
    var v = window.EN && window.EN[th];
    return v === undefined ? th : v;
  }
  function yearOf(ce) { return LANG === 'en' ? ce : ce + 543; }
  var REGION_EN = { central: 'Central', east: 'East', northeast: 'Northeast', north: 'North', west: 'West', south: 'South' };
  function provName(iso) { var p = D.provinceInfo[iso]; return LANG === 'en' ? p.name_en : p.name_th; }
  function translateStatic() {
    document.documentElement.lang = LANG;
    if (LANG === 'th') return;
    var walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n, nodes = [];
    while ((n = walk.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      if (/^(SCRIPT|STYLE|PRE)$/.test(node.parentNode.nodeName)) return;
      var key = node.nodeValue.replace(/\s+/g, ' ').trim();
      if (key && window.EN[key] !== undefined) {
        var lead = node.nodeValue.match(/^\s*/)[0], tail = node.nodeValue.match(/\s*$/)[0];
        node.nodeValue = lead + window.EN[key] + tail;
      }
    });
    document.querySelectorAll('[aria-label],[placeholder],[title]').forEach(function (e) {
      ['aria-label', 'placeholder', 'title'].forEach(function (a) {
        var v = e.getAttribute(a);
        if (v && window.EN[v.trim()] !== undefined) e.setAttribute(a, window.EN[v.trim()]);
      });
    });
    document.title = L(document.title.trim());
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', L(meta.getAttribute('content')));
    // English subtitles next to Thai headings repeat the heading once it is in English
    document.querySelectorAll('h1 .sub, h2 .sub').forEach(function (e) { if (!/[\u0E00-\u0E7F]/.test(e.textContent)) e.remove(); });
  }
  function setLang(lang) {
    try { localStorage.setItem('lang', lang); } catch (e) { /* private mode: the link still carries it */ }
    var h = location.hash || '#/', base = h.split('?')[0], q = (h.split('?')[1] || '').split('&').filter(function (kv) { return kv && kv.indexOf('lang=') !== 0; });
    if (lang === 'th') q.push('lang=th');
    history.replaceState(null, '', base + (q.length ? '?' + q.join('&') : ''));
    location.reload();
  }

  var TH_MONTHS = [L('ม.ค.'), L('ก.พ.'), L('มี.ค.'), L('เม.ย.'), L('พ.ค.'), L('มิ.ย.'), L('ก.ค.'), L('ส.ค.'), L('ก.ย.'), L('ต.ค.'), L('พ.ย.'), L('ธ.ค.')];
  var CATS = [['ry1', L('ร.ย.1 รถยนต์นั่งส่วนบุคคลไม่เกิน 7 คน')], ['ry2', L('ร.ย.2 รถยนต์นั่งส่วนบุคคลเกิน 7 คน')], ['ry3', L('ร.ย.3 รถยนต์บรรทุกส่วนบุคคล')]];
  var CAT_LABEL = { RY1: L('ร.ย.1'), RY2: L('ร.ย.2'), RY3: L('ร.ย.3') };
  var MAX_SERIES = 8, MAX_COMPARE = 4;
  var charts = {};
  var D = {};          // loaded data

  // ---------- helpers ----------
  function parseCSV(text) {
    var rows = [], row = [], field = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') q = false;
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    var head = rows.shift();
    return rows.map(function (r) {
      var o = {};
      head.forEach(function (h, j) { o[h] = r[j] === undefined ? '' : r[j]; });
      return o;
    });
  }
  function load(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(path + ' (' + r.status + ')');
      return r.text();
    }).then(parseCSV);
  }
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function baht(n) { return L('฿') + fmt(n); }
  function monthLabel(p, long) {
    var y = yearOf(+p.slice(0, 4)), m = +p.slice(5, 7) - 1;
    return TH_MONTHS[m] + ' ' + (long ? y : String(y).slice(2));
  }
  function dateLabel(d) {
    if (!d) return '—';
    return +d.slice(8, 10) + ' ' + TH_MONTHS[+d.slice(5, 7) - 1] + ' ' + yearOf(+d.slice(0, 4));
  }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    if (tag === 'canvas') e.setAttribute('role', 'img');
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function add(parent) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]); return parent; }
  function pctText(v) {
    if (v === '' || v === undefined || v === null) return '—';
    var n = +v;
    if (n > 999) return '▲ >999%';
    return (n > 0 ? '▲ +' : n < 0 ? '▼ ' : '') + n.toFixed(1) + '%';
  }
  function pctCell(v) {
    var td = el('td', { class: 'n ' + (v === '' || v === undefined ? 'na' : +v > 0 ? 'up' : +v < 0 ? 'down' : '') }, pctText(v));
    if (v !== '' && v !== undefined && +v > 999) td.title = (+v).toFixed(1) + L('% (ฐานปีก่อนต่ำมาก)');
    return td;
  }
  function table(headers, rows) {
    var t = el('table'), thead = el('thead'), tr = el('tr');
    headers.forEach(function (h) { tr.appendChild(el('th', h[1] ? { class: 'n' } : {}, h[0])); });
    thead.appendChild(tr); t.appendChild(thead);
    var tb = el('tbody');
    rows.forEach(function (r) { tb.appendChild(r); });
    t.appendChild(tb);
    return t;
  }
  function seriesColor(slot) { return css('--s' + (slot + 1)); }
  function card(title, sub, note) {
    var c = el('section', { class: 'card' }), head = el('div', { class: 'card-head' }), t = el('div');
    var h = el('h2', {}, title + ' ');
    if (sub && !(LANG === 'en' && title.toLowerCase().indexOf(String(sub).toLowerCase()) === 0)) h.appendChild(el('span', { class: 'sub' }, sub));
    add(t, h, note ? el('p', { class: 'note' }, note) : null);
    head.appendChild(t); c.appendChild(head);
    c.head = head;
    return c;
  }
  function tile(label, value, detail) {
    return add(el('div', { class: 'tile' }), el('span', { class: 'label' }, label), el('span', { class: 'value' }, value),
      el('span', { class: 'detail' }, detail || ''));
  }
  function link(href, text, cls) { return el('a', { href: href, class: cls || '' }, text); }
  function brandLabel(id) { return D.brandName[id] || id; }
  function modelName(id) {
    var m = D.modelInfo[id];
    if (!m) return id;
    var b = brandLabel(m.brand_id);
    return m.name.toLowerCase().indexOf(b.toLowerCase()) === 0 ? m.name : b + ' ' + m.name;  // "Jaecoo 5", not "Jaecoo Jaecoo 5"
  }
  function index(rows, key) {
    var out = {};
    rows.forEach(function (r) { (out[r[key]] = out[r[key]] || {})[r.period] = r; });
    return out;
  }
  function okPeriods() { return D.market.filter(function (r) { return r.status === 'ok'; }).map(function (r) { return r.period; }); }
  function lastOk() { var p = okPeriods(); return p[p.length - 1]; }
  function sumLast12(byPeriod) {
    var ps = okPeriods().slice(-12), s = 0;
    ps.forEach(function (p) { if (byPeriod && byPeriod[p]) s += +byPeriod[p].units; });
    return s;
  }
  function missingIndices() {
    var out = [];
    D.market.forEach(function (r, i) { if (r.status !== 'ok') out.push(i); });
    return out;
  }
  // a short message in the status line, then back to the "latest data" line
  function flash(msg) {
    var st = document.getElementById('status');
    st.textContent = msg;
    clearTimeout(flash.t);
    flash.t = setTimeout(function () { st.textContent = D.statusText || ''; }, 5000);
  }
  function destroyCharts(prefix) {
    Object.keys(charts).forEach(function (k) {
      if (k.indexOf(prefix) === 0) { charts[k].destroy(); delete charts[k]; }
    });
  }

  // Current prices: the newest list price per variant, plus promos still running.
  function priceDate(p) { return p.effective_from || p.published_on || p.observed_on; }
  function currentPrices(modelId) {
    var today = new Date().toISOString().slice(0, 10), latest = {};
    (D.pricesBy[modelId] || []).forEach(function (p) {
      if (p.price_type === 'promo' && (!p.effective_to || p.effective_to < today)) return;
      var k = p.price_type + '|' + p.variant, cur = latest[k];
      if (!cur || priceDate(p) > priceDate(cur) || (priceDate(p) === priceDate(cur) && p.observed_on > cur.observed_on)) latest[k] = p;
    });
    return Object.keys(latest).map(function (k) { return latest[k]; })
      .sort(function (a, b) { return a.price_type.localeCompare(b.price_type) || (+a.price_thb - +b.price_thb); });
  }
  function priceRange(modelId) {
    var list = currentPrices(modelId).filter(function (p) { return p.price_type === 'list'; }).map(function (p) { return +p.price_thb; });
    if (!list.length) return null;
    return [Math.min.apply(null, list), Math.max.apply(null, list), list.length];
  }
  function rangeText(r) { return r ? (r[0] === r[1] ? baht(r[0]) : baht(r[0]) + ' – ' + baht(r[1])) : L('ยังไม่มีข้อมูล'); }

  // Hatched band behind months with no source data, so a gap never reads as zero.
  var missingBands = {
    id: 'missingBands',
    beforeDatasetsDraw: function (chart, args, opts) {
      if (!opts || !opts.indices || !opts.indices.length) return;
      var ctx = chart.ctx, area = chart.chartArea, x = chart.scales.x;
      var w = area.width / chart.data.labels.length;
      ctx.strokeStyle = css('--hatch'); ctx.lineWidth = 1;
      opts.indices.forEach(function (i) {
        var left = x.getPixelForValue(i) - w / 2;
        ctx.save();
        ctx.beginPath(); ctx.rect(left, area.top, w, area.height); ctx.clip();  // one month's column only
        for (var s = -area.height; s < w; s += 6) {
          ctx.beginPath(); ctx.moveTo(left + s, area.bottom); ctx.lineTo(left + s + area.height, area.top); ctx.stroke();
        }
        ctx.restore();
      });
    }
  };

  function baseOptions() {
    Chart.defaults.font.family = css('--font');
    Chart.defaults.color = css('--muted');
    return {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { color: css('--ink-2'), boxWidth: 12, boxHeight: 12, usePointStyle: true } },
        tooltip: {
          backgroundColor: css('--surface'), titleColor: css('--ink'), bodyColor: css('--ink-2'), footerColor: css('--ink'),
          borderColor: css('--axis'), borderWidth: 1, padding: 10, usePointStyle: true, callbacks: {}
        }
      },
      scales: {
        x: { grid: { display: false }, border: { color: css('--axis') }, ticks: { color: css('--muted'), maxRotation: 0, autoSkipPadding: 12 } },
        y: { grid: { color: css('--grid') }, border: { display: false }, ticks: { color: css('--muted') }, beginAtZero: true }
      }
    };
  }
  function kTicks(v) { return v >= 1000 ? (v / 1000) + 'k' : v; }

  // ---------- trend chart (lines over all months) ----------
  // Color follows the entity: each selection keeps its slot while selected.
  function makeTrend(root, cfg) {
    var slots = {};
    var mode = cfg.mode || 'units';
    var c = card(cfg.title, cfg.subtitle, cfg.note || L('เลือกได้สูงสุด ') + MAX_SERIES + L(' รายการ เส้นที่ขาดคือเดือนที่ไม่มีข้อมูล'));
    var controls = el('div', { class: 'controls' });
    var listId = cfg.key + 'List';
    var input = el('input', { type: 'search', placeholder: L('ค้นหาเพื่อเพิ่ม…'), list: listId, 'aria-label': L('เพิ่มใน') + cfg.title, id: cfg.key + 'Search' });
    var dl = el('datalist', { id: listId });
    cfg.options().forEach(function (o) { dl.appendChild(el('option', { value: o.label })); });
    var seg = el('div', { class: 'seg', role: 'group', 'aria-label': L('หน่วย') });
    [['units', L('จำนวน (คัน)')], ['share_pct', L('ส่วนแบ่ง (%)')]].forEach(function (m) {
      var b = el('button', { type: 'button', 'aria-pressed': String(m[0] === mode) }, m[1]);
      b.addEventListener('click', function () {
        mode = m[0];
        seg.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        draw();
      });
      seg.appendChild(b);
    });
    add(controls, input, dl, seg);
    c.head.appendChild(controls);
    var chips = el('div', { class: 'chips' });
    var box = el('div', { class: 'chart-box' });
    var canvas = el('canvas', { 'aria-label': cfg.title });
    box.appendChild(canvas);
    add(c, chips, box);
    root.appendChild(c);

    input.addEventListener('change', function () {
      var hit = cfg.options().filter(function (o) { return o.label === input.value; })[0];
      if (hit) { addId(hit.id); input.value = ''; }
    });

    function addId(id) {
      if (id in slots) return;
      var used = Object.keys(slots).map(function (k) { return slots[k]; });
      for (var s = 0; s < MAX_SERIES; s++) if (used.indexOf(s) < 0) break;
      if (s >= MAX_SERIES) {
        flash(L('กราฟ') + cfg.title + L('แสดงได้สูงสุด ') + MAX_SERIES + L(' รายการ ลบรายการเดิมก่อน'));
        return;
      }
      slots[id] = s; draw();
      if (cfg.onUser) cfg.onUser(ids());
    }
    function remove(id) { delete slots[id]; draw(); if (cfg.onUser) cfg.onUser(ids()); }
    function ids() { return Object.keys(slots).sort(function (a, b) { return slots[a] - slots[b]; }); }

    function draw() {
      chips.textContent = '';
      ids().forEach(function (id) {
        var chip = el('span', { class: 'chip' });
        var dot = el('i'); dot.style.background = seriesColor(slots[id]);
        add(chip, dot, cfg.href ? link(cfg.href(id), cfg.nameOf(id), 'chip-link') : document.createTextNode(cfg.nameOf(id)));
        var x = el('button', { type: 'button', 'aria-label': L('ลบ ') + cfg.nameOf(id) }, '×');
        x.addEventListener('click', function () { remove(id); });
        chip.appendChild(x); chips.appendChild(chip);
      });
      var surface = css('--surface');
      var datasets = ids().map(function (id) {
        var byP = cfg.rows ? cfg.rows[id] || {} : null;
        return {
          label: cfg.nameOf(id),
          data: cfg.values ? cfg.values(id, mode) : D.market.map(function (r) {
            if (r.status !== 'ok') return null;             // no source data: a gap, never zero
            var row = byP[r.period];
            return row ? +row[mode] : 0;                    // absent from a published month = no registrations
          }),
          borderColor: seriesColor(slots[id]), backgroundColor: seriesColor(slots[id]),
          borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHoverBorderColor: surface, pointHoverBorderWidth: 2,
          tension: 0, spanGaps: false
        };
      });
      var opt = baseOptions();
      opt.plugins.missingBands = { indices: cfg.labels ? [] : missingIndices() };
      opt.plugins.legend.display = datasets.length > 1;
      opt.scales.y.ticks.callback = function (v) { return mode === 'units' ? kTicks(v) : v + '%'; };
      opt.plugins.tooltip.callbacks.label = function (ctx) {
        return ' ' + ctx.dataset.label + ': ' + (mode === 'units' ? fmt(ctx.raw) + L(' คัน') : (+ctx.raw).toFixed(2) + '%');
      };
      if (charts[cfg.key]) charts[cfg.key].destroy();
      charts[cfg.key] = new Chart(canvas, {
        type: 'line', data: { labels: cfg.labels ? cfg.labels() : D.market.map(function (r) { return monthLabel(r.period); }), datasets: datasets },
        options: opt, plugins: [missingBands]
      });
      if (cfg.onChange) cfg.onChange(ids());
    }
    cfg.defaults().forEach(function (id, i) { if (i < MAX_SERIES) slots[id] = i; });
    draw();
    return { toggle: function (id) { if (id in slots) remove(id); else addId(id); }, has: function (id) { return id in slots; }, ids: ids };
  }

  function modelOptions(filter) {
    return function () {
      return Object.keys(D.modelRows).filter(filter || function () { return true; })
        .map(function (id) { return { id: id, label: modelName(id) }; })
        .sort(function (a, b) { return a.label.localeCompare(b.label); });
    };
  }

  // ---------- market explorer (home): filters, stacked bars vs last year, regions, map ----------
  var REGION_GROUPS = [['bkk', L('กรุงเทพมหานคร')], ['central', L('ภาคกลาง (ไม่รวมกรุงเทพฯ)')], ['east', L('ภาคตะวันออก')],
    ['northeast', L('ภาคตะวันออกเฉียงเหนือ')], ['north', L('ภาคเหนือ')], ['west', L('ภาคตะวันตก')], ['south', L('ภาคใต้')]];
  var RANGES = [['12', L('12 เดือน')], ['24', L('24 เดือน')], ['36', L('3 ปี')], ['ytd', L('ปีนี้')], ['all', L('ทั้งหมด')], ['custom', L('กำหนดเอง')]];
  var GRAINS = [['m', L('รายเดือน')], ['q', L('รายไตรมาส')], ['y', L('รายปี')]];
  var M = { range: '12', grain: 'm', cats: { RY1: true, RY2: true, RY3: true }, area: 'all', from: null, to: null, metric: 'units' };

  function regionGroup(iso) { return iso === 'TH-10' ? 'bkk' : D.provinceInfo[iso].region; }
  function areaProvinces(area) {
    if (area === 'all') return null;
    var all = Object.keys(D.provinceInfo);
    if (area === 'bkk') return ['TH-10'];
    if (area === 'upcountry') return all.filter(function (i) { return i !== 'TH-10'; });
    if (area.indexOf('region:') === 0) { var rg = area.slice(7); return all.filter(function (i) { return D.provinceInfo[i].region === rg; }); }
    return [area.slice(5)];   // 'prov:TH-50'
  }
  function areaLabel(area) {
    if (area === 'all') return L('ทั้งประเทศ');
    if (area === 'bkk') return L('กรุงเทพมหานคร');
    if (area === 'upcountry') return L('ต่างจังหวัด (ไม่รวมกรุงเทพฯ)');
    if (area.indexOf('region:') === 0) return D.regionName[area.slice(7)] + (area === 'region:central' ? L(' (รวมกรุงเทพฯ)') : '');
    return LANG === 'en' ? provName(area.slice(5)) : 'จ.' + provName(area.slice(5));
  }
  function selCats() { return ['RY1', 'RY2', 'RY3'].filter(function (c) { return M.cats[c]; }); }
  // units for one month, area and category (0 when absent from a published month)
  function unitsFor(period, isos, cat) {
    if (!isos) return +D.marketBy[period][cat.toLowerCase()];
    var byIso = D.provBy[period] || {}, s = 0;
    isos.forEach(function (i) { s += (byIso[i] && byIso[i][cat]) || 0; });
    return s;
  }
  function selectedMonths() {
    var ps = okPeriods(), last = ps[ps.length - 1];
    if (M.range === 'all') return ps;
    if (M.range === 'ytd') return ps.filter(function (p) { return p.slice(0, 4) === last.slice(0, 4); });
    if (M.range === 'custom') return ps.filter(function (p) { return p >= M.from && p <= M.to; });
    return ps.slice(-(+M.range));
  }
  function shiftMonth(p, n) {
    var y = +p.slice(0, 4), m = +p.slice(5, 7) + n;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    return y + '-' + (m < 10 ? '0' : '') + m;
  }
  function bucketKey(p) {
    if (M.grain === 'm') return p;
    if (M.grain === 'q') return p.slice(0, 4) + '-Q' + Math.ceil(+p.slice(5, 7) / 3);
    return p.slice(0, 4);
  }
  function bucketLabel(k, n) {
    var y = yearOf(+k.slice(0, 4));
    if (M.grain === 'm') return monthLabel(k);
    if (M.grain === 'q') return 'Q' + k.slice(6) + (LANG === 'en' ? ' ' : '/') + String(y).slice(2) + (n < 3 ? '*' : '');
    return String(y) + (n < 12 ? ' (' + n + L(' ด.)') : '');
  }

  function buildMarketControls() {
    function seg(id, items, key) {
      var box = document.getElementById(id);
      box.textContent = '';
      items.forEach(function (it) {
        var b = el('button', { type: 'button', 'aria-pressed': String(M[key] === it[0]) }, it[1]);
        b.addEventListener('click', function () {
          M[key] = it[0];
          box.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
          document.getElementById('fCustom').hidden = M.range !== 'custom';
          renderExplorer();
        });
        box.appendChild(b);
      });
    }
    seg('fRange', RANGES, 'range');
    seg('fGrain', GRAINS, 'grain');
    var cats = document.getElementById('fCats');
    cats.textContent = '';
    CATS.forEach(function (c, k) {
      var code = c[0].toUpperCase();
      var b = el('button', { type: 'button', class: 'chip toggle', 'aria-pressed': String(M.cats[code]), title: c[1] });
      var dot = el('i'); dot.style.background = seriesColor(k);
      add(b, dot, document.createTextNode(CAT_LABEL[code]));
      b.addEventListener('click', function () {
        if (M.cats[code] && selCats().length === 1) return;   // keep at least one category
        M.cats[code] = !M.cats[code]; b.setAttribute('aria-pressed', String(M.cats[code])); renderExplorer();
      });
      cats.appendChild(b);
    });
    var area = document.getElementById('fArea');
    area.textContent = '';
    [['all', L('ทั้งประเทศ')], ['bkk', L('กรุงเทพมหานคร')], ['upcountry', L('ต่างจังหวัด (ไม่รวมกรุงเทพฯ)')]].forEach(function (o) {
      area.appendChild(el('option', { value: o[0] }, o[1]));
    });
    var og = el('optgroup', { label: L('ภูมิภาค') });
    Object.keys(D.regionName).forEach(function (r) { og.appendChild(el('option', { value: 'region:' + r }, areaLabel('region:' + r))); });
    area.appendChild(og);
    var op = el('optgroup', { label: L('จังหวัด') });
    Object.keys(D.provinceInfo).sort(function (a, b) { return provName(a).localeCompare(provName(b), LANG); })
      .forEach(function (i) { op.appendChild(el('option', { value: 'prov:' + i }, provName(i))); });
    area.appendChild(op);
    area.value = M.area;
    area.onchange = function () { M.area = area.value; renderExplorer(); };
    var ps = okPeriods(), from = document.getElementById('fFrom'), to = document.getElementById('fTo');
    from.textContent = ''; to.textContent = '';
    ps.forEach(function (p) {
      from.appendChild(el('option', { value: p }, monthLabel(p, true)));
      to.appendChild(el('option', { value: p }, monthLabel(p, true)));
    });
    M.from = M.from || ps[Math.max(0, ps.length - 12)]; M.to = M.to || ps[ps.length - 1];
    from.value = M.from; to.value = M.to;
    function onRange() {
      M.from = from.value; M.to = to.value;
      if (M.from > M.to) { var t = M.from; M.from = M.to; M.to = t; from.value = M.from; to.value = M.to; }
      renderExplorer();
    }
    from.onchange = onRange; to.onchange = onRange;
    document.getElementById('fCustom').hidden = M.range !== 'custom';
  }

  // total above each stacked bar when there are few enough bars to read them
  var totalLabels = {
    id: 'totalLabels',
    afterDatasetsDraw: function (chart, args, opts) {
      if (!opts || !opts.totals || chart.chartArea.width / chart.data.labels.length < 34) return;   // too crowded to read
      var ctx = chart.ctx, meta = chart.getDatasetMeta(opts.topIndex);
      ctx.save();
      ctx.fillStyle = css('--ink-2'); ctx.font = '11px ' + css('--font'); ctx.textAlign = 'center';
      opts.totals.forEach(function (t, i) {
        if (!meta.data[i]) return;
        var y = chart.scales.y.getPixelForValue(t);
        ctx.fillText(t >= 10000 ? (t / 1000).toFixed(t >= 100000 ? 0 : 1) + 'k' : fmt(t), meta.data[i].x, y - 5);
      });
      ctx.restore();
    }
  };

  function renderMarketCard() {
    var isos = areaProvinces(M.area), cats = selCats(), months = selectedMonths();
    var order = [], buckets = {};
    months.forEach(function (p) {
      var k = bucketKey(p);
      if (!buckets[k]) { buckets[k] = { months: [], cat: {}, total: 0, prev: 0, prevOk: true }; order.push(k); }
      var b = buckets[k];
      b.months.push(p);
      cats.forEach(function (c) { var v = unitsFor(p, isos, c); b.cat[c] = (b.cat[c] || 0) + v; b.total += v; });
      var q = shiftMonth(p, -12);
      if (!D.okSet[q]) b.prevOk = false;
      else cats.forEach(function (c) { b.prev += unitsFor(q, isos, c); });
    });
    var total = 0, prev = 0, prevOk = true;
    order.forEach(function (k) { total += buckets[k].total; prev += buckets[k].prev; prevOk = prevOk && buckets[k].prevOk; });

    // stats
    var last = months[months.length - 1], before = shiftMonth(last, -1), lastV = 0, beforeV = null;
    cats.forEach(function (c) { lastV += unitsFor(last, isos, c); });
    if (D.okSet[before]) { beforeV = 0; cats.forEach(function (c) { beforeV += unitsFor(before, isos, c); }); }
    function stat(label, value, detail, cls) {
      return add(el('div', { class: 'stat' }), el('span', { class: 'label' }, label), el('span', { class: 'value' }, value),
        el('span', { class: 'detail ' + (cls || '') }, detail));
    }
    var yoy = prevOk && prev ? 100 * (total - prev) / prev : null;
    var mom = beforeV ? 100 * (lastV - beforeV) / beforeV : null;
    var stats = document.getElementById('mStats');
    stats.textContent = '';
    add(stats,
      stat(L('รวม · ') + areaLabel(M.area), fmt(total) + L(' คัน'), monthLabel(months[0]) + ' – ' + monthLabel(last)),
      stat(L('เทียบช่วงเดียวกันปีก่อน'), yoy === null ? '—' : pctText(yoy), prevOk ? L('ปีก่อน ') + fmt(prev) + L(' คัน') : L('ไม่มีข้อมูลปีก่อนครบช่วง'), yoy === null ? '' : yoy >= 0 ? 'up' : 'down'),
      stat(L('เฉลี่ยต่อเดือน'), fmt(Math.round(total / months.length)) + L(' คัน'), months.length + L(' เดือน')),
      stat(L('เดือนล่าสุด · ') + monthLabel(last, true), fmt(lastV) + L(' คัน'), mom === null ? '' : L('จากเดือนก่อน ') + pctText(mom), mom === null ? '' : mom >= 0 ? 'up' : 'down'));

    // main chart: stacked categories + same period last year (one axis, same unit)
    var surface = css('--surface'), datasets = [];
    CATS.forEach(function (c, k) {
      var code = c[0].toUpperCase();
      if (!M.cats[code]) return;
      datasets.push({ type: 'bar', label: c[1], data: order.map(function (key) { return buckets[key].cat[code]; }),
        backgroundColor: seriesColor(k), borderColor: surface, borderWidth: { top: 2 }, borderSkipped: 'start', maxBarThickness: 34, stack: 'm', order: 2 });
    });
    datasets[datasets.length - 1].borderRadius = { topLeft: 4, topRight: 4 };
    var topIndex = datasets.length - 1;
    datasets.push({ type: 'line', label: L('ช่วงเดียวกันปีก่อน (รวม)'), data: order.map(function (key) { return buckets[key].prevOk ? buckets[key].prev : null; }),
      borderColor: css('--ink-2'), backgroundColor: css('--ink-2'), borderDash: [5, 4], borderWidth: 2, pointRadius: order.length > 26 ? 0 : 3,
      pointBackgroundColor: surface, pointBorderWidth: 2, pointHoverRadius: 5, spanGaps: false, order: 1 });
    var opt = baseOptions();
    opt.scales.x.stacked = true; opt.scales.y.stacked = true;
    opt.scales.y.ticks.callback = kTicks;
    opt.layout = { padding: { top: 18 } };
    opt.plugins.totalLabels = { totals: order.map(function (k) { return buckets[k].total; }), topIndex: topIndex };
    opt.plugins.tooltip.callbacks = {
      title: function (items) {
        var b = buckets[order[items[0].dataIndex]];
        return items[0].label + (b.months.length > 1 ? ' (' + monthLabel(b.months[0]) + '–' + monthLabel(b.months[b.months.length - 1]) + ')' : '');
      },
      label: function (c) { return c.raw === null ? ' ' + c.dataset.label + L(': ไม่มีข้อมูล') : ' ' + c.dataset.label + ': ' + fmt(c.raw) + L(' คัน'); },
      footer: function (items) {
        var b = buckets[order[items[0].dataIndex]];
        return L('รวม ') + fmt(b.total) + L(' คัน') + (b.prevOk && b.prev ? L(' · เทียบปีก่อน ') + pctText(100 * (b.total - b.prev) / b.prev) : '');
      }
    };
    if (charts.market) charts.market.destroy();
    charts.market = new Chart(document.getElementById('marketChart'), {
      data: { labels: order.map(function (k) { return bucketLabel(k, buckets[k].months.length); }), datasets: datasets },
      options: opt, plugins: [totalLabels]
    });
    var notes = [L('ยอดเดือนมกราคมสูงกว่าธันวาคมเกือบเท่าตัวทุกปี เป็นรูปแบบที่อยู่ในข้อมูลของกรมฯ เอง'),
      L('กระบะ 4 ประตูจำนวนมากจดเป็น ร.ย.1')];
    if (M.grain !== 'm') notes.push(L('* หรือ (n ด.) คือช่วงที่มีข้อมูลไม่ครบในตัวกรองที่เลือก'));
    if (M.area !== 'all') notes.push(L('รถนับตามจังหวัดที่จดทะเบียน รถของบริษัทและลีสซิ่งที่จดในกรุงเทพฯ ทำให้ยอดกรุงเทพฯ สูงกว่าจำนวนผู้ใช้จริงในพื้นที่'));
    document.getElementById('mNote').textContent = notes.join(' · ');

    var trs = order.slice().reverse().map(function (k) {
      var b = buckets[k], tr = el('tr');
      tr.appendChild(el('td', {}, bucketLabel(k, b.months.length)));
      ['RY1', 'RY2', 'RY3'].forEach(function (c) { tr.appendChild(el('td', { class: 'n' }, M.cats[c] ? fmt(b.cat[c]) : '—')); });
      tr.appendChild(el('td', { class: 'n' }, fmt(b.total)));
      tr.appendChild(el('td', { class: 'n' }, b.prevOk ? fmt(b.prev) : '—'));
      tr.appendChild(pctCell(b.prevOk && b.prev ? (100 * (b.total - b.prev) / b.prev).toFixed(2) : ''));
      return tr;
    });
    var tb = document.getElementById('marketTable');
    tb.textContent = '';
    tb.appendChild(table([[L('ช่วง')], [L('ร.ย.1'), 1], [L('ร.ย.2'), 1], [L('ร.ย.3'), 1], [L('รวม'), 1], [L('ปีก่อน'), 1], ['YoY', 1]], trs));

    renderGeo(months, cats);
  }

  function renderGeo(months, cats) {
    // per-province totals for the selected months and categories; always the whole country, for context
    var byIso = {}, prevIso = {}, grand = 0;
    var prevOk = months.every(function (p) { return D.okSet[shiftMonth(p, -12)]; });
    Object.keys(D.provinceInfo).forEach(function (i) { byIso[i] = 0; prevIso[i] = 0; });
    months.forEach(function (p) {
      var rows = D.provBy[p] || {}, prows = D.provBy[shiftMonth(p, -12)] || {};
      Object.keys(byIso).forEach(function (i) {
        cats.forEach(function (c) {
          byIso[i] += (rows[i] && rows[i][c]) || 0;
          prevIso[i] += (prows[i] && prows[i][c]) || 0;
        });
      });
    });
    Object.keys(byIso).forEach(function (i) { grand += byIso[i]; });
    var percap = M.metric === 'percap';
    function per1000(i) { return 1000 * byIso[i] / D.population[i]; }
    var selSet = {};
    (areaProvinces(M.area) || []).forEach(function (i) { selSet[i] = true; });

    // region bars (Bangkok shown on its own: it is about half the country)
    var groups = {};
    REGION_GROUPS.forEach(function (g) { groups[g[0]] = 0; });
    Object.keys(byIso).forEach(function (i) { groups[regionGroup(i)] += byIso[i]; });
    function activeGroup(g) {
      if (M.area === 'all') return true;
      if (M.area === 'bkk') return g === 'bkk';
      if (M.area === 'upcountry') return g !== 'bkk';
      if (M.area.indexOf('region:') === 0) return g === M.area.slice(7) || (M.area === 'region:central' && g === 'bkk');
      return g === regionGroup(M.area.slice(5));
    }
    var accent = css('--accent'), dim = css('--axis');
    var ro = baseOptions();
    ro.indexAxis = 'y';
    ro.interaction = { mode: 'nearest', intersect: true, axis: 'y' };
    ro.plugins.legend.display = false;
    ro.scales.x.grid = { color: css('--grid') }; ro.scales.x.ticks.callback = kTicks;
    ro.scales.y.grid = { display: false };
    var groupPop = {};
    REGION_GROUPS.forEach(function (g) { groupPop[g[0]] = 0; });
    Object.keys(byIso).forEach(function (i) { groupPop[regionGroup(i)] += D.population[i]; });
    ro.plugins.tooltip.callbacks = { label: function (c) {
      var g = REGION_GROUPS[c.dataIndex][0];
      return percap ? ' ' + c.raw.toFixed(1) + L(' คันต่อประชากร 1,000 คน · รวม ') + fmt(groups[g]) + L(' คัน')
        : ' ' + fmt(c.raw) + L(' คัน · ') + (grand ? (100 * c.raw / grand).toFixed(1) : 0) + L('% ของทั้งประเทศ');
    } };
    if (percap) ro.scales.x.ticks.callback = function (v) { return v; };
    ro.onClick = function (e, els) {
      if (!els.length) return;
      var g = REGION_GROUPS[els[0].index][0], next = g === 'bkk' ? 'bkk' : 'region:' + g;
      M.area = M.area === next ? 'all' : next;
      document.getElementById('fArea').value = M.area;
      renderExplorer();
    };
    if (charts.region) charts.region.destroy();
    charts.region = new Chart(document.getElementById('regionChart'), {
      type: 'bar', options: ro,
      data: { labels: REGION_GROUPS.map(function (g) { return g[1]; }),
        datasets: [{ data: REGION_GROUPS.map(function (g) { return percap ? 1000 * groups[g[0]] / groupPop[g[0]] : groups[g[0]]; }),
          backgroundColor: REGION_GROUPS.map(function (g) { return activeGroup(g[0]) ? accent : dim; }),
          borderRadius: 4, borderSkipped: 'start', maxBarThickness: 22 }] }
    });

    // choropleth with 5 quantile classes (Bangkok would flatten a linear scale)
    function metric(i) { return percap ? per1000(i) : byIso[i]; }
    var vals = Object.keys(byIso).map(metric).filter(function (v) { return v > 0; }).sort(function (a, b) { return a - b; });
    var breaks = [0.2, 0.4, 0.6, 0.8].map(function (q) { return vals[Math.floor(q * (vals.length - 1))]; });
    function cls(v) { if (!v) return -1; var k = 0; while (k < breaks.length && v > breaks[k]) k++; return k; }
    var colors = [1, 2, 3, 4, 5].map(function (n) { return css('--q' + n); });
    var rank = Object.keys(byIso).sort(function (a, b) { return metric(b) - metric(a); });
    var wrap = document.getElementById('mapWrap');
    wrap.textContent = '';
    var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', D.map.viewBox); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', L('แผนที่ยอดจดทะเบียนรายจังหวัด'));
    var tip = el('div', { class: 'map-tip' });
    tip.hidden = true;
    D.map.paths.forEach(function (f) {
      var path = document.createElementNS(NS, 'path'), v = byIso[f.iso], k = cls(metric(f.iso)), info = D.provinceInfo[f.iso];
      path.setAttribute('d', f.d);
      path.setAttribute('fill', k < 0 ? css('--grid') : colors[k]);
      path.setAttribute('class', 'prov' + (selSet[f.iso] ? ' sel' : ''));
      path.setAttribute('tabindex', '0');
      var change = prevOk && prevIso[f.iso] ? pctText(100 * (v - prevIso[f.iso]) / prevIso[f.iso]) : '—';
      var text = provName(f.iso) + ': ' + fmt(v) + L(' คัน · ') + per1000(f.iso).toFixed(1) + L(' ต่อ 1,000 คน · ') + (grand ? (100 * v / grand).toFixed(1) : 0) + L('% · อันดับ ') + (rank.indexOf(f.iso) + 1) + ' · YoY ' + change;
      path.setAttribute('aria-label', text);
      path.addEventListener('pointermove', function (e) {
        tip.textContent = text; tip.hidden = false;
        var r = wrap.getBoundingClientRect();
        tip.style.left = Math.max(0, Math.min(e.clientX - r.left + 12, r.width - 200)) + 'px';
        tip.style.top = (e.clientY - r.top + 14) + 'px';
      });
      path.addEventListener('pointerleave', function () { tip.hidden = true; });
      path.addEventListener('focus', function () {
        tip.textContent = text; tip.hidden = false;
        var r = wrap.getBoundingClientRect(), b = path.getBoundingClientRect();
        tip.style.left = Math.max(0, Math.min(b.right - r.left + 6, r.width - 200)) + 'px';
        tip.style.top = (b.top - r.top + b.height / 2) + 'px';
      });
      path.addEventListener('blur', function () { tip.hidden = true; });
      function pick() { M.area = M.area === 'prov:' + f.iso ? 'all' : 'prov:' + f.iso; document.getElementById('fArea').value = M.area; renderExplorer(); }
      path.addEventListener('click', pick);
      path.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      svg.appendChild(path);
    });
    // draw selected provinces last so their outline sits on top
    Array.prototype.slice.call(svg.querySelectorAll('.prov.sel')).forEach(function (p) { svg.appendChild(p); });
    add(wrap, svg, tip);
    var legend = document.getElementById('mapLegend');
    legend.textContent = '';
    var edges = [vals[0]].concat(breaks).concat([vals[vals.length - 1]]);
    colors.forEach(function (c, k) {
      var sw = el('i'); sw.style.background = c;
      var lo = percap ? edges[k].toFixed(1) : fmt(edges[k]), hi = percap ? edges[k + 1].toFixed(1) : fmt(edges[k + 1]);
      legend.appendChild(add(el('span'), sw, document.createTextNode(lo + '–' + hi)));
    });

    var trs = rank.map(function (i, n) {
      var v = byIso[i], info = D.provinceInfo[i], tr = el('tr', selSet[i] ? { class: 'sel-row' } : {});
      add(tr, el('td', { class: 'n' }, String(n + 1)), el('td', {}, provName(i)), el('td', {}, D.regionName[info.region]),
        el('td', { class: 'n' }, fmt(v)), el('td', { class: 'n' }, per1000(i).toFixed(1)), el('td', { class: 'n' }, (grand ? 100 * v / grand : 0).toFixed(2) + '%'),
        pctCell(prevOk && prevIso[i] ? (100 * (v - prevIso[i]) / prevIso[i]).toFixed(2) : ''));
      return tr;
    });
    var pt = document.getElementById('provinceTable');
    pt.textContent = '';
    pt.appendChild(table([['#', 1], [L('จังหวัด')], [L('ภาค')], [L('คัน'), 1], [L('ต่อ 1,000 คน'), 1], [L('ส่วนแบ่ง'), 1], ['YoY', 1]], trs));
  }

  // equirectangular projection scaled by cos(latitude); fine for a country Thailand's size
  function prepareMap(geo) {
    var minX = 999, minY = 999, maxX = -999, maxY = -999;
    geo.features.forEach(function (f) {
      f.geometry.coordinates.forEach(function (poly) {
        poly[0].forEach(function (pt) {
          minX = Math.min(minX, pt[0]); maxX = Math.max(maxX, pt[0]); minY = Math.min(minY, pt[1]); maxY = Math.max(maxY, pt[1]);
        });
      });
    });
    var k = Math.cos((minY + maxY) / 2 * Math.PI / 180), W = 300, s = W / ((maxX - minX) * k), H = (maxY - minY) * s;
    return {
      viewBox: '0 0 ' + W + ' ' + H.toFixed(1),
      paths: geo.features.map(function (f) {
        var d = f.geometry.coordinates.map(function (poly) {
          return 'M' + poly[0].map(function (pt) { return ((pt[0] - minX) * k * s).toFixed(1) + ',' + ((maxY - pt[1]) * s).toFixed(1); }).join('L') + 'Z';
        }).join('');
        return { iso: f.properties.province_iso, d: d };
      })
    };
  }

  // ---------- home: rankings, hot models and trends follow the same filters as the market chart ----------
  var A = { cache: {}, kind: 'b', hot: 'yoy', custom: {}, top5: {}, token: 0 };

  function areaKey(area) {
    if (area === 'all') return 'all';
    if (area === 'bkk') return 'TH-10';
    if (area === 'upcountry') return 'upcountry';
    if (area.indexOf('region:') === 0) return 'region-' + area.slice(7);
    return area.slice(5);
  }
  // summaries/areas/<key>.csv -> idx[period][kind][id][category] = units
  function loadArea(key) {
    if (!A.cache[key]) {
      A.cache[key] = load('summaries/areas/' + key + '.csv').then(function (rows) {
        var idx = {};
        rows.forEach(function (r) {
          var p = idx[r.period] = idx[r.period] || { b: {}, m: {} };
          var k = p[r.kind] = p[r.kind] || {};   // b, m, f (fuel) or bf (brand|fuel)
          var o = k[r.id] = k[r.id] || {};
          o[r.category] = +r.units;
        });
        return idx;
      });
    }
    return A.cache[key];
  }
  function sumById(idx, kind, months, cats) {
    var out = {};
    months.forEach(function (p) {
      var k = idx[p] && idx[p][kind];
      if (!k) return;
      Object.keys(k).forEach(function (id) {
        var s = 0;
        cats.forEach(function (c) { s += k[id][c] || 0; });
        if (s) out[id] = (out[id] || 0) + s;
      });
    });
    return out;
  }
  function sortedIds(obj) { return Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a] || a.localeCompare(b); }); }
  function sumValues(obj) { var s = 0; Object.keys(obj).forEach(function (k) { s += obj[k]; }); return s; }
  function nameFor(kind, id) { return kind === 'b' ? brandLabel(id) : modelName(id); }
  function hrefFor(kind, id) { return (kind === 'b' ? '#/brand/' : '#/model/') + id + filterQuery(); }
  function filterText() {
    var ms = selectedMonths(), cats = selCats();
    return areaLabel(M.area) + ' · ' + monthLabel(ms[0]) + ' – ' + monthLabel(ms[ms.length - 1]) + ' · ' +
      (cats.length === 3 ? L('ร.ย.1–3') : cats.map(function (c) { return CAT_LABEL[c]; }).join(', '));
  }

  // text at the end of each horizontal bar
  var barLabels = {
    id: 'barLabels',
    afterDatasetsDraw: function (chart, args, opts) {
      if (!opts || !opts.labels) return;
      var ctx = chart.ctx, meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.fillStyle = css('--ink-2'); ctx.font = '12px ' + css('--font'); ctx.textBaseline = 'middle';
      meta.data.forEach(function (bar, i) { ctx.fillText(opts.labels[i], bar.x + 6, bar.y); });
      ctx.restore();
    }
  };
  function hbar(key, canvas, labels, values, texts, onPick, shortTexts) {
    var narrow = canvas.parentNode.clientWidth < 520;
    if (narrow && shortTexts) texts = shortTexts;
    var o = baseOptions();
    o.indexAxis = 'y';
    o.interaction = { mode: 'nearest', intersect: true, axis: 'y' };
    o.plugins.legend.display = false;
    o.plugins.tooltip.enabled = false;
    o.plugins.barLabels = { labels: texts };
    o.layout = { padding: { right: narrow ? 92 : 150 } };
    o.scales.x.display = false;
    o.scales.y.grid = { display: false };
    o.scales.y.ticks = { color: css('--ink'), font: { size: 12 }, autoSkip: false,
      callback: function (v) { var t = this.getLabelForValue(v); return narrow && t.length > 16 ? t.slice(0, 15) + '…' : t; } };
    o.onClick = function (e, els) { if (els.length && onPick) onPick(els[0].index); };
    o.onHover = function (e, els) { e.native.target.style.cursor = els.length && onPick ? 'pointer' : 'default'; };
    if (charts[key]) charts[key].destroy();
    canvas.parentNode.style.height = (36 + 30 * labels.length) + 'px';
    charts[key] = new Chart(canvas, {
      type: 'bar', options: o, plugins: [barLabels],
      data: { labels: labels, datasets: [{ data: values, backgroundColor: css('--accent'), borderRadius: 4, borderSkipped: 'start', barPercentage: 0.72, categoryPercentage: 1 }] }
    });
  }

  function renderRankCard(idx) {
    var months = selectedMonths(), cats = selCats(), kind = A.kind;
    var cur = sumById(idx, kind, months, cats), total = sumValues(sumById(idx, 'b', months, cats));
    var prevMonths = months.map(function (p) { return shiftMonth(p, -12); });
    var prevOk = prevMonths.every(function (p) { return D.okSet[p]; });
    var prev = prevOk ? sumById(idx, kind, prevMonths, cats) : {};
    var prevRank = {};
    sortedIds(prev).forEach(function (id, i) { prevRank[id] = i + 1; });
    var ids = sortedIds(cur);
    var top = ids.slice(0, 15);
    hbar('rank', document.getElementById('rankChart'), top.map(function (id) { return nameFor(kind, id); }),
      top.map(function (id) { return cur[id]; }),
      top.map(function (id) { return fmt(cur[id]) + L(' คัน · ') + (100 * cur[id] / total).toFixed(1) + '%'; }),
      function (i) { location.hash = hrefFor(kind, top[i]); },
      top.map(function (id) { return fmt(cur[id]) + ' · ' + (100 * cur[id] / total).toFixed(1) + '%'; }));
    A.top5[kind] = ids.slice(0, 5);
    var trs = ids.slice(0, 50).map(function (id, i) {
      var tr = el('tr'), td = el('td', { class: 'name' });
      var on = trendIds(kind).indexOf(id) >= 0;
      var plus = el('button', { type: 'button', class: 'plus', 'data-id': id, 'aria-pressed': String(!!on), 'aria-label': L('เพิ่ม ') + nameFor(kind, id) + L(' ลงกราฟเทรนด์') }, on ? '✓' : '＋');
      plus.addEventListener('click', function () { toggleTrendId(kind, id); });
      add(td, plus, link(hrefFor(kind, id), nameFor(kind, id)));
      var move = '—';
      if (prevOk) {
        if (!prevRank[id]) move = L('ใหม่');
        else if (prevRank[id] === i + 1) move = '=';
        else move = (prevRank[id] > i + 1 ? '▲' : '▼') + Math.abs(prevRank[id] - (i + 1));
      }
      add(tr, el('td', { class: 'n' }, String(i + 1)), td, el('td', { class: 'n' }, fmt(cur[id])),
        el('td', { class: 'n' }, (100 * cur[id] / total).toFixed(1) + '%'),
        el('td', { class: 'n' }, prevOk ? fmt(prev[id] || 0) : '—'),
        pctCell(prevOk && prev[id] ? (100 * (cur[id] - prev[id]) / prev[id]).toFixed(2) : ''),
        el('td', { class: 'n move ' + (move[0] === '▲' || move === L('ใหม่') ? 'up' : move[0] === '▼' ? 'down' : 'na') }, move));
      return tr;
    });
    var box = document.getElementById('rankTable');
    box.textContent = '';
    box.appendChild(trs.length ? table([['#', 1], [kind === 'b' ? L('ยี่ห้อ') : L('รุ่น')], [L('คัน'), 1], [L('ส่วนแบ่ง'), 1], [L('ปีก่อน'), 1], ['YoY', 1], [L('อันดับ', 'Rank'), 1]], trs)
      : el('p', { class: 'note' }, L('ไม่มีข้อมูลในตัวกรองนี้')));
    document.getElementById('rankNote').textContent = (kind === 'm' ? L('นับเฉพาะชื่อรุ่นที่จับคู่ได้ ส่วนแบ่งคิดจากยอดทั้งหมดในพื้นที่และช่วงที่เลือก · ') : L('ส่วนแบ่งคิดจากยอดทั้งหมดในพื้นที่และช่วงที่เลือก · ')) +
      L('อันดับเทียบกับช่วงเดียวกันปีก่อน · กดแท่งหรือชื่อเพื่อดูรายละเอียด · กด ＋ ในตารางเพื่อเพิ่มลงกราฟในหน้าเทรนด์');
  }
  function trendIds(kind) { return A.custom[kind] || A.top5[kind] || []; }
  function toggleTrendId(kind, id) {
    var ids = trendIds(kind).slice(), i = ids.indexOf(id);
    if (i >= 0) ids.splice(i, 1); else if (ids.length < MAX_SERIES) ids.push(id);
    A.custom[kind] = ids;
    syncRankButtons();
  }
  function syncRankButtons() {
    var kind = A.kind;
    document.querySelectorAll('#rankTable .plus').forEach(function (b) {
      var on = trendIds(kind).indexOf(b.getAttribute('data-id')) >= 0;
      b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '✓' : '＋';
    });
  }

  function renderHotCard(idx) {
    var cats = selCats(), months = selectedMonths(), cur, prev, label, all = okPeriods();
    if (A.hot === 'yoy') {
      var pm = months.map(function (p) { return shiftMonth(p, -12); });
      if (!pm.every(function (p) { return D.okSet[p]; })) { return hotEmpty(L('ไม่มีข้อมูลปีก่อนครบสำหรับช่วงที่เลือก ลองเลือกช่วงที่สั้นลง')); }
      cur = sumById(idx, 'm', months, cats); prev = sumById(idx, 'm', pm, cats);
      label = monthLabel(months[0]) + '–' + monthLabel(months[months.length - 1]) + L(' เทียบช่วงเดียวกันปีก่อน');
    } else {
      var end = all.indexOf(months[months.length - 1]);
      if (end < 5) return hotEmpty(L('ต้องมีข้อมูลอย่างน้อย 6 เดือน'));
      var last3 = all.slice(end - 2, end + 1), prev3 = all.slice(end - 5, end - 2);
      cur = sumById(idx, 'm', last3, cats); prev = sumById(idx, 'm', prev3, cats);
      label = monthLabel(last3[0]) + '–' + monthLabel(last3[2]) + L(' เทียบ ') + monthLabel(prev3[0]) + '–' + monthLabel(prev3[2]);
    }
    var gains = {};
    Object.keys(cur).forEach(function (id) { var g = cur[id] - (prev[id] || 0); if (g > 0) gains[id] = g; });
    var top = sortedIds(gains).slice(0, 10);
    document.getElementById('hotNote').textContent = label + L(' · เรียงตามจำนวนคันที่เพิ่มขึ้น (ไม่ใช่ % เพื่อไม่ให้รุ่นฐานเล็กดูโตเกินจริง) · ยอดจดทะเบียน ไม่ใช่ยอดขาย');
    if (!top.length) return hotEmpty(L('ไม่มีรุ่นที่เพิ่มขึ้นในตัวกรองนี้'));
    document.getElementById('hotEmpty').hidden = true;
    document.getElementById('hotChart').parentNode.hidden = false;
    hbar('hot', document.getElementById('hotChart'), top.map(function (id) { return modelName(id); }),
      top.map(function (id) { return gains[id]; }),
      top.map(function (id) {
        var p = prev[id] || 0;
        return '+' + fmt(gains[id]) + L(' คัน · ') + (p ? (p * 10 < cur[id] ? L('>10 เท่า') : pctText(100 * gains[id] / p)) : L('ใหม่')) + L(' · รวม ') + fmt(cur[id]);
      }),
      function (i) { location.hash = '#/model/' + top[i] + filterQuery(); },
      top.map(function (id) { return '+' + fmt(gains[id]) + (prev[id] ? '' : L(' ใหม่')); }));
  }
  function hotEmpty(msg) {
    var e = document.getElementById('hotEmpty');
    e.textContent = msg; e.hidden = false;
    document.getElementById('hotChart').parentNode.hidden = true;
  }

  function renderHomeTrends(idx) {
    var months = selectedMonths(), cats = selCats();
    var order = [], bucketMonths = {};
    months.forEach(function (p) { var k = bucketKey(p); if (!bucketMonths[k]) { bucketMonths[k] = []; order.push(k); } bucketMonths[k].push(p); });
    var labels = order.map(function (k) { return bucketLabel(k, bucketMonths[k].length); });
    var totals = order.map(function (k) { return sumValues(sumById(idx, 'b', bucketMonths[k], cats)); });
    function series(kind) {
      var cache = {};
      return function (id, mode) {
        if (!cache[id]) cache[id] = order.map(function (k) { return sumById(idx, kind, bucketMonths[k], cats)[id] || 0; });
        return mode === 'units' ? cache[id] : cache[id].map(function (v, i) { return totals[i] ? +(100 * v / totals[i]).toFixed(2) : 0; });
      };
    }
    function options(kind) {
      var ids = {};
      Object.keys(idx).forEach(function (p) { Object.keys(idx[p][kind]).forEach(function (id) { ids[id] = true; }); });
      return function () {
        return Object.keys(ids).filter(function (id) { return kind === 'b' || D.modelInfo[id]; })
          .map(function (id) { return { id: id, label: nameFor(kind, id) }; }).sort(function (a, b) { return a.label.localeCompare(b.label); });
      };
    }
    [['b', 'brandTrend', L('เทรนด์รายยี่ห้อ'), 'Brand trend'], ['m', 'modelTrend', L('เทรนด์รายรุ่น'), 'Model trend']].forEach(function (t) {
      var kind = t[0], root = document.getElementById(t[1]);
      root.textContent = '';
      var top5 = sortedIds(sumById(idx, kind, months, cats)).slice(0, 5);
      var tr = makeTrend(root, {
        key: t[1], title: t[2], subtitle: t[3], nameOf: function (id) { return nameFor(kind, id); },
        href: function (id) { return hrefFor(kind, id); }, options: options(kind),
        labels: function () { return labels; }, values: series(kind),
        note: L('ตามตัวกรองด้านบน · ส่วนแบ่งคิดจากยอดทั้งหมดในพื้นที่ · เลือกได้สูงสุด ') + MAX_SERIES + L(' รายการ'),
        defaults: function () { return A.custom[kind] || top5; },
        onUser: function (ids) { A.custom[kind] = ids; syncRankButtons(); }
      });
      // makeTrend renders a card inside the section; keep a single card
      var inner = root.firstChild;
      while (inner.firstChild) root.appendChild(inner.firstChild);
      root.removeChild(inner);
      if (kind === 'b') D.brandTrend = tr; else D.modelTrend = tr;
    });
    syncRankButtons();
  }

  function buildHomeControls() {
    function seg(id, items, get, set) {
      var box = document.getElementById(id);
      box.textContent = '';
      items.forEach(function (it) {
        var b = el('button', { type: 'button', 'aria-pressed': String(get() === it[0]) }, it[1]);
        b.addEventListener('click', function () {
          set(it[0]);
          box.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
          renderExplorer();
        });
        box.appendChild(b);
      });
    }
    seg('rankKind', [['b', L('ยี่ห้อ')], ['m', L('รุ่น')]], function () { return A.kind; }, function (v) { A.kind = v; });
    seg('hotMode', [['yoy', L('เทียบปีก่อน')], ['mom3', L('3 เดือนล่าสุด')]], function () { return A.hot; }, function (v) { A.hot = v; });
    seg('regionMode', [['share', L('ส่วนแบ่ง')], ['index', L('เทียบค่าเฉลี่ยประเทศ')]], function () { return RG.mode; }, function (v) { RG.mode = v; });
    seg('regionKind', [['b', L('ยี่ห้อ')], ['m', L('รุ่น')]], function () { return RG.kind; }, function (v) { RG.kind = v; });
    seg('seasonMode', [['units', L('จำนวนคัน')], ['index', L('เทียบค่าเฉลี่ยของปี')]], function () { return SE.mode; }, function (v) { SE.mode = v; });
    seg('geoMetric', [['units', L('จำนวนคัน')], ['percap', L('ต่อประชากร 1,000 คน')]], function () { return M.metric; }, function (v) { M.metric = v; });
  }

  function buildControlsOnce() {
    if (D.controlsBuilt) return;
    D.controlsBuilt = true;
    buildMarketControls();
    buildHomeControls();
  }

  // ---------- filters in the URL (shareable views) ----------
  function filterQuery() {
    var q = [];
    if (M.range !== '12') q.push('range=' + M.range);
    if (M.range === 'custom') q.push('from=' + M.from, 'to=' + M.to);
    if (M.grain !== 'm') q.push('grain=' + M.grain);
    var cats = selCats();
    if (cats.length < 3) q.push('cats=' + cats.join('.'));
    if (M.area !== 'all') q.push('area=' + encodeURIComponent(M.area));
    if (M.metric !== 'units') q.push('metric=' + M.metric);
    if (LANG === 'th') q.push('lang=th');
    return q.length ? '?' + q.join('&') : '';
  }
  function applyQuery(qs) {
    var P = {};
    qs.split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) P[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    var ps = okPeriods(), ranges = RANGES.map(function (r) { return r[0]; });
    M.range = ranges.indexOf(P.range) >= 0 ? P.range : '12';
    if (M.range === 'custom') {
      M.from = ps.indexOf(P.from) >= 0 ? P.from : ps[Math.max(0, ps.length - 12)];
      M.to = ps.indexOf(P.to) >= 0 ? P.to : ps[ps.length - 1];
    }
    M.grain = ['m', 'q', 'y'].indexOf(P.grain) >= 0 ? P.grain : 'm';
    var cats = (P.cats || 'RY1.RY2.RY3').split('.').filter(function (c) { return CAT_LABEL[c]; });
    if (!cats.length) cats = ['RY1', 'RY2', 'RY3'];
    ['RY1', 'RY2', 'RY3'].forEach(function (c) { M.cats[c] = cats.indexOf(c) >= 0; });
    var a = P.area || 'all';
    M.area = a === 'all' || a === 'bkk' || a === 'upcountry' || (a.indexOf('region:') === 0 && D.regionName[a.slice(7)]) ||
      (a.indexOf('prov:') === 0 && D.provinceInfo[a.slice(5)]) ? a : 'all';
    M.metric = P.metric === 'percap' ? 'percap' : 'units';
  }
  function syncHash() {
    var base = (location.hash || '#/').split('?')[0];
    var want = base + (D.page === 'data' || D.page === 'seasonality' ? (LANG === 'th' ? '?lang=th' : '') : filterQuery());
    if (want !== location.hash) history.replaceState(null, '', want);
  }

  // ---------- page orchestration ----------
  // Which page is showing, and what it renders when the shared filters change.
  var PAGE_RENDER = {
    overview: function () { renderMarketCard(); },
    ranking: function (idx) { renderRankCard(idx); renderHotCard(idx); },
    trends: function (idx) { renderHomeTrends(idx); renderShareAndBump(idx); },
    origin: function (idx) { renderOrigin(idx); },
    regions: function (idx) { renderRegions(idx); },
    seasonality: function () { renderSeasonality(); },
    prices: function (idx) { renderPricePage(idx); },
    launches: function (idx) { renderLaunches(idx); },
    powertrain: function (idx) { renderPowertrain(idx); },
    brand: function (idx) { renderDetail(function (root) { renderBrand(root, D.detailArg, idx); }); },
    model: function (idx) { renderDetail(function (root) { renderModel(root, D.detailArg, idx); }); },
    compare: function (idx) { renderDetail(function (root) { renderCompare(root, D.detailArg ? D.detailArg.split(',').filter(Boolean) : [], idx); }); }
  };
  function renderDetail(fn) {
    var detail = document.getElementById('detail');
    destroyCharts('d-');
    detail.textContent = '';
    fn(detail);
    var t = detail.querySelector('.page-title');
    document.title = (t ? t.textContent : L('ไม่พบหน้านี้')) + ' · thai-auto-data';
  }
  var NEEDS_AREA = { ranking: 1, trends: 1, origin: 1, regions: 1, prices: 1, launches: 1, powertrain: 1, brand: 1, model: 1, compare: 1 };
  function renderExplorer() {
    var page = D.page, token = ++A.token;
    document.querySelectorAll('.filter-echo').forEach(function (e) { e.textContent = filterText(); });
    syncHash();
    if (!PAGE_RENDER[page]) return;
    if (!NEEDS_AREA[page]) { PAGE_RENDER[page](); return; }
    loadArea(areaKey(M.area)).then(function (idx) {
      if (token === A.token && D.page === page) PAGE_RENDER[page](idx);
    }).catch(function (e) {
      flash(L('โหลดข้อมูลพื้นที่ไม่สำเร็จ: ') + e.message);
    });
  }

  // ---------- analysis pages (all follow the shared filter bar) ----------
  var ORIGIN_GROUPS = [['JP', L('ญี่ปุ่น')], ['CN', L('จีน')], ['KR', L('เกาหลีใต้')], ['EU', L('ยุโรป')], ['US', L('สหรัฐฯ')], ['OT', L('อื่นๆ / ไม่ระบุ')]];
  var EU = { DE: 1, NL: 1, IT: 1, FR: 1, GB: 1, SE: 1 };
  var PRICE_BANDS = [[0, 600000, L('ต่ำกว่า 6 แสน')], [600000, 800000, L('6–8 แสน')], [800000, 1000000, L('8 แสน–1 ล้าน')],
    [1000000, 1500000, L('1–1.5 ล้าน')], [1500000, 2000000, L('1.5–2 ล้าน')], [2000000, Infinity, L('2 ล้านขึ้นไป')]];

  function originGroup(brandId) {
    var c = D.brandCountry[brandId] || '';
    if (c === 'JP' || c === 'CN' || c === 'KR' || c === 'US') return c;
    return EU[c] ? 'EU' : 'OT';
  }
  function buckets() {
    var order = [], months = {};
    selectedMonths().forEach(function (p) { var k = bucketKey(p); if (!months[k]) { months[k] = []; order.push(k); } months[k].push(p); });
    return { order: order, months: months, labels: order.map(function (k) { return bucketLabel(k, months[k].length); }) };
  }
  function mix(pct) { return 'color-mix(in srgb, var(--accent) ' + Math.round(pct) + '%, var(--surface))'; }
  function mixNeg(pct) { return 'color-mix(in srgb, var(--down) ' + Math.round(pct) + '%, var(--surface))'; }
  function heatCell(text, pct, neg) {
    var td = el('td', { class: 'n heat' }, text);
    td.style.background = neg ? mixNeg(pct) : mix(pct);
    if (pct > 55) td.style.color = '#fff';
    return td;
  }
  function areaRows(kind, idx, months, cats) { return sumById(idx, kind, months, cats); }
  // the seven region groups used on the regions/origin pages: Bangkok, the rest of the central region, and five regions
  function loadRegionGroups() {
    var keys = ['TH-10', 'region-central', 'region-east', 'region-northeast', 'region-north', 'region-west', 'region-south'];
    return Promise.all(keys.map(loadArea)).then(function (r) {
      return { bkk: r[0], central: r[1], east: r[2], northeast: r[3], north: r[4], west: r[5], south: r[6] };
    });
  }
  function groupTotals(groups, kind, months, cats) {
    var out = {};
    REGION_GROUPS.forEach(function (g) {
      var s = sumById(groups[g[0]], kind, months, cats);
      if (g[0] === 'central') {   // region-central includes Bangkok; show it without
        var b = sumById(groups.bkk, kind, months, cats);
        Object.keys(b).forEach(function (id) { s[id] = (s[id] || 0) - b[id]; if (!s[id]) delete s[id]; });
      }
      out[g[0]] = s;
    });
    return out;
  }
  function stackedArea(key, canvas, labels, series, opts) {
    var o = baseOptions();
    o.scales.y.stacked = true; o.scales.y.max = 100; o.scales.y.ticks.callback = function (v) { return v + '%'; };
    o.plugins.tooltip.itemSort = function (a, b) { return b.datasetIndex - a.datasetIndex; };
    o.plugins.tooltip.callbacks.label = function (c) { return ' ' + c.dataset.label + ': ' + c.raw.toFixed(1) + '%' + (opts && opts.units ? ' (' + fmt(opts.units[c.datasetIndex][c.dataIndex]) + L(' คัน)') : ''); };
    o.elements = { point: { radius: 0, hoverRadius: 4 }, line: { borderWidth: 1 } };
    if (charts[key]) charts[key].destroy();
    charts[key] = new Chart(canvas, {
      type: 'line', options: o,
      data: { labels: labels, datasets: series.map(function (s, i) {
        return { label: s.label, data: s.data, fill: i === 0 ? 'origin' : '-1', backgroundColor: s.color, borderColor: css('--surface'), tension: 0.25 };
      }) }
    });
  }

  // ----- trends page extras: share over time and rank bump chart -----
  function renderShareAndBump(idx) {
    var b = buckets(), cats = selCats();
    var range = sumById(idx, 'b', selectedMonths(), cats);
    var top = sortedIds(range).slice(0, 8);
    var per = b.order.map(function (k) { return sumById(idx, 'b', b.months[k], cats); });
    var tot = per.map(sumValues);
    var series = top.map(function (id, i) {
      return { label: brandLabel(id), color: seriesColor(i), data: per.map(function (o, j) { return tot[j] ? 100 * (o[id] || 0) / tot[j] : 0; }) };
    });
    series.push({ label: L('อื่นๆ'), color: css('--axis'), data: per.map(function (o, j) {
      var s = 0; top.forEach(function (id) { s += o[id] || 0; }); return tot[j] ? 100 * (tot[j] - s) / tot[j] : 0;
    }) });
    var units = top.map(function (id) { return per.map(function (o) { return o[id] || 0; }); });
    units.push(per.map(function (o, j) { var s = 0; top.forEach(function (id) { s += o[id] || 0; }); return tot[j] - s; }));
    stackedArea('share', document.getElementById('shareChart'), b.labels, series, { units: units });

    // ranks of the same 8 brands in each bucket (rank among all brands)
    var ranks = per.map(function (o) { var r = {}; sortedIds(o).forEach(function (id, i) { r[id] = i + 1; }); return r; });
    var o = baseOptions();
    o.scales.y.reverse = true; o.scales.y.min = 1; o.scales.y.max = 12; o.scales.y.beginAtZero = false;
    o.scales.y.ticks.stepSize = 1; o.scales.y.ticks.callback = function (v) { return '#' + v; };
    o.plugins.tooltip.callbacks.label = function (c) { return ' ' + c.dataset.label + L(': อันดับ ') + c.raw; };
    if (charts.bump) charts.bump.destroy();
    charts.bump = new Chart(document.getElementById('bumpChart'), {
      type: 'line', options: o,
      data: { labels: b.labels, datasets: top.map(function (id, i) {
        return { label: brandLabel(id), data: ranks.map(function (r) { return r[id] && r[id] <= 12 ? r[id] : null; }),
          borderColor: seriesColor(i), backgroundColor: seriesColor(i), borderWidth: 2.5, pointRadius: b.order.length > 24 ? 0 : 3,
          pointBackgroundColor: css('--surface'), pointBorderWidth: 2, tension: 0.3, spanGaps: false };
      }) }
    });
  }

  // ----- origin page: parent-company country groups -----
  function renderOrigin(idx) {
    var b = buckets(), cats = selCats(), months = selectedMonths();
    var per = b.order.map(function (k) {
      var o = {}; ORIGIN_GROUPS.forEach(function (g) { o[g[0]] = 0; });
      var s = sumById(idx, 'b', b.months[k], cats);
      Object.keys(s).forEach(function (id) { o[originGroup(id)] += s[id]; });
      return o;
    });
    var tot = per.map(sumValues);
    stackedArea('origin', document.getElementById('originChart'), b.labels, ORIGIN_GROUPS.map(function (g, i) {
      return { label: g[1], color: seriesColor(i), data: per.map(function (o, j) { return tot[j] ? 100 * o[g[0]] / tot[j] : 0; }) };
    }), { units: ORIGIN_GROUPS.map(function (g) { return per.map(function (o) { return o[g[0]]; }); }) });

    // stats: share in the selected range, and change vs the same period last year
    var range = sumById(idx, 'b', months, cats), pm = months.map(function (p) { return shiftMonth(p, -12); });
    var prevOk = pm.every(function (p) { return D.okSet[p]; }), prev = prevOk ? sumById(idx, 'b', pm, cats) : {};
    function byGroup(s) { var o = {}; ORIGIN_GROUPS.forEach(function (g) { o[g[0]] = 0; }); Object.keys(s).forEach(function (id) { o[originGroup(id)] += s[id]; }); return o; }
    var cur = byGroup(range), was = byGroup(prev), ct = sumValues(cur), pt = sumValues(was);
    var box = document.getElementById('originStats');
    box.textContent = '';
    ORIGIN_GROUPS.forEach(function (g, i) {
      var share = ct ? 100 * cur[g[0]] / ct : 0, pshare = pt ? 100 * was[g[0]] / pt : null;
      var d = pshare === null ? '' : (share - pshare >= 0 ? '▲ +' : '▼ ') + (share - pshare).toFixed(1) + L(' จุด จากปีก่อน');
      var s = add(el('div', { class: 'stat' }), el('span', { class: 'label' }, g[1]), el('span', { class: 'value' }, share.toFixed(1) + '%'),
        el('span', { class: 'detail ' + (pshare === null ? '' : share >= pshare ? 'up' : 'down') }, d || fmt(cur[g[0]]) + L(' คัน')));
      s.style.borderLeftColor = seriesColor(i);
      box.appendChild(s);
    });

    // brands in each group (for transparency)
    var list = document.getElementById('originBrands');
    list.textContent = '';
    ORIGIN_GROUPS.forEach(function (g) {
      var ids = sortedIds(range).filter(function (id) { return originGroup(id) === g[0]; });
      if (!ids.length) return;
      list.appendChild(add(el('p', {}), el('b', {}, g[1] + ': '), document.createTextNode(ids.slice(0, 15).map(function (id) {
        return brandLabel(id) + ' ' + (100 * range[id] / ct).toFixed(1) + '%';
      }).join(' · ') + (ids.length > 15 ? L(' · และอีก ') + (ids.length - 15) + L(' ยี่ห้อ') : ''))));
    });

    // by region (100% bars), always all regions
    loadRegionGroups().then(function (groups) {
      var gt = groupTotals(groups, 'b', months, cats);
      var o = baseOptions();
      o.indexAxis = 'y';
      o.scales.x.stacked = true; o.scales.y.stacked = true; o.scales.x.max = 100;
      o.scales.x.ticks.callback = function (v) { return v + '%'; };
      o.scales.y.grid = { display: false };
      o.interaction = { mode: 'index', intersect: false, axis: 'y' };
      o.plugins.tooltip.callbacks.label = function (c) { return ' ' + c.dataset.label + ': ' + c.raw.toFixed(1) + '%'; };
      var regTot = REGION_GROUPS.map(function (r) { return sumValues(gt[r[0]]); });
      if (charts.originRegion) charts.originRegion.destroy();
      charts.originRegion = new Chart(document.getElementById('originRegionChart'), {
        type: 'bar', options: o,
        data: { labels: REGION_GROUPS.map(function (r) { return r[1]; }), datasets: ORIGIN_GROUPS.map(function (g, i) {
          return { label: g[1], backgroundColor: seriesColor(i), borderColor: css('--surface'), borderWidth: { right: 1 }, borderSkipped: false, barPercentage: 0.75,
            data: REGION_GROUPS.map(function (r, j) {
              var s = 0, t = gt[r[0]];
              Object.keys(t).forEach(function (id) { if (originGroup(id) === g[0]) s += t[id]; });
              return regTot[j] ? 100 * s / regTot[j] : 0;
            }) };
        }) }
      });
    });
  }

  // ----- regions page: brand x region heatmap -----
  var RG = { mode: 'share', kind: 'b' };
  function renderRegions(idx) {
    var months = selectedMonths(), cats = selCats(), kind = RG.kind;
    Promise.all([loadRegionGroups(), loadArea('all')]).then(function (res) {
      var groups = res[0], all = res[1];
      var gt = groupTotals(groups, kind, months, cats), bt = groupTotals(groups, 'b', months, cats);
      var nat = sumById(all, kind, months, cats), natTot = sumValues(sumById(all, 'b', months, cats));
      var regTot = {};
      REGION_GROUPS.forEach(function (r) { regTot[r[0]] = sumValues(bt[r[0]]); });
      var top = sortedIds(nat).slice(0, 20);
      var head = [[kind === 'b' ? L('ยี่ห้อ') : L('รุ่น')], [L('ทั้งประเทศ'), 1]].concat(REGION_GROUPS.map(function (r) { return [r[1].replace(L(' (ไม่รวมกรุงเทพฯ)'), '*'), 1]; }));
      var trs = top.map(function (id) {
        var natShare = 100 * nat[id] / natTot, tr = el('tr');
        var rowMax = Math.max.apply(null, REGION_GROUPS.map(function (r) { return regTot[r[0]] ? (gt[r[0]][id] || 0) / regTot[r[0]] : 0; })) * 100;
        add(tr, add(el('td', { class: 'name' }), link(hrefFor(kind, id), nameFor(kind, id))), el('td', { class: 'n' }, natShare.toFixed(1) + '%'));
        REGION_GROUPS.forEach(function (r) {
          var share = regTot[r[0]] ? 100 * (gt[r[0]][id] || 0) / regTot[r[0]] : 0;
          var td;
          if (RG.mode === 'share') td = heatCell(share.toFixed(1) + '%', rowMax ? 8 + 70 * share / rowMax : 0);   // relative to the brand's best region
          else {
            var ix = natShare ? 100 * share / natShare : 0, dev = ix - 100;
            td = heatCell(Math.round(ix) + '', Math.min(80, Math.abs(dev) * 0.9), dev < 0);
          }
          td.title = nameFor(kind, id) + L(' ใน') + r[1] + ': ' + fmt(gt[r[0]][id] || 0) + L(' คัน · ') + share.toFixed(2) + '%';
          tr.appendChild(td);
        });
        return tr;
      });
      var box = document.getElementById('regionHeat');
      box.textContent = '';
      var t = table(head, trs); t.classList.add('heatmap');
      box.appendChild(t);
      document.getElementById('regionHeatNote').textContent = RG.mode === 'share'
        ? L('ตัวเลขคือส่วนแบ่งของแต่ละ') + (kind === 'b' ? L('ยี่ห้อ', 'brand') : L('รุ่น', 'model')) + L('ในภาคนั้น · สีเทียบภายในแถว: สีเข้มสุดคือภาคที่') + (kind === 'b' ? L('ยี่ห้อ', 'brand') : L('รุ่น', 'model')) + L('นั้นมีส่วนแบ่งสูงสุด · * ภาคกลางไม่รวมกรุงเทพฯ · เรียงตามยอดทั้งประเทศ')
        : L('ดัชนี = ส่วนแบ่งในภาค ÷ ส่วนแบ่งทั้งประเทศ × 100 · มากกว่า 100 (สีน้ำเงิน) = แข็งกว่าค่าเฉลี่ยประเทศ · น้อยกว่า 100 (สีแดง) = อ่อนกว่า · * ภาคกลางไม่รวมกรุงเทพฯ');
    });
  }

  // ----- seasonality page: year x month heatmap and one line per year -----
  var SE = { mode: 'units' };
  function renderSeasonality() {
    var isos = null, cats = ['RY1', 'RY2', 'RY3'], years = {}, all = okPeriods();   // always the whole market
    all.forEach(function (p) {
      var y = p.slice(0, 4), v = 0;
      cats.forEach(function (c) { v += unitsFor(p, isos, c); });
      (years[y] = years[y] || {})[+p.slice(5, 7)] = v;
    });
    var ys = Object.keys(years).sort(), max = 0;
    ys.forEach(function (y) { Object.keys(years[y]).forEach(function (m) { max = Math.max(max, years[y][m]); }); });
    var trs = ys.map(function (y) {
      var row = years[y], vals = Object.keys(row).map(function (m) { return row[m]; }), avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
      var tr = el('tr');
      tr.appendChild(el('th', { scope: 'row' }, String(yearOf(+y))));
      for (var m = 1; m <= 12; m++) {
        if (row[m] === undefined) { tr.appendChild(el('td', { class: 'n na' }, '—')); continue; }
        var td = SE.mode === 'units' ? heatCell(fmt(row[m]), 10 + 75 * row[m] / max)
          : heatCell(Math.round(100 * row[m] / avg) + '', Math.min(80, Math.abs(100 * row[m] / avg - 100) * 1.2), row[m] < avg);
        td.title = TH_MONTHS[m - 1] + ' ' + yearOf(+y) + ': ' + fmt(row[m]) + L(' คัน · ') + Math.round(100 * row[m] / avg) + L('% ของค่าเฉลี่ยรายเดือนปีนั้น');
        tr.appendChild(td);
      }
      tr.appendChild(el('td', { class: 'n' }, fmt(vals.reduce(function (a, b) { return a + b; }, 0)) + (vals.length < 12 ? ' (' + vals.length + L(' ด.)') : '')));
      return tr;
    });
    var box = document.getElementById('seasonHeat');
    box.textContent = '';
    var t = table([[L('ปี')]].concat(TH_MONTHS.map(function (m) { return [m, 1]; })).concat([[L('รวม'), 1]]), trs);
    t.classList.add('heatmap');
    box.appendChild(t);

    var o = baseOptions();
    o.scales.y.ticks.callback = kTicks;
    o.plugins.tooltip.callbacks.label = function (c) { return ' ' + c.dataset.label + ': ' + (c.raw === null ? L('ไม่มีข้อมูล') : fmt(c.raw) + L(' คัน')); };
    if (charts.season) charts.season.destroy();
    var recent = ys.slice(-6);
    charts.season = new Chart(document.getElementById('seasonChart'), {
      type: 'line', options: o,
      data: { labels: TH_MONTHS, datasets: recent.map(function (y, i) {
        var last = i === recent.length - 1;
        return { label: String(yearOf(+y)), data: TH_MONTHS.map(function (m, j) { return years[y][j + 1] === undefined ? null : years[y][j + 1]; }),
          borderColor: seriesColor(i), backgroundColor: seriesColor(i), borderWidth: last ? 3 : 1.5, pointRadius: last ? 3 : 0, tension: 0.25, spanGaps: false };
      }) }
    });
  }

  // ----- prices page: registrations by starting-price band, and price vs units -----
  function renderPricePage(idx) {
    var months = selectedMonths(), cats = selCats();
    var units = sumById(idx, 'm', months, cats), total = sumValues(sumById(idx, 'b', months, cats));
    var priced = Object.keys(D.pricesBy).filter(function (id) { return priceRange(id); });
    var band = PRICE_BANDS.map(function () { return { units: 0, models: [] }; }), covered = 0;
    priced.forEach(function (id) {
      var r = priceRange(id), u = units[id] || 0;
      covered += u;
      PRICE_BANDS.forEach(function (b, i) { if (r[0] >= b[0] && r[0] < b[1]) { band[i].units += u; band[i].models.push(id); } });
    });
    document.getElementById('priceCoverage').textContent = L('มีราคาจากเว็บไซต์ทางการ ') + priced.length + L(' รุ่น คิดเป็น ') +
      (total ? (100 * covered / total).toFixed(1) : 0) + L('% ของยอดจดทะเบียนในตัวกรองนี้ · จัดช่วงตามราคาเริ่มต้นของแต่ละรุ่น · ช่วงราคาจึงยังไม่ใช่ภาพทั้งตลาด');
    var o = baseOptions();
    o.plugins.legend.display = false;
    o.scales.y.ticks.callback = kTicks;
    o.scales.x.ticks.autoSkip = false; o.scales.x.ticks.maxRotation = 45;
    o.plugins.tooltip.callbacks.label = function (c) { return ' ' + fmt(c.raw) + L(' คัน · ') + band[c.dataIndex].models.length + L(' รุ่น'); };
    o.plugins.tooltip.callbacks.afterLabel = function (c) { return band[c.dataIndex].models.map(modelName).join(', '); };
    if (charts.priceBand) charts.priceBand.destroy();
    charts.priceBand = new Chart(document.getElementById('priceBandChart'), {
      type: 'bar', options: o,
      data: { labels: PRICE_BANDS.map(function (b) { return b[2]; }), datasets: [{ data: band.map(function (b) { return b.units; }),
        backgroundColor: css('--accent'), borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'start', maxBarThickness: 56 }] }
    });

    var pts = priced.map(function (id) { var r = priceRange(id); return { x: r[0] / 1000, y: units[id] || 0, id: id, max: r[1] }; });
    var so = baseOptions();
    so.plugins.legend.display = false;
    so.interaction = { mode: 'nearest', intersect: true };
    so.scales.x = { type: 'linear', grid: { color: css('--grid') }, ticks: { color: css('--muted'), callback: function (v) { return L('฿') + v + 'k'; } },
      title: { display: true, text: L('ราคาเริ่มต้น (พันบาท)'), color: css('--muted') } };
    so.scales.y.ticks.callback = kTicks;
    so.scales.y.title = { display: true, text: L('ยอดจดทะเบียนในช่วงที่เลือก'), color: css('--muted') };
    so.plugins.tooltip.callbacks.label = function (c) { var p = c.raw; return ' ' + modelName(p.id) + ': ' + rangeText(priceRange(p.id)) + ' · ' + fmt(p.y) + L(' คัน'); };
    so.onClick = function (e, els) { if (els.length) location.hash = '#/model/' + pts[els[0].index].id + filterQuery(); };
    if (charts.priceScatter) charts.priceScatter.destroy();
    charts.priceScatter = new Chart(document.getElementById('priceScatter'), {
      type: 'scatter', options: so, plugins: [{ id: 'ptLabels', afterDatasetsDraw: function (ch) {
        var ctx = ch.ctx, meta = ch.getDatasetMeta(0), area = ch.chartArea, boxes = [];
        ctx.save(); ctx.fillStyle = css('--ink-2'); ctx.font = '11px ' + css('--font');
        pts.map(function (p, i) { return i; }).sort(function (a, b) { return pts[b].y - pts[a].y; }).forEach(function (i) {
          var pt = meta.data[i], text = D.modelInfo[pts[i].id].name, w = ctx.measureText(text).width;
          var right = { l: pt.x + 7, r: pt.x + 9 + w, t: pt.y - 6, b: pt.y + 7 }, left = { l: pt.x - 9 - w, r: pt.x - 7, t: pt.y - 6, b: pt.y + 7 };
          function free(bx) { return bx.l >= 0 && bx.r <= ch.width && !boxes.some(function (o) { return bx.l < o.r && bx.r > o.l && bx.t < o.b && bx.b > o.t; }); }
          var bx = free(right) ? right : free(left) ? left : null;
          if (!bx) return;   // no room: the name is still in the tooltip and the table
          boxes.push(bx);
          ctx.fillText(text, bx.l, pt.y + 4);
        });
        ctx.restore();
      } }],
      data: { datasets: [{ data: pts, backgroundColor: css('--accent'), borderColor: css('--surface'), borderWidth: 2, pointRadius: 6, pointHoverRadius: 8 }] }
    });

    var trs = priced.sort(function (a, b) { return (units[b] || 0) - (units[a] || 0); }).map(function (id) {
      return add(el('tr'), add(el('td', { class: 'name' }), link('#/model/' + id + filterQuery(), modelName(id))), el('td', { class: 'n' }, rangeText(priceRange(id))),
        el('td', { class: 'n' }, String(priceRange(id)[2])), el('td', { class: 'n' }, fmt(units[id] || 0)));
    });
    var box = document.getElementById('priceTable');
    box.textContent = '';
    box.appendChild(table([[L('รุ่น')], [L('ราคา (เว็บไซต์ทางการ)'), 1], [L('รุ่นย่อย'), 1], [L('คัน'), 1]], trs));
  }

  // ----- launches page: models whose first registration falls in the selected range -----
  // A few vehicles are often registered months before a model's real launch (imports, test cars).
  // Launch = first month with at least 20 units and at least 3% of the model's best month.
  function launchMonth(id) {
    var rows = D.modelRows[id], ps = okPeriods(), peak = 0;
    ps.forEach(function (p) { if (rows[p]) peak = Math.max(peak, +rows[p].units); });
    var floor = Math.max(20, 0.03 * peak), pre = 0;
    for (var i = 0; i < ps.length; i++) {
      var v = rows[ps[i]] ? +rows[ps[i]].units : 0;
      if (v >= floor) return { start: ps[i], pre: pre, firstSeen: pre ? firstSeen(rows, ps) : ps[i] };
      pre += v;
    }
    return null;
  }
  function firstSeen(rows, ps) { for (var i = 0; i < ps.length; i++) if (rows[ps[i]] && +rows[ps[i]].units > 0) return ps[i]; return null; }
  function renderLaunches(idx) {
    var months = selectedMonths(), cats = selCats(), all = okPeriods(), first = all[0];
    var launches = Object.keys(D.modelRows).map(function (id) { var l = launchMonth(id); return l && { id: id, start: l.start, pre: l.pre, seen: l.firstSeen }; })
      .filter(function (x) { return x && x.seen > shiftMonth(first, 2) && months.indexOf(x.start) >= 0; });
    launches.forEach(function (x) {
      var i = all.indexOf(x.start);
      x.curve = [];
      for (var k = 0; k < 12; k++) {
        var p = all[i + k];
        if (!p) break;
        var s = idx[p] && idx[p].m[x.id], v = 0;
        if (s) cats.forEach(function (c) { v += s[c] || 0; });
        x.curve.push(v);
      }
      x.first3 = x.curve.slice(0, 3).reduce(function (a, b) { return a + b; }, 0);
      x.first6 = x.curve.slice(0, 6).reduce(function (a, b) { return a + b; }, 0);
      x.total = (sumById(idx, 'm', all.slice(i), cats)[x.id]) || 0;
    });
    launches = launches.filter(function (x) { return x.total > 0; });
    var top = launches.slice().sort(function (a, b) { return b.first6 - a.first6; }).slice(0, 8);
    var o = baseOptions();
    o.scales.y.ticks.callback = kTicks;
    o.scales.x.title = { display: true, text: L('เดือนที่นับจากเดือนแรกที่มีทะเบียน'), color: css('--muted') };
    o.plugins.tooltip.callbacks.title = function (items) { return L('เดือนที่ ') + items[0].label; };
    o.plugins.tooltip.callbacks.label = function (c) { return ' ' + c.dataset.label + ': ' + fmt(c.raw) + L(' คัน'); };
    if (charts.launch) charts.launch.destroy();
    charts.launch = new Chart(document.getElementById('launchChart'), {
      type: 'line', options: o,
      data: { labels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], datasets: top.map(function (x, i) {
        return { label: modelName(x.id) + ' (' + monthLabel(x.start) + ')', data: x.curve, borderColor: seriesColor(i), backgroundColor: seriesColor(i),
          borderWidth: 2, pointRadius: 2, tension: 0.25 };
      }) }
    });
    var trs = launches.sort(function (a, b) { return b.start.localeCompare(a.start) || b.first3 - a.first3; }).map(function (x) {
      return add(el('tr'), add(el('td', { class: 'name' }), link('#/model/' + x.id + filterQuery(), modelName(x.id))), el('td', {}, monthLabel(x.start, true)),
        el('td', { class: 'n' }, String(all.length - all.indexOf(x.start))), el('td', { class: 'n' }, fmt(x.first3)),
        el('td', { class: 'n' }, x.curve.length >= 6 ? fmt(x.first6) : '—'), el('td', { class: 'n' }, fmt(x.total)),
        el('td', { class: 'n' }, x.pre ? fmt(x.pre) + L(' (ตั้งแต่ ') + monthLabel(x.seen) + ')' : '—'),
        el('td', { class: 'n' }, rangeText(priceRange(x.id))));
    });
    var box = document.getElementById('launchTable');
    box.textContent = '';
    box.appendChild(trs.length ? table([[L('รุ่น')], [L('เดือนเปิดตัว')], [L('จำนวนเดือน'), 1], [L('3 เดือนแรก'), 1], [L('6 เดือนแรก'), 1], [L('รวมถึงปัจจุบัน'), 1], [L('ทะเบียนก่อนเปิดตัว'), 1], [L('ราคา'), 1]], trs)
      : el('p', { class: 'note' }, L('ไม่มีรุ่นที่เริ่มมีทะเบียนในช่วงที่เลือก ลองเลือกช่วงที่ยาวขึ้น')));
  }

  // ----- powertrain page: fuel types from the DLT brand x fuel file -----
  var FUELS = [['bev', L('ไฟฟ้า (BEV)')], ['phev', L('ปลั๊กอินไฮบริด (PHEV)')], ['hev', L('ไฮบริด (HEV)')], ['petrol', L('เบนซิน')], ['diesel', L('ดีเซล')], ['gas', L('ก๊าซ (LPG/CNG)')]];
  function fuelMix(idx, months, cats) {
    var s = sumById(idx, 'f', months, cats), o = {};
    FUELS.forEach(function (f) { o[f[0]] = s[f[0]] || 0; });
    return o;
  }
  function renderPowertrain(idx) {
    var b = buckets(), cats = selCats(), months = selectedMonths();
    var per = b.order.map(function (k) { return fuelMix(idx, b.months[k], cats); }), tot = per.map(sumValues);
    stackedArea('fuel', document.getElementById('fuelChart'), b.labels, FUELS.map(function (f, i) {
      return { label: f[1], color: seriesColor(i), data: per.map(function (o, j) { return tot[j] ? 100 * o[f[0]] / tot[j] : 0; }) };
    }), { units: FUELS.map(function (f) { return per.map(function (o) { return o[f[0]]; }); }) });

    var cur = fuelMix(idx, months, cats), pm = months.map(function (p) { return shiftMonth(p, -12); });
    var prevOk = pm.every(function (p) { return D.okSet[p]; }), prev = prevOk ? fuelMix(idx, pm, cats) : null;
    var ct = sumValues(cur), pt = prev ? sumValues(prev) : 0;
    var box = document.getElementById('fuelStats');
    box.textContent = '';
    FUELS.forEach(function (f, i) {
      var share = ct ? 100 * cur[f[0]] / ct : 0, ps = pt ? 100 * prev[f[0]] / pt : null;
      var st = add(el('div', { class: 'stat' }), el('span', { class: 'label' }, f[1]), el('span', { class: 'value' }, share.toFixed(1) + '%'),
        el('span', { class: 'detail ' + (ps === null ? '' : share >= ps ? 'up' : 'down') },
          ps === null ? fmt(cur[f[0]]) + L(' คัน') : (share - ps >= 0 ? '▲ +' : '▼ ') + (share - ps).toFixed(1) + L(' จุด · ') + fmt(cur[f[0]]) + L(' คัน')));
      st.style.borderLeftColor = seriesColor(i);
      box.appendChild(st);
    });

    // BEV brands: top 10 by battery-electric registrations in the range
    var bf = sumById(idx, 'bf', months, cats), bev = {}, bevTot = 0;
    Object.keys(bf).forEach(function (k) { var p = k.split('|'); if (p[1] === 'bev') { bev[p[0]] = bf[k]; bevTot += bf[k]; } });
    var topBev = sortedIds(bev).slice(0, 12);
    hbar('bevRank', document.getElementById('bevChart'), topBev.map(brandLabel), topBev.map(function (id) { return bev[id]; }),
      topBev.map(function (id) { return fmt(bev[id]) + L(' คัน · ') + (100 * bev[id] / bevTot).toFixed(1) + L('% ของ BEV'); }),
      function (i) { location.hash = '#/brand/' + topBev[i] + filterQuery(); },
      topBev.map(function (id) { return fmt(bev[id]) + ' · ' + (100 * bev[id] / bevTot).toFixed(0) + '%'; }));

    // powertrain mix of the 12 biggest brands
    var brandTot = sumById(idx, 'b', months, cats), top = sortedIds(brandTot).slice(0, 12);
    var o = baseOptions();
    o.indexAxis = 'y';
    o.scales.x.stacked = true; o.scales.y.stacked = true; o.scales.x.max = 100;
    o.scales.x.ticks.callback = function (v) { return v + '%'; };
    o.scales.y.grid = { display: false };
    o.interaction = { mode: 'index', intersect: false, axis: 'y' };
    o.plugins.tooltip.callbacks.label = function (c) { return c.raw ? ' ' + c.dataset.label + ': ' + c.raw.toFixed(1) + '%' : null; };
    if (charts.brandFuel) charts.brandFuel.destroy();
    document.getElementById('brandFuelChart').parentNode.style.height = (60 + 30 * top.length) + 'px';
    charts.brandFuel = new Chart(document.getElementById('brandFuelChart'), {
      type: 'bar', options: o,
      data: { labels: top.map(brandLabel), datasets: FUELS.map(function (f, i) {
        return { label: f[1], backgroundColor: seriesColor(i), borderColor: css('--surface'), borderWidth: { right: 1 }, borderSkipped: false, barPercentage: 0.75,
          data: top.map(function (id) { return brandTot[id] ? 100 * (bf[id + '|' + f[0]] || 0) / brandTot[id] : 0; }) };
      }) }
    });

    // by region
    loadRegionGroups().then(function (groups) {
      var gt = groupTotals(groups, 'f', months, cats);
      var ro = baseOptions();
      ro.indexAxis = 'y';
      ro.scales.x.stacked = true; ro.scales.y.stacked = true; ro.scales.x.max = 100;
      ro.scales.x.ticks.callback = function (v) { return v + '%'; };
      ro.scales.y.grid = { display: false };
      ro.interaction = { mode: 'index', intersect: false, axis: 'y' };
      ro.plugins.tooltip.callbacks.label = function (c) { return ' ' + c.dataset.label + ': ' + c.raw.toFixed(1) + '%'; };
      if (charts.fuelRegion) charts.fuelRegion.destroy();
      charts.fuelRegion = new Chart(document.getElementById('fuelRegionChart'), {
        type: 'bar', options: ro,
        data: { labels: REGION_GROUPS.map(function (r) { return r[1]; }), datasets: FUELS.map(function (f, i) {
          return { label: f[1], backgroundColor: seriesColor(i), borderColor: css('--surface'), borderWidth: { right: 1 }, borderSkipped: false, barPercentage: 0.75,
            data: REGION_GROUPS.map(function (r) { var t = sumValues(gt[r[0]]); return t ? 100 * (gt[r[0]][f[0]] || 0) / t : 0; }) };
        }) }
      });
    });
  }

  // ---------- detail pages (brand, model, compare) follow the shared filters ----------
  // Units, share and rank of one brand or model within the selected area, months and categories.
  function standing(idx, kind, id, months, cats) {
    var cur = sumById(idx, kind, months, cats), total = sumValues(sumById(idx, 'b', months, cats));
    var ids = sortedIds(cur), pm = months.map(function (p) { return shiftMonth(p, -12); });
    var prevOk = pm.every(function (p) { return D.okSet[p]; });
    var prev = prevOk ? sumById(idx, kind, pm, cats) : null;
    return {
      units: cur[id] || 0, total: total, share: total ? 100 * (cur[id] || 0) / total : 0,
      rank: cur[id] ? ids.indexOf(id) + 1 : null, of: ids.length,
      prev: prev ? prev[id] || 0 : null,
      prevRank: prev && prev[id] ? sortedIds(prev).indexOf(id) + 1 : null,
      yoy: prev && prev[id] ? 100 * ((cur[id] || 0) - prev[id]) / prev[id] : null
    };
  }
  function seriesFor(idx, kind, id, b, cats) {
    return b.order.map(function (k) { return sumById(idx, kind, b.months[k], cats)[id] || 0; });
  }
  function prevSeriesFor(idx, kind, id, b, cats) {
    return b.order.map(function (k) {
      var pm = b.months[k].map(function (p) { return shiftMonth(p, -12); });
      return pm.every(function (p) { return D.okSet[p]; }) ? sumById(idx, kind, pm, cats)[id] || 0 : null;
    });
  }
  function barsVsLastYear(key, root, title, name, labels, values, prev) {
    var c = card(title, name);
    var box = add(el('div', { class: 'chart-box' }), el('canvas', { 'aria-label': title + ' ' + name }));
    c.appendChild(box); root.appendChild(c);
    var o = baseOptions();
    o.scales.y.ticks.callback = kTicks;
    o.plugins.tooltip.callbacks.label = function (ctx) { return ctx.raw === null ? null : ' ' + ctx.dataset.label + ': ' + fmt(ctx.raw) + L(' คัน'); };
    charts[key] = new Chart(box.firstChild, {
      data: { labels: labels, datasets: [
        { type: 'bar', label: name, data: values, backgroundColor: css('--accent'), borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'start', maxBarThickness: 34, order: 2 },
        { type: 'line', label: L('ช่วงเดียวกันปีก่อน'), data: prev, borderColor: css('--ink-2'), backgroundColor: css('--ink-2'), borderDash: [5, 4], borderWidth: 2,
          pointRadius: labels.length > 26 ? 0 : 3, pointBackgroundColor: css('--surface'), spanGaps: false, order: 1 }
      ] },
      options: o
    });
  }
  function regionBreakdown(key, root, kind, id, name, months, cats) {
    var c = card(L('แยกตามภูมิภาค'), name, L('ช่วงเวลาและประเภทรถตามตัวกรอง แสดงทุกภูมิภาค · % คือส่วนแบ่งของ') + name + L('ในตลาดภาคนั้น'));
    var box = add(el('div', { class: 'chart-box' }), el('canvas', { 'aria-label': L('ยอดจดทะเบียนของ ') + name + L(' แยกตามภูมิภาค') }));
    c.appendChild(box); root.appendChild(c);
    loadRegionGroups().then(function (groups) {
      var gt = groupTotals(groups, kind, months, cats), bt = groupTotals(groups, 'b', months, cats);
      var vals = REGION_GROUPS.map(function (r) { return gt[r[0]][id] || 0; });
      var shares = REGION_GROUPS.map(function (r, i) { var t = sumValues(bt[r[0]]); return t ? 100 * vals[i] / t : 0; });
      if (!box.isConnected) return;
      hbar(key, box.firstChild, REGION_GROUPS.map(function (r) { return r[1]; }), vals,
        vals.map(function (v, i) { return fmt(v) + L(' คัน · ') + shares[i].toFixed(1) + '%'; }), null,
        vals.map(function (v, i) { return fmt(v) + ' · ' + shares[i].toFixed(1) + '%'; }));
    });
  }
  function rankText(s, what) {
    if (!s.rank) return L('ไม่มียอดในตัวกรองนี้');
    var t = L('อันดับ ') + s.rank + L(' จาก ') + s.of + ' ' + what;
    if (s.prevRank) t += s.prevRank === s.rank ? L(' (เท่าปีก่อน)') : L(' (ปีก่อน ') + s.prevRank + ')';
    return t;
  }

  // ---------- brand page ----------
  function renderBrand(root, brandId, idx) {
    if (!D.brandName[brandId]) { notFound(root, L('ไม่พบยี่ห้อ ') + brandId); return; }
    var name = brandLabel(brandId), months = selectedMonths(), cats = selCats(), b = buckets(), area = areaLabel(M.area);
    add(root, crumbs([[name]]), el('h2', { class: 'page-title' }, name), el('p', { class: 'note filter-echo' }, filterText()));
    var s = standing(idx, 'b', brandId, months, cats);
    var models = Object.keys(D.modelInfo).filter(function (id) { return D.modelInfo[id].brand_id === brandId; });
    var mUnits = sumById(idx, 'm', months, cats), active = models.filter(function (id) { return mUnits[id]; });
    var last = months[months.length - 1], lastV = sumById(idx, 'b', [last], cats)[brandId] || 0;
    add(root, add(el('section', { class: 'tiles' }),
      tile(L('ยอดจดทะเบียน · ') + area, fmt(s.units) + L(' คัน'), monthLabel(months[0]) + ' – ' + monthLabel(last) + (s.yoy === null ? '' : ' · YoY ' + pctText(s.yoy))),
      tile(L('ส่วนแบ่งตลาด'), s.share.toFixed(1) + '%', rankText(s, L('ยี่ห้อ', 'brands'))),
      tile(L('เดือนล่าสุด · ') + monthLabel(last, true), fmt(lastV) + L(' คัน'), ''),
      tile(L('รุ่นที่มียอด'), active.length + L(' รุ่น'), L('ที่จับคู่ชื่อได้ในตัวกรองนี้'))));

    barsVsLastYear('d-brand', root, L('ยอดจดทะเบียน'), name, b.labels, seriesFor(idx, 'b', brandId, b, cats), prevSeriesFor(idx, 'b', brandId, b, cats));

    // powertrain mix of this brand
    var fc = card(L('ชนิดเชื้อเพลิง'), name, L('จากไฟล์ยี่ห้อ × ชนิดเชื้อเพลิงของกรมฯ'));
    var fbox = add(el('div', { class: 'chart-box' }), el('canvas', { 'aria-label': L('ยอดจดทะเบียนของ ') + name + L(' ตามชนิดเชื้อเพลิง') }));
    fc.appendChild(fbox); root.appendChild(fc);
    var fo = baseOptions();
    fo.scales.x.stacked = true; fo.scales.y.stacked = true; fo.scales.y.ticks.callback = kTicks;
    fo.plugins.tooltip.callbacks.label = function (ctx) { return ctx.raw ? ' ' + ctx.dataset.label + ': ' + fmt(ctx.raw) + L(' คัน') : null; };
    charts['d-brandFuel'] = new Chart(fbox.firstChild, {
      type: 'bar', options: fo,
      data: { labels: b.labels, datasets: FUELS.map(function (f, i) {
        return { label: f[1], backgroundColor: seriesColor(i), borderColor: css('--surface'), borderWidth: { top: 1 }, borderSkipped: 'start', maxBarThickness: 34,
          data: seriesFor(idx, 'bf', brandId + '|' + f[0], b, cats) };
      }).filter(function (d) { return d.data.some(function (v) { return v; }); }) }
    });

    regionBreakdown('d-brandRegion', root, 'b', brandId, name, months, cats);

    // models table with compare checkboxes
    var mc = card(L('รุ่นของ ') + name, 'Models', L('ยอดในช่วงและพื้นที่ที่เลือก · กดชื่อรุ่นเพื่อดูรายละเอียด · เลือก 2–') + MAX_COMPARE + L(' รุ่นเพื่อเปรียบเทียบ'));
    var cmp = el('a', { class: 'btn', href: '#/compare/' }, L('เปรียบเทียบที่เลือก'));
    mc.head.appendChild(cmp);
    var wrap = el('div', { class: 'table-wrap' });
    mc.appendChild(wrap); root.appendChild(mc);
    var picked = [], allRank = sortedIds(mUnits), pm = months.map(function (p) { return shiftMonth(p, -12); });
    var prev = pm.every(function (p) { return D.okSet[p]; }) ? sumById(idx, 'm', pm, cats) : null;
    function updateCompare() {
      cmp.setAttribute('href', '#/compare/' + picked.join(',') + filterQuery());
      cmp.textContent = L('เปรียบเทียบที่เลือก (') + picked.length + ')';
      cmp.classList.toggle('disabled', picked.length < 2);
    }
    var trs = active.sort(function (a, c) { return mUnits[c] - mUnits[a]; }).map(function (id) {
      var tr = el('tr'), cb = el('input', { type: 'checkbox', 'aria-label': L('เลือก ') + modelName(id) + L(' เพื่อเปรียบเทียบ') });
      cb.addEventListener('change', function () {
        if (cb.checked) { if (picked.length >= MAX_COMPARE) { cb.checked = false; return; } picked.push(id); }
        else picked.splice(picked.indexOf(id), 1);
        updateCompare();
      });
      add(tr, add(el('td'), cb), add(el('td', { class: 'name' }), link('#/model/' + id + filterQuery(), modelName(id))),
        el('td', { class: 'n' }, fmt(mUnits[id])), el('td', { class: 'n' }, s.units ? (100 * mUnits[id] / s.units).toFixed(1) + '%' : '—'),
        el('td', { class: 'n' }, String(allRank.indexOf(id) + 1)),
        pctCell(prev && prev[id] ? (100 * (mUnits[id] - prev[id]) / prev[id]).toFixed(2) : ''), el('td', { class: 'n' }, rangeText(priceRange(id))));
      return tr;
    });
    wrap.appendChild(trs.length ? table([['', 0], [L('รุ่น')], [L('คัน'), 1], [L('% ของยี่ห้อ'), 1], [L('อันดับรุ่น'), 1], ['YoY', 1], [L('ราคา (ทางการ)'), 1]], trs)
      : el('p', { class: 'note' }, L('ไม่มียอดจดทะเบียนของรุ่นที่จับคู่ได้ในตัวกรองนี้')));
    updateCompare();

    var totals = b.order.map(function (k) { return sumValues(sumById(idx, 'b', b.months[k], cats)); });
    var cache = {};
    makeTrend(root, {
      key: 'd-brandModels', title: L('เทรนด์รายรุ่นของ ') + name, subtitle: 'Model trend', nameOf: modelName,
      href: function (id) { return '#/model/' + id + filterQuery(); },
      options: function () { return models.map(function (id) { return { id: id, label: modelName(id) }; }).sort(function (a, c) { return a.label.localeCompare(c.label); }); },
      labels: function () { return b.labels; },
      values: function (id, mode) {
        cache[id] = cache[id] || seriesFor(idx, 'm', id, b, cats);
        return mode === 'units' ? cache[id] : cache[id].map(function (v, i) { return totals[i] ? +(100 * v / totals[i]).toFixed(2) : 0; });
      },
      defaults: function () { return active.slice(0, 5); }
    });
  }

  // ---------- model page ----------
  function renderModel(root, modelId, idx) {
    var info = D.modelInfo[modelId];
    if (!info) { notFound(root, L('ไม่พบรุ่น ') + modelId); return; }
    var name = modelName(modelId), months = selectedMonths(), cats = selCats(), b = buckets(), area = areaLabel(M.area);
    add(root, crumbs([[brandLabel(info.brand_id), '#/brand/' + info.brand_id + filterQuery()], [info.name]]), el('h2', { class: 'page-title' }, name),
      el('p', { class: 'note filter-echo' }, filterText()));
    var s = standing(idx, 'm', modelId, months, cats), brandUnits = sumById(idx, 'b', months, cats)[info.brand_id] || 0;
    var range = priceRange(modelId), last = months[months.length - 1];
    add(root, add(el('section', { class: 'tiles' }),
      tile(L('ยอดจดทะเบียน · ') + area, fmt(s.units) + L(' คัน'), monthLabel(months[0]) + ' – ' + monthLabel(last) + (s.yoy === null ? '' : ' · YoY ' + pctText(s.yoy))),
      tile(L('ส่วนแบ่งตลาด'), s.share.toFixed(2) + '%', rankText(s, L('รุ่น', 'models'))),
      tile(L('สัดส่วนในยี่ห้อ'), brandUnits ? (100 * s.units / brandUnits).toFixed(1) + '%' : '—', L('ของยอด ') + brandLabel(info.brand_id)),
      tile(L('ราคา (เว็บไซต์ทางการ)'), range ? rangeText(range) : L('ยังไม่มีข้อมูล'), range ? range[2] + L(' รุ่นย่อย') : L('ช่วยเพิ่มได้ที่ GitHub'))));
    root.appendChild(add(el('div', { class: 'controls' }), link('#/compare/' + modelId + filterQuery(), L('เปรียบเทียบกับรุ่นอื่น →'), 'btn')));

    var totals = b.order.map(function (k) { return sumValues(sumById(idx, 'b', b.months[k], cats)); }), cache = {};
    makeTrend(root, {
      key: 'd-model', title: L('ยอดจดทะเบียน'), subtitle: L('เพิ่มรุ่นอื่นเพื่อเปรียบเทียบ'), nameOf: modelName,
      href: function (id) { return '#/model/' + id + filterQuery(); }, options: modelOptions(),
      labels: function () { return b.labels; },
      values: function (id, mode) {
        cache[id] = cache[id] || seriesFor(idx, 'm', id, b, cats);
        return mode === 'units' ? cache[id] : cache[id].map(function (v, i) { return totals[i] ? +(100 * v / totals[i]).toFixed(2) : 0; });
      },
      defaults: function () { return [modelId]; },
      note: L('ตามตัวกรองด้านบน · ยอดจดทะเบียนใหม่ ไม่ใช่ยอดขาย · ค้นหาเพื่อเพิ่มรุ่นอื่นลงกราฟเดียวกัน')
    });

    regionBreakdown('d-modelRegion', root, 'm', modelId, name, months, cats);
    renderPrices(root, modelId);

    var vc = card(L('ชื่อรุ่นย่อยตามที่กรมฯ บันทึก'), monthLabel(months[0]) + ' – ' + monthLabel(last) + L(' · ทั้งประเทศ'),
      L('เป็นชื่อในทะเบียนรถของกรมการขนส่งทางบก ไม่ใช่ชื่อรุ่นย่อยทางการของค่ายรถเสมอไป บางค่ายแจ้งเฉพาะชื่อรุ่น · ตารางนี้เป็นยอดทั้งประเทศเสมอ'));
    var vbox = el('div', { class: 'table-wrap' }, L('กำลังโหลด…'));
    vc.appendChild(vbox); root.appendChild(vc);
    loadVariants().then(function () {
      var agg = {};
      (D.variantsBy[modelId] || []).forEach(function (v) {
        if (months.indexOf(v.period) < 0 || cats.indexOf(v.category) < 0) return;
        var k = v.category + '|' + v.variant;
        agg[k] = agg[k] || { category: v.category, variant: v.variant, units: 0, last: v.period };
        agg[k].units += +v.units;
        if (v.period > agg[k].last) agg[k].last = v.period;
      });
      var list = Object.keys(agg).map(function (k) { return agg[k]; }).sort(function (a, c) { return c.units - a.units; });
      var total = list.reduce(function (t, x) { return t + x.units; }, 0);
      vbox.textContent = '';
      vbox.appendChild(list.length ? table([[L('ชื่อในทะเบียน')], [L('ประเภท')], [L('คัน'), 1], [L('สัดส่วน'), 1], [L('เดือนล่าสุดที่มี'), 1]], list.map(function (x) {
        return add(el('tr'), el('td', {}, x.variant || L('(ว่าง)')), el('td', {}, CAT_LABEL[x.category] || x.category),
          el('td', { class: 'n' }, fmt(x.units)), el('td', { class: 'n' }, (100 * x.units / total).toFixed(1) + '%'),
          el('td', { class: 'n' }, monthLabel(x.last)));
      })) : el('p', { class: 'note' }, L('ไม่มีการจดทะเบียนในช่วงที่เลือก')));
    });
  }

  function renderPrices(root, modelId) {
    var pc = card(L('ราคา'), 'Price', L('ราคาที่แสดงบนเว็บไซต์ทางการของค่ายรถ ณ วันที่บันทึก ราคาจริงอาจต่างตามโปรโมชันและตัวแทนจำหน่าย'));
    root.appendChild(pc);
    var all = (D.pricesBy[modelId] || []).slice();
    if (!all.length) {
      pc.appendChild(add(el('p', { class: 'note' }, L('ยังไม่มีข้อมูลราคาที่ยืนยันจากเว็บไซต์ทางการสำหรับรุ่นนี้ ')),
        link('https://github.com/sunJirapath/thai-auto-data/issues', L('ส่งข้อมูลราคาพร้อมลิงก์แหล่งที่มา'))));
      return;
    }
    var cur = currentPrices(modelId);
    pc.appendChild(el('h3', {}, L('ราคาปัจจุบัน')));
    pc.appendChild(add(el('div', { class: 'table-wrap' }), table([[L('รุ่นย่อย')], [L('ประเภท')], [L('ราคา'), 1], [L('ข้อมูล ณ'), 1], [L('แหล่งที่มา')]], cur.map(function (p) {
      return add(el('tr'), el('td', {}, p.variant), el('td', {}, p.price_type === 'list' ? L('ราคาบนเว็บ') : L('โปรโมชัน ถึง ') + dateLabel(p.effective_to)),
        el('td', { class: 'n' }, baht(p.price_thb)), el('td', { class: 'n' }, dateLabel(p.published_on || p.observed_on)),
        add(el('td'), link(p.source_url, p.source_publisher)));
    }))));

    // history: every observation, oldest first, with change vs the previous one for the same variant and type
    all.sort(function (a, b) { return priceDate(a).localeCompare(priceDate(b)) || a.variant.localeCompare(b.variant); });
    var prev = {};
    var rows = all.map(function (p) {
      var k = p.price_type + '|' + p.variant, d = prev[k] !== undefined ? +p.price_thb - prev[k] : null;
      prev[k] = +p.price_thb;
      return add(el('tr'), el('td', {}, dateLabel(priceDate(p))), el('td', {}, p.variant),
        el('td', {}, p.price_type === 'list' ? L('ราคาบนเว็บ') : L('โปรโมชัน')),
        el('td', { class: 'n' }, baht(p.price_thb)),
        el('td', { class: 'n ' + (d > 0 ? 'down' : d < 0 ? 'up' : 'na') }, d === null ? '—' : d === 0 ? L('เท่าเดิม') : (d > 0 ? '+' : '−') + fmt(Math.abs(d))),
        add(el('td'), link(p.source_url, p.source_publisher)));
    }).reverse();
    var det = add(el('details'), el('summary', {}, L('ประวัติราคาทั้งหมด (') + all.length + L(' รายการ)')),
      add(el('div', { class: 'table-wrap' }), table([[L('วันที่')], [L('รุ่นย่อย')], [L('ประเภท')], [L('ราคา'), 1], [L('เปลี่ยนแปลง'), 1], [L('แหล่งที่มา')]], rows)),
      el('p', { class: 'note' }, L('วันที่คือวันที่มีผลหรือวันที่เผยแพร่ตามแหล่งที่มา ถ้าไม่ระบุใช้วันที่เราบันทึก ประวัติเริ่มจากวันที่เราเริ่มเก็บ จึงไม่ครบย้อนหลัง')));
    pc.appendChild(det);
  }

  // ---------- compare page ----------
  function renderCompare(root, ids, idx) {
    ids = ids.filter(function (id) { return D.modelInfo[id]; }).slice(0, MAX_COMPARE);
    add(root, crumbs([[L('เปรียบเทียบรุ่น')]]), el('h2', { class: 'page-title' }, L('เปรียบเทียบรุ่น')), el('p', { class: 'note filter-echo' }, filterText()));
    var pick = card(L('เลือกรุ่น'), L('สูงสุด ') + MAX_COMPARE + L(' รุ่น'), L('ค้นหาแล้วกดเลือก ยอดทั้งหมดเป็นยอดจดทะเบียนใหม่จากกรมการขนส่งทางบก ไม่ใช่ยอดขาย'));
    var input = el('input', { type: 'search', placeholder: L('ค้นหารุ่น…'), list: 'cmpList', id: 'cmpSearch', 'aria-label': L('ค้นหารุ่นเพื่อเปรียบเทียบ') });
    var dl = el('datalist', { id: 'cmpList' });
    modelOptions()().forEach(function (o) { dl.appendChild(el('option', { value: o.label })); });
    var chips = el('div', { class: 'chips' });
    ids.forEach(function (id, i) {
      var chip = el('span', { class: 'chip' }), dot = el('i');
      dot.style.background = seriesColor(i);
      var x = el('button', { type: 'button', 'aria-label': L('ลบ ') + modelName(id) }, '×');
      x.addEventListener('click', function () { location.hash = '#/compare/' + ids.filter(function (y) { return y !== id; }).join(',') + filterQuery(); });
      chips.appendChild(add(chip, dot, link('#/model/' + id + filterQuery(), modelName(id), 'chip-link'), x));
    });
    input.addEventListener('change', function () {
      var hit = modelOptions()().filter(function (o) { return o.label === input.value; })[0];
      if (hit && ids.indexOf(hit.id) < 0 && ids.length < MAX_COMPARE) location.hash = '#/compare/' + ids.concat([hit.id]).join(',') + filterQuery();
    });
    add(pick.head, add(el('div', { class: 'controls' }), input, dl));
    pick.appendChild(chips);
    root.appendChild(pick);
    if (!ids.length) { pick.appendChild(el('p', { class: 'note' }, L('ยังไม่ได้เลือกรุ่น'))); return; }

    // side-by-side table for the selected months, categories and area
    var months = selectedMonths(), cats = selCats(), b = buckets(), st = {};
    ids.forEach(function (id) { st[id] = standing(idx, 'm', id, months, cats); });
    var span = monthLabel(months[0]) + '–' + monthLabel(months[months.length - 1]);
    var metrics = [
      [L('ยี่ห้อ'), function (id) { return link('#/brand/' + D.modelInfo[id].brand_id + filterQuery(), brandLabel(D.modelInfo[id].brand_id)); }],
      [L('ยอดจดทะเบียน ') + span, function (id) { return fmt(st[id].units) + L(' คัน'); }, function (id) { return st[id].units; }],
      [L('อันดับรุ่น'), function (id) { return st[id].rank ? st[id].rank + L(' จาก ') + st[id].of : '—'; }, function (id) { return st[id].rank ? -st[id].rank : null; }],
      [L('ส่วนแบ่งตลาด'), function (id) { return st[id].share.toFixed(2) + '%'; }],
      [L('ช่วงเดียวกันปีก่อน'), function (id) { return st[id].prev === null ? '—' : fmt(st[id].prev) + L(' คัน'); }],
      ['YoY', function (id) { return st[id].yoy === null ? '—' : pctText(st[id].yoy); }, function (id) { return st[id].yoy; }],
      [L('เฉลี่ยต่อเดือน'), function (id) { return fmt(Math.round(st[id].units / months.length)) + L(' คัน'); }],
      [L('ราคาต่ำสุด (เว็บไซต์ทางการ)'), function (id) { var r = priceRange(id); return r ? baht(r[0]) : L('ยังไม่มีข้อมูล'); }, function (id) { var r = priceRange(id); return r ? -r[0] : null; }],
      [L('ราคาสูงสุด'), function (id) { var r = priceRange(id); return r ? baht(r[1]) : L('ยังไม่มีข้อมูล'); }],
      [L('จำนวนรุ่นย่อยที่มีราคา'), function (id) { var r = priceRange(id); return r ? String(r[2]) : '—'; }]
    ];
    var tc = card(L('ตารางเปรียบเทียบ'), areaLabel(M.area) + ' · ' + span, L('ค่าที่ดีที่สุดในแถวที่เปรียบเทียบได้ถูกเน้นไว้ ข้อมูลที่ไม่มีไม่ถือว่าเป็นศูนย์'));
    var head = [['']].concat(ids.map(function (id) { return [modelName(id)]; }));
    var trs = metrics.map(function (m) {
      var tr = el('tr'), best = null;
      if (m[2]) {
        var vals = ids.map(m[2]).filter(function (v) { return v !== null; });
        if (vals.length > 1) best = Math.max.apply(null, vals);
      }
      tr.appendChild(el('th', { scope: 'row' }, m[0]));
      ids.forEach(function (id) {
        var v = m[1](id), td = el('td', { class: m[2] && best !== null && m[2](id) === best ? 'best' : '' });
        if (typeof v === 'string') td.textContent = v; else td.appendChild(v);
        tr.appendChild(td);
      });
      return tr;
    });
    var t = table(head, trs);
    t.classList.add('compare');
    tc.appendChild(add(el('div', { class: 'table-wrap' }), t));
    root.appendChild(tc);

    // registrations over the selected range
    var rc = card(L('ยอดจดทะเบียน'), L('เปรียบเทียบ · ') + areaLabel(M.area));
    var rbox = add(el('div', { class: 'chart-box' }), el('canvas', { 'aria-label': L('กราฟเปรียบเทียบยอดจดทะเบียน') }));
    rc.appendChild(rbox); root.appendChild(rc);
    var opt = baseOptions();
    opt.plugins.legend.display = ids.length > 1;
    opt.scales.y.ticks.callback = kTicks;
    opt.plugins.tooltip.callbacks.label = function (ctx) { return ' ' + ctx.dataset.label + ': ' + fmt(ctx.raw) + L(' คัน'); };
    charts['d-cmp'] = new Chart(rbox.firstChild, {
      type: 'line', options: opt,
      data: { labels: b.labels, datasets: ids.map(function (id, i) {
        return { label: modelName(id), borderColor: seriesColor(i), backgroundColor: seriesColor(i), borderWidth: 2,
          pointRadius: b.order.length > 24 ? 0 : 3, pointHoverRadius: 5, tension: 0.2, data: seriesFor(idx, 'm', id, b, cats) };
      }) }
    });

    regionCompare(root, ids, months, cats);

    // price ranges as floating bars (one axis: baht)
    var priced = ids.filter(function (id) { return priceRange(id); });
    var pc = card(L('ช่วงราคา', 'Price range'), L('ราคาบนเว็บไซต์ทางการ'), priced.length ? L('แท่งคือช่วงราคาต่ำสุดถึงสูงสุดของรุ่นย่อยที่มีข้อมูล') : L('รุ่นที่เลือกยังไม่มีข้อมูลราคาที่ยืนยัน'));
    root.appendChild(pc);
    if (priced.length) {
      var pbox = add(el('div', { class: 'chart-box' }), el('canvas', { 'aria-label': L('ช่วงราคาของรุ่นที่เลือก') }));
      pbox.style.height = (70 + 48 * priced.length) + 'px';
      pc.appendChild(pbox);
      var po = baseOptions();
      po.indexAxis = 'y';
      po.interaction = { mode: 'nearest', intersect: true };
      po.plugins.legend.display = false;
      po.scales.x.grid = { color: css('--grid') }; po.scales.x.beginAtZero = false;
      po.scales.x.ticks.callback = function (v) { return L('฿') + (v / 1000) + 'k'; };
      po.scales.y.grid = { display: false }; po.scales.y.beginAtZero = false;
      po.plugins.tooltip.callbacks.label = function (ctx) { return ' ' + rangeText(priceRange(priced[ctx.dataIndex])); };
      charts['d-price'] = new Chart(pbox.firstChild, {
        type: 'bar', options: po,
        data: {
          labels: priced.map(modelName),
          datasets: [{ data: priced.map(function (id) { var r = priceRange(id); return r[0] === r[1] ? [r[0] - 2000, r[1] + 2000] : [r[0], r[1]]; }),
            backgroundColor: priced.map(function (id) { return seriesColor(ids.indexOf(id)); }), borderRadius: 4, borderSkipped: false, maxBarThickness: 22 }]
        }
      });
      priced.forEach(function (id) {
        pc.appendChild(add(el('details'), el('summary', {}, L('ราคารุ่นย่อย ') + modelName(id)),
          add(el('div', { class: 'table-wrap' }), table([[L('รุ่นย่อย')], [L('ราคา'), 1], [L('แหล่งที่มา')]], currentPrices(id).filter(function (p) { return p.price_type === 'list'; }).map(function (p) {
            return add(el('tr'), el('td', {}, p.variant), el('td', { class: 'n' }, baht(p.price_thb)), add(el('td'), link(p.source_url, p.source_publisher + ' · ' + dateLabel(p.observed_on))));
          })))));
      });
    }
  }

  function regionCompare(root, ids, months, cats) {
    var c = card(L('ส่วนแบ่งแยกตามภูมิภาค'), L('เปรียบเทียบ'), L('ส่วนแบ่งของแต่ละรุ่นในตลาดของแต่ละภาค ช่วงเวลาและประเภทรถตามตัวกรอง แสดงทุกภูมิภาค'));
    var box = add(el('div', { class: 'chart-box tall' }), el('canvas', { 'aria-label': L('ส่วนแบ่งของรุ่นที่เลือกในแต่ละภูมิภาค') }));
    c.appendChild(box); root.appendChild(c);
    loadRegionGroups().then(function (groups) {
      if (!box.isConnected) return;
      var gt = groupTotals(groups, 'm', months, cats), bt = groupTotals(groups, 'b', months, cats);
      var o = baseOptions();
      o.indexAxis = 'y';
      o.scales.x.ticks.callback = function (v) { return v + '%'; };
      o.scales.y.grid = { display: false };
      o.interaction = { mode: 'index', intersect: false, axis: 'y' };
      o.plugins.tooltip.callbacks.label = function (ctx) { return ' ' + ctx.dataset.label + ': ' + ctx.raw.toFixed(2) + '%'; };
      charts['d-cmpRegion'] = new Chart(box.firstChild, {
        type: 'bar', options: o,
        data: { labels: REGION_GROUPS.map(function (r) { return r[1]; }), datasets: ids.map(function (id, i) {
          return { label: modelName(id), backgroundColor: seriesColor(i), borderRadius: 3, borderSkipped: 'start', barPercentage: 0.85,
            data: REGION_GROUPS.map(function (r) { var tt = sumValues(bt[r[0]]); return tt ? 100 * (gt[r[0]][id] || 0) / tt : 0; }) };
        }) }
      });
    });
  }

  function notFound(root, msg) {
    add(root, crumbs([[msg]]), add(el('section', { class: 'card' }), el('p', {}, msg),
      el('p', { class: 'note' }, L('ลิงก์อาจเก่าหรือพิมพ์ผิด ลองดูจากหน้าอันดับ')), link('#/ranking' + filterQuery(), L('ไปหน้าอันดับ'), 'btn')));
  }
  function crumbs(items) {
    var nav = el('nav', { class: 'crumbs', 'aria-label': 'breadcrumb' });
    nav.appendChild(link('#/', L('หน้าแรก')));
    items.forEach(function (it) {
      nav.appendChild(el('span', { 'aria-hidden': 'true' }, ' / '));
      nav.appendChild(it[1] ? link(it[1], it[0]) : el('span', { 'aria-current': 'page' }, it[0]));
    });
    return nav;
  }

  var variantsPromise = null;
  function loadVariants() {
    if (!variantsPromise) {
      variantsPromise = load('summaries/variant_monthly.csv').then(function (rows) {
        D.variantsBy = {};
        rows.forEach(function (v) { (D.variantsBy[v.model_id] = D.variantsBy[v.model_id] || []).push(v); });
      });
    }
    return variantsPromise;
  }

  // ---------- router ----------
  var PAGES = ['overview', 'ranking', 'trends', 'powertrain', 'origin', 'regions', 'seasonality', 'prices', 'launches', 'data'];
  function route() {
    var h = location.hash || '#/';
    if (h.indexOf('#/') !== 0) return;   // in-page anchors such as #cite
    var parts = h.slice(2).split('?'), path = parts[0].replace(/\/$/, '');
    buildControlsOnce();
    if (parts.length > 1) { applyQuery(parts[1]); D.controlsBuilt = false; buildControlsOnce(); }
    var m = path.match(/^(brand|model|compare)(?:\/(.*))?$/), page;
    if (m) { page = m[1]; D.detailArg = decodeURIComponent(m[2] || ''); }
    else page = PAGES.indexOf(path || 'overview') >= 0 ? path || 'overview' : 'overview';
    var changed = page !== D.page || (m && D.lastArg !== D.detailArg);
    D.page = page; D.lastArg = D.detailArg;
    destroyCharts('d-');
    document.querySelectorAll('[data-page]').forEach(function (sec) { sec.hidden = true; });
    var detail = document.getElementById('detail');
    detail.hidden = !m;
    if (!m) detail.textContent = '';
    document.querySelectorAll('[data-page~="' + page + '"]').forEach(function (sec) { sec.hidden = false; });
    document.getElementById('filterbar').hidden = page === 'data' || page === 'seasonality';
    setNav(page === 'brand' || page === 'model' ? '' : page);
    var title = document.querySelector('.tabs a[data-nav="' + page + '"]');
    if (!m) document.title = (page === 'overview' ? L('ตลาดรถยนต์ไทย') : title ? title.textContent : L('ตลาดรถยนต์ไทย')) + ' · thai-auto-data';
    renderExplorer();
    if (changed) window.scrollTo(0, 0);
  }
  function setNav(page) {
    document.querySelectorAll('.tabs a').forEach(function (a) {
      if (a.getAttribute('data-nav') === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  // ---------- boot ----------
  translateStatic();
  document.querySelectorAll('[data-lang]').forEach(function (a) {
    if (a.getAttribute('data-lang') === LANG) a.setAttribute('aria-current', 'true');
    a.addEventListener('click', function (e) { e.preventDefault(); if (a.getAttribute('data-lang') !== LANG) setLang(a.getAttribute('data-lang')); });
  });
  Promise.all([
    load('summaries/market_monthly.csv'), load('summaries/brand_monthly.csv'), load('summaries/model_monthly.csv'),
    load('data/brands.csv'), load('data/models.csv'), load('data/prices.csv'),
    load('summaries/province_monthly.csv'), load('data/provinces.csv'), load('data/population.csv'),
    fetch('site/th-provinces.geojson').then(function (r) { if (!r.ok) throw new Error('site/th-provinces.geojson'); return r.json(); })
  ]).then(function (res) {
    D.provBy = {};
    res[6].forEach(function (r) { var p = D.provBy[r.period] = D.provBy[r.period] || {}; (p[r.province_iso] = p[r.province_iso] || {})[r.category] = +r.units; });
    D.provinceInfo = {}; D.regionName = {};
    res[7].forEach(function (p) { D.provinceInfo[p.province_iso] = p; D.regionName[p.region] = LANG === 'en' ? REGION_EN[p.region] : p.region_th; });
    D.map = prepareMap(res[9]);
    D.population = {}; res[8].forEach(function (p) { D.population[p.province_iso] = +p.population; D.populationAsOf = p.as_of; });
    D.market = res[0]; D.brand = res[1]; D.model = res[2];
    D.okSet = {}; D.marketBy = {};
    D.market.forEach(function (r) { D.marketBy[r.period] = r; if (r.status === 'ok') D.okSet[r.period] = true; });
    D.brandName = {}; D.brandCountry = {};
    res[3].forEach(function (b) { D.brandName[b.brand_id] = b.name; D.brandCountry[b.brand_id] = b.parent_country; });
    D.modelInfo = {}; res[4].forEach(function (m) { D.modelInfo[m.model_id] = m; });
    D.pricesBy = {}; res[5].forEach(function (p) { (D.pricesBy[p.model_id] = D.pricesBy[p.model_id] || []).push(p); });
    D.brandRows = index(D.brand, 'brand_id'); D.modelRows = index(D.model, 'model_id');
    D.statusText = L('ข้อมูลล่าสุด: ') + monthLabel(lastOk(), true) + L(' · แหล่งข้อมูล: กรมการขนส่งทางบก');
    document.getElementById('status').textContent = D.statusText;
    window.addEventListener('hashchange', route);
    route();
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function () { renderExplorer(); });
  }).catch(function (e) {
    var st = document.getElementById('status');
    st.className = 'status error';
    st.textContent = L('โหลดข้อมูลไม่สำเร็จ: ') + e.message + L(' (เปิดผ่าน GitHub Pages หรือ local web server ไม่ใช่ไฟล์ตรงๆ)');
    console.error(e);
  });

  document.getElementById('shareLink').addEventListener('click', function () {
    var b = this, url = location.href;
    function done() { b.textContent = L('คัดลอกลิงก์แล้ว'); setTimeout(function () { b.textContent = L('คัดลอกลิงก์มุมมองนี้'); }, 2000); }
    if (!navigator.clipboard) { window.prompt(L('คัดลอกลิงก์นี้'), url); return; }
    navigator.clipboard.writeText(url).then(done, function () { window.prompt(L('คัดลอกลิงก์นี้'), url); });
  });

  document.getElementById('copyCite').addEventListener('click', function () {
    var t = document.getElementById('citeText').textContent, b = this;
    navigator.clipboard.writeText(t).then(function () { b.textContent = L('คัดลอกแล้ว · Copied'); }, function () {
      var r = document.createRange(); r.selectNodeContents(document.getElementById('citeText'));
      var s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
  });
})();
