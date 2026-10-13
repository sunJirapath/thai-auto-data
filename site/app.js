/* thai-auto-data dashboard: reads the CSVs in this repo directly, no build step. */
(function () {
  'use strict';

  var TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var CATS = [['ry1', 'ร.ย.1 รถเก๋ง/SUV ≤7 ที่นั่ง'], ['ry2', 'ร.ย.2 รถนั่ง >7 ที่นั่ง'], ['ry3', 'ร.ย.3 กระบะ/บรรทุกส่วนบุคคล']];
  var MAX_SERIES = 8;
  var charts = {};
  var D = {};  // loaded data

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
  function monthLabel(p, long) {
    var y = +p.slice(0, 4) + 543, m = +p.slice(5, 7) - 1;
    return TH_MONTHS[m] + ' ' + (long ? y : String(y).slice(2));
  }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function pctCell(v) {
    if (v === '' || v === undefined) return el('td', { class: 'n na' }, '—');
    var n = +v;
    return el('td', { class: 'n ' + (n > 0 ? 'up' : n < 0 ? 'down' : '') }, (n > 0 ? '▲ +' : n < 0 ? '▼ ' : '') + n.toFixed(1) + '%');
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
          backgroundColor: css('--surface'), titleColor: css('--ink'), bodyColor: css('--ink-2'),
          borderColor: css('--axis'), borderWidth: 1, padding: 10, usePointStyle: true,
          callbacks: {}
        }
      },
      scales: {
        x: { grid: { display: false }, border: { color: css('--axis') }, ticks: { color: css('--muted'), maxRotation: 0, autoSkipPadding: 12 } },
        y: { grid: { color: css('--grid') }, border: { display: false }, ticks: { color: css('--muted') }, beginAtZero: true }
      }
    };
  }

  // ---------- sections ----------
  function renderTiles() {
    var ok = D.market.filter(function (r) { return r.status === 'ok'; });
    var last = ok[ok.length - 1];
    var missing = D.market.filter(function (r) { return r.status === 'missing'; });
    var topBrand = D.brand.filter(function (r) { return r.period === last.period && r.rank === '1'; })[0];
    var tiles = [
      ['ยอดจดทะเบียน ' + monthLabel(last.period, true), fmt(last.total) + ' คัน',
        last.yoy_pct ? 'เทียบปีก่อน ' + (+last.yoy_pct > 0 ? '+' : '') + (+last.yoy_pct).toFixed(1) + '%' : 'ไม่มีข้อมูลเทียบปีก่อน'],
      ['อันดับ 1 ยี่ห้อ', D.brandName[topBrand.brand_id] || topBrand.brand_id, 'ส่วนแบ่ง ' + (+topBrand.share_pct).toFixed(1) + '%'],
      ['ช่วงข้อมูล', ok.length + ' เดือน', monthLabel(D.market[0].period) + ' – ' + monthLabel(last.period)],
      ['เดือนที่ไม่มีข้อมูล', missing.length + ' เดือน', missing.map(function (r) { return monthLabel(r.period); }).join(', ') || '—']
    ];
    var box = document.getElementById('tiles');
    box.textContent = '';
    tiles.forEach(function (t) {
      var d = el('div', { class: 'tile' });
      d.appendChild(el('span', { class: 'label' }, t[0]));
      d.appendChild(el('span', { class: 'value' }, t[1]));
      d.appendChild(el('span', { class: 'detail' }, t[2]));
      box.appendChild(d);
    });
  }

  function renderMarket() {
    var labels = D.market.map(function (r) { return monthLabel(r.period); });
    var missingIdx = [];
    D.market.forEach(function (r, i) { if (r.status !== 'ok') missingIdx.push(i); });
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
    opt.scales.y.ticks.callback = function (v) { return v >= 1000 ? (v / 1000) + 'k' : v; };
    opt.plugins.missingBands = { indices: missingIdx };
    opt.plugins.tooltip.callbacks = {
      label: function (c) { return ' ' + c.dataset.label + ': ' + fmt(c.raw) + ' คัน'; },
      footer: function (items) {
        var r = D.market[items[0].dataIndex];
        return 'รวม ' + fmt(r.total) + ' คัน' + (r.yoy_pct ? ' · YoY ' + (+r.yoy_pct).toFixed(1) + '%' : '');
      }
    };
    opt.plugins.tooltip.footerColor = css('--ink');
    if (charts.market) charts.market.destroy();
    charts.market = new Chart(document.getElementById('marketChart'), { type: 'bar', data: { labels: labels, datasets: datasets }, options: opt, plugins: [missingBands] });

    var rows = D.market.slice().reverse().map(function (r) {
      var tr = el('tr', r.status === 'ok' ? {} : { class: 'missing' });
      tr.appendChild(el('td', {}, monthLabel(r.period, true)));
      if (r.status !== 'ok') {
        var td = el('td', { colspan: '6' }, 'ไม่มีข้อมูล · ' + r.note);
        tr.appendChild(td); return tr;
      }
      ['ry1', 'ry2', 'ry3', 'total'].forEach(function (k) { tr.appendChild(el('td', { class: 'n' }, fmt(r[k]))); });
      tr.appendChild(pctCell(r.mom_pct)); tr.appendChild(pctCell(r.yoy_pct));
      return tr;
    });
    var box = document.getElementById('marketTable');
    box.textContent = '';
    box.appendChild(table([['เดือน'], ['ร.ย.1', 1], ['ร.ย.2', 1], ['ร.ย.3', 1], ['รวม', 1], ['MoM', 1], ['YoY', 1]], rows));
  }

  // A trend chart for brands or models. Color follows the entity: each selection keeps its slot.
  function makeTrend(cfg) {
    var root = document.getElementById(cfg.el);
    var slots = {};      // id -> slot index
    var mode = 'units';
    var head = el('div', { class: 'card-head' });
    var titles = el('div');
    var h2 = el('h2', {}, cfg.title + ' '); h2.appendChild(el('span', { class: 'sub' }, cfg.subtitle));
    titles.appendChild(h2);
    titles.appendChild(el('p', { class: 'note' }, 'เลือกได้สูงสุด ' + MAX_SERIES + ' รายการ เส้นที่ขาดคือเดือนที่ไม่มีข้อมูล'));
    head.appendChild(titles);
    var controls = el('div', { class: 'controls' });
    var listId = cfg.el + 'List';
    var input = el('input', { type: 'search', placeholder: 'ค้นหาเพื่อเพิ่ม…', list: listId, 'aria-label': 'เพิ่ม' + cfg.title, id: cfg.el + 'Search' });
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
    controls.appendChild(input); controls.appendChild(dl); controls.appendChild(seg);
    head.appendChild(controls);
    var chips = el('div', { class: 'chips' });
    var box = el('div', { class: 'chart-box' });
    var canvas = el('canvas', { 'aria-label': cfg.title });
    box.appendChild(canvas);
    root.appendChild(head); root.appendChild(chips); root.appendChild(box);

    input.addEventListener('change', function () {
      var hit = cfg.options().filter(function (o) { return o.label === input.value; })[0];
      if (hit) { add(hit.id); input.value = ''; }
    });

    function add(id) {
      if (id in slots) return;
      var used = Object.keys(slots).map(function (k) { return slots[k]; });
      for (var s = 0; s < MAX_SERIES; s++) if (used.indexOf(s) < 0) break;
      if (s >= MAX_SERIES) { alertFull(); return; }
      slots[id] = s; draw();
    }
    function remove(id) { delete slots[id]; draw(); }
    function toggle(id) { if (id in slots) remove(id); else add(id); }
    function has(id) { return id in slots; }
    function alertFull() {
      document.getElementById('status').textContent = 'กราฟ' + cfg.title + 'แสดงได้สูงสุด ' + MAX_SERIES + ' รายการ ลบรายการเดิมก่อน';
    }

    function draw() {
      var ids = Object.keys(slots).sort(function (a, b) { return slots[a] - slots[b]; });
      chips.textContent = '';
      ids.forEach(function (id) {
        var c = el('span', { class: 'chip' });
        var dot = el('i'); dot.style.background = seriesColor(slots[id]);
        c.appendChild(dot); c.appendChild(document.createTextNode(cfg.nameOf(id)));
        var x = el('button', { type: 'button', 'aria-label': 'ลบ ' + cfg.nameOf(id) }, '×');
        x.addEventListener('click', function () { remove(id); });
        c.appendChild(x); chips.appendChild(c);
      });
      var labels = D.market.map(function (r) { return monthLabel(r.period); });
      var missingIdx = [];
      D.market.forEach(function (r, i) { if (r.status !== 'ok') missingIdx.push(i); });
      var surface = css('--surface');
      var datasets = ids.map(function (id) {
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
      opt.plugins.missingBands = { indices: missingIdx };
      opt.plugins.legend.display = ids.length > 1;
      opt.scales.y.ticks.callback = function (v) { return mode === 'units' ? (v >= 1000 ? (v / 1000) + 'k' : v) : v + '%'; };
      opt.plugins.tooltip.callbacks.label = function (c) {
        return ' ' + c.dataset.label + ': ' + (mode === 'units' ? fmt(c.raw) + ' คัน' : (+c.raw).toFixed(2) + '%');
      };
      if (charts[cfg.el]) charts[cfg.el].destroy();
      charts[cfg.el] = new Chart(canvas, { type: 'line', data: { labels: labels, datasets: datasets }, options: opt, plugins: [missingBands] });
      if (cfg.onChange) cfg.onChange();
    }
    cfg.defaults().forEach(function (id) { slots[id] = Object.keys(slots).length; });
    draw();
    return { toggle: toggle, has: has, redraw: draw };
  }

  function renderRanking(period) {
    function rankTable(rows, key, nameOf, trend, limit) {
      var trs = rows.slice(0, limit).map(function (r) {
        var tr = el('tr');
        tr.appendChild(el('td', { class: 'n' }, r.rank));
        var td = el('td');
        var b = el('button', { type: 'button', class: 'linkbtn', 'aria-pressed': String(trend.has(r[key])) }, nameOf(r[key]));
        b.addEventListener('click', function () { trend.toggle(r[key]); });
        td.appendChild(b); tr.appendChild(td);
        tr.appendChild(el('td', { class: 'n' }, fmt(r.units)));
        tr.appendChild(el('td', { class: 'n' }, (+r.share_pct).toFixed(1) + '%'));
        tr.appendChild(pctCell(r.yoy_pct));
        return tr;
      });
      return table([['#', 1], ['ชื่อ'], ['คัน', 1], ['ส่วนแบ่ง', 1], ['YoY', 1]], trs);
    }
    var bBox = document.getElementById('brandTable'), mBox = document.getElementById('modelTable');
    bBox.textContent = ''; mBox.textContent = '';
    bBox.appendChild(rankTable(D.brand.filter(function (r) { return r.period === period; }), 'brand_id', brandLabel, D.brandTrend, 30));
    mBox.appendChild(rankTable(D.model.filter(function (r) { return r.period === period; }), 'model_id', modelLabel, D.modelTrend, 50));
  }

  function brandLabel(id) { return D.brandName[id] || id; }
  function modelLabel(id) {
    var m = D.modelInfo[id];
    if (!m) return id;
    var b = D.brandName[m.brand_id] || m.brand_id;
    return m.name.toLowerCase().indexOf(b.toLowerCase()) === 0 ? m.name : b + ' ' + m.name;  // "Jaecoo 5", not "Jaecoo Jaecoo 5"
  }
  function index(rows, key) {
    var out = {};
    rows.forEach(function (r) { (out[r[key]] = out[r[key]] || {})[r.period] = r; });
    return out;
  }

  function renderAll() {
    renderTiles();
    renderMarket();
    var sel = document.getElementById('monthSelect');
    var period = sel.value;
    ['brandTrend', 'modelTrend'].forEach(function (id) { document.getElementById(id).textContent = ''; });
    var lastOk = sel.options[0].value;
    function topIds(rows, key, n) {
      return rows.filter(function (r) { return r.period === lastOk; }).slice(0, n).map(function (r) { return r[key]; });
    }
    var keepB = D.brandTrend ? D.brandSel() : topIds(D.brand, 'brand_id', 5);
    var keepM = D.modelTrend ? D.modelSel() : topIds(D.model, 'model_id', 5);
    var rerank = function () { if (D.brandTrend && D.modelTrend) renderRanking(sel.value); };
    var bRows = index(D.brand, 'brand_id'), mRows = index(D.model, 'model_id');
    D.brandTrend = makeTrend({
      el: 'brandTrend', title: 'เทรนด์รายยี่ห้อ', subtitle: 'Brand trend', rows: bRows, nameOf: brandLabel,
      options: function () { return Object.keys(bRows).map(function (id) { return { id: id, label: brandLabel(id) }; }).sort(function (a, b) { return a.label.localeCompare(b.label); }); },
      defaults: function () { return keepB; }, onChange: rerank
    });
    D.modelTrend = makeTrend({
      el: 'modelTrend', title: 'เทรนด์รายรุ่น', subtitle: 'Model trend', rows: mRows, nameOf: modelLabel,
      options: function () { return Object.keys(mRows).map(function (id) { return { id: id, label: modelLabel(id) }; }).sort(function (a, b) { return a.label.localeCompare(b.label); }); },
      defaults: function () { return keepM; }, onChange: rerank
    });
    D.brandSel = function () { return selected('brandTrend'); };
    D.modelSel = function () { return selected('modelTrend'); };
    renderRanking(period);
  }
  function selected(id) {
    var c = charts[id];
    if (!c) return [];
    var byName = {};
    var rows = id === 'brandTrend' ? D.brand : D.model, key = id === 'brandTrend' ? 'brand_id' : 'model_id';
    var nameOf = id === 'brandTrend' ? brandLabel : modelLabel;
    rows.forEach(function (r) { byName[nameOf(r[key])] = r[key]; });
    return c.data.datasets.map(function (d) { return byName[d.label]; });
  }

  // ---------- boot ----------
  Promise.all([
    load('summaries/market_monthly.csv'), load('summaries/brand_monthly.csv'), load('summaries/model_monthly.csv'),
    load('data/brands.csv'), load('data/models.csv')
  ]).then(function (res) {
    D.market = res[0]; D.brand = res[1]; D.model = res[2];
    D.brandName = {}; res[3].forEach(function (b) { D.brandName[b.brand_id] = b.name; });
    D.modelInfo = {}; res[4].forEach(function (m) { D.modelInfo[m.model_id] = m; });
    var sel = document.getElementById('monthSelect');
    D.market.filter(function (r) { return r.status === 'ok'; }).reverse().forEach(function (r) {
      sel.appendChild(el('option', { value: r.period }, monthLabel(r.period, true)));
    });
    sel.addEventListener('change', function () { renderRanking(sel.value); });
    renderAll();
    var st = document.getElementById('status');
    st.textContent = 'ข้อมูลล่าสุด: ' + monthLabel(sel.options[0].value, true) + ' · แหล่งข้อมูล: กรมการขนส่งทางบก';
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(renderAll);
  }).catch(function (e) {
    var st = document.getElementById('status');
    st.className = 'status error';
    st.textContent = 'โหลดข้อมูลไม่สำเร็จ: ' + e.message + ' (เปิดผ่าน GitHub Pages หรือ local web server ไม่ใช่ไฟล์ตรงๆ)';
  });

  document.getElementById('copyCite').addEventListener('click', function () {
    var t = document.getElementById('citeText').textContent, b = this;
    navigator.clipboard.writeText(t).then(function () { b.textContent = 'คัดลอกแล้ว · Copied'; }, function () {
      var r = document.createRange(); r.selectNodeContents(document.getElementById('citeText'));
      var s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
  });
})();
