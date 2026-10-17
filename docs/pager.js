
/* ---------------------------------------------------------------- 分页
 * 表格数据行超过 PAGE_SIZE 时，在表格下方渲染页码跳转。
 * 与筛选互不干扰：
 *   · 筛选逻辑用 `hidden` 属性标记不匹配的行（filters.js 负责）
 *   · 分页只控制「匹配行」的 inline display，不碰 hidden
 *   · 筛选用 MutationObserver 监听 hidden 变化，自动回到第 1 页并重算页数
 */
(function () {
  if (typeof document === 'undefined') return;
  var PAGE_SIZE = 50;
  var pagers = [];

  function buildBar(total, page, pages, go) {
    var bar = document.createElement('div');
    bar.className = 'pager';
    var info = document.createElement('span');
    info.className = 'pager-info';
    info.textContent = '共 ' + total + ' 条 · 第 ' + page + '/' + pages + ' 页';
    bar.appendChild(info);

    function btn(text, target, disabled, active) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pager-btn' + (active ? ' active' : '');
      b.textContent = text;
      if (disabled) b.disabled = true;
      else b.addEventListener('click', function () { go(target); });
      bar.appendChild(b);
    }

    btn('上一页', page - 1, page <= 1, false);
    // 页码：首末页 + 当前页附近
    var nums = {};
    nums[1] = 1; nums[pages] = 1;
    for (var i = page - 2; i <= page + 2; i++) if (i >= 1 && i <= pages) nums[i] = 1;
    var keys = Object.keys(nums).map(Number).sort(function (a, b) { return a - b; });
    var prev = 0;
    for (var k = 0; k < keys.length; k++) {
      var n = keys[k];
      if (prev && n - prev > 1) {
        var dots = document.createElement('span');
        dots.className = 'pager-dots';
        dots.textContent = '…';
        bar.appendChild(dots);
      }
      btn(String(n), n, false, n === page);
      prev = n;
    }
    btn('下一页', page + 1, page >= pages, false);
    return bar;
  }

  function init(table) {
    var rows = [].slice.call(table.querySelectorAll('tr[data-param1]'));
    if (rows.length <= PAGE_SIZE) return;

    var page = 1;
    var writing = false;
    var bar = document.createElement('div');
    bar.className = 'pager-slot';
    if (table.parentNode) table.parentNode.insertBefore(bar, table.nextSibling);

    function matched() {
      return rows.filter(function (r) { return !r.hasAttribute('hidden'); });
    }

    function render() {
      var vis = matched();
      var pages = Math.max(1, Math.ceil(vis.length / PAGE_SIZE));
      if (page > pages) page = pages;
      writing = true;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.hasAttribute('hidden')) continue;          // 被筛掉的行不管
        var idx = vis.indexOf(r);
        r.style.display = (idx >= (page - 1) * PAGE_SIZE && idx < page * PAGE_SIZE) ? '' : 'none';
      }
      writing = false;
      bar.innerHTML = '';
      bar.appendChild(buildBar(vis.length, page, pages, function (p) {
        page = Math.max(1, Math.min(pages, p));
        render();
      }));
    }

    // 筛选变化（hidden 属性增删）→ 回到第一页重算
    var obs = new MutationObserver(function () {
      if (writing) return;
      page = 1;
      render();
    });
    for (var i = 0; i < rows.length; i++) {
      obs.observe(rows[i], { attributes: true, attributeFilter: ['hidden'] });
    }

    pagers.push({ table: table, render: render });
    render();
  }

  function boot() {
    var tables = document.querySelectorAll('table');
    for (var i = 0; i < tables.length; i++) init(tables[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  if (typeof window !== 'undefined') {
    window.__XBGD_PAGER__ = {
      size: PAGE_SIZE,
      count: function () { return pagers.length; },
      render: function () { pagers.forEach(function (p) { p.render(); }); }
    };
  }
})();
