/* 可筛选表格（等价 BWIKI 的 CardSelect 组件）：
   按钮 .cardSelectOption[data-group][data-option="显示|值"]
   行   <tr data-param1="值1,值2" data-param2="…">
   规则：同组内多选为「或」，不同组之间为「且」；data-group="0" 是「全部」重置键。 */
(function () {
  'use strict';

  var buttons = document.querySelectorAll('.cardSelectOption');
  if (!buttons.length) return;

  /* 作用域 = 最近的 .filter-box 祖先；若因 HTML 结构问题取不到容器，
     退化到「同时包含一组按钮和一张表」的最近祖先，避免整站筛选直接失灵。 */
  function scopeOf(btn) {
    var el = btn;
    while (el && el.parentNode) {
      if (el.classList && el.classList.contains('filter-box')) return el;
      el = el.parentNode;
    }
    el = btn.parentNode;
    while (el && el.parentNode && el !== document.body) {
      if (el.querySelectorAll && el.querySelectorAll('.cardSelectOption').length &&
          el.querySelector && el.querySelector('table')) {
        return el;
      }
      el = el.parentNode;
    }
    return document.body;
  }

  function tableOf(scope) {
    /* 筛选框之后的第一个表格 */
    var el = scope.nextElementSibling;
    while (el) {
      if (el.tagName === 'TABLE') return el;
      if (el.classList && el.classList.contains('table-scroll')) {
        var t = el.querySelector('table');
        if (t) return t;
      }
      var inner = el.querySelector && el.querySelector('table');
      if (inner) return inner;
      el = el.nextElementSibling;
    }
    return document.querySelector('table.wikitable');
  }

  function paramNames(tr) {
    var names = [];
    for (var i = 0; i < tr.attributes.length; i++) {
      var a = tr.attributes[i];
      if (/^data-param\d+$/.test(a.name)) names.push(a.name);
    }
    names.sort(function (x, y) {
      return parseInt(x.replace(/\D/g, ''), 10) - parseInt(y.replace(/\D/g, ''), 10);
    });
    return names;
  }

  function setup(scope) {
    var table = tableOf(scope);
    if (!table) return;
    var tbody = table.tBodies[0] || table;
    var rows = [];
    var all = tbody.rows;
    for (var i = 0; i < all.length; i++) {
      if (paramNames(all[i]).length) rows.push(all[i]);   // 表头行也带 param，参与筛选
    }
    if (!rows.length) return;

    // 初始化必须幂等：scopeOf() 对同一容器里的每个按钮都会返回同一个容器，
    // 若不加标记，setup 会被调用 N 次，往同一个容器里塞 N 个计数器。
    if (scope.getAttribute('data-xbgd-init') === '1') return;
    scope.setAttribute('data-xbgd-init', '1');

    var counter = scope.querySelector('.filter-count');
    if (!counter) {
      counter = document.createElement('div');
      counter.className = 'filter-count';
      scope.appendChild(counter);
    }

    function activeValues() {
      var byGroup = {}, resets = {};
      var btns = scope.querySelectorAll('.cardSelectOption.cardSelectOn');
      for (var i = 0; i < btns.length; i++) {
        var g = btns[i].getAttribute('data-group');
        var opt = (btns[i].getAttribute('data-option') || '').split('|');
        var val = opt.length > 1 ? opt[1] : '';
        // 值为空（如 data-option="全部|"）或 data-group="0" 视为重置键，不参与匹配
        if (!g || g === '0' || g === 'all' || !val) {
          if (g && g !== '0') resets[g] = true;
          continue;
        }
        (byGroup[g] = byGroup[g] || []).push(val);
      }
      return { sel: byGroup, resets: resets };
    }

    function apply() {
      var act = activeValues();
      var sel = act.sel, resets = act.resets;
      var groups = Object.keys(sel);
      var shown = 0;
      for (var i = 0; i < rows.length; i++) {
        var tr = rows[i];
        var ok = true;
        var names = paramNames(tr);
        for (var g = 0; g < groups.length && ok; g++) {
          if (resets[groups[g]]) continue;      // 该组被重置，不参与匹配
          var want = sel[groups[g]];
          var got = false;
          for (var n = 0; n < names.length && !got; n++) {
            var raw = tr.getAttribute(names[n]) || '';
            var vals = raw.split(',');
            for (var v = 0; v < vals.length; v++) {
              if (want.indexOf(vals[v].trim()) >= 0) { got = true; break; }
            }
          }
          if (!got) ok = false;
        }
        tr.classList.toggle('hide', !ok);
        if (ok) shown++;
      }
      var eff = groups.filter(function (g) { return !resets[g]; }).length;
      counter.innerHTML = eff
        ? '筛选结果：<b>' + shown + '</b> / ' + rows.length + ' 条'
        : '共 <b>' + rows.length + '</b> 条（点上面的按钮筛选）';
    }

    scope.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('.cardSelectOption') : null;
      if (!btn || !scope.contains(btn)) return;
      var group = btn.getAttribute('data-group');
      var opt = (btn.getAttribute('data-option') || '').split('|');
      var val = opt.length > 1 ? opt[1] : '';
      if (group === '0') {
        var on = scope.querySelectorAll('.cardSelectOption.cardSelectOn');
        for (var i = 0; i < on.length; i++) on[i].classList.remove('cardSelectOn');
      } else if (!val) {
        // 本组的「全部」：只重置同组按钮
        var same = scope.querySelectorAll('.cardSelectOption[data-group="' + group + '"]');
        for (var j = 0; j < same.length; j++) same[j].classList.remove('cardSelectOn');
      } else {
        btn.classList.toggle('cardSelectOn');
      }
      apply();
    });

    apply();
  }

  /* 收集所有筛选框：优先 .filter-box，退化为按钮的父级容器 */
  var scopes = [], seen = [];
  for (var i = 0; i < buttons.length; i++) {
    var s = scopeOf(buttons[i]);
    if (seen.indexOf(s) < 0) { seen.push(s); scopes.push(s); }
  }
  for (var j = 0; j < scopes.length; j++) setup(scopes[j]);
})();
