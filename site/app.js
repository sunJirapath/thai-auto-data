/* thai-auto-data dashboard: reads the CSVs in this repo directly, no build step.
   Routes: #/ (market), #/brand/<brand_id>, #/model/<model_id>, #/compare/<model_id>,<model_id>,... */
(function () {
  'use strict';

  var TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var CATS = [['ry1', 'ร.ย.1 รถเก๋ง/SUV ≤7 ที่นั่ง'], ['ry2', 'ร.ย.2 รถนั่ง >7 ที่นั่ง'], ['ry3', 'ร.ย.3 กระบะ/บรรทุกส่วนบุคคล']];
  var CAT_LABEL = { RY1: 'ร.ย.1', RY2: 'ร.ย.2', RY3: 'ร.ย.3' };
  var MAX_SERIES = 8, MAX_COMPARE = 4;
  var charts = {};
  var D = {};          // loaded data
  var homeTrends = {}; // persistent selections on the home page

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
    var y = +p.slice(0, 4) + 543, m = +p.slice(5, 7) - 1;
    return TH_MONTHS[m] + ' ' + (long ? y : String(y).slice(2));
  }
  function dateLabel(d) {
    if (!d) return '—';
    return +d.slice(8, 10) + ' ' + TH_MONTHS[+d.slice(5, 7) - 1] + ' ' + (+d.slice(0, 4) + 543);
  }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
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
    if (v !== '' && v !== undefined && +v > 999) td.title = (+v).toFixed(1) + '% (ฐานปีก่อนต่ำมาก)';
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
    if (sub) h.appendChild(el('span', { class: 'sub' }, sub));
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
  function rangeText(r) { return r ? (r[0] === r[1] ? baht(r[0]) : baht(r[0]) + ' – ' + baht(r[1])) : 'ยังไม่มีข้อมูล'; }

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
    var c = card(cfg.title, cfg.subtitle, cfg.note || 'เลือกได้สูงสุด ' + MAX_SERIES + ' รายการ เส้นที่ขาดคือเดือนที่ไม่มีข้อมูล');
    var controls = el('div', { class: 'controls' });
    var listId = cfg.key + 'List';
    var input = el('input', { type: 'search', placeholder: 'ค้นหาเพื่อเพิ่ม…', list: listId, 'aria-label': 'เพิ่มใน' + cfg.title, id: cfg.key + 'Search' });
    var dl = el('datalist', { id: listId });
    cfg.options().forEach(function (o) { dl.appendChild(el('option', { value: o.label })); });
    var seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'หน่วย' });
    [['units', 'จำนวน (คัน)'], ['share_pct', 'ส่วนแบ่ง (%)']].forEach(function (m) {
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
        document.getElementById('status').textContent = 'กราฟ' + cfg.title + 'แสดงได้สูงสุด ' + MAX_SERIES + ' รายการ ลบรายการเดิมก่อน';
        return;
      }
      slots[id] = s; draw();
    }
    function remove(id) { delete slots[id]; draw(); }
    function ids() { return Object.keys(slots).sort(function (a, b) { return slots[a] - slots[b]; }); }

    function draw() {
      chips.textContent = '';
      ids().forEach(function (id) {
        var chip = el('span', { class: 'chip' });
        var dot = el('i'); dot.style.background = seriesColor(slots[id]);
        add(chip, dot, cfg.href ? link(cfg.href(id), cfg.nameOf(id), 'chip-link') : document.createTextNode(cfg.nameOf(id)));
        var x = el('button', { type: 'button', 'aria-label': 'ลบ ' + cfg.nameOf(id) }, '×');
        x.addEventListener('click', function () { remove(id); });
        chip.appendChild(x); chips.appendChild(chip);
      });
      var surface = css('--surface');
      var datasets = ids().map(function (id) {
        var byP = cfg.rows[id] || {};
        return {
          label: cfg.nameOf(id),
          data: D.market.map(function (r) {
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
      opt.plugins.missingBands = { indices: missingIndices() };
      opt.plugins.legend.display = datasets.length > 1;
      opt.scales.y.ticks.callback = function (v) { return mode === 'units' ? kTicks(v) : v + '%'; };
      opt.plugins.tooltip.callbacks.label = function (ctx) {
        return ' ' + ctx.dataset.label + ': ' + (mode === 'units' ? fmt(ctx.raw) + ' คัน' : (+ctx.raw).toFixed(2) + '%');
      };
      if (charts[cfg.key]) charts[cfg.key].destroy();
      charts[cfg.key] = new Chart(canvas, {
        type: 'line', data: { labels: D.market.map(function (r) { return monthLabel(r.period); }), datasets: datasets },
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

  // ---------- home ----------
  function renderTiles() {
    var last = D.market.filter(function (r) { return r.period === lastOk(); })[0];
    var missing = D.market.filter(function (r) { return r.status === 'missing'; });
    var topBrand = D.brand.filter(function (r) { return r.period === last.period && r.rank === '1'; })[0];
    var topModel = D.model.filter(function (r) { return r.period === last.period && r.rank === '1'; })[0];
    var box = document.getElementById('tiles');
    box.textContent = '';
    add(box,
      tile('ยอดจดทะเบียน ' + monthLabel(last.period, true), fmt(last.total) + ' คัน',
        last.yoy_pct ? 'เทียบปีก่อน ' + pctText(last.yoy_pct) : 'ไม่มีข้อมูลเทียบปีก่อน'),
      tile('อันดับ 1 ยี่ห้อ', brandLabel(topBrand.brand_id), 'ส่วนแบ่ง ' + (+topBrand.share_pct).toFixed(1) + '%'),
      tile('อันดับ 1 รุ่น', modelName(topModel.model_id), fmt(topModel.units) + ' คัน'),
      tile('ช่วงข้อมูล', okPeriods().length + ' เดือน', monthLabel(D.market[0].period) + ' – ' + monthLabel(last.period) +
        (missing.length ? ' · ขาด ' + missing.length + ' เดือน' : ' · ครบทุกเดือน')));
  }

  function renderMarket() {
    var surface = css('--surface');
    var datasets = CATS.map(function (c, k) {
      return {
        label: c[1], data: D.market.map(function (r) { return r.status === 'ok' ? +r[c[0]] : null; }),
        backgroundColor: seriesColor(k), borderColor: surface, borderWidth: { top: 2 }, borderSkipped: 'start',
        borderRadius: k === CATS.length - 1 ? { topLeft: 4, topRight: 4 } : 0, maxBarThickness: 18, stack: 'm'
      };
    });
    var opt = baseOptions();
    opt.scales.x.stacked = true; opt.scales.y.stacked = true;
    opt.scales.y.ticks.callback = kTicks;
    opt.plugins.missingBands = { indices: missingIndices() };
    opt.plugins.tooltip.callbacks = {
      label: function (c) { return ' ' + c.dataset.label + ': ' + fmt(c.raw) + ' คัน'; },
      footer: function (items) {
        var r = D.market[items[0].dataIndex];
        return 'รวม ' + fmt(r.total) + ' คัน' + (r.yoy_pct ? ' · YoY ' + pctText(r.yoy_pct) : '');
      }
    };
    if (charts.market) charts.market.destroy();
    charts.market = new Chart(document.getElementById('marketChart'), {
      type: 'bar', data: { labels: D.market.map(function (r) { return monthLabel(r.period); }), datasets: datasets },
      options: opt, plugins: [missingBands]
    });

    var rows = D.market.slice().reverse().map(function (r) {
      var tr = el('tr', r.status === 'ok' ? {} : { class: 'missing' });
      tr.appendChild(el('td', {}, monthLabel(r.period, true)));
      if (r.status !== 'ok') { tr.appendChild(el('td', { colspan: '6' }, 'ไม่มีข้อมูล · ' + r.note)); return tr; }
      ['ry1', 'ry2', 'ry3', 'total'].forEach(function (k) { tr.appendChild(el('td', { class: 'n' }, fmt(r[k]))); });
      tr.appendChild(pctCell(r.mom_pct)); tr.appendChild(pctCell(r.yoy_pct));
      return tr;
    });
    var box = document.getElementById('marketTable');
    box.textContent = '';
    box.appendChild(table([['เดือน'], ['ร.ย.1', 1], ['ร.ย.2', 1], ['ร.ย.3', 1], ['รวม', 1], ['MoM', 1], ['YoY', 1]], rows));
  }

  function renderRanking(period) {
    function rankTable(rows, key, nameOf, href, trend, limit) {
      var trs = rows.slice(0, limit).map(function (r) {
        var tr = el('tr');
        tr.appendChild(el('td', { class: 'n' }, r.rank));
        var td = el('td', { class: 'name' });
        var plus = el('button', { type: 'button', class: 'plus', 'aria-pressed': String(trend.has(r[key])), 'aria-label': 'เพิ่ม ' + nameOf(r[key]) + ' ลงกราฟเทรนด์' }, trend.has(r[key]) ? '✓' : '＋');
        plus.addEventListener('click', function () { trend.toggle(r[key]); });
        add(td, plus, link(href(r[key]), nameOf(r[key])));
        tr.appendChild(td);
        tr.appendChild(el('td', { class: 'n' }, fmt(r.units)));
        tr.appendChild(el('td', { class: 'n' }, (+r.share_pct).toFixed(1) + '%'));
        tr.appendChild(pctCell(r.yoy_pct));
        return tr;
      });
      return table([['#', 1], ['ชื่อ'], ['คัน', 1], ['ส่วนแบ่ง', 1], ['YoY', 1]], trs);
    }
    var bBox = document.getElementById('brandTable'), mBox = document.getElementById('modelTable');
    bBox.textContent = ''; mBox.textContent = '';
    bBox.appendChild(rankTable(D.brand.filter(function (r) { return r.period === period; }), 'brand_id', brandLabel,
      function (id) { return '#/brand/' + id; }, D.brandTrend, 30));
    mBox.appendChild(rankTable(D.model.filter(function (r) { return r.period === period; }), 'model_id', modelName,
      function (id) { return '#/model/' + id; }, D.modelTrend, 50));
  }

  function renderHome() {
    renderTiles();
    renderMarket();
    var sel = document.getElementById('monthSelect');
    ['brandTrend', 'modelTrend'].forEach(function (id) { document.getElementById(id).textContent = ''; });
    function topIds(rows, key, n) {
      return rows.filter(function (r) { return r.period === lastOk(); }).slice(0, n).map(function (r) { return r[key]; });
    }
    var rerank = function () { if (D.brandTrend && D.modelTrend) renderRanking(sel.value); };
    D.brandTrend = null; D.modelTrend = null;
    var bt = makeTrend(document.getElementById('brandTrend'), {
      key: 'brandTrend', title: 'เทรนด์รายยี่ห้อ', subtitle: 'Brand trend', rows: D.brandRows, nameOf: brandLabel,
      href: function (id) { return '#/brand/' + id; },
      options: function () { return Object.keys(D.brandRows).map(function (id) { return { id: id, label: brandLabel(id) }; }).sort(function (a, b) { return a.label.localeCompare(b.label); }); },
      defaults: function () { return homeTrends.brands || topIds(D.brand, 'brand_id', 5); },
      onChange: function (ids) { homeTrends.brands = ids; rerank(); }
    });
    var mt = makeTrend(document.getElementById('modelTrend'), {
      key: 'modelTrend', title: 'เทรนด์รายรุ่น', subtitle: 'Model trend', rows: D.modelRows, nameOf: modelName,
      href: function (id) { return '#/model/' + id; }, options: modelOptions(),
      defaults: function () { return homeTrends.models || topIds(D.model, 'model_id', 5); },
      onChange: function (ids) { homeTrends.models = ids; rerank(); }
    });
    // makeTrend renders into a fresh card; unwrap so the existing section keeps one card
    ['brandTrend', 'modelTrend'].forEach(function (id) {
      var sec = document.getElementById(id), inner = sec.firstChild;
      while (inner.firstChild) sec.appendChild(inner.firstChild);
      sec.removeChild(inner);
    });
    D.brandTrend = bt; D.modelTrend = mt;
    renderRanking(sel.value);
  }

  // ---------- brand page ----------
  function renderBrand(root, brandId) {
    var byP = D.brandRows[brandId];
    if (!byP) { root.appendChild(el('p', { class: 'card' }, 'ไม่พบยี่ห้อ ' + brandId)); return; }
    var name = brandLabel(brandId), last = lastOk(), cur = byP[last];
    add(root, crumbs([[name]]), el('h2', { class: 'page-title' }, name));
    var models = Object.keys(D.modelRows).filter(function (id) { return D.modelInfo[id] && D.modelInfo[id].brand_id === brandId; });
    var tiles = el('section', { class: 'tiles' });
    add(tiles,
      tile('ยอดจดทะเบียน ' + monthLabel(last, true), cur ? fmt(cur.units) + ' คัน' : '0 คัน', cur ? 'อันดับ ' + cur.rank + ' ของตลาด · YoY ' + pctText(cur.yoy_pct) : ''),
      tile('ส่วนแบ่งตลาด', cur ? (+cur.share_pct).toFixed(1) + '%' : '—', 'ร.ย.1–3 ' + monthLabel(last, true)),
      tile('ยอด 12 เดือนล่าสุด', fmt(sumLast12(byP)) + ' คัน', monthLabel(okPeriods().slice(-12)[0]) + ' – ' + monthLabel(last)),
      tile('จำนวนรุ่น', models.length + ' รุ่น', 'ที่จับคู่ชื่อได้'));
    root.appendChild(tiles);

    // brand monthly bars
    var c = card('ยอดจดทะเบียนรายเดือน', name);
    var box = add(el('div', { class: 'chart-box' }), el('canvas', { 'aria-label': 'ยอดจดทะเบียนรายเดือนของ ' + name }));
    c.appendChild(box); root.appendChild(c);
    var opt = baseOptions();
    opt.plugins.legend.display = false;
    opt.scales.y.ticks.callback = kTicks;
    opt.plugins.missingBands = { indices: missingIndices() };
    opt.plugins.tooltip.callbacks.label = function (ctx) {
      var r = byP[D.market[ctx.dataIndex].period];
      return ' ' + fmt(ctx.raw) + ' คัน' + (r ? ' · ส่วนแบ่ง ' + (+r.share_pct).toFixed(1) + '% · อันดับ ' + r.rank : '');
    };
    charts['d-brand'] = new Chart(box.firstChild, {
      type: 'bar', plugins: [missingBands], options: opt,
      data: {
        labels: D.market.map(function (r) { return monthLabel(r.period); }),
        datasets: [{ label: name, data: D.market.map(function (r) { return r.status !== 'ok' ? null : byP[r.period] ? +byP[r.period].units : 0; }),
          backgroundColor: seriesColor(0), borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'start', maxBarThickness: 18 }]
      }
    });

    // model table with compare checkboxes
    var mc = card('รุ่นของ ' + name, 'Models', 'กดชื่อรุ่นเพื่อดูรายละเอียด เลือก 2–' + MAX_COMPARE + ' รุ่นเพื่อเปรียบเทียบ');
    var sel = el('select', { id: 'brandMonth', 'aria-label': 'เลือกเดือน' });
    okPeriods().slice().reverse().forEach(function (p) { sel.appendChild(el('option', { value: p }, monthLabel(p, true))); });
    var cmp = el('a', { class: 'btn', href: '#/compare/' }, 'เปรียบเทียบที่เลือก');
    add(mc.head, add(el('div', { class: 'controls' }), add(el('label', { class: 'field' }, 'เดือน'), sel), cmp));
    var wrap = el('div', { class: 'table-wrap' });
    mc.appendChild(wrap); root.appendChild(mc);
    var picked = [];
    function updateCompare() {
      cmp.setAttribute('href', '#/compare/' + picked.join(','));
      cmp.textContent = 'เปรียบเทียบที่เลือก (' + picked.length + ')';
      cmp.classList.toggle('disabled', picked.length < 2);
    }
    function drawTable() {
      var p = sel.value, brandTotal = byP[p] ? +byP[p].units : 0;
      var rows = models.map(function (id) { return { id: id, r: D.modelRows[id][p] }; })
        .filter(function (x) { return x.r; }).sort(function (a, b) { return +b.r.units - +a.r.units; });
      var trs = rows.map(function (x) {
        var tr = el('tr');
        var cb = el('input', { type: 'checkbox', 'aria-label': 'เลือก ' + modelName(x.id) + ' เพื่อเปรียบเทียบ' });
        cb.checked = picked.indexOf(x.id) >= 0;
        cb.addEventListener('change', function () {
          if (cb.checked) { if (picked.length >= MAX_COMPARE) { cb.checked = false; return; } picked.push(x.id); }
          else picked.splice(picked.indexOf(x.id), 1);
          updateCompare();
        });
        add(tr, add(el('td'), cb), add(el('td', { class: 'name' }), link('#/model/' + x.id, modelName(x.id))),
          el('td', { class: 'n' }, fmt(x.r.units)),
          el('td', { class: 'n' }, brandTotal ? (100 * x.r.units / brandTotal).toFixed(1) + '%' : '—'),
          el('td', { class: 'n' }, x.r.rank), pctCell(x.r.yoy_pct), el('td', { class: 'n' }, rangeText(priceRange(x.id))));
        return tr;
      });
      wrap.textContent = '';
      wrap.appendChild(trs.length ? table([['', 0], ['รุ่น'], ['คัน', 1], ['% ของยี่ห้อ', 1], ['อันดับตลาด', 1], ['YoY', 1], ['ราคา (ทางการ)', 1]], trs)
        : el('p', { class: 'note' }, 'ไม่มียอดจดทะเบียนของรุ่นที่จับคู่ได้ในเดือนนี้'));
    }
    sel.addEventListener('change', drawTable);
    drawTable(); updateCompare();

    var top = models.filter(function (id) { return D.modelRows[id][last]; })
      .sort(function (a, b) { return +D.modelRows[b][last].units - +D.modelRows[a][last].units; }).slice(0, 5);
    makeTrend(root, {
      key: 'd-brandModels', title: 'เทรนด์รายรุ่นของ ' + name, subtitle: 'Model trend', rows: D.modelRows, nameOf: modelName,
      href: function (id) { return '#/model/' + id; }, options: modelOptions(function (id) { return models.indexOf(id) >= 0; }),
      defaults: function () { return top; }
    });
  }

  // ---------- model page ----------
  function renderModel(root, modelId) {
    var info = D.modelInfo[modelId], byP = D.modelRows[modelId];
    if (!info) { root.appendChild(el('p', { class: 'card' }, 'ไม่พบรุ่น ' + modelId)); return; }
    var name = modelName(modelId), last = lastOk(), cur = byP && byP[last];
    var brandP = D.brandRows[info.brand_id] && D.brandRows[info.brand_id][last];
    add(root, crumbs([[brandLabel(info.brand_id), '#/brand/' + info.brand_id], [info.name]]), el('h2', { class: 'page-title' }, name));
    var range = priceRange(modelId);
    add(root, add(el('section', { class: 'tiles' }),
      tile('ยอดจดทะเบียน ' + monthLabel(last, true), cur ? fmt(cur.units) + ' คัน' : '0 คัน', cur ? 'อันดับ ' + cur.rank + ' ของตลาด · YoY ' + pctText(cur.yoy_pct) : 'ไม่มีการจดทะเบียนเดือนนี้'),
      tile('ส่วนแบ่ง', cur ? (+cur.share_pct).toFixed(2) + '%' : '—', cur && brandP ? (100 * cur.units / brandP.units).toFixed(1) + '% ของ ' + brandLabel(info.brand_id) : ''),
      tile('ยอด 12 เดือนล่าสุด', fmt(sumLast12(byP)) + ' คัน', monthLabel(okPeriods().slice(-12)[0]) + ' – ' + monthLabel(last)),
      tile('ราคา (เว็บไซต์ทางการ)', range ? rangeText(range) : 'ยังไม่มีข้อมูล', range ? range[2] + ' รุ่นย่อย' : 'ช่วยเพิ่มได้ที่ GitHub')));

    var actions = add(el('div', { class: 'controls' }), link('#/compare/' + modelId, 'เปรียบเทียบกับรุ่นอื่น →', 'btn'));
    root.appendChild(actions);

    makeTrend(root, {
      key: 'd-model', title: 'ยอดจดทะเบียนรายเดือน', subtitle: 'เพิ่มรุ่นอื่นเพื่อเปรียบเทียบ', rows: D.modelRows, nameOf: modelName,
      href: function (id) { return '#/model/' + id; }, options: modelOptions(), defaults: function () { return [modelId]; },
      note: 'ยอดจดทะเบียนใหม่ ไม่ใช่ยอดขาย ค้นหาเพื่อเพิ่มรุ่นอื่นลงกราฟเดียวกัน'
    });

    renderPrices(root, modelId);

    var vc = card('ชื่อรุ่นย่อยตามที่กรมฯ บันทึก', '12 เดือนล่าสุด',
      'เป็นชื่อในทะเบียนรถของกรมการขนส่งทางบก ไม่ใช่ชื่อรุ่นย่อยทางการของค่ายรถเสมอไป บางค่ายแจ้งเฉพาะชื่อรุ่น');
    var vbox = el('div', { class: 'table-wrap' }, 'กำลังโหลด…');
    vc.appendChild(vbox); root.appendChild(vc);
    loadVariants().then(function () {
      var ps = okPeriods().slice(-12), agg = {};
      (D.variantsBy[modelId] || []).forEach(function (v) {
        if (ps.indexOf(v.period) < 0) return;
        var k = v.category + '|' + v.variant;
        agg[k] = agg[k] || { category: v.category, variant: v.variant, units: 0, last: v.period };
        agg[k].units += +v.units;
        if (v.period > agg[k].last) agg[k].last = v.period;
      });
      var list = Object.keys(agg).map(function (k) { return agg[k]; }).sort(function (a, b) { return b.units - a.units; });
      var total = list.reduce(function (s, x) { return s + x.units; }, 0);
      vbox.textContent = '';
      vbox.appendChild(list.length ? table([['ชื่อในทะเบียน'], ['ประเภท'], ['คัน', 1], ['สัดส่วน', 1], ['เดือนล่าสุดที่มี', 1]], list.map(function (x) {
        return add(el('tr'), el('td', {}, x.variant || '(ว่าง)'), el('td', {}, CAT_LABEL[x.category] || x.category),
          el('td', { class: 'n' }, fmt(x.units)), el('td', { class: 'n' }, (100 * x.units / total).toFixed(1) + '%'),
          el('td', { class: 'n' }, monthLabel(x.last)));
      })) : el('p', { class: 'note' }, 'ไม่มีการจดทะเบียนใน 12 เดือนล่าสุด'));
    });
  }

  function renderPrices(root, modelId) {
    var pc = card('ราคา', 'Price', 'ราคาที่แสดงบนเว็บไซต์ทางการของค่ายรถ ณ วันที่บันทึก ราคาจริงอาจต่างตามโปรโมชันและตัวแทนจำหน่าย');
    root.appendChild(pc);
    var all = (D.pricesBy[modelId] || []).slice();
    if (!all.length) {
      pc.appendChild(add(el('p', { class: 'note' }, 'ยังไม่มีข้อมูลราคาที่ยืนยันจากเว็บไซต์ทางการสำหรับรุ่นนี้ '),
        link('https://github.com/sunJirapath/thai-auto-data/issues', 'ส่งข้อมูลราคาพร้อมลิงก์แหล่งที่มา')));
      return;
    }
    var cur = currentPrices(modelId);
    pc.appendChild(el('h3', {}, 'ราคาปัจจุบัน'));
    pc.appendChild(add(el('div', { class: 'table-wrap' }), table([['รุ่นย่อย'], ['ประเภท'], ['ราคา', 1], ['ข้อมูล ณ', 1], ['แหล่งที่มา']], cur.map(function (p) {
      return add(el('tr'), el('td', {}, p.variant), el('td', {}, p.price_type === 'list' ? 'ราคาบนเว็บ' : 'โปรโมชัน ถึง ' + dateLabel(p.effective_to)),
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
        el('td', {}, p.price_type === 'list' ? 'ราคาบนเว็บ' : 'โปรโมชัน'),
        el('td', { class: 'n' }, baht(p.price_thb)),
        el('td', { class: 'n ' + (d > 0 ? 'down' : d < 0 ? 'up' : 'na') }, d === null ? '—' : d === 0 ? 'เท่าเดิม' : (d > 0 ? '+' : '−') + fmt(Math.abs(d))),
        add(el('td'), link(p.source_url, p.source_publisher)));
    }).reverse();
    var det = add(el('details'), el('summary', {}, 'ประวัติราคาทั้งหมด (' + all.length + ' รายการ)'),
      add(el('div', { class: 'table-wrap' }), table([['วันที่'], ['รุ่นย่อย'], ['ประเภท'], ['ราคา', 1], ['เปลี่ยนแปลง', 1], ['แหล่งที่มา']], rows)),
      el('p', { class: 'note' }, 'วันที่คือวันที่มีผลหรือวันที่เผยแพร่ตามแหล่งที่มา ถ้าไม่ระบุใช้วันที่เราบันทึก ประวัติเริ่มจากวันที่เราเริ่มเก็บ จึงไม่ครบย้อนหลัง'));
    pc.appendChild(det);
  }

  // ---------- compare page ----------
  function renderCompare(root, ids) {
    ids = ids.filter(function (id) { return D.modelInfo[id]; }).slice(0, MAX_COMPARE);
    add(root, crumbs([['เปรียบเทียบรุ่น']]), el('h2', { class: 'page-title' }, 'เปรียบเทียบรุ่น'));
    var pick = card('เลือกรุ่น', 'สูงสุด ' + MAX_COMPARE + ' รุ่น', 'ค้นหาแล้วกดเลือก ยอดทั้งหมดเป็นยอดจดทะเบียนใหม่จากกรมการขนส่งทางบก ไม่ใช่ยอดขาย');
    var input = el('input', { type: 'search', placeholder: 'ค้นหารุ่น…', list: 'cmpList', id: 'cmpSearch', 'aria-label': 'ค้นหารุ่นเพื่อเปรียบเทียบ' });
    var dl = el('datalist', { id: 'cmpList' });
    modelOptions()().forEach(function (o) { dl.appendChild(el('option', { value: o.label })); });
    var chips = el('div', { class: 'chips' });
    ids.forEach(function (id, i) {
      var chip = el('span', { class: 'chip' }), dot = el('i');
      dot.style.background = seriesColor(i);
      var x = el('button', { type: 'button', 'aria-label': 'ลบ ' + modelName(id) }, '×');
      x.addEventListener('click', function () { location.hash = '#/compare/' + ids.filter(function (y) { return y !== id; }).join(','); });
      chips.appendChild(add(chip, dot, link('#/model/' + id, modelName(id), 'chip-link'), x));
    });
    input.addEventListener('change', function () {
      var hit = modelOptions()().filter(function (o) { return o.label === input.value; })[0];
      if (hit && ids.indexOf(hit.id) < 0 && ids.length < MAX_COMPARE) location.hash = '#/compare/' + ids.concat([hit.id]).join(',');
    });
    add(pick.head, add(el('div', { class: 'controls' }), input, dl));
    pick.appendChild(chips);
    root.appendChild(pick);
    if (!ids.length) { pick.appendChild(el('p', { class: 'note' }, 'ยังไม่ได้เลือกรุ่น')); return; }

    // side-by-side table
    var last = lastOk(), first12 = okPeriods().slice(-12)[0];
    var metrics = [
      ['ยี่ห้อ', function (id) { return link('#/brand/' + D.modelInfo[id].brand_id, brandLabel(D.modelInfo[id].brand_id)); }],
      ['ยอดจดทะเบียน ' + monthLabel(last, true), function (id) { var r = D.modelRows[id][last]; return r ? fmt(r.units) + ' คัน' : '0 คัน'; }, function (id) { var r = D.modelRows[id][last]; return r ? +r.units : 0; }],
      ['อันดับตลาด ' + monthLabel(last), function (id) { var r = D.modelRows[id][last]; return r ? r.rank : '—'; }],
      ['ส่วนแบ่งตลาด', function (id) { var r = D.modelRows[id][last]; return r ? (+r.share_pct).toFixed(2) + '%' : '—'; }],
      ['YoY', function (id) { var r = D.modelRows[id][last]; return r ? pctText(r.yoy_pct) : '—'; }],
      ['ยอด 12 เดือน (' + monthLabel(first12) + '–' + monthLabel(last) + ')', function (id) { return fmt(sumLast12(D.modelRows[id])) + ' คัน'; }, function (id) { return sumLast12(D.modelRows[id]); }],
      ['เฉลี่ยต่อเดือน (12 เดือน)', function (id) { return fmt(Math.round(sumLast12(D.modelRows[id]) / 12)) + ' คัน'; }],
      ['ราคาต่ำสุด (เว็บไซต์ทางการ)', function (id) { var r = priceRange(id); return r ? baht(r[0]) : 'ยังไม่มีข้อมูล'; }, function (id) { var r = priceRange(id); return r ? -r[0] : null; }],
      ['ราคาสูงสุด', function (id) { var r = priceRange(id); return r ? baht(r[1]) : 'ยังไม่มีข้อมูล'; }],
      ['จำนวนรุ่นย่อยที่มีราคา', function (id) { var r = priceRange(id); return r ? String(r[2]) : '—'; }]
    ];
    var tc = card('ตารางเปรียบเทียบ', monthLabel(last, true), 'ค่าที่ดีที่สุดในแถวที่เปรียบเทียบได้ถูกเน้นไว้ ข้อมูลที่ไม่มีไม่ถือว่าเป็นศูนย์');
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

    // registrations overlay
    var rc = card('ยอดจดทะเบียนรายเดือน', 'เปรียบเทียบ');
    var rbox = add(el('div', { class: 'chart-box' }), el('canvas', { 'aria-label': 'กราฟเปรียบเทียบยอดจดทะเบียน' }));
    rc.appendChild(rbox); root.appendChild(rc);
    var opt = baseOptions();
    opt.plugins.missingBands = { indices: missingIndices() };
    opt.plugins.legend.display = ids.length > 1;
    opt.scales.y.ticks.callback = kTicks;
    opt.plugins.tooltip.callbacks.label = function (ctx) { return ' ' + ctx.dataset.label + ': ' + fmt(ctx.raw) + ' คัน'; };
    charts['d-cmp'] = new Chart(rbox.firstChild, {
      type: 'line', plugins: [missingBands], options: opt,
      data: {
        labels: D.market.map(function (r) { return monthLabel(r.period); }),
        datasets: ids.map(function (id, i) {
          var byP = D.modelRows[id];
          return { label: modelName(id), borderColor: seriesColor(i), backgroundColor: seriesColor(i), borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, spanGaps: false,
            data: D.market.map(function (r) { return r.status !== 'ok' ? null : byP[r.period] ? +byP[r.period].units : 0; }) };
        })
      }
    });

    // price ranges as floating bars (one axis: baht)
    var priced = ids.filter(function (id) { return priceRange(id); });
    var pc = card('ช่วงราคา', 'ราคาบนเว็บไซต์ทางการ', priced.length ? 'แท่งคือช่วงราคาต่ำสุดถึงสูงสุดของรุ่นย่อยที่มีข้อมูล' : 'รุ่นที่เลือกยังไม่มีข้อมูลราคาที่ยืนยัน');
    root.appendChild(pc);
    if (priced.length) {
      var pbox = add(el('div', { class: 'chart-box' }), el('canvas', { 'aria-label': 'ช่วงราคาของรุ่นที่เลือก' }));
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
        pc.appendChild(add(el('details'), el('summary', {}, 'ราคารุ่นย่อย ' + modelName(id)),
          add(el('div', { class: 'table-wrap' }), table([['รุ่นย่อย'], ['ราคา', 1], ['แหล่งที่มา']], currentPrices(id).filter(function (p) { return p.price_type === 'list'; }).map(function (p) {
            return add(el('tr'), el('td', {}, p.variant), el('td', { class: 'n' }, baht(p.price_thb)), add(el('td'), link(p.source_url, p.source_publisher + ' · ' + dateLabel(p.observed_on))));
          })))));
      });
    }
  }

  function crumbs(items) {
    var nav = el('nav', { class: 'crumbs', 'aria-label': 'breadcrumb' });
    nav.appendChild(link('#/', 'หน้าแรก'));
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
  function route() {
    var h = location.hash || '';
    var m = h.match(/^#\/(brand|model|compare)\/?([^?]*)$/);
    var home = document.getElementById('home'), detail = document.getElementById('detail');
    destroyCharts('d-');
    if (!m) {
      if (h.indexOf('#/') === 0 || !D.homeRendered) { renderHome(); D.homeRendered = true; }
      detail.hidden = true; detail.textContent = ''; home.hidden = false;
      if (h === '#/' || h === '') window.scrollTo(0, 0);
      return;
    }
    home.hidden = true; detail.hidden = false; detail.textContent = '';
    var arg = decodeURIComponent(m[2] || '');
    if (m[1] === 'brand') renderBrand(detail, arg);
    else if (m[1] === 'model') renderModel(detail, arg);
    else renderCompare(detail, arg ? arg.split(',').filter(Boolean) : []);
    document.title = (detail.querySelector('.page-title') || {}).textContent + ' · thai-auto-data';
    window.scrollTo(0, 0);
  }

  // ---------- boot ----------
  Promise.all([
    load('summaries/market_monthly.csv'), load('summaries/brand_monthly.csv'), load('summaries/model_monthly.csv'),
    load('data/brands.csv'), load('data/models.csv'), load('data/prices.csv')
  ]).then(function (res) {
    D.market = res[0]; D.brand = res[1]; D.model = res[2];
    D.brandName = {}; res[3].forEach(function (b) { D.brandName[b.brand_id] = b.name; });
    D.modelInfo = {}; res[4].forEach(function (m) { D.modelInfo[m.model_id] = m; });
    D.pricesBy = {}; res[5].forEach(function (p) { (D.pricesBy[p.model_id] = D.pricesBy[p.model_id] || []).push(p); });
    D.brandRows = index(D.brand, 'brand_id'); D.modelRows = index(D.model, 'model_id');
    var sel = document.getElementById('monthSelect');
    okPeriods().slice().reverse().forEach(function (p) { sel.appendChild(el('option', { value: p }, monthLabel(p, true))); });
    sel.addEventListener('change', function () { renderRanking(sel.value); });
    document.getElementById('status').textContent = 'ข้อมูลล่าสุด: ' + monthLabel(lastOk(), true) + ' · แหล่งข้อมูล: กรมการขนส่งทางบก';
    window.addEventListener('hashchange', route);
    route();
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function () { D.homeRendered = false; route(); });
  }).catch(function (e) {
    var st = document.getElementById('status');
    st.className = 'status error';
    st.textContent = 'โหลดข้อมูลไม่สำเร็จ: ' + e.message + ' (เปิดผ่าน GitHub Pages หรือ local web server ไม่ใช่ไฟล์ตรงๆ)';
    console.error(e);
  });

  document.getElementById('copyCite').addEventListener('click', function () {
    var t = document.getElementById('citeText').textContent, b = this;
    navigator.clipboard.writeText(t).then(function () { b.textContent = 'คัดลอกแล้ว · Copied'; }, function () {
      var r = document.createRange(); r.selectNodeContents(document.getElementById('citeText'));
      var s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
  });
})();
