/*
  Driftstatus: renders https://kollegienet.github.io/driftstatus/driftstatus.json into every
  element with a data-driftstatus attribute (the URL). Used by driftstatus.html
  (full list) and index.html (compact card without a list).

  Expected markup inside the element:
    [data-status-dot]    dot whose class becomes ok / bad / unknown
    [data-status-label]  headline
    [data-status-sub]    detail line
    [data-status-list]   optional <ul> listing every dorm

  Texts and date formats follow the page language (<html lang="da"> or "en").
*/
(function () {
  // GitHub Pages caches the JSON for up to 10 minutes, so allow for that on top of the update interval.
  var STALE_MS = 30 * 60 * 1000;
  var EN = (document.documentElement.lang || '').slice(0, 2) === 'en';
  var LOCALE = EN ? 'en-GB' : 'da-DK';
  var T = EN ? {
    unknown: 'Status unknown right now',
    unknownSub: "We can't load the network status. Follow us on Facebook for news about problems.",
    at: 'at ', updated: 'Updated ', staleTitle: 'Status not updated since ',
    staleSub: 'Showing the last known status. Follow us on Facebook for news about problems.',
    downOne: 'Problems at 1 dorm', downMany: function (n) { return 'Problems at ' + n + ' dorms'; },
    ok: 'Everything is running normally'
  } : {
    unknown: 'Status ukendt lige nu',
    unknownSub: 'Vi kan ikke hente driftstatus. Følg med på Facebook ved driftsproblemer.',
    at: 'kl. ', updated: 'Opdateret ', staleTitle: 'Status ikke opdateret siden ',
    staleSub: 'Viser senest kendte status. Følg med på Facebook ved driftsproblemer.',
    downOne: 'Driftsproblemer på 1 kollegie', downMany: function (n) { return 'Driftsproblemer på ' + n + ' kollegier'; },
    ok: 'Alt kører normalt'
  };

  function setup(board) {
    var dot = board.querySelector('[data-status-dot]');
    var label = board.querySelector('[data-status-label]');
    var sub = board.querySelector('[data-status-sub]');
    var list = board.querySelector('[data-status-list]');

    function show(state, text, detail) {
      dot.className = dot.className.replace(/\b(ok|bad|unknown)\b/g, '').trim() + ' ' + state;
      label.textContent = text;
      sub.textContent = detail || '';
    }

    function unknown() {
      show('unknown', T.unknown, T.unknownSub);
      if (list) list.hidden = true;
    }

    function render(data) {
      var updated = new Date(data.generated_at);
      if (isNaN(updated) || !Array.isArray(data.dorms)) return unknown();

      var when = T.at + updated.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
      if (updated.toDateString() !== new Date().toDateString()) {
        when = updated.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' }) + ' ' + when;
      }
      var time = T.updated + when;
      var stale = Date.now() - updated > STALE_MS;
      var down = data.dorms.filter(function (d) { return d.status === 'down'; });
      if (stale) {
        // Keep the last known status visible, but don't present it as current.
        show('unknown', T.staleTitle + when, T.staleSub);
      } else if (down.length) {
        var title = down.length === 1 ? T.downOne : T.downMany(down.length);
        // Without a list, name the affected dorms in the detail line.
        var names = list ? '' : down.map(function (d) { return d.name; }).join(', ') + ' · ';
        show('bad', title, names + time);
      } else {
        show('ok', T.ok, time);
      }

      if (!list) return;
      list.textContent = '';
      down.concat(data.dorms.filter(function (d) { return d.status !== 'down'; })).forEach(function (d) {
        var li = document.createElement('li');
        var dotEl = document.createElement('span');
        dotEl.className = d.status === 'down' ? 'dot-bad' : 'dot-ok';
        li.appendChild(dotEl);
        li.appendChild(document.createTextNode(d.name));
        if (d.status === 'down') li.className = 'problem';
        list.appendChild(li);
      });
      list.classList.toggle('stale', stale);
      list.hidden = false;
    }

    function load() {
      fetch(board.getAttribute('data-driftstatus'), { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(render)
        .catch(unknown);
    }

    load();
    setInterval(load, 2 * 60 * 1000);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-driftstatus]'), setup);
})();
