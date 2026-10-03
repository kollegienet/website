/*
  Driftstatus: renders https://stats.kollegienet.dk/driftstatus.json into every
  element with a data-driftstatus attribute (the URL). Used by driftstatus.html
  (full list) and index.html (compact card without a list).

  Expected markup inside the element:
    [data-status-dot]    dot whose class becomes ok / bad / unknown
    [data-status-label]  headline
    [data-status-sub]    detail line
    [data-status-list]   optional <ul> listing every dorm
*/
(function () {
  var STALE_MS = 10 * 60 * 1000;

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
      show('unknown', 'Status ukendt lige nu', 'Vi kan ikke hente driftstatus. Følg med på Facebook ved driftsproblemer.');
      if (list) list.hidden = true;
    }

    function render(data) {
      var updated = new Date(data.generated_at);
      if (isNaN(updated) || !Array.isArray(data.dorms)) return unknown();

      var when = 'kl. ' + updated.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
      if (updated.toDateString() !== new Date().toDateString()) {
        when = updated.toLocaleDateString('da-DK', { day: 'numeric', month: 'long' }) + ' ' + when;
      }
      var time = 'Opdateret ' + when;
      var stale = Date.now() - updated > STALE_MS;
      var down = data.dorms.filter(function (d) { return d.status === 'down'; });
      if (stale) {
        // Keep the last known status visible, but don't present it as current.
        show('unknown', 'Status ikke opdateret siden ' + when, 'Viser senest kendte status. Følg med på Facebook ved driftsproblemer.');
      } else if (down.length) {
        var title = down.length === 1 ? 'Driftsproblemer på 1 kollegie' : 'Driftsproblemer på ' + down.length + ' kollegier';
        // Without a list, name the affected dorms in the detail line.
        var names = list ? '' : down.map(function (d) { return d.name; }).join(', ') + ' · ';
        show('bad', title, names + time);
      } else {
        show('ok', 'Alt kører normalt', time);
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
