/* 星布谷地 WIKI —— 可筛选表格（重写版）
 *
 * 设计约定（与 build_site.py 的产物一一对应，不依赖任何结构猜测）：
 *   容器   <div class="filter-box"> …按钮… </div>      必须存在，且是表格的前一个兄弟节点
 *   按钮   <span class="cardSelectOption" data-group="N" data-option="显示|值">
 *   数据行 <tr data-param1="值1,值2" data-param2="…">   列号 N 与 data-group="N" 对应
 *   重置键 data-group="0"，或同组内 data-option 的值为空（形如 "全部|"）
 *
 * 语义：组内多选取「或」，组间取「与」；重置键只清空本组。
 *
 * 三条硬性要求（都是之前踩过的坑）：
 *   1. 初始化幂等 —— 同一容器被处理多次不得产生副作用（曾堆出十几个计数器）；
 *   2. 不用 table.tBodies —— 兼容不实现该 API 的 DOM（如测试环境的 linkedom）；
 *   3. 组与数据列对不上时主动报出来，而不是静默筛成空表。
 */
(function () {
  'use strict';

  var MARK = 'data-xbgd-filters';
  var tpl = null;

  function boxes() {
    var list = document.querySelectorAll('.filter-box');
    // 退化路径：万一容器类没写上，用「同时包含按钮和表格」的最近祖先兜底
    if (!list.length) {
      var btns = document.querySelectorAll('.cardSelectOption');
      var seen = [];
      for (var i = 0; i < btns.length; i++) {
        var el = btns[i].parentNode;
        while (el && el.nodeType === 1 && el !== document.body) {
          if (el.querySelectorAll('.cardSelectOption').length && el.querySelector('table')) {
            if (seen.indexOf(el) < 0) { seen.push(el); list = seen; }
            break;
          }
          el = el.parentNode;
        }
      }
    }
    return list || [];
  }

  /* 表格：优先取容器后面的第一个表格；退化到容器内的第一个表格 */
  function tableOf(box) {
    var el = box.nextElementSibling;
    var guard = 0;
    while (el && guard++ < 40) {
      if (el.tagName === 'TABLE') return el;
      if (el.querySelector && el.querySelector('table')) return el.querySelector('table');
      el = el.nextElementSibling;
    }
    return box.querySelector ? box.querySelector('table') : null;
  }

  /* 行：只认带 data-paramN 的行，表头行也带，所以会一起参与筛选 */
  function rowsOf(table) {
    var all = table.querySelectorAll('tr');
    var rows = [];
    for (var i = 0; i < all.length; i++) {
      if (paramNames(all[i]).length) rows.push(all[i]);
    }
    return rows;
  }

  function paramNames(tr) {
    var names = [];
    var attrs = tr.attributes || [];
    for (var i = 0; i < attrs.length; i++) {
      if (/^data-param\d+$/.test(attrs[i].name)) names.push(attrs[i].name);
    }
    return names;
  }

  function parseOption(btn) {
    var raw = btn.getAttribute('data-option') || '';
    var i = raw.indexOf('|');
    var text = i < 0 ? raw : raw.slice(0, i);
    var value = i < 0 ? raw : raw.slice(i + 1);
    var group = btn.getAttribute('data-group');
    if (group === null || group === '') group = '0';
    return { text: text, value: value, group: group, reset: group === '0' || value === '' };
  }

  function labelOf(box) {
    var el = box.previousElementSibling;
    while (el && el.tagName !== 'B' && el.tagName !== 'STRONG' && el.tagName !== 'H2' &&
           el.tagName !== 'H3' && el.tagName !== 'H4') {
      el = el.previousElementSibling;
    }
    return el ? (el.textContent || '').trim().slice(0, 24) : '(本页)';
  }

  function Counter(box) {
    var el = box.querySelector('.filter-count');
    if (!el) {
      el = document.createElement('div');
      el.className = 'filter-count';
      box.appendChild(el);
    }
    return {
      show: function (matched, total, effective, hasProblem) {
        if (hasProblem) {
          el.innerHTML = '共 <b>' + total + '</b> 条 · <span class="filter-problem">' +
                         '部分筛选按钮与表格数据列对不上，点它们会筛不出内容</span>';
        } else if (effective) {
          el.innerHTML = '筛选结果：<b>' + matched + '</b> / ' + total + ' 条';
        } else {
          el.innerHTML = '共 <b>' + total + '</b> 条（点上面的按钮筛选）';
        }
      },
    };
  }

  function init(box) {
    if (box.getAttribute(MARK) === '1') return;      // 幂等：只初始化一次
    var table = tableOf(box);
    if (!table) return;
    var rows = rowsOf(table);
    if (!rows.length) return;
    box.setAttribute(MARK, '1');

    // ---- 建索引：一次解析，之后筛选不再碰 DOM 结构 ----
    var btnEls = box.querySelectorAll('.cardSelectOption');
    var buttons = [];
    var groups = [];                                  // [{id, buttons:[], resetButtons:[]}]
    var groupById = {};
    for (var i = 0; i < btnEls.length; i++) {
      var info = parseOption(btnEls[i]);
      info.el = btnEls[i];
      buttons.push(info);
      var g = groupById[info.group];
      if (!g) { g = groupById[info.group] = { id: info.group, buttons: [], resetButtons: [] }; groups.push(g); }
      (info.reset ? g.resetButtons : g.buttons).push(info);
    }

    var data = [];
    var columns = {};
    for (var r = 0; r < rows.length; r++) {
      var names = paramNames(rows[r]);
      var values = {};
      for (var n = 0; n < names.length; n++) {
        values[names[n]] = (rows[r].getAttribute(names[n]) || '').split(',')
          .map(function (s) { return s.trim(); }).filter(Boolean);
        columns[names[n]] = true;
      }
      data.push({ el: rows[r], values: values });
    }

    // 页面自身的筛选维度可能与数据列数不一致（源数据就缺列）——预先算出来提示。
    // 注意：只对「有可点选项的组」报缺列；纯重置组（如只有 data-group="0"）本就无数据列。
    var paramIndexes = {};
    Object.keys(columns).forEach(function (k) { paramIndexes[k.replace('data-param', '')] = true; });
    var missing = groups.filter(function (g) {
      return g.buttons.length > 0 && !paramIndexes[g.id];
    }).map(function (g) { return g.id; });
    var broken = missing.length > 0;

    var counter = Counter(box);
    if (broken && window.console && console.warn) {
      console.warn('[筛选] ' + labelOf(box) + '：data-group=' + missing.join(',') +
                   ' 没有对应的 data-paramN 数据列，这些按钮点下去会筛不出内容。');
    }

    function selected() {
      var on = {};
      for (var i = 0; i < buttons.length; i++) {
        var b = buttons[i];
        if (!b.reset && b.el.classList.contains('cardSelectOn')) {
          (on[b.group] = on[b.group] || []).push(b.value);
        }
      }
      return on;
    }

    function apply() {
      var on = selected();
      var ids = Object.keys(on);
      var matched = 0;
      for (var i = 0; i < data.length; i++) {
        var ok = true;
        for (var g = 0; g < ids.length && ok; g++) {
          var want = on[ids[g]];
          var have = data[i].values['data-param' + ids[g]] || [];
          var hit = false;
          for (var w = 0; w < want.length && !hit; w++) {
            if (have.indexOf(want[w]) >= 0) hit = true;
          }
          if (!hit) ok = false;
        }
        data[i].el.classList.toggle('hide', !ok);
        if (ok) matched++;
      }
      counter.show(matched, data.length, ids.length, broken);
      return matched;
    }

    function reset(groupId) {
      for (var i = 0; i < buttons.length; i++) {
        if (buttons[i].group === groupId) buttons[i].el.classList.remove('cardSelectOn');
      }
    }

    box.addEventListener('click', function (ev) {
      var node = ev.target;
      var btn = null;
      while (node && node !== box) {
        if (node.classList && node.classList.contains('cardSelectOption')) { btn = node; break; }
        node = node.parentNode;
      }
      if (!btn) return;
      var info = parseOption(btn);
      if (info.group === '0') {
        for (var i = 0; i < buttons.length; i++) buttons[i].el.classList.remove('cardSelectOn');
      } else if (info.reset) {
        reset(info.group);
      } else {
        btn.classList.toggle('cardSelectOn');
      }
      apply();
    });

    apply();
  }

  function boot() {
    var list = boxes();
    for (var i = 0; i < list.length; i++) init(list[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 供测试直接调用（浏览器里无副作用）
  tpl = { init: init, apply: function (box) { return box.querySelector('.filter-count'); } };
  if (typeof window !== 'undefined') window.__XBGD_FILTERS__ = tpl;
})();
