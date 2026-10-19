/* thai-auto-data dashboard: reads the CSVs in this repo directly, no build step.
   Routes: #/ (market), #/brand/<brand_id>, #/model/<model_id>, #/compare/<model_id>,..., #/compare/brands/<brand_id>,... */
(function () {
  'use strict';

  // ---------- language: English by default, Thai with ?lang=th or the saved choice ----------
  var LANG = (function () {
    var m = (location.hash || '').match(/[?&]lang=(th|en)\b/);
    if (m) return m[1];
    try { return localStorage.getItem('lang') === 'th' ? 'th' : 'en'; } catch (e) { return 'en'; }
  })();
  // L('English', 'ไทย'): English by default, the Thai text when the page is in Thai
  function L(en, th) { return LANG === 'th' && th !== undefined ? th : en; }
  function yearOf(ce) { return LANG === 'en' ? ce : ce + 543; }
  var REGION_EN = { central: 'Central', east: 'East', northeast: 'Northeast', north: 'North', west: 'West', south: 'South' };
  function provName(iso) { var p = D.provinceInfo[iso]; return LANG === 'en' ? p.name_en : p.name_th; }
  // The HTML is written in English. In Thai, its text and labels come from site/i18n-th.js (English -> Thai),
  // and each main heading keeps its English name as a small subtitle.
  function translateStatic() {
    document.documentElement.lang = LANG;
    if (LANG !== 'th') return;
    var T = window.TH || {};
    function th(s) { var k = s.replace(/\s+/g, ' ').trim(); return k && T[k] !== undefined ? T[k] : null; }
    var heads = Array.prototype.map.call(document.querySelectorAll('h1, h2'), function (h) { return [h, h.textContent.trim()]; });
    var walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n, nodes = [];
    while ((n = walk.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      if (/^(SCRIPT|STYLE|PRE|NOSCRIPT)$/.test(node.parentNode.nodeName)) return;
      var v = th(node.nodeValue);
      if (v !== null) node.nodeValue = node.nodeValue.match(/^\s*/)[0] + v + node.nodeValue.match(/\s*$/)[0];
    });
    document.querySelectorAll('[aria-label],[placeholder],[title]').forEach(function (e) {
      ['aria-label', 'placeholder', 'title'].forEach(function (a) {
        var v = e.getAttribute(a) && th(e.getAttribute(a));
        if (v) e.setAttribute(a, v);
      });
    });
    heads.forEach(function (h) {
      if (h[0].textContent.trim() !== h[1]) add(h[0], document.createTextNode(' '), el('span', { class: 'sub' }, h[1]));
    });
  }
  function setLang(lang) {
    try { localStorage.setItem('lang', lang); } catch (e) { /* private mode: the link still carries it */ }
    var h = location.hash || '#/', base = h.split('?')[0], q = (h.split('?')[1] || '').split('&').filter(function (kv) { return kv && kv.indexOf('lang=') !== 0; });
    if (lang === 'th') q.push('lang=th');
    history.replaceState(null, '', base + (q.length ? '?' + q.join('&') : ''));
    location.reload();
  }

  var TH_MONTHS = [L('Jan', 'ม.ค.'), L('Feb', 'ก.พ.'), L('Mar', 'มี.ค.'), L('Apr', 'เม.ย.'), L('May', 'พ.ค.'), L('Jun', 'มิ.ย.'), L('Jul', 'ก.ค.'), L('Aug', 'ส.ค.'), L('Sep', 'ก.ย.'), L('Oct', 'ต.ค.'), L('Nov', 'พ.ย.'), L('Dec', 'ธ.ค.')];
  var CATS = [['ry1', L('RY1 Private car, up to 7 seats', 'ร.ย.1 รถยนต์นั่งส่วนบุคคลไม่เกิน 7 คน')], ['ry2', L('RY2 Private car, more than 7 seats', 'ร.ย.2 รถยนต์นั่งส่วนบุคคลเกิน 7 คน')], ['ry3', L('RY3 Private van & pickup', 'ร.ย.3 รถยนต์บรรทุกส่วนบุคคล')]];
  var CAT_LABEL = { RY1: L('RY1', 'ร.ย.1'), RY2: L('RY2', 'ร.ย.2'), RY3: L('RY3', 'ร.ย.3') };
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
  function baht(n) { return '฿' + fmt(n); }
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
    if (v !== '' && v !== undefined && +v > 999) td.title = (+v).toFixed(1) + L('% (very small base last year)', '% (ฐานปีก่อนต่ำมาก)');
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
  function rangeText(r) { return r ? (r[0] === r[1] ? baht(r[0]) : baht(r[0]) + ' – ' + baht(r[1])) : L('No data yet', 'ยังไม่มีข้อมูล'); }

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
        legend: { position: 'bottom', labels: { color: css('--ink-2'), boxWidth: 8, boxHeight: 8, usePointStyle: true } },
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
  function fmtK(v) { return v >= 10000 ? (v / 1000).toFixed(v >= 100000 ? 0 : 1) + 'k' : fmt(v); }
  // change in a share, in percentage points; rounding to 0.0 reads "no change", never "-0.0"
  function ptsText(d) { var r = Math.round(d * 10) / 10; return r === 0 ? L('no change', 'ไม่เปลี่ยน') : (r > 0 ? '▲ +' : '▼ ') + r.toFixed(1) + L(' pts', ' จุด'); }
  function ptsClass(d) { var r = Math.round(d * 10) / 10; return r > 0 ? 'up' : r < 0 ? 'down' : ''; }
  // fuel colours mean something: electrified in cool colours (BEV, PHEV, HEV), combustion in warm and neutral ones
  function fuelColor(code) { return css('--f-' + code); }
  function wrapLabel(t, n) {   // a long name on two lines instead of cut off
    if (t.length <= n) return t;
    var cut = t.lastIndexOf(' ', n);
    if (cut < 4) cut = n;
    var rest = t.slice(cut).trim();
    return [t.slice(0, cut), rest.length > n + 2 ? rest.slice(0, n + 1) + '…' : rest];
  }

  // ---------- direct labels: read a chart without matching colours to a legend ----------
  function textWidth(t, font) { var c = textWidth.c || (textWidth.c = document.createElement('canvas').getContext('2d')); c.font = font; return c.measureText(t).width; }
  // a name after the last point of each line, nudged apart so they never overlap (halo keeps them readable over lines)
  var endLabels = {
    id: 'endLabels',
    afterDatasetsDraw: function (chart, args, opts) {
      if (!opts || !opts.on) return;
      var ctx = chart.ctx, area = chart.chartArea, items = [];
      chart.data.datasets.forEach(function (ds, i) {
        var meta = chart.getDatasetMeta(i);
        if (meta.hidden) return;
        for (var k = ds.data.length - 1; k >= 0; k--) {
          var v = ds.data[k], pt = meta.data[k];
          if (v !== null && v !== undefined && pt && isFinite(pt.y)) { items.push({ x: pt.x + 8, y: pt.y, text: ds.label, color: ds.borderColor }); break; }
        }
      });
      items.sort(function (a, b) { return a.y - b.y; });
      for (var i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < 13) items[i].y = items[i - 1].y + 13;
      var over = items.length ? items[items.length - 1].y - area.bottom : 0;
      if (over > 0) items.forEach(function (it) { it.y -= over; });
      ctx.save();
      ctx.font = opts.font; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      items.forEach(function (it) {
        ctx.strokeStyle = css('--surface'); ctx.lineWidth = 3; ctx.strokeText(it.text, it.x, it.y);
        ctx.fillStyle = it.color; ctx.fillText(it.text, it.x, it.y);
      });
      ctx.restore();
    }
  };
  // turns end labels on when the chart is wide enough; returns whether it did (the legend is then redundant)
  function withEndLabels(o, canvas, names) {
    if ((canvas.parentNode.clientWidth || 0) < 560) return false;
    var font = '600 11px ' + css('--font'), w = Math.max.apply(null, names.map(function (n) { return textWidth(n, font); }).concat([0]));
    o.plugins.endLabels = { on: true, font: font };
    o.layout = o.layout || {};
    o.layout.padding = Object.assign({}, o.layout.padding, { right: Math.min(170, Math.ceil(w) + 14) });
    return true;
  }
  // a 100% stacked area: each layer's name and latest share at the right edge, when the layer is tall enough
  var areaLabels = {
    id: 'areaLabels',
    afterDatasetsDraw: function (chart, args, opts) {
      if (!opts || !opts.on) return;
      var ctx = chart.ctx, area = chart.chartArea, below = area.bottom;
      ctx.save();
      ctx.font = '11px ' + css('--font'); ctx.textBaseline = 'middle';
      chart.data.datasets.forEach(function (ds, i) {
        var meta = chart.getDatasetMeta(i), pt = meta.data[meta.data.length - 1];
        if (!pt) return;
        var top = pt.y, v = ds.data[ds.data.length - 1], y = (top + below) / 2;
        if (below - top >= 12) {
          ctx.fillStyle = ds.backgroundColor; ctx.fillRect(area.right + 8, y - 4, 8, 8);
          ctx.fillStyle = css('--ink-2'); ctx.fillText(ds.label + ' ' + Math.round(v) + '%', area.right + 20, y);
        }
        below = top;
      });
      ctx.restore();
    }
  };
  // a horizontal 100% stacked bar: the share printed inside each segment wide enough to hold it
  var segLabels = {
    id: 'segLabels',
    afterDatasetsDraw: function (chart) {
      var ctx = chart.ctx;
      ctx.save();
      ctx.font = '600 10.5px ' + css('--font'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      chart.data.datasets.forEach(function (ds, i) {
        var meta = chart.getDatasetMeta(i);
        if (meta.hidden) return;
        meta.data.forEach(function (bar, k) {
          var v = ds.data[k];
          if (!v || Math.abs(bar.x - bar.base) < 30) return;
          ctx.fillStyle = tint(ds.backgroundColor, 100).fg;
          ctx.fillText(Math.round(v) + '%', (bar.x + bar.base) / 2, bar.y);
        });
      });
      ctx.restore();
    }
  };

  // ---------- trend chart (lines over all months) ----------
  // Color follows the entity: each selection keeps its slot while selected.
  function makeTrend(root, cfg) {
    var slots = {};
    var mode = cfg.mode || 'units';
    var c = card(cfg.title, cfg.subtitle, cfg.note || L('Up to ', 'เลือกได้สูงสุด ') + MAX_SERIES + L(' series. Gaps are months with no data', ' รายการ เส้นที่ขาดคือเดือนที่ไม่มีข้อมูล'));
    var controls = el('div', { class: 'controls' });
    var listId = cfg.key + 'List';
    var input = el('input', { type: 'search', placeholder: L('Search to add…', 'ค้นหาเพื่อเพิ่ม…'), list: listId, 'aria-label': L('Add to ', 'เพิ่มใน') + cfg.title, id: cfg.key + 'Search' });
    var dl = el('datalist', { id: listId });
    cfg.options().forEach(function (o) { dl.appendChild(el('option', { value: o.label })); });
    var seg = el('div', { class: 'seg', role: 'group', 'aria-label': L('Unit', 'หน่วย') });
    [['units', L('Units', 'จำนวน (คัน)')], ['share_pct', L('Share (%)', 'ส่วนแบ่ง (%)')]].forEach(function (m) {
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
        flash(L('The ', 'กราฟ') + cfg.title + L(' chart shows at most ', 'แสดงได้สูงสุด ') + MAX_SERIES + L(' series. Remove one first', ' รายการ ลบรายการเดิมก่อน'));
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
        var x = el('button', { type: 'button', 'aria-label': L('Remove ', 'ลบ ') + cfg.nameOf(id) }, '×');
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
      opt.plugins.legend.display = datasets.length > 1 && !withEndLabels(opt, canvas, datasets.map(function (d) { return d.label; }));
      opt.scales.y.ticks.callback = function (v) { return mode === 'units' ? kTicks(v) : v + '%'; };
      opt.plugins.tooltip.callbacks.label = function (ctx) {
        return ' ' + ctx.dataset.label + ': ' + (mode === 'units' ? fmt(ctx.raw) + L(' units', ' คัน') : (+ctx.raw).toFixed(2) + '%');
      };
      if (charts[cfg.key]) charts[cfg.key].destroy();
      charts[cfg.key] = new Chart(canvas, {
        type: 'line', data: { labels: cfg.labels ? cfg.labels() : D.market.map(function (r) { return monthLabel(r.period); }), datasets: datasets },
        options: opt, plugins: [missingBands, endLabels]
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
  var REGION_GROUPS = [['bkk', L('Bangkok', 'กรุงเทพมหานคร')], ['central', L('Central (excl. Bangkok)', 'ภาคกลาง (ไม่รวมกรุงเทพฯ)')], ['east', L('East', 'ภาคตะวันออก')],
    ['northeast', L('Northeast', 'ภาคตะวันออกเฉียงเหนือ')], ['north', L('North', 'ภาคเหนือ')], ['west', L('West', 'ภาคตะวันตก')], ['south', L('South', 'ภาคใต้')]];
  var RANGES = [['12', L('12 months', '12 เดือน')], ['24', L('24 months', '24 เดือน')], ['36', L('3 years', '3 ปี')], ['ytd', L('This year', 'ปีนี้')], ['all', L('All', 'ทั้งหมด')], ['custom', L('Custom', 'กำหนดเอง')]];
  var GRAINS = [['m', L('Monthly', 'รายเดือน')], ['q', L('Quarterly', 'รายไตรมาส')], ['y', L('Yearly', 'รายปี')]];
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
    if (area === 'all') return L('Whole country', 'ทั้งประเทศ');
    if (area === 'bkk') return L('Bangkok', 'กรุงเทพมหานคร');
    if (area === 'upcountry') return L('Outside Bangkok', 'ต่างจังหวัด (ไม่รวมกรุงเทพฯ)');
    if (area.indexOf('region:') === 0) return D.regionName[area.slice(7)] + (area === 'region:central' ? L(' (incl. Bangkok)', ' (รวมกรุงเทพฯ)') : '');
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
  // A range total is compared with the same calendar months 1, 2 or 3 years earlier, the first that does not overlap
  // the range: 12 months -> the year before, 24 months -> the 24 months before, an 18-month range -> 2 years earlier.
  // (Always shifting by 12 compared 24 months with a period sharing a year with them.) Single months and chart
  // buckets still compare with the same month a year earlier.
  function priorShift(months) { return 12 * Math.max(1, Math.ceil(months.length / 12)); }
  function priorMonths(months) { var k = priorShift(months); return months.map(function (p) { return shiftMonth(p, -k); }); }
  function priorOk(months) { return priorMonths(months).every(function (p) { return D.okSet[p]; }); }
  // how that comparison reads: 'noun' (in a sentence), 'title' (a row or column name), 'short' (a narrow column)
  function priorText(months, form) {
    var k = priorShift(months), n = months.length, y = k / 12;
    var t = k === 12 ? { noun: L('the same period last year', 'ช่วงเดียวกันปีก่อน'), title: L('Same period last year', 'ช่วงเดียวกันปีก่อน'), short: 'YoY' }
      : k === n ? { noun: L('the previous ' + n + ' months', n + ' เดือนก่อนหน้า'), title: L('Previous ' + n + ' months', n + ' เดือนก่อนหน้า'), short: L('vs prev. ' + n + ' mo', 'เทียบ ' + n + ' ด. ก่อน') }
      : { noun: L('the same months ' + y + ' years earlier', 'เดือนเดียวกันเมื่อ ' + y + ' ปีก่อน'), title: L('Same months ' + y + ' years earlier', 'เดือนเดียวกันเมื่อ ' + y + ' ปีก่อน'), short: L('vs ' + y + ' yrs earlier', 'เทียบ ' + y + ' ปีก่อน') };
    return t[form];
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
    return String(y) + (n < 12 ? ' (' + n + L(' mo)', ' ด.)') : '');
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
    [['all', L('Whole country', 'ทั้งประเทศ')], ['bkk', L('Bangkok', 'กรุงเทพมหานคร')], ['upcountry', L('Outside Bangkok', 'ต่างจังหวัด (ไม่รวมกรุงเทพฯ)')]].forEach(function (o) {
      area.appendChild(el('option', { value: o[0] }, o[1]));
    });
    var og = el('optgroup', { label: L('Regions', 'ภูมิภาค') });
    Object.keys(D.regionName).forEach(function (r) { og.appendChild(el('option', { value: 'region:' + r }, areaLabel('region:' + r))); });
    area.appendChild(og);
    var op = el('optgroup', { label: L('Provinces', 'จังหวัด') });
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
        var y = chart.scales.y.getPixelForValue(t), mark = opts.marks && opts.marks[i];
        if (mark !== null && mark !== undefined) {
          var my = chart.scales.y.getPixelForValue(mark);
          if (my > y - 20 && my < y + 2) y = my - 3;   // the last-year mark sits where the label goes: lift the label just above it
        }
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
    var total = 0, prev = 0, prevOk = priorOk(months);
    order.forEach(function (k) { total += buckets[k].total; });
    if (prevOk) priorMonths(months).forEach(function (q) { cats.forEach(function (c) { prev += unitsFor(q, isos, c); }); });

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
      stat(L('Total · ', 'รวม · ') + areaLabel(M.area), fmt(total) + L(' units', ' คัน'), monthLabel(months[0]) + ' – ' + monthLabel(last)),
      stat(prevOk ? L('vs ', 'เทียบ') + priorText(months, 'noun') : L('vs an earlier period', 'เทียบช่วงก่อนหน้า'), yoy === null ? '—' : pctText(yoy),
        prevOk ? monthLabel(priorMonths(months)[0]) + ' – ' + monthLabel(priorMonths(months)[months.length - 1]) + ': ' + fmt(prev) + L(' units', ' คัน')
          : L('The data starts in ', 'ข้อมูลเริ่ม ') + monthLabel(okPeriods()[0], true) + L('; choose a shorter range', ' เลือกช่วงที่สั้นลง'),
        yoy === null ? '' : yoy >= 0 ? 'up' : 'down'),
      stat(L('Monthly average', 'เฉลี่ยต่อเดือน'), fmt(Math.round(total / months.length)) + L(' units', ' คัน'), months.length + L(' months', ' เดือน')),
      stat(L('Latest month · ', 'เดือนล่าสุด · ') + monthLabel(last, true), fmt(lastV) + L(' units', ' คัน'), mom === null ? '' : L('vs previous month ', 'จากเดือนก่อน ') + pctText(mom), mom === null ? '' : mom >= 0 ? 'up' : 'down'));

    // main chart: stacked categories + same period last year (one axis, same unit)
    var surface = css('--surface'), datasets = [];
    CATS.forEach(function (c, k) {
      var code = c[0].toUpperCase();
      if (!M.cats[code]) return;
      datasets.push({ type: 'bar', label: c[1], data: order.map(function (key) { return buckets[key].cat[code]; }),
        backgroundColor: seriesColor(k), borderWidth: 0, borderSkipped: 'start', maxBarThickness: 34, stack: 'm', order: 2 });   // no separators: they hid the thin RY2 band
    });
    datasets[datasets.length - 1].borderRadius = { topLeft: 4, topRight: 4 };
    var topIndex = datasets.length - 1;
    // same period last year: a level mark across each bar (a connecting line ran through the total labels)
    var marks = order.map(function (key) { return buckets[key].prevOk ? buckets[key].prev : null; });
    function markWidth(c) { var bar = c.chart.getDatasetMeta(0).data[c.dataIndex]; return bar && bar.width ? bar.width / 2 + 3 : 8; }
    datasets.push({ type: 'line', label: L('Same period last year (total)', 'ช่วงเดียวกันปีก่อน (รวม)'), data: marks, showLine: false,
      pointStyle: 'line', pointRadius: markWidth, pointHoverRadius: markWidth, pointBorderWidth: 2.5, pointHoverBorderWidth: 3.5,
      borderColor: css('--ink'), backgroundColor: css('--ink'), order: 0 });
    var opt = baseOptions();
    opt.scales.x.stacked = true; opt.scales.y.stacked = true;
    opt.scales.y.ticks.callback = kTicks;
    opt.layout = { padding: { top: 18 } };
    opt.plugins.totalLabels = { totals: order.map(function (k) { return buckets[k].total; }), topIndex: topIndex, marks: marks };
    opt.plugins.tooltip.callbacks = {
      title: function (items) {
        var b = buckets[order[items[0].dataIndex]];
        return items[0].label + (b.months.length > 1 ? ' (' + monthLabel(b.months[0]) + '–' + monthLabel(b.months[b.months.length - 1]) + ')' : '');
      },
      label: function (c) { return c.raw === null ? ' ' + c.dataset.label + L(': no data', ': ไม่มีข้อมูล') : ' ' + c.dataset.label + ': ' + fmt(c.raw) + L(' units', ' คัน'); },
      footer: function (items) {
        var b = buckets[order[items[0].dataIndex]];
        return L('Total ', 'รวม ') + fmt(b.total) + L(' units', ' คัน') + (b.prevOk && b.prev ? L(' · vs last year ', ' · เทียบปีก่อน ') + pctText(100 * (b.total - b.prev) / b.prev) : '');
      }
    };
    if (charts.market) charts.market.destroy();
    charts.market = new Chart(document.getElementById('marketChart'), {
      data: { labels: order.map(function (k) { return bucketLabel(k, buckets[k].months.length); }), datasets: datasets },
      options: opt, plugins: [totalLabels]
    });
    var notes = [L('January is almost double December every year; the pattern is in the DLT data itself', 'ยอดเดือนมกราคมสูงกว่าธันวาคมเกือบเท่าตัวทุกปี เป็นรูปแบบที่อยู่ในข้อมูลของกรมฯ เอง'),
      L('Many four-door pickups are registered as RY1', 'กระบะ 4 ประตูจำนวนมากจดเป็น ร.ย.1')];
    if (M.grain !== 'm') notes.push(L('* or (n mo) marks a period with incomplete data under the selected filters', '* หรือ (n ด.) คือช่วงที่มีข้อมูลไม่ครบในตัวกรองที่เลือก'));
    if (M.area !== 'all') notes.push(L('Vehicles are counted where they are registered; company and leasing cars registered in Bangkok make Bangkok higher than local use', 'รถนับตามจังหวัดที่จดทะเบียน รถของบริษัทและลีสซิ่งที่จดในกรุงเทพฯ ทำให้ยอดกรุงเทพฯ สูงกว่าจำนวนผู้ใช้จริงในพื้นที่'));
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
    tb.appendChild(table([[L('Period', 'ช่วง')], [L('RY1', 'ร.ย.1'), 1], [L('RY2', 'ร.ย.2'), 1], [L('RY3', 'ร.ย.3'), 1], [L('Total', 'รวม'), 1], [L('Last year', 'ปีก่อน'), 1], ['YoY', 1]], trs));

    renderGeo(months, cats);
  }

  function renderGeo(months, cats) {
    // per-province totals for the selected months and categories; always the whole country, for context
    var byIso = {}, prevIso = {}, grand = 0;
    var prevOk = priorOk(months), pmonths = priorMonths(months);
    Object.keys(D.provinceInfo).forEach(function (i) { byIso[i] = 0; prevIso[i] = 0; });
    months.forEach(function (p, j) {
      var rows = D.provBy[p] || {}, prows = D.provBy[pmonths[j]] || {};
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
      return percap ? ' ' + c.raw.toFixed(1) + L(' per 1,000 people · total ', ' คันต่อประชากร 1,000 คน · รวม ') + fmt(groups[g]) + L(' units', ' คัน')
        : ' ' + fmt(c.raw) + L(' units · ', ' คัน · ') + (grand ? (100 * c.raw / grand).toFixed(1) : 0) + L('% of the country', '% ของทั้งประเทศ');
    } };
    if (percap) ro.scales.x.ticks.callback = function (v) { return v; };
    var values = REGION_GROUPS.map(function (g) { return percap ? 1000 * groups[g[0]] / groupPop[g[0]] : groups[g[0]]; });
    // Bangkok (company and leasing registrations) is often several times any region: cap the axis so the others stay readable
    var rest = Math.max.apply(null, values.slice(1)), capped = !percap && values[0] > 3 * rest;
    if (capped) ro.scales.x.max = Math.ceil(1.3 * rest / 10000) * 10000;
    ro.layout = { padding: { right: 96 } };
    ro.plugins.barLabels = { labels: values.map(function (v, i) {
      return (percap ? v.toFixed(1) : fmtK(v)) + (capped && i === 0 ? L(' · bar cut off', ' · ตัดแท่ง') : '');
    }) };
    ro.onClick = function (e, els) {
      if (!els.length) return;
      var g = REGION_GROUPS[els[0].index][0], next = g === 'bkk' ? 'bkk' : 'region:' + g;
      M.area = M.area === next ? 'all' : next;
      document.getElementById('fArea').value = M.area;
      renderExplorer();
    };
    if (charts.region) charts.region.destroy();
    charts.region = new Chart(document.getElementById('regionChart'), {
      type: 'bar', options: ro, plugins: [barLabels],
      data: { labels: REGION_GROUPS.map(function (g) { return g[1]; }),
        datasets: [{ data: values,
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
    svg.setAttribute('aria-label', L('Map of registrations by province', 'แผนที่ยอดจดทะเบียนรายจังหวัด'));
    var tip = el('div', { class: 'map-tip' });
    tip.hidden = true;
    D.map.paths.forEach(function (f) {
      var path = document.createElementNS(NS, 'path'), v = byIso[f.iso], k = cls(metric(f.iso)), info = D.provinceInfo[f.iso];
      path.setAttribute('d', f.d);
      path.setAttribute('fill', k < 0 ? css('--grid') : colors[k]);
      path.setAttribute('class', 'prov' + (selSet[f.iso] ? ' sel' : ''));
      path.setAttribute('tabindex', '0');
      var change = prevOk && prevIso[f.iso] ? pctText(100 * (v - prevIso[f.iso]) / prevIso[f.iso]) : '—';
      var text = provName(f.iso) + ': ' + fmt(v) + L(' units · ', ' คัน · ') + per1000(f.iso).toFixed(1) + L(' per 1,000 people · ', ' ต่อ 1,000 คน · ') + (grand ? (100 * v / grand).toFixed(1) : 0) + L('% · rank ', '% · อันดับ ') + (rank.indexOf(f.iso) + 1) + ' · YoY ' + change;
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
      legend.appendChild(add(el('span'), sw, document.createTextNode(k === colors.length - 1 ? '> ' + lo : lo + '–' + hi)));
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
    pt.appendChild(table([['#', 1], [L('Provinces', 'จังหวัด')], [L('Region', 'ภาค')], [L('Units', 'คัน'), 1], [L('Per 1,000 people', 'ต่อ 1,000 คน'), 1], [L('Share', 'ส่วนแบ่ง'), 1], [priorText(months, 'short'), 1]], trs));
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
  // "Share of brand" denominator. Brand totals follow the DLT brand but a model counts all its cars (GWM-badged Haval H6
  // are in GWM's total and in Haval H6), so a brand's models can outnumber its total; then the models' sum is the base.
  function brandBase(brandId, bUnits, mUnits) {
    var models = 0;
    Object.keys(mUnits).forEach(function (id) { if ((D.modelInfo[id] || {}).brand_id === brandId) models += mUnits[id]; });
    return Math.max(bUnits[brandId] || 0, models);
  }
  function sortedIds(obj) { return Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a] || a.localeCompare(b); }); }
  function sumValues(obj) { var s = 0; Object.keys(obj).forEach(function (k) { s += obj[k]; }); return s; }
  function nameFor(kind, id) { return kind === 'b' ? brandLabel(id) : modelName(id); }
  function hrefFor(kind, id) { return (kind === 'b' ? '#/brand/' : '#/model/') + id + filterQuery(); }
  // Which shared filters each page reads. The others are hidden on that page, so no visible control is ignored.
  var ALL_FILTERS = { range: 1, grain: 1, cats: 1, area: 1 };
  var PAGE_FILTERS = {
    ranking: { range: 1, cats: 1, area: 1 },    // totals over the period: no time axis
    prices: { range: 1, cats: 1, area: 1 },
    launches: { range: 1, cats: 1, area: 1 },   // x axis is months since launch
    regions: { range: 1, cats: 1 },             // always shows every region side by side
    seasonality: { cats: 1, area: 1 },          // always every year, month by month
    data: {}
  };
  function pageFilters(page) { return PAGE_FILTERS[page] || ALL_FILTERS; }
  function filterText() {
    var f = pageFilters(D.page), ms = selectedMonths(), cats = selCats(), parts = [];
    if (f.area) parts.push(areaLabel(M.area));
    if (f.range) parts.push(monthLabel(ms[0]) + ' – ' + monthLabel(ms[ms.length - 1]));
    if (f.cats) parts.push(cats.length === 3 ? L('RY1–3', 'ร.ย.1–3') : cats.map(function (c) { return CAT_LABEL[c]; }).join(', '));
    return parts.join(' · ');
  }

  // text at the end of each horizontal bar
  // Every chart gets CSV / PNG buttons under it, added once per chart box when its first chart is created
  function chartRows(chart) {
    var ds = chart.data.datasets, labels = chart.data.labels || [];
    function cell(v) { return v === null || v === undefined ? '' : typeof v === 'number' && v % 1 ? +v.toFixed(2) : v; }
    if (!labels.length) {   // scatter: one row per point
      var rows = [[L('Series', 'ชุดข้อมูล'), 'x', 'y', L('Name', 'ชื่อ')]];
      ds.forEach(function (d) { d.data.forEach(function (pt) { rows.push([d.label || '', cell(pt.x), cell(pt.y), pt.id ? modelName(pt.id) : '']); }); });
      return rows;
    }
    var head = [''].concat(ds.map(function (d, i) { return d.label || (ds.length === 1 ? L('Value', 'ค่า') : String(i + 1)); }));
    return [head].concat(labels.map(function (lab, j) {
      return [Array.isArray(lab) ? lab.join(' ') : lab].concat(ds.map(function (d) { return cell(d.data[j]); }));
    }));
  }
  function chartPNG(chart, name) {
    var src = chart.canvas, out = document.createElement('canvas'), ctx = out.getContext('2d');
    out.width = src.width; out.height = src.height;
    ctx.fillStyle = css('--surface'); ctx.fillRect(0, 0, out.width, out.height);   // a transparent PNG is unreadable in the other theme
    ctx.drawImage(src, 0, 0);
    var a = el('a', { href: out.toDataURL('image/png'), download: name });
    document.body.appendChild(a); a.click(); a.remove();
  }
  Chart.register({ id: 'exportTools', afterInit: function (chart) {
    var box = chart.canvas.parentNode, next = box && box.nextElementSibling;
    if (!box || !box.parentNode || (next && next.classList.contains('chart-tools'))) return;
    var canvas = chart.canvas, tools = el('div', { class: 'chart-tools' });
    function stem() { return 'thai-auto-data-' + (canvas.id || 'chart').replace(/Chart$/, '') + '-' + selectedMonths()[0] + '-' + selectedMonths().slice(-1)[0]; }
    [['CSV', L('Download the chart data (CSV)', 'ดาวน์โหลดข้อมูลกราฟ (CSV)')], ['PNG', L('Download the chart as an image (PNG)', 'ดาวน์โหลดภาพกราฟ (PNG)')]].forEach(function (t) {
      var btn = el('button', { type: 'button', 'aria-label': t[1], title: t[1] }, t[0]);
      btn.addEventListener('click', function () {
        var c = Chart.getChart(canvas);
        if (!c) return;
        if (t[0] === 'CSV') downloadCSV(stem() + '.csv', chartRows(c)); else chartPNG(c, stem() + '.png');
      });
      tools.appendChild(btn);
    });
    box.parentNode.insertBefore(tools, box.nextSibling);
  } });
  var barLabels = {
    id: 'barLabels',
    afterDatasetsDraw: function (chart, args, opts) {
      if (!opts || !opts.labels) return;
      var ctx = chart.ctx, meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.fillStyle = css('--ink-2'); ctx.font = '12px ' + css('--font'); ctx.textBaseline = 'middle';
      meta.data.forEach(function (bar, i) { ctx.fillText(opts.labels[i], Math.min(bar.x, chart.chartArea.right) + 6, bar.y); });
      ctx.restore();
    }
  };
  function hbar(key, canvas, labels, values, texts, onPick, shortTexts, color) {
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
      callback: function (v) { return wrapLabel(this.getLabelForValue(v), narrow ? 14 : 22); } };
    o.onClick = function (e, els) { if (els.length && onPick) onPick(els[0].index); };
    o.onHover = function (e, els) { e.native.target.style.cursor = els.length && onPick ? 'pointer' : 'default'; };
    if (charts[key]) charts[key].destroy();
    var wraps = labels.some(function (t) { return t.length > (narrow ? 14 : 22); });
    canvas.parentNode.style.height = (36 + (wraps ? 36 : 30) * labels.length) + 'px';
    charts[key] = new Chart(canvas, {
      type: 'bar', options: o, plugins: [barLabels],
      data: { labels: labels, datasets: [{ data: values, backgroundColor: color || css('--accent'), borderRadius: 4, borderSkipped: 'start', barPercentage: 0.72, categoryPercentage: 1 }] }
    });
  }

  function renderRankCard(idx) {
    var months = selectedMonths(), cats = selCats(), kind = A.kind;
    var cur = sumById(idx, kind, months, cats), total = sumValues(sumById(idx, 'b', months, cats));
    var prevMonths = priorMonths(months);
    var prevOk = priorOk(months);
    var prev = prevOk ? sumById(idx, kind, prevMonths, cats) : {};
    var prevRank = {};
    sortedIds(prev).forEach(function (id, i) { prevRank[id] = i + 1; });
    var ids = sortedIds(cur);
    var top = ids.slice(0, 15);
    hbar('rank', document.getElementById('rankChart'), top.map(function (id) { return nameFor(kind, id); }),
      top.map(function (id) { return cur[id]; }),
      top.map(function (id) { return fmt(cur[id]) + L(' units · ', ' คัน · ') + (100 * cur[id] / total).toFixed(1) + '%'; }),
      function (i) { location.hash = hrefFor(kind, top[i]); },
      top.map(function (id) { return fmt(cur[id]) + ' · ' + (100 * cur[id] / total).toFixed(1) + '%'; }));
    A.top5[kind] = ids.slice(0, 5);
    var rc = document.getElementById('rankCompare');
    rc.href = compareHref(kind, ids.filter(function (id) { return kind === 'b' || D.modelInfo[id]; }).slice(0, MAX_COMPARE));
    rc.textContent = kind === 'b' ? L('Compare the top 4 brands →', 'เปรียบเทียบ 4 ยี่ห้อแรก →') : L('Compare the top 4 models →', 'เปรียบเทียบ 4 รุ่นแรก →');
    var trs = ids.slice(0, 50).map(function (id, i) {
      var tr = el('tr'), td = el('td', { class: 'name' });
      var on = trendIds(kind).indexOf(id) >= 0;
      var plus = el('button', { type: 'button', class: 'plus', 'data-id': id, 'aria-pressed': String(!!on), 'aria-label': L('Add ', 'เพิ่ม ') + nameFor(kind, id) + L(' to the trend chart', ' ลงกราฟเทรนด์') }, on ? '✓' : '＋');
      plus.addEventListener('click', function () { toggleTrendId(kind, id); });
      add(td, plus, link(hrefFor(kind, id), nameFor(kind, id)));
      var move = '—';
      if (prevOk) {
        if (!prevRank[id]) move = L('New', 'ใหม่');
        else if (prevRank[id] === i + 1) move = '=';
        else move = (prevRank[id] > i + 1 ? '▲' : '▼') + Math.abs(prevRank[id] - (i + 1));
      }
      add(tr, el('td', { class: 'n' }, String(i + 1)), td, el('td', { class: 'n' }, fmt(cur[id])),
        el('td', { class: 'n' }, (100 * cur[id] / total).toFixed(1) + '%'),
        el('td', { class: 'n' }, prevOk ? fmt(prev[id] || 0) : '—'),
        pctCell(prevOk && prev[id] ? (100 * (cur[id] - prev[id]) / prev[id]).toFixed(2) : ''),
        el('td', { class: 'n move ' + (move[0] === '▲' || move === L('New', 'ใหม่') ? 'up' : move[0] === '▼' ? 'down' : 'na') }, move));
      return tr;
    });
    var box = document.getElementById('rankTable');
    box.textContent = '';
    box.appendChild(trs.length ? table([['#', 1], [kind === 'b' ? L('Brand', 'ยี่ห้อ') : L('Model', 'รุ่น')], [L('Units', 'คัน'), 1], [L('Share', 'ส่วนแบ่ง'), 1], [priorText(months, 'title'), 1], [priorText(months, 'short'), 1], [L('Rank', 'อันดับ'), 1]], trs)
      : el('p', { class: 'note' }, L('No data for these filters', 'ไม่มีข้อมูลในตัวกรองนี้')));
    document.getElementById('rankNote').textContent = (kind === 'm' ? L('Only matched model names are counted; share is of all units in the selected area and period · ', 'นับเฉพาะชื่อรุ่นที่จับคู่ได้ ส่วนแบ่งคิดจากยอดทั้งหมดในพื้นที่และช่วงที่เลือก · ') : L('Share is of all units in the selected area and period · ', 'ส่วนแบ่งคิดจากยอดทั้งหมดในพื้นที่และช่วงที่เลือก · ')) +
      L('Rank compared with ', 'อันดับเทียบกับ') + priorText(months, 'noun') + L(' · click a bar or name for details · click ＋ in the table to add it to the chart on the Trends page', ' · กดแท่งหรือชื่อเพื่อดูรายละเอียด · กด ＋ ในตารางเพื่อเพิ่มลงกราฟในหน้าเทรนด์');
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

  // Fastest growing and biggest declines: the same comparison, sorted both ways
  function renderHotCard(idx) {
    var cats = selCats(), months = selectedMonths(), cur, prev, label, all = okPeriods();
    if (A.hot === 'yoy') {
      var pm = priorMonths(months);
      if (!priorOk(months)) { var msg = L('The data does not cover ', 'ข้อมูลไม่ครอบคลุม') + priorText(months, 'noun') + L('; try a shorter range', ' ลองเลือกช่วงที่สั้นลง'); hotEmpty(msg, 'drop'); return hotEmpty(msg); }
      cur = sumById(idx, 'm', months, cats); prev = sumById(idx, 'm', pm, cats);
      label = monthLabel(months[0]) + '–' + monthLabel(months[months.length - 1]) + L(' vs ', ' เทียบ ') + monthLabel(pm[0]) + '–' + monthLabel(pm[pm.length - 1]);
    } else {
      var end = all.indexOf(months[months.length - 1]);
      if (end < 5) { var few = L('Needs at least 6 months of data', 'ต้องมีข้อมูลอย่างน้อย 6 เดือน'); hotEmpty(few, 'drop'); return hotEmpty(few); }
      var last3 = all.slice(end - 2, end + 1), prev3 = all.slice(end - 5, end - 2);
      cur = sumById(idx, 'm', last3, cats); prev = sumById(idx, 'm', prev3, cats);
      label = monthLabel(last3[0]) + '–' + monthLabel(last3[2]) + L(' vs ', ' เทียบ ') + monthLabel(prev3[0]) + '–' + monthLabel(prev3[2]);
    }
    var gains = {}, losses = {};
    Object.keys(cur).forEach(function (id) { var g = cur[id] - (prev[id] || 0); if (g > 0) gains[id] = g; });
    Object.keys(prev).forEach(function (id) { var d = prev[id] - (cur[id] || 0); if (d > 0) losses[id] = d; });
    var top = sortedIds(gains).slice(0, 10), drop = sortedIds(losses).slice(0, 10);
    document.getElementById('hotNote').textContent = label + L(' · ranked by units gained (not %, so small bases do not look huge) · registrations, not sales', ' · เรียงตามจำนวนคันที่เพิ่มขึ้น (ไม่ใช่ % เพื่อไม่ให้รุ่นฐานเล็กดูโตเกินจริง) · ยอดจดทะเบียน ไม่ใช่ยอดขาย');
    document.getElementById('dropNote').textContent = label + L(' · ranked by units lost · a new generation under a new name (e.g. Hilux Revo → Hilux Travo) shows here as a decline and in the left list as growth', ' · เรียงตามจำนวนคันที่ลดลง · รุ่นที่เปลี่ยนโฉมและเปลี่ยนชื่อ (เช่น Hilux Revo → Hilux Travo) จะขึ้นเป็นยอดลดที่นี่ และเป็นยอดเพิ่มในรายการรุ่นมาแรง');
    if (!drop.length) hotEmpty(L('No model declined under these filters', 'ไม่มีรุ่นที่ลดลงในตัวกรองนี้'), 'drop');
    else {
      document.getElementById('dropEmpty').hidden = true;
      document.getElementById('dropChart').parentNode.hidden = false;
      hbar('drop', document.getElementById('dropChart'), drop.map(function (id) { return modelName(id); }),
        drop.map(function (id) { return losses[id]; }),
        drop.map(function (id) {
          return '−' + fmt(losses[id]) + L(' units · ', ' คัน · ') + pctText(-100 * losses[id] / prev[id]) + L(' · total ', ' · รวม ') + fmt(cur[id] || 0);
        }),
        function (i) { location.hash = '#/model/' + drop[i] + filterQuery(); },
        drop.map(function (id) { return '−' + fmt(losses[id]) + (cur[id] ? '' : L(' · none', ' · ไม่มียอด')); }),
        css('--down'));
    }
    if (!top.length) return hotEmpty(L('No model grew under these filters', 'ไม่มีรุ่นที่เพิ่มขึ้นในตัวกรองนี้'));
    document.getElementById('hotEmpty').hidden = true;
    document.getElementById('hotChart').parentNode.hidden = false;
    hbar('hot', document.getElementById('hotChart'), top.map(function (id) { return modelName(id); }),
      top.map(function (id) { return gains[id]; }),
      top.map(function (id) {
        var p = prev[id] || 0;
        return '+' + fmt(gains[id]) + L(' units · ', ' คัน · ') + (p ? (p * 10 < cur[id] ? L('>10×', '>10 เท่า') : pctText(100 * gains[id] / p)) : L('New', 'ใหม่')) + L(' · total ', ' · รวม ') + fmt(cur[id]);
      }),
      function (i) { location.hash = '#/model/' + top[i] + filterQuery(); },
      top.map(function (id) { return '+' + fmt(gains[id]) + (prev[id] ? '' : L(' · new', ' · ใหม่')); }));
  }
  function hotEmpty(msg, key) {
    key = key || 'hot';
    var e = document.getElementById(key + 'Empty');
    e.textContent = msg; e.hidden = false;
    document.getElementById(key + 'Chart').parentNode.hidden = true;
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
    [['b', 'brandTrend', L('Brand trend', 'เทรนด์รายยี่ห้อ'), 'Brand trend'], ['m', 'modelTrend', L('Model trend', 'เทรนด์รายรุ่น'), 'Model trend']].forEach(function (t) {
      var kind = t[0], root = document.getElementById(t[1]);
      root.textContent = '';
      var top5 = sortedIds(sumById(idx, kind, months, cats)).slice(0, 5);
      var tr = makeTrend(root, {
        key: t[1], title: t[2], subtitle: t[3], nameOf: function (id) { return nameFor(kind, id); },
        href: function (id) { return hrefFor(kind, id); }, options: options(kind),
        labels: function () { return labels; }, values: series(kind),
        note: L('Follows the filters above · share is of all units in the area · up to ', 'ตามตัวกรองด้านบน · ส่วนแบ่งคิดจากยอดทั้งหมดในพื้นที่ · เลือกได้สูงสุด ') + MAX_SERIES + L(' series', ' รายการ'),
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
    seg('rankKind', [['b', L('Brand', 'ยี่ห้อ')], ['m', L('Model', 'รุ่น')]], function () { return A.kind; }, function (v) { A.kind = v; });
    seg('hotMode', [['yoy', L('vs earlier period', 'เทียบช่วงก่อนหน้า')], ['mom3', L('Last 3 months', '3 เดือนล่าสุด')]], function () { return A.hot; }, function (v) { A.hot = v; });
    seg('regionMode', [['share', L('Share', 'ส่วนแบ่ง')], ['index', L('vs national average', 'เทียบค่าเฉลี่ยประเทศ')]], function () { return RG.mode; }, function (v) { RG.mode = v; });
    seg('regionKind', [['b', L('Brand', 'ยี่ห้อ')], ['m', L('Model', 'รุ่น')]], function () { return RG.kind; }, function (v) { RG.kind = v; });
    seg('regionShade', [['col', L('Shade by region', 'ไล่สีตามภาค')], ['row', L('Shade by row', 'ไล่สีตามแถว')]], function () { return RG.shade; }, function (v) { RG.shade = v; });
    seg('seasonMode', [['units', L('Units', 'จำนวนคัน')], ['index', L('vs year average', 'เทียบค่าเฉลี่ยของปี')]], function () { return SE.mode; }, function (v) { SE.mode = v; });
    seg('launchMode', [['cum', L('Cumulative', 'สะสม')], ['month', L('Monthly', 'รายเดือน')]], function () { return LA.mode; }, function (v) { LA.mode = v; });
    seg('geoMetric', [['units', L('Units', 'จำนวนคัน')], ['percap', L('Per 1,000 people', 'ต่อประชากร 1,000 คน')]], function () { return M.metric; }, function (v) { M.metric = v; });
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
    var want = base + (D.page === 'data' ? (LANG === 'th' ? '?lang=th' : '') : filterQuery());
    if (want !== location.hash) history.replaceState(null, '', want);
  }

  // ---------- page orchestration ----------
  // Which page is showing, and what it renders when the shared filters change.
  var PAGE_RENDER = {
    overview: function () { renderMarketCard(); },
    ranking: function (idx) { renderRankCard(idx); renderHotCard(idx); },
    trends: function (idx) { renderHomeTrends(idx); renderShareAndBump(idx); },
    origin: function (idx) { renderGroupPage(idx, ORIGIN); },
    segments: function (idx) { renderGroupPage(idx, SEGMENT); },
    regions: function () { renderRegions(); },
    seasonality: function () { renderSeasonality(); },
    prices: function (idx) { renderPricePage(idx); },
    launches: function (idx) { renderLaunches(idx); },
    powertrain: function (idx) { renderPowertrain(idx); },
    brand: function (idx) { renderDetail(function (root) { renderBrand(root, D.detailArg, idx); }); },
    model: function (idx) { renderDetail(function (root) { renderModel(root, D.detailArg, idx); }); },
    compare: function (idx) { renderDetail(function (root) { renderCompare(root, D.detailArg, idx); }); }
  };
  function renderDetail(fn) {
    var detail = document.getElementById('detail');
    destroyCharts('d-');
    detail.textContent = '';
    fn(detail);
    var t = detail.querySelector('.page-title');
    document.title = (t ? t.textContent : L('Page not found', 'ไม่พบหน้านี้')) + ' · thai-auto-data';
  }
  var NEEDS_AREA = { ranking: 1, trends: 1, origin: 1, segments: 1, prices: 1, launches: 1, powertrain: 1, brand: 1, model: 1, compare: 1 };
  function renderExplorer() {
    var page = D.page, token = ++A.token;
    document.querySelectorAll('.filter-echo').forEach(function (e) { e.textContent = filterText(); });
    syncHash();
    if (!PAGE_RENDER[page]) return;
    if (!NEEDS_AREA[page]) { PAGE_RENDER[page](); return; }
    loadArea(areaKey(M.area)).then(function (idx) {
      if (token === A.token && D.page === page) PAGE_RENDER[page](idx);
    }).catch(function (e) {
      flash(L('Could not load area data: ', 'โหลดข้อมูลพื้นที่ไม่สำเร็จ: ') + e.message);
    });
  }

  // ---------- analysis pages (all follow the shared filter bar) ----------
  var ORIGIN_GROUPS = [['JP', L('Japan', 'ญี่ปุ่น')], ['CN', L('China', 'จีน')], ['KR', L('South Korea', 'เกาหลีใต้')], ['EU', L('Europe', 'ยุโรป')], ['US', L('United States', 'สหรัฐฯ')], ['OT', L('Other / unknown', 'อื่นๆ / ไม่ระบุ')]];
  var EU = { DE: 1, NL: 1, IT: 1, FR: 1, GB: 1, SE: 1 };
  // body types in data/models.csv; 'other' also holds mixed-body models and units whose model name is not matched
  var SEGMENTS = [['pickup', L('Pickup', 'กระบะ')], ['ppv', L('PPV (pickup-based SUV)', 'PPV')], ['suv', L('SUV / crossover', 'SUV / ครอสโอเวอร์')], ['sedan', L('Sedan', 'ซีดาน')],
    ['hatchback', L('Hatchback', 'แฮทช์แบ็ก')], ['mpv', L('MPV', 'MPV')], ['van', L('Van', 'รถตู้')], ['wagon', L('Wagon / sports', 'สเตชันแวกอน / สปอร์ต')],
    ['other', L('Unclassified / unmatched', 'ไม่ระบุ / ยังไม่จับคู่')]];
  var PRICE_BANDS = [[0, 600000, L('Under ฿600k', 'ต่ำกว่า 6 แสน')], [600000, 800000, L('฿600–800k', '6–8 แสน')], [800000, 1000000, L('฿800k–1M', '8 แสน–1 ล้าน')],
    [1000000, 1500000, L('฿1–1.5M', '1–1.5 ล้าน')], [1500000, 2000000, L('฿1.5–2M', '1.5–2 ล้าน')], [2000000, Infinity, L('฿2M and up', '2 ล้านขึ้นไป')]];

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
  // one line under a row of share tiles saying what the ▲▼ compare with
  function basisNote(box, months, ok) {
    var n = box.nextElementSibling;
    if (!n || !n.classList.contains('basis')) { n = el('p', { class: 'note basis' }); box.parentNode.insertBefore(n, box.nextSibling); }
    n.textContent = ok ? L('▲▼ change in share, in percentage points, vs ', '▲▼ ส่วนแบ่งที่เปลี่ยนไป (จุด) เทียบกับ') + priorText(months, 'noun') : '';
  }
  function heatCell(text, pct, neg) {
    var td = el('td', { class: 'n heat' }, text);
    td.style.background = neg ? mixNeg(pct) : mix(pct);
    if (pct > 55) td.style.color = '#fff';
    return td;
  }
  function areaRows(kind, idx, months, cats) { return sumById(idx, kind, months, cats); }
  // A colour mixed into the card background at pct %, with the text colour that reads best on it.
  function tint(hex, pct) {
    function rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
    var a = rgb(hex), b = rgb(css('--surface')), f = pct / 100;
    var c = a.map(function (v, i) { return Math.round(v * f + b[i] * (1 - f)); });
    var lin = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    var lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    return { bg: 'rgb(' + c.join(',') + ')', fg: lum > 0.179 ? '#0b0b0b' : '#ffffff' };   // the higher-contrast of black and white
  }
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
    o.plugins.tooltip.callbacks.label = function (c) { return ' ' + c.dataset.label + ': ' + c.raw.toFixed(1) + '%' + (opts && opts.units ? ' (' + fmt(opts.units[c.datasetIndex][c.dataIndex]) + L(' units)', ' คัน)') : ''); };
    o.elements = { point: { radius: 0, hoverRadius: 4 }, line: { borderWidth: 1 } };
    if ((canvas.parentNode.clientWidth || 0) >= 560) {
      var w = Math.max.apply(null, series.map(function (x) { return textWidth(x.label + ' 100%', '11px ' + css('--font')); }));
      o.plugins.areaLabels = { on: true };
      o.layout = { padding: { right: Math.min(190, Math.ceil(w) + 26) } };
    }
    if (charts[key]) charts[key].destroy();
    charts[key] = new Chart(canvas, {
      type: 'line', options: o, plugins: [areaLabels],
      data: { labels: labels, datasets: series.map(function (s, i) {
        // monotone: smooth without bending past the data
        return { label: s.label, data: s.data, fill: i === 0 ? 'origin' : '-1', backgroundColor: s.color, borderColor: css('--surface'), cubicInterpolationMode: 'monotone' };
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
    series.push({ label: L('Others', 'อื่นๆ'), color: css('--axis'), data: per.map(function (o, j) {
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
    o.plugins.tooltip.callbacks.label = function (c) { return ' ' + c.dataset.label + L(': rank ', ': อันดับ ') + c.raw; };
    // point at a line to bring it forward; the other brands fade
    o.interaction = { mode: 'nearest', intersect: false };
    o.onHover = function (e, els, chart) {
      var hi = els.length ? els[0].datasetIndex : -1;
      if (chart.$hi === hi) return;
      chart.$hi = hi;
      chart.data.datasets.forEach(function (d, i) { d.borderColor = hi < 0 || i === hi ? seriesColor(i) : seriesColor(i) + '33'; d.borderWidth = i === hi ? 3.5 : 2.5; });
      chart.update('none');
    };
    var bumpCanvas = document.getElementById('bumpChart');
    if (withEndLabels(o, bumpCanvas, top.map(brandLabel))) o.plugins.legend.display = false;
    if (charts.bump) charts.bump.destroy();
    charts.bump = new Chart(bumpCanvas, {
      type: 'line', options: o, plugins: [endLabels],
      data: { labels: b.labels, datasets: top.map(function (id, i) {
        return { label: brandLabel(id), data: ranks.map(function (r) { return r[id] && r[id] <= 12 ? r[id] : null; }),
          borderColor: seriesColor(i), backgroundColor: seriesColor(i), borderWidth: 2.5, pointRadius: b.order.length > 24 ? 0 : 3,
          pointBackgroundColor: css('--surface'), pointBorderWidth: 2, tension: 0, spanGaps: false };
      }) }
    });
  }

  // ----- origin page: parent-company country groups -----
  // Brand origin (brands by parent-company country) and Segments (models by body type) share one page layout:
  // share over time, share tiles, members table and the mix in each region. g.other collects what has no group;
  // for models that includes units whose DLT name is not matched, so shares are always of the whole market.
  var ORIGIN = { key: 'origin', kind: 'b', groups: ORIGIN_GROUPS, groupOf: originGroup, other: 'OT', word: L(' brands', ' ยี่ห้อ'), head: L('Brand', 'ยี่ห้อ'),
    where: function (id, g) { return g === 'EU' || g === 'OT' ? countryName(D.brandCountry[id]) : ''; } };   // the country only where the group name does not say it
  var SEGMENT = { key: 'segment', kind: 'm', groups: SEGMENTS, groupOf: function (id) { var t = (D.modelInfo[id] || {}).body_type; return t === 'sports' ? 'wagon' : t || 'other'; }, other: 'other',
    word: L(' models', ' รุ่น'), head: L('Model', 'รุ่น'), where: function (id) { return brandLabel((D.modelInfo[id] || {}).brand_id); } };
  function groupColor(i) { return i < 8 ? seriesColor(i) : css('--hatch'); }   // 8 series colours; a 9th group (Unclassified) is grey
  function renderGroupPage(idx, g) {
    var b = buckets(), cats = selCats(), months = selectedMonths();
    function byGroup(s, total) {
      var o = {}, sum = 0;
      g.groups.forEach(function (x) { o[x[0]] = 0; });
      Object.keys(s).forEach(function (id) { o[g.groupOf(id)] += s[id]; sum += s[id]; });
      if (total !== undefined) o[g.other] += Math.max(0, total - sum);
      return o;
    }
    function sums(group, ms) { return [sumById(group, g.kind, ms, cats), g.kind === 'm' ? sumValues(sumById(group, 'b', ms, cats)) : undefined]; }
    var per = b.order.map(function (k) { var x = sums(idx, b.months[k]); return byGroup(x[0], x[1]); });
    var tot = per.map(sumValues);
    stackedArea(g.key, document.getElementById(g.key + 'Chart'), b.labels, g.groups.map(function (x, i) {
      return { label: x[1], color: groupColor(i), data: per.map(function (o, j) { return tot[j] ? 100 * o[x[0]] / tot[j] : 0; }) };
    }), { units: g.groups.map(function (x) { return per.map(function (o) { return o[x[0]]; }); }) });

    // stats: share in the selected range, and change vs the same period last year
    var pm = priorMonths(months), prevOk = priorOk(months);
    var rx = sums(idx, months), px = prevOk ? sums(idx, pm) : [{}, 0];
    var range = rx[0], prev = px[0];
    var cur = byGroup(range, rx[1]), was = byGroup(prev, px[1]), ct = sumValues(cur), pt = sumValues(was);
    var box = document.getElementById(g.key + 'Stats');
    box.textContent = '';
    g.groups.forEach(function (x, i) {
      var share = ct ? 100 * cur[x[0]] / ct : 0, pshare = pt ? 100 * was[x[0]] / pt : null;
      var d = (pshare === null ? '' : ptsText(share - pshare) + ' · ') + fmt(cur[x[0]]) + L(' units', ' คัน');
      var st = add(el('div', { class: 'stat' }), el('span', { class: 'label' }, x[1]), el('span', { class: 'value' }, share.toFixed(1) + '%'),
        el('span', { class: 'detail ' + (pshare === null ? '' : ptsClass(share - pshare)) }, d));
      st.style.borderLeftColor = groupColor(i);
      box.appendChild(st);
    });
    basisNote(box, months, prevOk);

    // members of each group, as a table: a total row per group, then its members, biggest first
    var list = document.getElementById(g.key + 'Members');
    list.textContent = '';
    function pct(v) { return v > 0 && v < 0.01 ? '<0.01%' : v.toFixed(v < 1 ? 2 : 1) + '%'; }
    function change(now, before) { return pctCell(prevOk && before ? (100 * (now - before) / before).toFixed(2) : ''); }
    var rows = [];
    g.groups.forEach(function (x, i) {
      var ids = sortedIds(range).filter(function (id) { return g.groupOf(id) === x[0]; });
      if (!ids.length && !cur[x[0]]) return;
      var gu = cur[x[0]], dot = el('i', { class: 'dot' });
      dot.style.background = groupColor(i);
      var head = add(el('tr', { class: 'origin-group' }), add(el('td'), dot, document.createTextNode(x[1] + ' · ' + ids.length + g.word)),
        el('td', { class: 'n' }, fmt(gu)), el('td', { class: 'n' }, pct(ct ? 100 * gu / ct : 0)), el('td', { class: 'n' }, '100%'), change(gu, was[x[0]]));
      head.style.boxShadow = 'inset 3px 0 0 ' + groupColor(i);
      rows.push(head);
      ids.forEach(function (id) {
        var where = g.where(id, x[0]);
        rows.push(add(el('tr'), add(el('td', { class: 'name' }), link(hrefFor(g.kind, id), nameFor(g.kind, id)), where ? el('span', { class: 'country' }, where) : null),
          el('td', { class: 'n' }, fmt(range[id])), el('td', { class: 'n' }, pct(100 * range[id] / ct)), el('td', { class: 'n' }, pct(gu ? 100 * range[id] / gu : 0)),
          change(range[id], prev[id])));
      });
    });
    list.appendChild(table([[g.head], [L('Units', 'คัน'), 1], [L('Market share', 'ส่วนแบ่งตลาด'), 1],
      [L('Share of group', 'สัดส่วนในกลุ่ม'), 1], [priorText(months, 'short'), 1]], rows));

    // by region (100% bars), always all regions
    loadRegionGroups().then(function (groups) {
      var gt = groupTotals(groups, g.kind, months, cats), bt = g.kind === 'm' ? groupTotals(groups, 'b', months, cats) : null;
      var mix = REGION_GROUPS.map(function (r) { return byGroup(gt[r[0]], bt ? sumValues(bt[r[0]]) : undefined); });
      var regTot = mix.map(sumValues);
      var o = baseOptions();
      o.indexAxis = 'y';
      o.scales.x.stacked = true; o.scales.y.stacked = true; o.scales.x.max = 100;
      o.scales.x.ticks.callback = function (v) { return v + '%'; };
      o.scales.y.grid = { display: false };
      o.interaction = { mode: 'index', intersect: false, axis: 'y' };
      o.plugins.tooltip.callbacks.label = function (c) { return ' ' + c.dataset.label + ': ' + c.raw.toFixed(1) + '%'; };
      if (charts[g.key + 'Region']) charts[g.key + 'Region'].destroy();
      charts[g.key + 'Region'] = new Chart(document.getElementById(g.key + 'RegionChart'), {
        type: 'bar', options: o, plugins: [segLabels],
        data: { labels: REGION_GROUPS.map(function (r) { return r[1]; }), datasets: g.groups.map(function (x, i) {
          return { label: x[1], backgroundColor: groupColor(i), borderColor: css('--surface'), borderWidth: { right: 1 }, borderSkipped: false, barPercentage: 0.75,
            data: mix.map(function (m, j) { return regTot[j] ? 100 * m[x[0]] / regTot[j] : 0; }) };
        }) }
      });
    });
  }

  // ----- regions page: brand x region heatmap -----
  var RG = { mode: 'share', kind: 'b', shade: 'col' };
  function renderRegions() {
    var months = selectedMonths(), cats = selCats(), kind = RG.kind;
    Promise.all([loadRegionGroups(), loadArea('all')]).then(function (res) {
      var groups = res[0], all = res[1];
      var gt = groupTotals(groups, kind, months, cats), bt = groupTotals(groups, 'b', months, cats);
      var nat = sumById(all, kind, months, cats), natTot = sumValues(sumById(all, 'b', months, cats));
      var regTot = {};
      REGION_GROUPS.forEach(function (r) { regTot[r[0]] = sumValues(bt[r[0]]); });
      var top = sortedIds(nat).slice(0, 20);
      // each region column has its own colour; in share mode the shade compares within the column (who leads the region)
      // or within the row (where each brand or model is strongest)
      var share = function (r, id) { return regTot[r] ? 100 * (gt[r][id] || 0) / regTot[r] : 0; };
      var colMax = {};
      REGION_GROUPS.forEach(function (r) { colMax[r[0]] = Math.max.apply(null, top.map(function (id) { return share(r[0], id); })); });
      document.getElementById('regionShade').hidden = RG.mode !== 'share';
      var head = [[kind === 'b' ? L('Brand', 'ยี่ห้อ') : L('Model', 'รุ่น')], [L('Whole country', 'ทั้งประเทศ'), 1]].concat(REGION_GROUPS.map(function (r) { return [r[1].replace(L(' (excl. Bangkok)', ' (ไม่รวมกรุงเทพฯ)'), '*'), 1]; }));
      var trs = top.map(function (id) {
        var natShare = 100 * nat[id] / natTot, tr = el('tr');
        var rowMax = Math.max.apply(null, REGION_GROUPS.map(function (r) { return regTot[r[0]] ? (gt[r[0]][id] || 0) / regTot[r[0]] : 0; })) * 100;
        add(tr, add(el('td', { class: 'name' }), link(hrefFor(kind, id), nameFor(kind, id))), el('td', { class: 'n' }, natShare.toFixed(1) + '%'));
        REGION_GROUPS.forEach(function (r, j) {
          var v = share(r[0], id), td;
          if (RG.mode === 'share') {
            var max = RG.shade === 'col' ? colMax[r[0]] : rowMax, c = tint(seriesColor(j), max && v ? 10 + 70 * Math.sqrt(v / max) : 0);   // square root: one dominant brand would leave the rest pale
            td = el('td', { class: 'n heat' }, v.toFixed(1) + '%');
            td.style.background = c.bg; td.style.color = c.fg;
          } else {
            var ix = natShare ? 100 * v / natShare : 0, dev = ix - 100;
            td = heatCell(Math.round(ix) + '', Math.min(80, Math.abs(dev) * 0.9), dev < 0);
          }
          td.title = nameFor(kind, id) + L(' in ', ' ใน') + r[1] + ': ' + fmt(gt[r[0]][id] || 0) + L(' units · ', ' คัน · ') + v.toFixed(2) + '%';
          tr.appendChild(td);
        });
        return tr;
      });
      var box = document.getElementById('regionHeat');
      box.textContent = '';
      var t = table(head, trs); t.classList.add('heatmap');
      Array.prototype.slice.call(t.querySelectorAll('thead th'), 2).forEach(function (th, j) { th.style.boxShadow = 'inset 0 3px 0 ' + seriesColor(j); });
      box.appendChild(t);
      var what = kind === 'b' ? L('brand', 'ยี่ห้อ') : L('model', 'รุ่น');
      document.getElementById('regionHeatNote').textContent = RG.mode === 'share'
        ? L('Each value is the share of the ', 'ตัวเลขคือส่วนแบ่งของแต่ละ') + what + L(' in that region; each region has its own colour · ', 'ในภาคนั้น แต่ละภาคมีสีของตัวเอง · ') +
          (RG.shade === 'col'
            ? L('shades compare within a column: the darkest cell is the ', 'สีเทียบภายในคอลัมน์: สีเข้มสุดคือ') + what + L(' with the highest share in that region', 'ที่มีส่วนแบ่งสูงสุดในภาคนั้น')
            : L('shades compare within a row: the darkest cell is the region where the ', 'สีเทียบภายในแถว: สีเข้มสุดคือภาคที่') + what + L(' has its highest share', 'นั้นมีส่วนแบ่งสูงสุด')) +
          L(' · * Central excludes Bangkok · sorted by national units', ' · * ภาคกลางไม่รวมกรุงเทพฯ · เรียงตามยอดทั้งประเทศ')
        : L('Index = share in the region ÷ national share × 100 · above 100 (blue) = stronger than the national average · below 100 (red) = weaker · * Central excludes Bangkok', 'ดัชนี = ส่วนแบ่งในภาค ÷ ส่วนแบ่งทั้งประเทศ × 100 · มากกว่า 100 (สีน้ำเงิน) = แข็งกว่าค่าเฉลี่ยประเทศ · น้อยกว่า 100 (สีแดง) = อ่อนกว่า · * ภาคกลางไม่รวมกรุงเทพฯ');
    });
  }

  // ----- seasonality page: year x month heatmap and one line per year -----
  var SE = { mode: 'units' };
  function renderSeasonality() {
    var isos = areaProvinces(M.area), cats = selCats(), years = {}, all = okPeriods();   // every year; types and area follow the filters
    all.forEach(function (p) {
      var y = p.slice(0, 4), v = 0;
      cats.forEach(function (c) { v += unitsFor(p, isos, c); });
      (years[y] = years[y] || {})[+p.slice(5, 7)] = v;
    });
    var ys = Object.keys(years).sort(), max = 0, min = Infinity;
    ys.forEach(function (y) { Object.keys(years[y]).forEach(function (m) { max = Math.max(max, years[y][m]); min = Math.min(min, years[y][m]); }); });
    var trs = ys.map(function (y) {
      var row = years[y], vals = Object.keys(row).map(function (m) { return row[m]; }), avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
      var tr = el('tr');
      tr.appendChild(el('th', { scope: 'row' }, String(yearOf(+y))));
      for (var m = 1; m <= 12; m++) {
        if (row[m] === undefined) { tr.appendChild(el('td', { class: 'n na' }, '—')); continue; }
        var td = SE.mode === 'units' ? heatCell(fmtK(row[m]), 8 + 72 * (row[m] - min) / ((max - min) || 1))   // lowest month to highest
          : heatCell(Math.round(100 * row[m] / avg) + '', Math.min(80, Math.abs(100 * row[m] / avg - 100) * 1.2), row[m] < avg);
        td.title = TH_MONTHS[m - 1] + ' ' + yearOf(+y) + ': ' + fmt(row[m]) + L(' units · ', ' คัน · ') + Math.round(100 * row[m] / avg) + L('% of that year\'s monthly average', '% ของค่าเฉลี่ยรายเดือนปีนั้น');
        tr.appendChild(td);
      }
      tr.appendChild(el('td', { class: 'n' }, fmtK(vals.reduce(function (a, b) { return a + b; }, 0)) + (vals.length < 12 ? ' (' + vals.length + L(' mo)', ' ด.)') : '')));
      return tr;
    });
    var box = document.getElementById('seasonHeat');
    box.textContent = '';
    var t = table([[L('Year', 'ปี')]].concat(TH_MONTHS.map(function (m) { return [m, 1]; })).concat([[L('Total', 'รวม'), 1]]), trs);
    t.classList.add('heatmap');
    box.appendChild(t);

    var o = baseOptions();
    o.scales.y.ticks.callback = kTicks;
    o.plugins.tooltip.callbacks.label = function (c) { return ' ' + c.dataset.label + ': ' + (c.raw === null ? L('No data', 'ไม่มีข้อมูล') : fmt(c.raw) + L(' units', ' คัน')); };
    if (charts.season) charts.season.destroy();
    var recent = ys.slice(-6), seasonCanvas = document.getElementById('seasonChart');
    // older years fade into the background, the latest year is bold orange
    function yearColor(i) { return i === recent.length - 1 ? seriesColor(1) : css('--q' + Math.max(1, 5 - (recent.length - 2 - i))); }
    if (withEndLabels(o, seasonCanvas, recent.map(function (y) { return String(yearOf(+y)); }))) o.plugins.legend.display = false;
    charts.season = new Chart(seasonCanvas, {
      type: 'line', options: o, plugins: [endLabels],
      data: { labels: TH_MONTHS, datasets: recent.map(function (y, i) {
        var last = i === recent.length - 1;
        return { label: String(yearOf(+y)), data: TH_MONTHS.map(function (m, j) { return years[y][j + 1] === undefined ? null : years[y][j + 1]; }),
          borderColor: yearColor(i), backgroundColor: yearColor(i), borderWidth: last ? 3 : 1.75, pointRadius: last ? 3 : 0, tension: 0, spanGaps: false };
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
    // the last bar holds every unit without a price, so empty bands are not read as zero sales
    var missing = { units: Math.max(0, total - covered), models: sortedIds(units).filter(function (id) { return !priceRange(id); }) };
    band.push(missing);
    document.getElementById('priceCoverage').textContent = L('Official-website prices for ', 'มีราคาจากเว็บไซต์ทางการ ') + priced.length + L(' models, covering ', ' รุ่น คิดเป็น ') +
      (total ? (100 * covered / total).toFixed(1) : 0) + L('% of registrations under these filters · bands use each model\'s starting price · % is of all registrations; the grey bar is everything without a price yet', '% ของยอดจดทะเบียนในตัวกรองนี้ · จัดช่วงตามราคาเริ่มต้นของแต่ละรุ่น · % คิดจากยอดทั้งหมด แท่งสีเทาคือยอดที่ยังไม่มีราคา');
    var o = baseOptions();
    o.plugins.legend.display = false;
    o.scales.y.ticks.callback = kTicks;
    o.scales.x.ticks.autoSkip = false; o.scales.x.ticks.maxRotation = 45;
    o.layout = { padding: { top: 18 } };
    o.plugins.tooltip.callbacks.label = function (c) { return ' ' + fmt(c.raw) + L(' units · ', ' คัน · ') + band[c.dataIndex].models.length + L(' models', ' รุ่น'); };
    o.plugins.tooltip.callbacks.afterLabel = function (c) {
      var ms = band[c.dataIndex].models;
      if (band[c.dataIndex] !== missing) return ms.map(modelName).join(', ');
      return L('Biggest without a price: ', 'รุ่นใหญ่ที่ยังไม่มีราคา: ') + ms.slice(0, 8).map(modelName).join(', ') + L(' · also units with unmatched model names', ' · รวมยอดที่ยังจับคู่ชื่อรุ่นไม่ได้');
    };
    if (charts.priceBand) charts.priceBand.destroy();
    charts.priceBand = new Chart(document.getElementById('priceBandChart'), {
      type: 'bar', options: o,
      data: { labels: PRICE_BANDS.map(function (b) { return b[2]; }).concat(L('No price data', 'ยังไม่มีราคา')), datasets: [{ data: band.map(function (b) { return b.units; }),
        backgroundColor: band.map(function (b) { return b === missing ? css('--hatch') : css('--accent'); }), borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'start', maxBarThickness: 56 }] },
      plugins: [{ id: 'bandLabels', afterDatasetsDraw: function (ch) {
        var ctx = ch.ctx, meta = ch.getDatasetMeta(0);
        ctx.save(); ctx.font = '11px ' + css('--font'); ctx.textAlign = 'center'; ctx.fillStyle = css('--ink-2');
        meta.data.forEach(function (bar, i) {
          var b = band[i];
          ctx.fillText(b.units || b.models.length ? fmtK(b.units) + ' · ' + (total ? Math.round(100 * b.units / total) : 0) + '%' : L('no model priced yet', 'ยังไม่มีรุ่นที่มีราคา'), bar.x, bar.y - 6);
        });
        ctx.restore();
      } }]
    });

    var pts = priced.map(function (id) { var r = priceRange(id); return { x: r[0] / 1000, y: units[id] || 0, id: id, max: r[1] }; });
    var so = baseOptions();
    so.plugins.legend.display = false;
    so.interaction = { mode: 'nearest', intersect: true };
    so.scales.x = { type: 'linear', grid: { color: css('--grid') }, ticks: { color: css('--muted'), callback: function (v) { return v >= 1000 ? '฿' + (v / 1000) + 'M' : '฿' + v + 'k'; } },
      title: { display: true, text: L('Starting price (official website)', 'ราคาเริ่มต้น (เว็บไซต์ทางการ)'), color: css('--muted') } };
    so.scales.y.ticks.callback = kTicks;
    so.scales.y.title = { display: true, text: L('Registrations in the selected period', 'ยอดจดทะเบียนในช่วงที่เลือก'), color: css('--muted') };
    so.plugins.tooltip.callbacks.label = function (c) { var p = c.raw; return ' ' + modelName(p.id) + ': ' + rangeText(priceRange(p.id)) + ' · ' + fmt(p.y) + L(' units', ' คัน'); };
    so.onClick = function (e, els) { if (els.length) location.hash = '#/model/' + pts[els[0].index].id + filterQuery(); };
    if (charts.priceScatter) charts.priceScatter.destroy();
    charts.priceScatter = new Chart(document.getElementById('priceScatter'), {
      type: 'scatter', options: so, plugins: [{ id: 'ptLabels', afterDatasetsDraw: function (ch) {
        var ctx = ch.ctx, meta = ch.getDatasetMeta(0), area = ch.chartArea, boxes = [];
        var dots = meta.data.map(function (pt) { return { l: pt.x - 7, r: pt.x + 7, t: pt.y - 7, b: pt.y + 7 }; });   // labels avoid other models' dots too
        ctx.save(); ctx.fillStyle = css('--ink-2'); ctx.font = '11px ' + css('--font');
        pts.map(function (p, i) { return i; }).sort(function (a, b) { return pts[b].y - pts[a].y; }).forEach(function (i) {
          var pt = meta.data[i], text = D.modelInfo[pts[i].id].name, w = ctx.measureText(text).width;
          var right = { l: pt.x + 7, r: pt.x + 9 + w, t: pt.y - 6, b: pt.y + 7 }, left = { l: pt.x - 9 - w, r: pt.x - 7, t: pt.y - 6, b: pt.y + 7 };
          function hit(bx, o) { return bx.l < o.r && bx.r > o.l && bx.t < o.b && bx.b > o.t; }
          function free(bx) { return bx.l >= 0 && bx.r <= ch.width && !boxes.some(function (o) { return hit(bx, o); }) && !dots.some(function (o, j) { return j !== i && hit(bx, o); }); }
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
    box.appendChild(table([[L('Model', 'รุ่น')], [L('Price (official website)', 'ราคา (เว็บไซต์ทางการ)'), 1], [L('Variants', 'รุ่นย่อย'), 1], [L('Units', 'คัน'), 1]], trs));
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
  var LA = { mode: 'cum' };
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
    // The chart compares like with like: models with at least 3 months since launch, ranked by those first 3 months.
    // (Ranking by 6 months mixed full 6-month totals with 3- or 4-month totals of the newest models.)
    var top = launches.filter(function (x) { return x.curve.length >= 3 && x.first3 > 0; })
      .sort(function (a, b) { return b.first3 - a.first3; }).slice(0, 8);
    var cum = LA.mode === 'cum';
    var o = baseOptions();
    o.scales.y.ticks.callback = kTicks;
    o.scales.y.title = { display: true, text: cum ? L('Cumulative registrations', 'ยอดจดทะเบียนสะสม') : L('Registrations per month', 'ยอดจดทะเบียนต่อเดือน'), color: css('--muted') };
    o.scales.x.title = { display: true, text: L('Months since launch', 'เดือนที่นับจากเดือนเปิดตัว'), color: css('--muted') };
    o.plugins.tooltip.callbacks.title = function (items) { return L('Month ', 'เดือนที่ ') + items[0].label; };
    o.plugins.tooltip.callbacks.label = function (c) { return ' ' + c.dataset.label + ': ' + fmt(c.raw) + L(' units', ' คัน'); };
    if (charts.launch) charts.launch.destroy();
    var canvas = document.getElementById('launchChart'), empty = document.getElementById('launchEmpty');
    canvas.parentNode.hidden = !top.length;
    empty.hidden = !!top.length;
    empty.textContent = launches.length ? L('No new model has 3 months of data under these filters yet; see the table below', 'ยังไม่มีรุ่นใหม่ที่มีข้อมูลครบ 3 เดือนในตัวกรองนี้ ดูรายการได้ในตารางด้านล่าง')
      : L('No model launched in the selected period; try a longer range', 'ไม่มีรุ่นที่เริ่มมีทะเบียนในช่วงที่เลือก ลองเลือกช่วงที่ยาวขึ้น');
    if (top.length) charts.launch = new Chart(canvas, {
      type: 'line', options: o,
      data: { labels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], datasets: top.map(function (x, i) {
        var run = 0, data = cum ? x.curve.map(function (v) { return (run += v); }) : x.curve;
        return { label: modelName(x.id) + ' (' + monthLabel(x.start) + ')', data: data, borderColor: seriesColor(i), backgroundColor: seriesColor(i),
          borderWidth: 2, pointRadius: 2, pointHoverRadius: 5, tension: 0 };   // straight segments: no curve overshooting the data
      }) }
    });
    document.getElementById('launchNote').textContent = L(
      'Models launched in the selected period (models present since the start of the data, Jan 2021, are left out) · the chart compares the 8 with the most units in their first 3 months, among models launched at least 3 months ago · ' +
      'the "launch month" comes from whole-country, all-type units: the first month with at least 20 units and at least 3% of the model\'s best month (earlier registrations are under "Registered before launch"); it is not the official launch date · ' +
      'the vehicle types and area you select change the units only',
      'รุ่นที่เปิดตัวในช่วงที่เลือก (ไม่นับรุ่นที่มีตั้งแต่ต้นข้อมูล ม.ค. 2564) · กราฟเทียบ 8 รุ่นที่ยอด 3 เดือนแรกสูงสุด เฉพาะรุ่นที่เปิดตัวมาแล้วอย่างน้อย 3 เดือน · ' +
      '"เดือนเปิดตัว" คิดจากยอดทั้งประเทศทุกประเภทรถ: เดือนแรกที่มีอย่างน้อย 20 คันและไม่ต่ำกว่า 3% ของเดือนสูงสุดของรุ่นนั้น (ทะเบียนก่อนหน้านั้นอยู่ในคอลัมน์ "ทะเบียนก่อนเปิดตัว") ไม่ใช่วันเปิดตัวทางการ · ' +
      'ประเภทรถและพื้นที่ที่เลือกเปลี่ยนเฉพาะจำนวนคัน');
    var trs = launches.sort(function (a, b) { return b.start.localeCompare(a.start) || b.first3 - a.first3; }).map(function (x) {
      return add(el('tr'), add(el('td', { class: 'name' }), link('#/model/' + x.id + filterQuery(), modelName(x.id))), el('td', {}, monthLabel(x.start, true)),
        el('td', { class: 'n' }, String(all.length - all.indexOf(x.start))), el('td', { class: 'n' }, fmt(x.first3)),
        el('td', { class: 'n' }, x.curve.length >= 6 ? fmt(x.first6) : '—'), el('td', { class: 'n' }, fmt(x.total)),
        el('td', { class: 'n' }, x.pre ? fmt(x.pre) + L(' (since ', ' (ตั้งแต่ ') + monthLabel(x.seen) + ')' : '—'),
        el('td', { class: 'n' }, rangeText(priceRange(x.id))));
    });
    var box = document.getElementById('launchTable');
    box.textContent = '';
    box.appendChild(trs.length ? table([[L('Model', 'รุ่น')], [L('Launch month', 'เดือนเปิดตัว')], [L('Months', 'จำนวนเดือน'), 1], [L('First 3 months', '3 เดือนแรก'), 1], [L('First 6 months', '6 เดือนแรก'), 1], [L('Total to date', 'รวมถึงปัจจุบัน'), 1], [L('Registered before launch', 'ทะเบียนก่อนเปิดตัว'), 1], [L('Price', 'ราคา'), 1]], trs)
      : el('p', { class: 'note' }, L('No model launched in the selected period; try a longer range', 'ไม่มีรุ่นที่เริ่มมีทะเบียนในช่วงที่เลือก ลองเลือกช่วงที่ยาวขึ้น')));
  }

  // ----- powertrain page: fuel types from the DLT brand x fuel file -----
  var FUELS = [['bev', L('Battery electric (BEV)', 'ไฟฟ้า (BEV)')], ['phev', L('Plug-in hybrid (PHEV)', 'ปลั๊กอินไฮบริด (PHEV)')], ['hev', L('Hybrid (HEV)', 'ไฮบริด (HEV)')], ['petrol', L('Petrol', 'เบนซิน')], ['diesel', L('Diesel', 'ดีเซล')], ['gas', L('Gas (LPG/CNG)', 'ก๊าซ (LPG/CNG)')]];
  function fuelMix(idx, months, cats) {
    var s = sumById(idx, 'f', months, cats), o = {};
    FUELS.forEach(function (f) { o[f[0]] = s[f[0]] || 0; });
    return o;
  }
  function renderPowertrain(idx) {
    var b = buckets(), cats = selCats(), months = selectedMonths();
    var per = b.order.map(function (k) { return fuelMix(idx, b.months[k], cats); }), tot = per.map(sumValues);
    stackedArea('fuel', document.getElementById('fuelChart'), b.labels, FUELS.map(function (f, i) {
      return { label: f[1], color: fuelColor(f[0]), data: per.map(function (o, j) { return tot[j] ? 100 * o[f[0]] / tot[j] : 0; }) };
    }), { units: FUELS.map(function (f) { return per.map(function (o) { return o[f[0]]; }); }) });

    var cur = fuelMix(idx, months, cats), pm = priorMonths(months);
    var prevOk = priorOk(months), prev = prevOk ? fuelMix(idx, pm, cats) : null;
    var ct = sumValues(cur), pt = prev ? sumValues(prev) : 0;
    var box = document.getElementById('fuelStats');
    box.textContent = '';
    FUELS.forEach(function (f, i) {
      var share = ct ? 100 * cur[f[0]] / ct : 0, ps = pt ? 100 * prev[f[0]] / pt : null;
      var st = add(el('div', { class: 'stat' }), el('span', { class: 'label' }, f[1]), el('span', { class: 'value' }, share.toFixed(1) + '%'),
        el('span', { class: 'detail ' + (ps === null ? '' : ptsClass(share - ps)) },
          (ps === null ? '' : ptsText(share - ps) + ' · ') + fmt(cur[f[0]]) + L(' units', ' คัน')));
      st.style.borderLeftColor = fuelColor(f[0]);
      box.appendChild(st);
    });
    basisNote(box, months, prevOk);

    // BEV brands: top 10 by battery-electric registrations in the range
    var bf = sumById(idx, 'bf', months, cats), bev = {}, bevTot = 0;
    Object.keys(bf).forEach(function (k) { var p = k.split('|'); if (p[1] === 'bev') { bev[p[0]] = bf[k]; bevTot += bf[k]; } });
    var topBev = sortedIds(bev).slice(0, 12);
    hbar('bevRank', document.getElementById('bevChart'), topBev.map(brandLabel), topBev.map(function (id) { return bev[id]; }),
      topBev.map(function (id) { return fmt(bev[id]) + L(' units · ', ' คัน · ') + (100 * bev[id] / bevTot).toFixed(1) + L('% of BEV', '% ของ BEV'); }),
      function (i) { location.hash = '#/brand/' + topBev[i] + filterQuery(); },
      topBev.map(function (id) { return fmt(bev[id]) + ' · ' + (100 * bev[id] / bevTot).toFixed(0) + '%'; }), fuelColor('bev'));

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
      type: 'bar', options: o, plugins: [segLabels],
      data: { labels: top.map(brandLabel), datasets: FUELS.map(function (f, i) {
        return { label: f[1], backgroundColor: fuelColor(f[0]), borderColor: css('--surface'), borderWidth: { right: 1 }, borderSkipped: false, barPercentage: 0.75,
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
        type: 'bar', options: ro, plugins: [segLabels],
        data: { labels: REGION_GROUPS.map(function (r) { return r[1]; }), datasets: FUELS.map(function (f, i) {
          return { label: f[1], backgroundColor: fuelColor(f[0]), borderColor: css('--surface'), borderWidth: { right: 1 }, borderSkipped: false, barPercentage: 0.75,
            data: REGION_GROUPS.map(function (r) { var t = sumValues(gt[r[0]]); return t ? 100 * (gt[r[0]][f[0]] || 0) / t : 0; }) };
        }) }
      });
    });
  }

  // ---------- detail pages (brand, model, compare) follow the shared filters ----------
  // Units, share and rank of one brand or model within the selected area, months and categories.
  function standing(idx, kind, id, months, cats) {
    var cur = sumById(idx, kind, months, cats), total = sumValues(sumById(idx, 'b', months, cats));
    var ids = sortedIds(cur), pm = priorMonths(months);
    var prev = priorOk(months) ? sumById(idx, kind, pm, cats) : null;
    return {
      prior: priorText(months, 'noun'), priorShort: priorText(months, 'short'),
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
  function lastYearMark(c) { var bar = c.chart.getDatasetMeta(0).data[c.dataIndex]; return bar && bar.width ? bar.width / 2 + 3 : 8; }
  function barsVsLastYear(key, root, title, name, labels, values, prev) {
    var c = card(title, name);
    var box = add(el('div', { class: 'chart-box' }), el('canvas', { 'aria-label': title + ' ' + name }));
    c.appendChild(box); root.appendChild(c);
    var o = baseOptions();
    o.scales.y.ticks.callback = kTicks;
    o.plugins.tooltip.callbacks.label = function (ctx) { return ctx.raw === null ? null : ' ' + ctx.dataset.label + ': ' + fmt(ctx.raw) + L(' units', ' คัน'); };
    charts[key] = new Chart(box.firstChild, {
      data: { labels: labels, datasets: [
        { type: 'bar', label: name, data: values, backgroundColor: css('--accent'), borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'start', maxBarThickness: 34, order: 2 },
        { type: 'line', label: L('Same period last year', 'ช่วงเดียวกันปีก่อน'), data: prev, showLine: false, pointStyle: 'line',
          pointRadius: lastYearMark, pointHoverRadius: lastYearMark, pointBorderWidth: 2.5, pointHoverBorderWidth: 3.5, borderColor: css('--ink'), backgroundColor: css('--ink'), order: 0 }
      ] },
      options: o
    });
  }
  function regionBreakdown(key, root, kind, id, name, months, cats) {
    var c = card(L('By region', 'แยกตามภูมิภาค'), name, L('Period and categories follow the filters, all regions shown · % is the share of ', 'ช่วงเวลาและประเภทรถตามตัวกรอง แสดงทุกภูมิภาค · % คือส่วนแบ่งของ') + name + L(' in that region\'s market', 'ในตลาดภาคนั้น'));
    var box = add(el('div', { class: 'chart-box' }), el('canvas', { 'aria-label': L('Registrations of ', 'ยอดจดทะเบียนของ ') + name + L(' by region', ' แยกตามภูมิภาค') }));
    c.appendChild(box); root.appendChild(c);
    loadRegionGroups().then(function (groups) {
      var gt = groupTotals(groups, kind, months, cats), bt = groupTotals(groups, 'b', months, cats);
      var vals = REGION_GROUPS.map(function (r) { return gt[r[0]][id] || 0; });
      var shares = REGION_GROUPS.map(function (r, i) { var t = sumValues(bt[r[0]]); return t ? 100 * vals[i] / t : 0; });
      if (!box.isConnected) return;
      hbar(key, box.firstChild, REGION_GROUPS.map(function (r) { return r[1]; }), vals,
        vals.map(function (v, i) { return fmt(v) + L(' units · ', ' คัน · ') + shares[i].toFixed(1) + '%'; }), null,
        vals.map(function (v, i) { return fmt(v) + ' · ' + shares[i].toFixed(1) + '%'; }));
    });
  }
  function rankText(s, what) {
    if (!s.rank) return L('No units under these filters', 'ไม่มียอดในตัวกรองนี้');
    var t = L('Rank ', 'อันดับ ') + s.rank + L(' of ', ' จาก ') + s.of + ' ' + what;
    if (s.prevRank) t += s.prevRank === s.rank ? L(' (unchanged vs ', ' (เท่าเดิมเมื่อเทียบกับ') + s.prior + ')' : L(' (was ', ' (เดิมอันดับ ') + s.prevRank + L(' in ', ' ใน') + s.prior + ')';
    return t;
  }

  // ---------- brand page ----------
  function renderBrand(root, brandId, idx) {
    if (!D.brandName[brandId]) { notFound(root, L('Brand not found: ', 'ไม่พบยี่ห้อ ') + brandId); return; }
    var name = brandLabel(brandId), months = selectedMonths(), cats = selCats(), b = buckets(), area = areaLabel(M.area);
    add(root, crumbs([[name]]), el('h2', { class: 'page-title' }, name), el('p', { class: 'note filter-echo' }, filterText()));
    var s = standing(idx, 'b', brandId, months, cats);
    var models = Object.keys(D.modelInfo).filter(function (id) { return D.modelInfo[id].brand_id === brandId; });
    var mUnits = sumById(idx, 'm', months, cats), active = models.filter(function (id) { return mUnits[id]; });
    var last = months[months.length - 1], lastV = sumById(idx, 'b', [last], cats)[brandId] || 0;
    add(root, add(el('section', { class: 'tiles' }),
      tile(L('Registrations · ', 'ยอดจดทะเบียน · ') + area, fmt(s.units) + L(' units', ' คัน'), monthLabel(months[0]) + ' – ' + monthLabel(last) + (s.yoy === null ? '' : ' · ' + s.priorShort + ' ' + pctText(s.yoy))),
      tile(L('Market share', 'ส่วนแบ่งตลาด'), s.share.toFixed(1) + '%', rankText(s, L('brands', 'ยี่ห้อ'))),
      tile(L('Latest month · ', 'เดือนล่าสุด · ') + monthLabel(last, true), fmt(lastV) + L(' units', ' คัน'), ''),
      tile(L('Models with units', 'รุ่นที่มียอด'), active.length + L(' models', ' รุ่น'), L('matched names under these filters', 'ที่จับคู่ชื่อได้ในตัวกรองนี้'))));

    root.appendChild(add(el('div', { class: 'controls' }), link(compareHref('b', [brandId]), L('Compare with other brands →', 'เปรียบเทียบกับยี่ห้ออื่น →'), 'btn')));
    barsVsLastYear('d-brand', root, L('Registrations', 'ยอดจดทะเบียน'), name, b.labels, seriesFor(idx, 'b', brandId, b, cats), prevSeriesFor(idx, 'b', brandId, b, cats));

    // powertrain mix of this brand
    var fc = card(L('Fuel type', 'ชนิดเชื้อเพลิง'), name, L('From the DLT brand × fuel file', 'จากไฟล์ยี่ห้อ × ชนิดเชื้อเพลิงของกรมฯ'));
    var fbox = add(el('div', { class: 'chart-box' }), el('canvas', { 'aria-label': L('Registrations of ', 'ยอดจดทะเบียนของ ') + name + L(' by fuel type', ' ตามชนิดเชื้อเพลิง') }));
    fc.appendChild(fbox); root.appendChild(fc);
    var fo = baseOptions();
    fo.scales.x.stacked = true; fo.scales.y.stacked = true; fo.scales.y.ticks.callback = kTicks;
    fo.plugins.tooltip.callbacks.label = function (ctx) { return ctx.raw ? ' ' + ctx.dataset.label + ': ' + fmt(ctx.raw) + L(' units', ' คัน') : null; };
    charts['d-brandFuel'] = new Chart(fbox.firstChild, {
      type: 'bar', options: fo,
      data: { labels: b.labels, datasets: FUELS.map(function (f, i) {
        return { label: f[1], backgroundColor: fuelColor(f[0]), borderColor: css('--surface'), borderWidth: { top: 1 }, borderSkipped: 'start', maxBarThickness: 34,
          data: seriesFor(idx, 'bf', brandId + '|' + f[0], b, cats) };
      }).filter(function (d) { return d.data.some(function (v) { return v; }); }) }
    });

    regionBreakdown('d-brandRegion', root, 'b', brandId, name, months, cats);

    // models table with compare checkboxes
    var mc = card(L('Models of ', 'รุ่นของ ') + name, 'Models', L('Units in the selected period and area · click a model for details · tick 2–', 'ยอดในช่วงและพื้นที่ที่เลือก · กดชื่อรุ่นเพื่อดูรายละเอียด · เลือก 2–') + MAX_COMPARE + L(' models to compare', ' รุ่นเพื่อเปรียบเทียบ'));
    var cmp = el('a', { class: 'btn', href: '#/compare/' }, L('Compare selected', 'เปรียบเทียบที่เลือก'));
    mc.head.appendChild(cmp);
    var wrap = el('div', { class: 'table-wrap' });
    mc.appendChild(wrap); root.appendChild(mc);
    var picked = [], allRank = sortedIds(mUnits), pm = priorMonths(months), own = {};
    own[brandId] = s.units;
    var base = brandBase(brandId, own, mUnits);
    var prev = priorOk(months) ? sumById(idx, 'm', pm, cats) : null;
    function updateCompare() {
      cmp.setAttribute('href', compareHref('m', picked));
      cmp.textContent = L('Compare selected (', 'เปรียบเทียบที่เลือก (') + picked.length + ')';
      cmp.classList.toggle('disabled', picked.length < 2);
    }
    var trs = active.sort(function (a, c) { return mUnits[c] - mUnits[a]; }).map(function (id) {
      var tr = el('tr'), cb = el('input', { type: 'checkbox', 'aria-label': L('Select ', 'เลือก ') + modelName(id) + L(' to compare', ' เพื่อเปรียบเทียบ') });
      cb.addEventListener('change', function () {
        if (cb.checked) { if (picked.length >= MAX_COMPARE) { cb.checked = false; return; } picked.push(id); }
        else picked.splice(picked.indexOf(id), 1);
        updateCompare();
      });
      add(tr, add(el('td'), cb), add(el('td', { class: 'name' }), link('#/model/' + id + filterQuery(), modelName(id))),
        el('td', { class: 'n' }, fmt(mUnits[id])), el('td', { class: 'n' }, base ? (100 * mUnits[id] / base).toFixed(1) + '%' : '—'),
        el('td', { class: 'n' }, String(allRank.indexOf(id) + 1)),
        pctCell(prev && prev[id] ? (100 * (mUnits[id] - prev[id]) / prev[id]).toFixed(2) : ''), el('td', { class: 'n' }, rangeText(priceRange(id))));
      return tr;
    });
    wrap.appendChild(trs.length ? table([['', 0], [L('Model', 'รุ่น')], [L('Units', 'คัน'), 1], [L('% of brand', '% ของยี่ห้อ'), 1], [L('Model rank', 'อันดับรุ่น'), 1], [priorText(months, 'short'), 1], [L('Price (official)', 'ราคา (ทางการ)'), 1]], trs)
      : el('p', { class: 'note' }, L('No matched model has units under these filters', 'ไม่มียอดจดทะเบียนของรุ่นที่จับคู่ได้ในตัวกรองนี้')));
    updateCompare();

    var totals = b.order.map(function (k) { return sumValues(sumById(idx, 'b', b.months[k], cats)); });
    var cache = {};
    makeTrend(root, {
      key: 'd-brandModels', title: L('Model trend of ', 'เทรนด์รายรุ่นของ ') + name, subtitle: 'Model trend', nameOf: modelName,
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
    if (!info) { notFound(root, L('Model not found: ', 'ไม่พบรุ่น ') + modelId); return; }
    var name = modelName(modelId), months = selectedMonths(), cats = selCats(), b = buckets(), area = areaLabel(M.area);
    add(root, crumbs([[brandLabel(info.brand_id), '#/brand/' + info.brand_id + filterQuery()], [info.name]]), el('h2', { class: 'page-title' }, name),
      el('p', { class: 'note filter-echo' }, filterText()));
    var s = standing(idx, 'm', modelId, months, cats), brandUnits = brandBase(info.brand_id, sumById(idx, 'b', months, cats), sumById(idx, 'm', months, cats));
    var range = priceRange(modelId), last = months[months.length - 1];
    add(root, add(el('section', { class: 'tiles' }),
      tile(L('Registrations · ', 'ยอดจดทะเบียน · ') + area, fmt(s.units) + L(' units', ' คัน'), monthLabel(months[0]) + ' – ' + monthLabel(last) + (s.yoy === null ? '' : ' · ' + s.priorShort + ' ' + pctText(s.yoy))),
      tile(L('Market share', 'ส่วนแบ่งตลาด'), s.share.toFixed(2) + '%', rankText(s, L('models', 'รุ่น'))),
      tile(L('Share of brand', 'สัดส่วนในยี่ห้อ'), brandUnits ? (100 * s.units / brandUnits).toFixed(1) + '%' : '—', L('of ', 'ของยอด ') + brandLabel(info.brand_id)),
      tile(L('Price (official website)', 'ราคา (เว็บไซต์ทางการ)'), range ? rangeText(range) : L('No data yet', 'ยังไม่มีข้อมูล'), range ? range[2] + L(' variants', ' รุ่นย่อย') : L('Help add it on GitHub', 'ช่วยเพิ่มได้ที่ GitHub'))));
    root.appendChild(add(el('div', { class: 'controls' }), link(compareHref('m', [modelId]), L('Compare with other models →', 'เปรียบเทียบกับรุ่นอื่น →'), 'btn')));

    var totals = b.order.map(function (k) { return sumValues(sumById(idx, 'b', b.months[k], cats)); }), cache = {};
    makeTrend(root, {
      key: 'd-model', title: L('Registrations', 'ยอดจดทะเบียน'), subtitle: L('Add other models to compare', 'เพิ่มรุ่นอื่นเพื่อเปรียบเทียบ'), nameOf: modelName,
      href: function (id) { return '#/model/' + id + filterQuery(); }, options: modelOptions(),
      labels: function () { return b.labels; },
      values: function (id, mode) {
        cache[id] = cache[id] || seriesFor(idx, 'm', id, b, cats);
        return mode === 'units' ? cache[id] : cache[id].map(function (v, i) { return totals[i] ? +(100 * v / totals[i]).toFixed(2) : 0; });
      },
      defaults: function () { return [modelId]; },
      note: L('Follows the filters above · new registrations, not sales · search to add other models to the same chart', 'ตามตัวกรองด้านบน · ยอดจดทะเบียนใหม่ ไม่ใช่ยอดขาย · ค้นหาเพื่อเพิ่มรุ่นอื่นลงกราฟเดียวกัน')
    });

    regionBreakdown('d-modelRegion', root, 'm', modelId, name, months, cats);
    renderPrices(root, modelId);

    var vc = card(L('Variant names as recorded by the DLT', 'ชื่อรุ่นย่อยตามที่กรมฯ บันทึก'), monthLabel(months[0]) + ' – ' + monthLabel(last) + L(' · whole country', ' · ทั้งประเทศ'),
      L('Names from DLT vehicle registrations, not always the manufacturer\'s official trim names; some brands report only the model · this table is always national', 'เป็นชื่อในทะเบียนรถของกรมการขนส่งทางบก ไม่ใช่ชื่อรุ่นย่อยทางการของค่ายรถเสมอไป บางค่ายแจ้งเฉพาะชื่อรุ่น · ตารางนี้เป็นยอดทั้งประเทศเสมอ'));
    var vbox = el('div', { class: 'table-wrap' }, L('Loading…', 'กำลังโหลด…'));
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
      vbox.appendChild(list.length ? table([[L('Registered name', 'ชื่อในทะเบียน')], [L('Category', 'ประเภท')], [L('Units', 'คัน'), 1], [L('Share', 'สัดส่วน'), 1], [L('Last month seen', 'เดือนล่าสุดที่มี'), 1]], list.map(function (x) {
        return add(el('tr'), el('td', {}, x.variant || L('(blank)', '(ว่าง)')), el('td', {}, CAT_LABEL[x.category] || x.category),
          el('td', { class: 'n' }, fmt(x.units)), el('td', { class: 'n' }, (100 * x.units / total).toFixed(1) + '%'),
          el('td', { class: 'n' }, monthLabel(x.last)));
      })) : el('p', { class: 'note' }, L('No registrations in the selected period', 'ไม่มีการจดทะเบียนในช่วงที่เลือก')));
    });
  }

  function renderPrices(root, modelId) {
    var pc = card(L('Price', 'ราคา'), 'Price', L('Prices shown on the manufacturer\'s official website on the date recorded; actual prices vary with promotions and dealers', 'ราคาที่แสดงบนเว็บไซต์ทางการของค่ายรถ ณ วันที่บันทึก ราคาจริงอาจต่างตามโปรโมชันและตัวแทนจำหน่าย'));
    root.appendChild(pc);
    var all = (D.pricesBy[modelId] || []).slice();
    if (!all.length) {
      pc.appendChild(add(el('p', { class: 'note' }, L('No price verified from an official website yet for this model. ', 'ยังไม่มีข้อมูลราคาที่ยืนยันจากเว็บไซต์ทางการสำหรับรุ่นนี้ ')),
        link('https://github.com/sunJirapath/thai-auto-data/issues', L('Send a price with its source link', 'ส่งข้อมูลราคาพร้อมลิงก์แหล่งที่มา'))));
      return;
    }
    var cur = currentPrices(modelId);
    pc.appendChild(el('h3', {}, L('Current prices', 'ราคาปัจจุบัน')));
    pc.appendChild(add(el('div', { class: 'table-wrap' }), table([[L('Variants', 'รุ่นย่อย')], [L('Category', 'ประเภท')], [L('Price', 'ราคา'), 1], [L('As of', 'ข้อมูล ณ'), 1], [L('Source', 'แหล่งที่มา')]], cur.map(function (p) {
      return add(el('tr'), el('td', {}, p.variant), el('td', {}, p.price_type === 'list' ? L('Website price', 'ราคาบนเว็บ') : L('Promotion until ', 'โปรโมชัน ถึง ') + dateLabel(p.effective_to)),
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
        el('td', {}, p.price_type === 'list' ? L('Website price', 'ราคาบนเว็บ') : L('Promotion', 'โปรโมชัน')),
        el('td', { class: 'n' }, baht(p.price_thb)),
        el('td', { class: 'n ' + (d > 0 ? 'down' : d < 0 ? 'up' : 'na') }, d === null ? '—' : d === 0 ? L('Unchanged', 'เท่าเดิม') : (d > 0 ? '+' : '−') + fmt(Math.abs(d))),
        add(el('td'), link(p.source_url, p.source_publisher)));
    }).reverse();
    var det = add(el('details'), el('summary', {}, L('Full price history (', 'ประวัติราคาทั้งหมด (') + all.length + L(' records)', ' รายการ)')),
      add(el('div', { class: 'table-wrap' }), table([[L('Date', 'วันที่')], [L('Variants', 'รุ่นย่อย')], [L('Category', 'ประเภท')], [L('Price', 'ราคา'), 1], [L('Change', 'เปลี่ยนแปลง'), 1], [L('Source', 'แหล่งที่มา')]], rows)),
      el('p', { class: 'note' }, L('The date is the effective or publication date from the source, otherwise the date we recorded it. History starts when we started collecting, so it is not complete back in time', 'วันที่คือวันที่มีผลหรือวันที่เผยแพร่ตามแหล่งที่มา ถ้าไม่ระบุใช้วันที่เราบันทึก ประวัติเริ่มจากวันที่เราเริ่มเก็บ จึงไม่ครบย้อนหลัง')));
    pc.appendChild(det);
  }

  // ---------- compare page ----------
  // Up to MAX_COMPARE models or brands side by side, under the shared filters:
  //   #/compare/<model_id>,...        #/compare/brands/<brand_id>,...
  var CMP = { mode: 'units', focus: false };
  function compareHref(kind, ids) { return '#/compare/' + (kind === 'b' ? 'brands/' : '') + ids.join(',') + filterQuery(); }
  function parseCompareArg(arg) {
    var m = /^brands(?:\/(.*))?$/.exec(arg || '');
    return m ? { kind: 'b', ids: (m[1] || '').split(',').filter(Boolean) } : { kind: 'm', ids: (arg || '').split(',').filter(Boolean) };
  }
  function cmpKnown(kind, id) { return kind === 'b' ? !!D.brandName[id] : !!D.modelInfo[id]; }
  // switching models <-> brands keeps the selection meaningful: a model's brand, or a brand's best-selling model
  function switchKind(kind, ids, idx, months, cats) {
    var out = [];
    if (kind === 'm') ids.forEach(function (id) { var b = D.modelInfo[id].brand_id; if (out.indexOf(b) < 0) out.push(b); });
    else {
      var mu = sumById(idx, 'm', months, cats);
      ids.forEach(function (bid) {
        var top = sortedIds(mu).filter(function (id) { return D.modelInfo[id] && D.modelInfo[id].brand_id === bid; })[0];
        if (top) out.push(top);
      });
    }
    return out.slice(0, MAX_COMPARE);
  }
  function countryName(code) {
    if (!code) return '—';
    try { return new Intl.DisplayNames([LANG], { type: 'region' }).of(code); } catch (e) { return code; }
  }
  function csvCell(v) { v = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function downloadCSV(name, rows) {
    // BOM so Excel opens the Thai names as UTF-8
    var text = '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n';
    var a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // Search box: the WAI-ARIA APG combobox with list autocomplete (https://www.w3.org/WAI/ARIA/apg/patterns/combobox/),
  // keyboard behaviour after Downshift (MIT): arrows move, Enter picks, Escape closes then clears; focus stays in the box.
  // o: { id, label, placeholder, disabled, items: () => [{ id, label, sub, units }], onPick: id => void }
  function comboBox(o) {
    var wrap = el('div', { class: 'combo' }), listId = o.id + '-list';
    var input = el('input', { type: 'text', id: o.id, role: 'combobox', autocomplete: 'off', spellcheck: 'false', 'aria-autocomplete': 'list',
      'aria-expanded': 'false', 'aria-controls': listId, 'aria-label': o.label, placeholder: o.placeholder });
    input.disabled = !!o.disabled;
    var list = el('ul', { role: 'listbox', id: listId, class: 'combo-list', 'aria-label': o.label });
    var live = el('span', { class: 'sr-only', 'aria-live': 'polite' });
    var shown = [], active = -1;
    list.hidden = true;
    function filter(q) {
      var all = o.items(), toks = q.toLowerCase().split(/\s+/).map(function (t) { return t.replace(/[-_.()]/g, ''); }).filter(Boolean);
      if (!toks.length) return all.sort(function (a, b) { return b.units - a.units; }).slice(0, 8);   // empty box: biggest first
      var whole = toks.join('');
      return all.map(function (it) {
        var flat = it.label.toLowerCase().replace(/[\s\-_.()]+/g, '');
        if (!toks.every(function (t) { return flat.indexOf(t) >= 0; })) return null;
        var starts = flat.indexOf(whole) === 0 || it.label.toLowerCase().split(/[\s\-]+/).some(function (w) { return w.indexOf(toks[0]) === 0; });
        return { it: it, score: starts ? 0 : 1 };
      }).filter(Boolean)
        .sort(function (a, b) { return a.score - b.score || b.it.units - a.it.units || a.it.label.localeCompare(b.it.label); })
        .slice(0, 8).map(function (x) { return x.it; });
    }
    function setActive(i) {
      active = i;
      Array.prototype.forEach.call(list.children, function (li, k) { li.setAttribute('aria-selected', String(k === i)); });
      if (i >= 0) { input.setAttribute('aria-activedescendant', list.children[i].id); list.children[i].scrollIntoView({ block: 'nearest' }); }
      else input.removeAttribute('aria-activedescendant');
    }
    function open() {
      shown = filter(input.value);
      list.textContent = '';
      shown.forEach(function (it, k) {
        var li = add(el('li', { role: 'option', id: o.id + '-opt-' + k, 'aria-selected': 'false' }), el('span', {}, it.label), el('span', { class: 'sub' }, it.sub || ''));
        li.addEventListener('mousedown', function (e) { e.preventDefault(); pick(k); });   // keep focus in the box
        list.appendChild(li);
      });
      if (!shown.length) list.appendChild(el('li', { class: 'empty', role: 'option', 'aria-disabled': 'true' }, L('No match', 'ไม่พบ')));
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      live.textContent = shown.length ? shown.length + L(' results', ' รายการ') : L('No match', 'ไม่พบ');
      setActive(input.value.trim() && shown.length ? 0 : -1);
    }
    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); setActive(-1); }
    function pick(k) { var it = shown[k]; if (!it) return; input.value = ''; close(); o.onPick(it.id); }
    input.addEventListener('input', open);
    input.addEventListener('click', function () { if (list.hidden) open(); });
    input.addEventListener('blur', close);
    input.addEventListener('keydown', function (e) {
      var n = shown.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (list.hidden) { open(); return; }
        if (n) setActive(e.key === 'ArrowDown' ? (active + 1) % n : (active <= 0 ? n - 1 : active - 1));
      } else if (e.key === 'Enter') {
        if (!list.hidden && active >= 0) { e.preventDefault(); pick(active); }
      } else if (e.key === 'Escape') {
        if (!list.hidden) { e.preventDefault(); close(); } else input.value = '';
      }
    });
    add(wrap, input, list, live);
    wrap.input = input;
    return wrap;
  }

  function renderCompare(root, arg, idx) {
    var req = parseCompareArg(arg), kind = req.kind;
    var unknown = req.ids.filter(function (id) { return !cmpKnown(kind, id); });
    var ids = req.ids.filter(function (id, i, a) { return cmpKnown(kind, id) && a.indexOf(id) === i; }).slice(0, MAX_COMPARE);
    var months = selectedMonths(), cats = selCats(), last = months[months.length - 1];
    var cur = sumById(idx, kind, months, cats);
    var what = kind === 'b' ? L('brands', 'ยี่ห้อ') : L('models', 'รุ่น');
    var heading = kind === 'b' ? L('Compare brands', 'เปรียบเทียบยี่ห้อ') : L('Compare models', 'เปรียบเทียบรุ่น');
    add(root, crumbs([[heading]]),
      el('h2', { class: 'page-title' }, ids.length > 1 ? ids.map(function (id) { return nameFor(kind, id); }).join(' vs ') : heading),
      el('p', { class: 'note filter-echo' }, filterText()));
    function go(next) { location.hash = compareHref(kind, next); }

    // ----- picker -----
    var pick = card(kind === 'b' ? L('Choose brands', 'เลือกยี่ห้อ') : L('Choose models', 'เลือกรุ่น'), L('up to ', 'สูงสุด ') + MAX_COMPARE + ' ' + what,
      L('Search or pick a suggestion. Figures are new registrations under the filters above, not sales', 'ค้นหาหรือกดรายการแนะนำ ตัวเลขเป็นยอดจดทะเบียนใหม่ในตัวกรองด้านบน ไม่ใช่ยอดขาย'));
    var seg = el('div', { class: 'seg', role: 'group', 'aria-label': L('What to compare', 'เปรียบเทียบอะไร') });
    [['m', L('Models', 'รุ่น')], ['b', L('Brands', 'ยี่ห้อ')]].forEach(function (k) {
      var bt = el('button', { type: 'button', 'aria-pressed': String(k[0] === kind) }, k[1]);
      bt.addEventListener('click', function () { if (k[0] !== kind) location.hash = compareHref(k[0], switchKind(kind, ids, idx, months, cats)); });
      seg.appendChild(bt);
    });
    var full = ids.length >= MAX_COMPARE;
    var combo = comboBox({
      id: 'cmpSearch', disabled: full,
      label: kind === 'b' ? L('Search brands to compare', 'ค้นหายี่ห้อเพื่อเปรียบเทียบ') : L('Search models to compare', 'ค้นหารุ่นเพื่อเปรียบเทียบ'),
      placeholder: full ? L('Full: ', 'ครบ ') + MAX_COMPARE + L(' chosen, remove one to add', ' รายการ ลบก่อนเพิ่ม') : kind === 'b' ? L('Search brands…', 'ค้นหายี่ห้อ…') : L('Search models…', 'ค้นหารุ่น…'),
      items: function () {
        return Object.keys(kind === 'b' ? D.brandName : D.modelInfo).filter(function (id) { return ids.indexOf(id) < 0; }).map(function (id) {
          var u = cur[id] || 0;
          return { id: id, label: nameFor(kind, id), units: u, sub: u ? fmt(u) + L(' units', ' คัน') : L('none under these filters', 'ไม่มียอดในตัวกรองนี้') };
        });
      },
      onPick: function (id) { CMP.focus = true; go(ids.concat([id])); }
    });
    add(pick.head, add(el('div', { class: 'controls' }), seg, combo));

    var chips = el('div', { class: 'chips' });
    ids.forEach(function (id, i) {
      var dot = el('i'), x = el('button', { type: 'button', 'aria-label': L('Remove ', 'ลบ ') + nameFor(kind, id) }, '×');
      dot.style.background = seriesColor(i);
      x.addEventListener('click', function () { go(ids.filter(function (y) { return y !== id; })); });
      chips.appendChild(add(el('span', { class: 'chip' }), dot, link(hrefFor(kind, id), nameFor(kind, id), 'chip-link'), x));
    });
    if (ids.length > 1) {
      var clear = el('button', { type: 'button', class: 'linkbtn note' }, L('Clear all', 'ล้างทั้งหมด'));
      clear.addEventListener('click', function () { go([]); });
      chips.appendChild(clear);
    }
    pick.appendChild(chips);

    // suggestions: the biggest in the current filter, and ready-made sets
    if (!full) {
      var sug = add(el('div', { class: 'suggest' }), el('span', {}, L('Suggestions:', 'แนะนำ:')));
      sortedIds(cur).filter(function (id) { return cmpKnown(kind, id) && ids.indexOf(id) < 0; }).slice(0, 6).forEach(function (id) {
        var bt = el('button', { type: 'button', class: 'chip add', 'aria-label': L('Add ', 'เพิ่ม ') + nameFor(kind, id) }, nameFor(kind, id));
        bt.addEventListener('click', function () { go(ids.concat([id])); });
        sug.appendChild(bt);
      });
      pick.appendChild(sug);
    }
    var mUnits = sumById(idx, 'm', months, cats), bUnits = kind === 'b' ? cur : sumById(idx, 'b', months, cats);
    var bf = sumById(idx, 'bf', months, cats), bev = {};
    Object.keys(bf).forEach(function (k) { var p = k.split('|'); if (p[1] === 'bev') bev[p[0]] = bf[k]; });
    var sets = [
      [L('Top 4 models', '4 รุ่นยอดสูงสุด'), 'm', sortedIds(mUnits).filter(function (id) { return D.modelInfo[id]; }).slice(0, 4)],
      [L('Top 4 brands', '4 ยี่ห้อยอดสูงสุด'), 'b', sortedIds(bUnits).slice(0, 4)],
      [L('Top 4 EV (BEV) brands', '4 ยี่ห้อรถไฟฟ้า (BEV) ยอดสูงสุด'), 'b', sortedIds(bev).slice(0, 4)]
    ].filter(function (s) { return s[2].length > 1; });
    if (sets.length) {
      var quick = add(el('div', { class: 'suggest' }), el('span', {}, L('Ready-made:', 'ชุดสำเร็จรูป:')));
      sets.forEach(function (s) { quick.appendChild(link(compareHref(s[1], s[2]), s[0], 'chip-link quick')); });
      pick.appendChild(quick);
    }
    if (unknown.length) pick.appendChild(el('p', { class: 'note' }, L('Not found, skipped: ', 'ไม่พบและข้ามไป: ') + unknown.join(', ')));
    root.appendChild(pick);
    if (CMP.focus) { CMP.focus = false; if (!full) combo.input.focus(); }
    if (!ids.length) { pick.appendChild(el('p', { class: 'note' }, L('Nothing chosen yet. Pick at least 2 to compare', 'ยังไม่ได้เลือก เลือกอย่างน้อย 2 รายการเพื่อเปรียบเทียบ'))); return; }

    // ----- side-by-side table -----
    var all = okPeriods(), b = buckets(), span = monthLabel(months[0]) + '–' + monthLabel(last), monthCache = {};
    function monthUnits(p) { return monthCache[p] || (monthCache[p] = sumById(idx, kind, [p], cats)); }
    function unitsIn(ps, id) { var s = 0; ps.forEach(function (p) { s += monthUnits(p)[id] || 0; }); return s; }
    var end = all.indexOf(last), before = shiftMonth(last, -1);
    var last3 = end >= 5 ? all.slice(end - 2, end + 1) : null, prev3 = end >= 5 ? all.slice(end - 5, end - 2) : null;
    var S = {};
    ids.forEach(function (id) {
      var s = standing(idx, kind, id, months, cats);
      s.last = monthUnits(last)[id] || 0;
      var pb = D.okSet[before] ? monthUnits(before)[id] || 0 : 0;
      s.mom = pb ? 100 * (s.last - pb) / pb : null;
      var a = last3 ? unitsIn(last3, id) : 0, z = last3 ? unitsIn(prev3, id) : 0;
      s.momentum = z ? 100 * (a - z) / z : null;
      s.peak = null;
      months.forEach(function (p) { var v = monthUnits(p)[id] || 0; if (v && (!s.peak || v > s.peak[1])) s.peak = [p, v]; });
      if (kind === 'm') {
        var bu = brandBase(D.modelInfo[id].brand_id, bUnits, mUnits);
        s.inBrand = bu ? 100 * s.units / bu : null;
        s.launch = launchMonth(id);
        s.price = priceRange(id);
      } else {
        var own = sortedIds(mUnits).filter(function (m) { return D.modelInfo[m] && D.modelInfo[m].brand_id === id; });
        s.models = own.length;
        s.top = own[0] || null;
        var f = function (code) { return bf[id + '|' + code] || 0; };
        s.bev = s.units ? 100 * f('bev') / s.units : null;
        s.hybrid = s.units ? 100 * (f('phev') + f('hev')) / s.units : null;
      }
      S[id] = s;
    });
    function pctOrDash(v, digits) { return v === null || v === undefined ? '—' : v.toFixed(digits === undefined ? 1 : digits) + '%'; }
    // [label, text(id) -> string | node, value(id) -> number | null where higher is better (highlighted)]
    var groups = [[L('Registrations ', 'ยอดจดทะเบียน ') + span, [
      kind === 'm' ? [L('Brand', 'ยี่ห้อ'), function (id) { var bid = D.modelInfo[id].brand_id; return link(hrefFor('b', bid), brandLabel(bid)); }]
        : [L('Parent-company country', 'ประเทศบริษัทแม่'), function (id) { return countryName(D.brandCountry[id]); }],
      [L('Units', 'ยอดรวม'), function (id) { return fmt(S[id].units) + L(' units', ' คัน'); }, function (id) { return S[id].units; }],
      [L('Market share', 'ส่วนแบ่งตลาด'), function (id) { return pctOrDash(S[id].share, 2); }, function (id) { return S[id].share; }],
      [kind === 'm' ? L('Model rank', 'อันดับรุ่น') : L('Brand rank', 'อันดับยี่ห้อ'), function (id) { return S[id].rank ? S[id].rank + L(' of ', ' จาก ') + S[id].of : '—'; }, function (id) { return S[id].rank ? -S[id].rank : null; }],
      [L('Monthly average', 'เฉลี่ยต่อเดือน'), function (id) { return fmt(Math.round(S[id].units / months.length)) + L(' units', ' คัน'); }],
      kind === 'm' ? [L('Share of brand', 'สัดส่วนในยี่ห้อ'), function (id) { return pctOrDash(S[id].inBrand); }]
        : [L('Models with units', 'รุ่นที่มียอด'), function (id) { return String(S[id].models); }, function (id) { return S[id].models; }],
      kind === 'b' ? [L('Best-selling model', 'รุ่นขายดี'), function (id) {
        var t = S[id].top;
        return t ? add(el('span'), link(hrefFor('m', t), D.modelInfo[t].name), document.createTextNode(' · ' + pctOrDash(S[id].units ? 100 * mUnits[t] / S[id].units : null))) : '—';
      }] : null
    ]], [L('Trend', 'แนวโน้ม'), [
      [priorText(months, 'title'), function (id) { return S[id].prev === null ? '—' : fmt(S[id].prev) + L(' units', ' คัน'); }],
      [priorText(months, 'short'), function (id) { return S[id].yoy === null ? '—' : pctText(S[id].yoy); }, function (id) { return S[id].yoy; }],
      [L('Latest month · ', 'เดือนล่าสุด · ') + monthLabel(last), function (id) { return fmt(S[id].last) + L(' units', ' คัน') + (S[id].mom === null ? '' : ' (' + pctText(S[id].mom) + ')'); }, function (id) { return S[id].last; }],
      [last3 ? monthLabel(last3[0]) + '–' + monthLabel(last3[2]) + L(' vs the 3 months before', ' เทียบ 3 เดือนก่อนหน้า') : L('Last 3 months', '3 เดือนล่าสุด'),
        function (id) { return S[id].momentum === null ? '—' : pctText(S[id].momentum); }, function (id) { return S[id].momentum; }],
      [L('Best month in range', 'เดือนที่สูงสุดในช่วง'), function (id) { var p = S[id].peak; return p ? fmt(p[1]) + ' (' + monthLabel(p[0]) + ')' : '—'; }],
      kind === 'm' ? [L('Launch month (whole country)', 'เดือนเปิดตัว (ทั้งประเทศ)'), function (id) {
        var l = S[id].launch;
        return !l ? '—' : l.start === all[0] ? L('before ', 'ก่อน ') + monthLabel(all[0], true) : monthLabel(l.start, true);
      }] : null
    ]]];
    if (kind === 'b') groups.push([L('Fuel type', 'ชนิดเชื้อเพลิง'), [
      [L('Battery electric (BEV)', 'ไฟฟ้า (BEV)'), function (id) { return pctOrDash(S[id].bev); }],
      [L('Hybrid and plug-in hybrid', 'ไฮบริดและปลั๊กอินไฮบริด'), function (id) { return pctOrDash(S[id].hybrid); }]
    ]]);
    else groups.push([L('Price (official website)', 'ราคา (เว็บไซต์ทางการ)'), [
      [L('Starting price', 'ราคาเริ่มต้น'), function (id) { return S[id].price ? baht(S[id].price[0]) : L('No data yet', 'ยังไม่มีข้อมูล'); }, function (id) { return S[id].price ? -S[id].price[0] : null; }],
      [L('Highest price', 'ราคาสูงสุด'), function (id) { return S[id].price ? baht(S[id].price[1]) : L('No data yet', 'ยังไม่มีข้อมูล'); }],
      [L('Variants with a price', 'จำนวนรุ่นย่อยที่มีราคา'), function (id) { return S[id].price ? String(S[id].price[2]) : '—'; }]
    ]]);

    var tc = card(L('Comparison table', 'ตารางเปรียบเทียบ'), areaLabel(M.area) + ' · ' + span,
      L('The best value in each comparable row is highlighted; missing data shows as —, never zero', 'ค่าที่ดีที่สุดในแถวที่เทียบกันได้ถูกเน้นไว้ ข้อมูลที่ไม่มีแสดงเป็น — ไม่ใช่ศูนย์'));
    var t = el('table', { class: 'compare' }), thead = el('thead'), htr = el('tr'), tb = el('tbody'), csv = [[L('metric', 'รายการ')].concat(ids.map(function (id) { return nameFor(kind, id); }))];
    htr.appendChild(el('th', {}, ''));
    ids.forEach(function (id, i) {
      var dot = el('i', { class: 'dot' });
      dot.style.background = seriesColor(i);
      htr.appendChild(add(el('th', { scope: 'col' }), dot, link(hrefFor(kind, id), nameFor(kind, id))));
    });
    add(t, add(thead, htr), tb);
    groups.forEach(function (g) {
      tb.appendChild(add(el('tr', { class: 'group' }), el('th', { scope: 'colgroup', colspan: String(ids.length + 1) }, g[0])));
      g[1].filter(Boolean).forEach(function (m) {
        var tr = el('tr'), best = null, row = [m[0]];
        if (m[2] && ids.length > 1) {
          var vals = ids.map(m[2]).filter(function (v) { return v !== null; });
          if (vals.length > 1) best = Math.max.apply(null, vals);
        }
        tr.appendChild(el('th', { scope: 'row' }, m[0]));
        ids.forEach(function (id) {
          var v = m[1](id), td = el('td', { class: best !== null && m[2](id) === best ? 'best' : '' });
          if (typeof v === 'string') td.textContent = v; else td.appendChild(v);
          row.push(td.textContent);
          tr.appendChild(td);
        });
        tb.appendChild(tr);
        csv.push(row);
      });
    });
    tc.appendChild(add(el('div', { class: 'table-wrap' }), t));
    var stem = 'thai-auto-data-compare-' + ids.join('-');
    var dlTable = el('button', { type: 'button', class: 'btn' }, L('Download table (CSV)', 'ดาวน์โหลดตาราง (CSV)'));
    dlTable.addEventListener('click', function () { downloadCSV(stem + '-summary.csv', csv); });
    tc.appendChild(add(el('div', { class: 'controls' }), dlTable,
      el('span', { class: 'note' }, L('When you reuse it, credit thai-auto-data and the Department of Land Transport (CC BY 4.0)', 'เมื่อนำไปใช้ กรุณาอ้างอิง thai-auto-data และกรมการขนส่งทางบก (CC BY 4.0)'))));
    root.appendChild(tc);

    // ----- registrations over the selected range: units or share -----
    var totals = b.order.map(function (k) { return sumValues(sumById(idx, 'b', b.months[k], cats)); });
    var series = ids.map(function (id) { return seriesFor(idx, kind, id, b, cats); });
    var share = series.map(function (s) { return s.map(function (v, i) { return totals[i] ? 100 * v / totals[i] : 0; }); });
    var rc = card(L('Registrations', 'ยอดจดทะเบียน'), L('Compare · ', 'เปรียบเทียบ · ') + areaLabel(M.area));
    var modeSeg = el('div', { class: 'seg', role: 'group', 'aria-label': L('Unit', 'หน่วย') });
    var rbox = add(el('div', { class: 'chart-box tall' }), el('canvas', { 'aria-label': L('Registrations comparison chart', 'กราฟเปรียบเทียบยอดจดทะเบียน') }));
    function drawTrend() {
      var units = CMP.mode === 'units', opt = baseOptions();
      opt.plugins.legend.display = ids.length > 1 && !withEndLabels(opt, rbox.firstChild, ids.map(function (id) { return nameFor(kind, id); }));
      opt.scales.y.ticks.callback = units ? kTicks : function (v) { return v + '%'; };
      opt.plugins.tooltip.callbacks.label = function (ctx) {
        return ' ' + ctx.dataset.label + ': ' + (units ? fmt(ctx.raw) + L(' units', ' คัน') : ctx.raw.toFixed(2) + '%');
      };
      if (charts['d-cmp']) charts['d-cmp'].destroy();
      charts['d-cmp'] = new Chart(rbox.firstChild, {
        type: 'line', options: opt, plugins: [endLabels],
        data: { labels: b.labels, datasets: ids.map(function (id, i) {
          return { label: nameFor(kind, id), borderColor: seriesColor(i), backgroundColor: seriesColor(i), borderWidth: 2,
            pointRadius: b.order.length > 24 ? 0 : 3, pointHoverRadius: 5, tension: 0, data: units ? series[i] : share[i] };
        }) }
      });
    }
    [['units', L('Units', 'จำนวน (คัน)')], ['share', L('Share (%)', 'ส่วนแบ่ง (%)')]].forEach(function (m) {
      var bt = el('button', { type: 'button', 'aria-pressed': String(CMP.mode === m[0]) }, m[1]);
      bt.addEventListener('click', function () {
        CMP.mode = m[0];
        modeSeg.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === bt)); });
        drawTrend();
      });
      modeSeg.appendChild(bt);
    });
    rc.head.appendChild(modeSeg);
    rc.appendChild(rbox);
    var dlSeries = el('button', { type: 'button', class: 'btn' }, L('Download the series (CSV)', 'ดาวน์โหลดยอดรายช่วง (CSV)'));
    dlSeries.addEventListener('click', function () {
      var head = ['period', 'first_month', 'last_month'].concat(ids.map(function (id) { return id + '_units'; })).concat(ids.map(function (id) { return id + '_share_pct'; }));
      downloadCSV(stem + '-series.csv', [head].concat(b.order.map(function (k, j) {
        var ms = b.months[k];
        return [k, ms[0], ms[ms.length - 1]].concat(series.map(function (s) { return s[j]; })).concat(share.map(function (s) { return s[j].toFixed(3); }));
      })));
    });
    rc.appendChild(add(el('div', { class: 'controls' }), dlSeries));
    root.appendChild(rc);
    drawTrend();

    regionCompare(root, kind, ids, months, cats);
    if (kind === 'b') fuelCompare(root, ids, bf, cur);
    else comparePrices(root, ids);
  }

  function regionCompare(root, kind, ids, months, cats) {
    var c = card(L('Share by region', 'ส่วนแบ่งแยกตามภูมิภาค'), L('Compare', 'เปรียบเทียบ'),
      (kind === 'b' ? L('Each brand\'s share of each region\'s market', 'ส่วนแบ่งของแต่ละยี่ห้อในตลาดของแต่ละภาค') : L('Each model\'s share of each region\'s market', 'ส่วนแบ่งของแต่ละรุ่นในตลาดของแต่ละภาค')) +
      L('; period and categories follow the filters; all regions shown', ' ช่วงเวลาและประเภทรถตามตัวกรอง แสดงทุกภูมิภาค'));
    var box = add(el('div', { class: 'chart-box tall' }), el('canvas', { 'aria-label': L('Share of the chosen items in each region', 'ส่วนแบ่งของรายการที่เลือกในแต่ละภูมิภาค') }));
    c.appendChild(box); root.appendChild(c);
    loadRegionGroups().then(function (groups) {
      if (!box.isConnected) return;
      var gt = groupTotals(groups, kind, months, cats), bt = groupTotals(groups, 'b', months, cats);
      var o = baseOptions();
      o.indexAxis = 'y';
      o.scales.x.ticks.callback = function (v) { return v + '%'; };
      o.scales.y.grid = { display: false };
      o.interaction = { mode: 'index', intersect: false, axis: 'y' };
      o.plugins.tooltip.callbacks.label = function (ctx) { return ' ' + ctx.dataset.label + ': ' + ctx.raw.toFixed(2) + '%'; };
      charts['d-cmpRegion'] = new Chart(box.firstChild, {
        type: 'bar', options: o,
        data: { labels: REGION_GROUPS.map(function (r) { return r[1]; }), datasets: ids.map(function (id, i) {
          return { label: nameFor(kind, id), backgroundColor: seriesColor(i), borderRadius: 3, borderSkipped: 'start', barPercentage: 0.85,
            data: REGION_GROUPS.map(function (r) { var tt = sumValues(bt[r[0]]); return tt ? 100 * (gt[r[0]][id] || 0) / tt : 0; }) };
        }) }
      });
    });
  }

  // brands only: powertrain mix as 100% bars (one bar per brand)
  function fuelCompare(root, ids, bf, units) {
    var c = card(L('Fuel type', 'ชนิดเชื้อเพลิง'), L('Compare', 'เปรียบเทียบ'), L('Each brand\'s units by the fuel type the DLT records, under the filters above', 'สัดส่วนของยอดแต่ละยี่ห้อตามชนิดเชื้อเพลิงที่กรมฯ บันทึก ตามตัวกรองด้านบน'));
    var box = add(el('div', { class: 'chart-box' }), el('canvas', { 'aria-label': L('Powertrain mix of the chosen brands', 'สัดส่วนชนิดเชื้อเพลิงของยี่ห้อที่เลือก') }));
    box.style.height = (90 + 44 * ids.length) + 'px';
    c.appendChild(box); root.appendChild(c);
    var o = baseOptions();
    o.indexAxis = 'y';
    o.scales.x.stacked = true; o.scales.y.stacked = true; o.scales.x.max = 100;
    o.scales.x.ticks.callback = function (v) { return v + '%'; };
    o.scales.y.grid = { display: false };
    o.interaction = { mode: 'index', intersect: false, axis: 'y' };
    o.plugins.tooltip.callbacks.label = function (ctx) { return ctx.raw ? ' ' + ctx.dataset.label + ': ' + ctx.raw.toFixed(1) + '%' : null; };
    charts['d-cmpFuel'] = new Chart(box.firstChild, {
      type: 'bar', options: o, plugins: [segLabels],
      data: { labels: ids.map(brandLabel), datasets: FUELS.map(function (f, i) {
        return { label: f[1], backgroundColor: fuelColor(f[0]), borderColor: css('--surface'), borderWidth: { right: 1 }, borderSkipped: false, barPercentage: 0.7,
          data: ids.map(function (id) { return units[id] ? 100 * (bf[id + '|' + f[0]] || 0) / units[id] : 0; }) };
      }).filter(function (d) { return d.data.some(function (v) { return v; }); }) }
    });
  }

  // models only: price ranges as floating bars (one axis: baht) and the variant prices behind them
  function comparePrices(root, ids) {
    var priced = ids.filter(function (id) { return priceRange(id); });
    var pc = card(L('Price range', 'ช่วงราคา'), L('Price on the official website', 'ราคาบนเว็บไซต์ทางการ'), priced.length ? L('Bars span the lowest to highest price of the variants with data', 'แท่งคือช่วงราคาต่ำสุดถึงสูงสุดของรุ่นย่อยที่มีข้อมูล') : L('None of the selected models has a verified price yet', 'รุ่นที่เลือกยังไม่มีข้อมูลราคาที่ยืนยัน'));
    root.appendChild(pc);
    if (!priced.length) return;
    var pbox = add(el('div', { class: 'chart-box' }), el('canvas', { 'aria-label': L('Price ranges of the selected models', 'ช่วงราคาของรุ่นที่เลือก') }));
    pbox.style.height = (70 + 48 * priced.length) + 'px';
    pc.appendChild(pbox);
    var po = baseOptions();
    po.indexAxis = 'y';
    po.interaction = { mode: 'nearest', intersect: true };
    po.plugins.legend.display = false;
    po.scales.x.grid = { color: css('--grid') }; po.scales.x.beginAtZero = false;
    po.scales.x.ticks.callback = function (v) { return '฿' + (v / 1000) + 'k'; };
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
      pc.appendChild(add(el('details'), el('summary', {}, L('Variant prices: ', 'ราคารุ่นย่อย ') + modelName(id)),
        add(el('div', { class: 'table-wrap' }), table([[L('Variants', 'รุ่นย่อย')], [L('Price', 'ราคา'), 1], [L('Source', 'แหล่งที่มา')]], currentPrices(id).filter(function (p) { return p.price_type === 'list'; }).map(function (p) {
          return add(el('tr'), el('td', {}, p.variant), el('td', { class: 'n' }, baht(p.price_thb)), add(el('td'), link(p.source_url, p.source_publisher + ' · ' + dateLabel(p.observed_on))));
        })))));
    });
  }

  function notFound(root, msg) {
    add(root, crumbs([[msg]]), add(el('section', { class: 'card' }), el('p', {}, msg),
      el('p', { class: 'note' }, L('The link may be old or mistyped; try the ranking page', 'ลิงก์อาจเก่าหรือพิมพ์ผิด ลองดูจากหน้าอันดับ')), link('#/ranking' + filterQuery(), L('Go to the ranking', 'ไปหน้าอันดับ'), 'btn')));
  }
  function crumbs(items) {
    var nav = el('nav', { class: 'crumbs', 'aria-label': 'breadcrumb' });
    nav.appendChild(link('#/', L('Home', 'หน้าแรก')));
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
  var PAGES = ['overview', 'ranking', 'trends', 'powertrain', 'segments', 'origin', 'regions', 'seasonality', 'prices', 'launches', 'data'];
  function route() {
    var h = location.hash || '#/';
    if (h.indexOf('#/') !== 0) return;   // in-page anchors such as #cite
    var lm = h.match(/[?&]lang=(th|en)\b/);
    if (lm && lm[1] !== LANG) { location.reload(); return; }   // a link with another lang= while the page is open: the text is set at load
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
    var pf = pageFilters(page);
    document.getElementById('filterbar').hidden = !Object.keys(pf).length;
    document.getElementById('fRange').hidden = !pf.range;
    document.getElementById('fCustom').hidden = !pf.range || M.range !== 'custom';
    document.getElementById('fGrain').hidden = !pf.grain;
    document.getElementById('fCats').hidden = !pf.cats;
    document.getElementById('fArea').parentNode.hidden = !pf.area;
    setNav(page === 'brand' || page === 'model' ? '' : page);
    var title = document.querySelector('.side-nav a[data-nav="' + page + '"]');
    if (!m) document.title = (page === 'overview' ? 'ยอดจดทะเบียนรถยนต์ใหม่ · ' + L('Thai Car Market', 'ตลาดรถยนต์ไทย') : title ? title.textContent : L('Thai Car Market', 'ตลาดรถยนต์ไทย')) + ' · thai-auto-data';
    renderExplorer();
    if (changed) window.scrollTo(0, 0);
  }
  function setNav(page) {
    document.body.classList.remove('nav-open');   // a phone's drawer closes once a page is picked
    document.getElementById('menuBtn').setAttribute('aria-expanded', 'false');
    document.getElementById('navBackdrop').hidden = true;
    document.querySelectorAll('.side-nav a').forEach(function (a) {
      if (a.getAttribute('data-nav') === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  // ---------- boot ----------
  // phones: the side navigation is a drawer opened by the Menu button
  (function () {
    var btn = document.getElementById('menuBtn'), back = document.getElementById('navBackdrop');
    function open(on) {
      document.body.classList.toggle('nav-open', on);
      btn.setAttribute('aria-expanded', String(on));
      back.hidden = !on;
      if (on) document.querySelector('.side-nav a').focus();
    }
    btn.addEventListener('click', function () { open(!document.body.classList.contains('nav-open')); });
    back.addEventListener('click', function () { open(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('nav-open')) { open(false); btn.focus(); } });
  })();
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
    D.statusText = L('Latest data: ', 'ข้อมูลล่าสุด: ') + monthLabel(lastOk(), true) + L(' · Source: Department of Land Transport', ' · แหล่งข้อมูล: กรมการขนส่งทางบก');
    document.getElementById('status').textContent = D.statusText;
    window.addEventListener('hashchange', route);
    route();
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function () { renderExplorer(); });
  }).catch(function (e) {
    var st = document.getElementById('status');
    st.className = 'status error';
    st.textContent = L('Failed to load data: ', 'โหลดข้อมูลไม่สำเร็จ: ') + e.message + L(' (open it through GitHub Pages or a local web server, not as a file)', ' (เปิดผ่าน GitHub Pages หรือ local web server ไม่ใช่ไฟล์ตรงๆ)');
    console.error(e);
  });

  document.getElementById('shareLink').addEventListener('click', function () {
    var b = this, url = location.href;
    function done() { b.textContent = L('Link copied', 'คัดลอกลิงก์แล้ว'); setTimeout(function () { b.textContent = L('Copy link to this view', 'คัดลอกลิงก์มุมมองนี้'); }, 2000); }
    if (!navigator.clipboard) { window.prompt(L('Copy this link', 'คัดลอกลิงก์นี้'), url); return; }
    navigator.clipboard.writeText(url).then(done, function () { window.prompt(L('Copy this link', 'คัดลอกลิงก์นี้'), url); });
  });

  document.getElementById('copyCite').addEventListener('click', function () {
    var t = document.getElementById('citeText').textContent, b = this;
    navigator.clipboard.writeText(t).then(function () { b.textContent = L('Copied', 'คัดลอกแล้ว · Copied'); }, function () {
      var r = document.createRange(); r.selectNodeContents(document.getElementById('citeText'));
      var s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
  });
})();
