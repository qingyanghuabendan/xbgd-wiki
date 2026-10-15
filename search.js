/* 顶栏搜索：先匹配页面名（search-index.json），再就地匹配当前页表格行/图鉴卡片。 */
(function () {
  'use strict';

  var input = document.getElementById('searchInput');
  var box = document.getElementById('searchResults');
  if (!input || !box) return;

  var pages = [];
  var pageCache = {};

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  fetch('search-index.json')
    .then(function (r) { return r.json(); })
    .then(function (j) { pages = Array.isArray(j) ? j : []; })
    .catch(function () { pages = []; });

  /* 当前页面的行级检索：以 <tr data-paramN="…"> 作为「条目行」，
     没有该属性的普通表格行退回用 <td> 数量判断。 */
  function isEntryRow(tr) {
    for (var i = 0; i < tr.attributes.length; i++) {
      if (/^data-param\d+$/.test(tr.attributes[i].name)) return true;
    }
    return tr.querySelectorAll('td').length >= 2;
  }

  function entryRows() {
    var out = [];
    var rows = document.querySelectorAll('table.wikitable tbody tr');
    for (var i = 0; i < rows.length; i++) {
      if (isEntryRow(rows[i])) out.push(rows[i]);
    }
    return out;
  }

  function pageHits(q) {
    var ql = q.toLowerCase();
    var hits = [];
    var i;
    for (i = 0; i < pages.length; i++) {
      var p = pages[i];
      if (p.title.toLowerCase().indexOf(ql) >= 0 ||
          (p.desc && p.desc.toLowerCase().indexOf(ql) >= 0)) {
        hits.push({ href: p.file, label: p.title, note: '页面' });
      }
      if (hits.length >= 8) break;
    }
    return hits;
  }

  function rowHits(q) {
    var ql = q.toLowerCase();
    var hitList = [];
    var rows = entryRows();
    for (var i = 0; i < rows.length && hitList.length < 12; i++) {
      var text = (rows[i].textContent || '').replace(/\s+/g, ' ').trim();
      if (text.toLowerCase().indexOf(ql) >= 0) {
        hitList.push({ el: rows[i], text: text.slice(0, 90) });
      }
    }
    return hitList;
  }

  function highlightRows(q) {
    var rows = entryRows();
    var ql = q ? q.toLowerCase() : '';
    for (var i = 0; i < rows.length; i++) {
      if (!ql) { rows[i].classList.remove('search-hit'); continue; }
      var hit = (rows[i].textContent || '').toLowerCase().indexOf(ql) >= 0;
      rows[i].classList.toggle('search-hit', hit);
    }
  }

  function close() { box.classList.remove('open'); box.innerHTML = ''; }

  function render(q) {
    if (!q) { close(); return; }
    var html = [];
    var hits = pageHits(q);
    if (hits.length) {
      html.push('<div class="hit-sec">页面</div>');
      for (var i = 0; i < hits.length; i++) {
        html.push('<a href="' + hits[i].href + '">' + escapeHtml(hits[i].label) +
                  ' <span style="color:#a99">' + escapeHtml(hits[i].note) + '</span></a>');
      }
    }
    var rows = rowHits(q);
    if (rows.length) {
      html.push('<div class="hit-sec">本页条目（' + rows.length + '）</div>');
      for (var j = 0; j < rows.length; j++) {
        html.push('<a href="#" data-row="' + j + '">' + escapeHtml(rows[j].text) + '</a>');
      }
    }
    if (!html.length) {
      html.push('<div class="empty">没有匹配「' + escapeHtml(q) + '」的内容</div>');
    }
    box.innerHTML = html.join('');
    box.classList.add('open');

    var links = box.querySelectorAll('a[data-row]');
    for (var k = 0; k < links.length; k++) {
      links[k].addEventListener('click', function (ev) {
        ev.preventDefault();
        var idx = parseInt(this.getAttribute('data-row'), 10);
        var el = rows[idx] && rows[idx].el;
        if (el) {
          highlightRows(q);
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.outline = '2px solid #c9a227';
          setTimeout(function () { el.style.outline = ''; }, 2200);
        }
        close();
      });
    }
  }

  var timer = null;
  input.addEventListener('input', function () {
    var q = input.value.trim();
    highlightRows(q);
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { render(q); }, 90);
  });

  input.addEventListener('focus', function () {
    if (input.value.trim()) render(input.value.trim());
  });

  document.addEventListener('click', function (ev) {
    if (!box.contains(ev.target) && ev.target !== input) close();
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { close(); input.blur(); }
    if (ev.key === '/' && document.activeElement !== input) {
      ev.preventDefault(); input.focus();
    }
  });
})();
