/* 可筛选表格（等价 BWIKI 的 CardSelect 组件）：
   按钮 .cardSelectOption[data-group][data-option="显示|值"]
   行   <tr data-param1="值1,值2" data-param2="…">
   规则：同组内多选为「或」，不同组之间为「且」；data-group="0" 是「全部」重置键。 */
(function () {
  'use strict';

  var buttons = document.querySelectorAll('.cardSelectOption');
  if (!buttons.length) return;

  /* 只在同一张表所属的筛选框内联动：把按钮按最近的容器分组 */
  function scopeOf(btn) {
    var el = btn;
    while (el && el.parentNode) {
      if (el.classList && el.classList.contains('filter-box')) return el;
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

    var counter = document.createElement('div');
    counter.className = 'filter-count';
    scope.appendChild(counter);

    function activeValues() {
      var byGroup = {};
      var btns = scope.querySelectorAll('.cardSelectOption.cardSelectOn');
      for (var i = 0; i < btns.length; i++) {
        var g = btns[i].getAttribute('data-group');
        var opt = (btns[i].getAttribute('data-option') || '').split('|');
        var val = opt.length > 1 ? opt[1] : opt[0];
        if (!g || g === '0' || !val) continue;
        (byGroup[g] = byGroup[g] || []).push(val);
      }
      return byGroup;
    }

    function apply() {
      var sel = activeValues();
      var groups = Object.keys(sel);
      var shown = 0;
      for (var i = 0; i < rows.length; i++) {
        var tr = rows[i];
        var ok = true;
        var names = paramNames(tr);
        for (var g = 0; g < groups.length && ok; g++) {
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
      counter.innerHTML = groups.length
        ? '筛选结果：<b>' + shown + '</b> / ' + rows.length + ' 条'
        : '共 <b>' + rows.length + '</b> 条（点上面的按钮筛选）';
    }

    scope.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('.cardSelectOption') : null;
      if (!btn || !scope.contains(btn)) return;
      var group = btn.getAttribute('data-group');
      if (group === '0') {
        var on = scope.querySelectorAll('.cardSelectOption.cardSelectOn');
        for (var i = 0; i < on.length; i++) on[i].classList.remove('cardSelectOn');
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
