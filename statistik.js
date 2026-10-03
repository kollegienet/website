/*
  Trafikstatistik: renders traffic graphs from the JSON published by the
  LibreNMS export (driftstatus-json/stats-export.py) to the URL in the page's
  data-stats attribute:

    index.json      port list (id, name, group, speed_bps) and generated_at
    day.json        last 24 hours for every port (overview)
    port-<id>.json  day, week, month, year and years for one port (detail)

  Series are bits per second; null where LibreNMS has no data. Ports are on
  Kollegienet's core switches, so for a dorm ("gateway") port OUT is traffic to
  the dorm (download) and IN is upload; for an uplink ("transit") port it's the
  other way round.
*/
(function () {
  var root = document.querySelector('[data-stats]');
  if (!root) return;
  var BASE = root.getAttribute('data-stats');
  var STALE_MS = 45 * 60 * 1000;
  var SVG = 'http://www.w3.org/2000/svg';
  // Texts and number/date formats follow the page language (<html lang="da"> or "en").
  var EN = (document.documentElement.lang || '').slice(0, 2) === 'en';
  var LOCALE = EN ? 'en-GB' : LOCALE;
  var T = EN ? {
    periods: ['Day', 'Week', 'Month', 'Year', '4 years'],
    uplinks: 'Internet uplinks', dorms: 'Dorms', noData: 'No data',
    head: ['', 'Now', 'Average', 'Max', '95th percentile', 'Data'],
    back: '← All connections', loading: 'Loading…', portError: 'Could not load data for ',
    error: "Traffic statistics can't be loaded right now. Please try again later.",
    at: 'at ', updated: 'Updated ', stale: 'Not updated since '
  } : {
    periods: ['Døgn', 'Uge', 'Måned', 'År', '4 år'],
    uplinks: 'Internetforbindelse', dorms: 'Kollegier', noData: 'Ingen data',
    head: ['', 'Nu', 'Gennemsnit', 'Maks', '95-percentil', 'Data'],
    back: '← Alle forbindelser', loading: 'Henter…', portError: 'Kunne ikke hente data for ',
    error: 'Trafikstatistikken kan ikke hentes lige nu. Prøv igen senere.',
    at: 'kl. ', updated: 'Opdateret ', stale: 'Ikke opdateret siden '
  };
  var PERIODS = ['day', 'week', 'month', 'year', 'years'].map(function (key, i) {
    return { key: key, label: T.periods[i] };
  });

  var overview = root.querySelector('[data-stats-overview]');
  var detail = root.querySelector('[data-stats-detail]');
  var updatedEl = document.querySelector('[data-stats-updated]');
  var index = null;
  var day = null;
  var portCache = {};

  function getJSON(name) {
    return fetch(BASE + name, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(name + ': ' + r.status);
      return r.json();
    });
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function fmtBps(v) {
    if (v == null || isNaN(v)) return '–';
    var units = [[1e9, 'Gbit/s'], [1e6, 'Mbit/s'], [1e3, 'kbit/s']];
    for (var i = 0; i < units.length; i++) {
      if (Math.abs(v) >= units[i][0]) {
        var n = v / units[i][0];
        return n.toLocaleString(LOCALE, { maximumFractionDigits: n < 10 ? 1 : 0 }) + ' ' + units[i][1];
      }
    }
    return Math.round(v) + ' bit/s';
  }

  function fmtBytes(b) {
    var units = [[1e12, 'TB'], [1e9, 'GB'], [1e6, 'MB']];
    for (var i = 0; i < units.length; i++) {
      if (b >= units[i][0]) return (b / units[i][0]).toLocaleString(LOCALE, { maximumFractionDigits: 1 }) + ' ' + units[i][1];
    }
    return Math.round(b / 1e3) + ' kB';
  }

  function fmtSpeed(bps) {
    if (!bps) return '';
    return bps >= 1e9 ? (bps / 1e9) + ' Gbit' : (bps / 1e6) + ' Mbit';
  }

  // Download/upload from the port's in/out, depending on which side faces the dorm.
  function directions(port, series) {
    return port.group === 'uplink'
      ? { down: series.in, up: series.out }
      : { down: series.out, up: series.in };
  }

  function stats(values, step) {
    var v = values.filter(function (x) { return x != null; });
    if (!v.length) return { now: null, avg: null, max: null, p95: null, bytes: 0 };
    var sorted = v.slice().sort(function (a, b) { return a - b; });
    var sum = v.reduce(function (a, b) { return a + b; }, 0);
    var last = null;
    for (var i = values.length - 1; i >= 0 && last == null; i--) last = values[i];
    return {
      now: last,
      avg: sum / v.length,
      max: sorted[sorted.length - 1],
      p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
      bytes: sum * step / 8
    };
  }

  function niceMax(v) {
    if (!v) return 1e6;
    var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    var m = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < m.length; i++) if (m[i] * p >= v) return m[i] * p;
    return 10 * p;
  }

  function timeLabel(date, period) {
    if (period === 'day') return date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
    if (period === 'week') return date.toLocaleDateString(LOCALE, { weekday: 'short' });
    if (period === 'month') return date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
    if (period === 'year') return date.toLocaleDateString(LOCALE, { month: 'short' });
    return String(date.getFullYear());
  }

  // Download as an area above the axis, upload mirrored below, like LibreNMS.
  function chart(series, dir, opts) {
    var W = opts.width, H = opts.height;
    var padL = opts.axes ? 92 : 0, padR = opts.axes ? 8 : 0, padT = 6, padB = opts.axes ? 22 : 6;
    var w = W - padL - padR, h = H - padT - padB, mid = padT + h * 0.62;
    var n = dir.down.length;
    var peak = 0;
    for (var i = 0; i < n; i++) {
      if (dir.down[i] > peak) peak = dir.down[i];
      if (dir.up[i] * 0.62 / 0.38 > peak) peak = dir.up[i] * 0.62 / 0.38;
    }
    var top = niceMax(peak);
    var x = function (i) { return padL + (n <= 1 ? 0 : i * w / (n - 1)); };
    var yDown = function (v) { return mid - v / top * (mid - padT); };
    var yUp = function (v) { return mid + v / (top * 0.38 / 0.62) * (padT + h - mid); };

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img', class: 'traffic-chart' });
    if (opts.axes) {
      // Same scale on both sides; the upload side only shows the round values that fit.
      var upRange = top * 0.38 / 0.62;
      [0.25, 0.5, 0.75, 1].forEach(function (f) {
        var v = top * f, marks = [];
        if (f === 0.5 || f === 1) marks.push(yDown(v));
        if (v <= upRange && (f === 0.5 || f === 1 || upRange < top * 0.5)) marks.push(yUp(v));
        marks.forEach(function (gy) {
          svg.appendChild(svgEl('line', { x1: padL, x2: W - padR, y1: gy, y2: gy, class: 'grid' }));
          var t = svgEl('text', { x: padL - 8, y: gy + 4, 'text-anchor': 'end', class: 'tick' });
          t.textContent = fmtBps(v);
          svg.appendChild(t);
        });
      });
      var ticks = opts.ticks || 6;
      for (var k = 0; k <= ticks; k++) {
        var idx = Math.round(k * (n - 1) / ticks);
        var tx = svgEl('text', { x: x(idx), y: H - 5, 'text-anchor': k === 0 ? 'start' : k === ticks ? 'end' : 'middle', class: 'tick' });
        tx.textContent = timeLabel(new Date((series.start + idx * series.step) * 1000), opts.period);
        svg.appendChild(tx);
      }
    }
    [['down', yDown], ['up', yUp]].forEach(function (pair) {
      var values = dir[pair[0]], y = pair[1], d = '', open = false, first = 0;
      for (var i = 0; i < n; i++) {
        var v = values[i];
        if (v == null) {
          if (open) { d += 'L' + x(i - 1) + ',' + mid + 'L' + x(first) + ',' + mid + 'Z'; open = false; }
          continue;
        }
        if (!open) { d += 'M' + x(i) + ',' + mid; first = i; open = true; }
        d += 'L' + x(i) + ',' + y(v);
      }
      if (open) d += 'L' + x(n - 1) + ',' + mid + 'L' + x(first) + ',' + mid + 'Z';
      if (d) svg.appendChild(svgEl('path', { d: d, class: 'area ' + pair[0] }));
    });
    svg.appendChild(svgEl('line', { x1: padL, x2: W - padR, y1: mid, y2: mid, class: 'axis' }));
    return svg;
  }

  function showUpdated(generatedAt) {
    var t = new Date(generatedAt);
    if (isNaN(t)) { updatedEl.textContent = ''; return; }
    var when = T.at + t.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
    if (t.toDateString() !== new Date().toDateString()) when = t.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' }) + ' ' + when;
    var stale = Date.now() - t > STALE_MS;
    updatedEl.textContent = (stale ? T.stale : T.updated) + when;
    updatedEl.classList.toggle('stale', stale);
  }

  function renderOverview() {
    overview.textContent = '';
    [['uplink', T.uplinks], ['dorm', T.dorms]].forEach(function (g) {
      var ports = index.ports.filter(function (p) { return p.group === g[0]; });
      if (!ports.length) return;
      overview.appendChild(el('h2', 'stats-group', g[1]));
      var grid = el('div', 'stats-grid');
      ports.forEach(function (port) {
        var series = day.ports[String(port.id)];
        var a = el('a', 'stats-card');
        a.href = '#' + port.id;
        var head = el('div', 'stats-card-head');
        head.appendChild(el('span', 'stats-name', port.name));
        head.appendChild(el('span', 'stats-speed', fmtSpeed(port.speed_bps)));
        a.appendChild(head);
        if (series) {
          var dir = directions(port, series);
          a.appendChild(chart(series, dir, { width: 300, height: 70, axes: false, period: 'day' }));
          var now = el('div', 'stats-now');
          now.appendChild(el('span', 'down', '↓ ' + fmtBps(stats(dir.down, series.step).now)));
          now.appendChild(el('span', 'up', '↑ ' + fmtBps(stats(dir.up, series.step).now)));
          a.appendChild(now);
        } else {
          a.appendChild(el('div', 'stats-now', T.noData));
        }
        grid.appendChild(a);
      });
      overview.appendChild(grid);
    });
  }

  function legendTable(dir, step) {
    var table = el('table', 'stats-legend');
    var head = el('tr');
    T.head.forEach(function (h) { head.appendChild(el('th', null, h)); });
    table.appendChild(head);
    [['down', '↓ Download'], ['up', '↑ Upload']].forEach(function (r) {
      var s = stats(dir[r[0]], step);
      var tr = el('tr');
      tr.appendChild(el('th', r[0], r[1]));
      [fmtBps(s.now), fmtBps(s.avg), fmtBps(s.max), fmtBps(s.p95), fmtBytes(s.bytes)].forEach(function (v) { tr.appendChild(el('td', null, v)); });
      table.appendChild(tr);
    });
    return table;
  }

  function renderDetail(port, data, periodKey) {
    detail.textContent = '';
    var back = el('a', 'stats-back', T.back);
    back.href = '#';
    detail.appendChild(back);
    var title = el('h2', null, port.name);
    if (port.speed_bps) title.appendChild(el('span', 'stats-speed', ' ' + fmtSpeed(port.speed_bps)));
    detail.appendChild(title);
    var tabs = el('div', 'stats-tabs');
    PERIODS.forEach(function (p) {
      var b = el('a', p.key === periodKey ? 'active' : null, p.label);
      b.href = '#' + port.id + '/' + p.key;
      tabs.appendChild(b);
    });
    detail.appendChild(tabs);
    var series = data.periods[periodKey];
    var dir = directions(port, series);
    // Draw at the real width so axis text stays readable on phones.
    var width = Math.max(300, Math.round(detail.clientWidth || 1000));
    detail.appendChild(chart(series, dir, { width: width, height: width < 600 ? 220 : 300, axes: true, period: periodKey, ticks: width < 600 ? 3 : 6 }));
    detail.appendChild(legendTable(dir, series.step));
  }

  // Keep the selected port/period when switching language.
  function syncLangSwitch() {
    Array.prototype.forEach.call(document.querySelectorAll('.lang-switch a'), function (a) {
      a.setAttribute('href', a.getAttribute('href').split('#')[0] + location.hash);
    });
  }

  function route() {
    syncLangSwitch();
    var m = location.hash.match(/^#(\d+)(?:\/(\w+))?$/);
    if (!m || !index) {
      detail.hidden = true;
      overview.hidden = false;
      return;
    }
    var port = index.ports.filter(function (p) { return String(p.id) === m[1]; })[0];
    var periodKey = PERIODS.some(function (p) { return p.key === m[2]; }) ? m[2] : 'day';
    if (!port) { location.hash = ''; return; }
    overview.hidden = true;
    detail.hidden = false;
    var show = function (data) { renderDetail(port, data, periodKey); };
    if (portCache[port.id]) return show(portCache[port.id]);
    detail.textContent = T.loading;
    getJSON('port-' + port.id + '.json').then(function (data) { portCache[port.id] = data; show(data); })
      .catch(function () { detail.textContent = T.portError + port.name + '.'; });
  }

  Promise.all([getJSON('index.json'), getJSON('day.json')]).then(function (r) {
    index = r[0];
    day = r[1];
    showUpdated(index.generated_at);
    renderOverview();
    route();
  }).catch(function () {
    overview.textContent = T.error;
    updatedEl.textContent = '';
  });
  window.addEventListener('hashchange', route);
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (!detail.hidden) route(); }, 200);
  });
})();
