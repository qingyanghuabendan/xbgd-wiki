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
      // 表头行带着「本组全部取值」（防止自己被隐藏），但它不是数据行。
      // 若把它算进 data，跨组可达性判断会永远成立、级联置灰失效。
      var isHead = !!(rows[r].getAttribute && rows[r].getAttribute('data-xbgd-head'));
      data.push({ el: rows[r], values: values, head: isHead });
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

    // 所有筛选组一律「同组单选」（用户要求：同组不能出现多选）：
    // 点一项即取消本组其它项；再点同一项则取消选择。
    // 另做「跨组联动置灰」：选某项后，其它组里与当前选择无交集的选项变灰，
    // 例如选「分类=作物」后，「组别名」只剩作物类下的品种。
    var single = true;

    // 当前已选条件：{组: [值, ...]}（多选/单选都按数组处理，逻辑统一）
    function currentSelection() {
      var sel = {};
      for (var i = 0; i < buttons.length; i++) {
        var b = buttons[i];
        if (!b.reset && b.el.classList.contains('cardSelectOn')) {
          (sel[b.group] = sel[b.group] || []).push(b.value);
        }
      }
      return sel;
    }

    // 组 group 取 value 时，是否还存在同时满足「其它组已选条件」的行。
    // 组内多选取「或」，组间取「与」——与 apply() 的筛选语义保持一致。
    // 显式接收 selection，避免在读选中态时依赖遍历顺序。
    function reachable(group, value, selection) {
      var keys = Object.keys(selection || {});
      for (var i = 0; i < data.length; i++) {
        if (data[i].head) continue;                 // 表头行不参与可达性判断
        var vals = data[i].values['data-param' + group] || [];
        if (vals.indexOf(value) < 0) continue;
        var ok = true;
        for (var k = 0; k < keys.length && ok; k++) {
          var g = keys[k];
          if (g === group) continue;
          var want = selection[g] || [];
          var have = data[i].values['data-param' + g] || [];
          var hit = false;
          for (var x = 0; x < want.length && !hit; x++) {
            if (have.indexOf(want[x]) >= 0) hit = true;
          }
          if (!hit) ok = false;
        }
        if (ok) return true;
      }
      return false;
    }

    // 统一置灰规则（用户要求「做完全」）：
    //  1) 同组只要选了任意项，该组其余未选中项一律置灰
    //  2) 其它组里与当前选择无交集的项置灰（跨组联动）
    // 多选模式下同组仍可继续点（追加/取消），所以置灰项不设 disabled；
    // 只有「跨组不可达」才是点了也没意义的，多选下忽略其点击。
    function refreshGray() {
      var sel = currentSelection();
      for (var g = 0; g < groups.length; g++) {
        var grp = groups[g];
        if (!grp.buttons.length) continue;
        var mine = sel[grp.id] || [];
        for (var j = 0; j < grp.buttons.length; j++) {
          var b = grp.buttons[j];
          var sibling = mine.length > 0 && mine.indexOf(b.value) < 0;
          var unreachable = !reachable(b.group, b.value, sel);
          b.el.classList.toggle('cardSelectOff', sibling || unreachable);
          // 多选模式下「跨组不可达」的按钮点了会筛出 0 条，直接忽略点击
          b.el.classList.toggle('disabled', !single && unreachable);
        }
      }
    }

    // 选择变化后，把「与当前选择不可能同时成立」的已选项取消掉，
    // 否则会停留在自相矛盾的组合上（例如 分类=花 却留着 组别名=小麦）。
    // 参与过本次点击的组（justGroup）不参与清理，用户刚点的要算数。
    function pruneUnreachable(justGroup) {
      var changed = true, guard = 0;
      while (changed && guard++ < 20) {
        changed = false;
        var sel = currentSelection();
        for (var i = 0; i < buttons.length; i++) {
          var b = buttons[i];
          if (b.reset || b.group === justGroup) continue;
          if (!b.el.classList.contains('cardSelectOn')) continue;
          if (!reachable(b.group, b.value, sel)) {
            b.el.classList.remove('cardSelectOn');
            changed = true;
          }
        }
      }
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

    // ---- 搜索框：按「名称」列做即时关键字过滤，与按钮筛选取「与」 ----
    var searchInput = box.querySelector('input[data-filter-search]');
    var searchClear = box.querySelector('.filter-search-clear');
    var searchCol = -1;
    if (searchInput) {
      var ths = table.querySelectorAll('th');
      for (var t = 0; t < ths.length; t++) {
        var txt = (ths[t].textContent || '').trim();
        if (txt.indexOf('名称') >= 0 || txt.indexOf('菜名') >= 0) { searchCol = t; break; }
      }
      if (searchCol < 0) searchCol = 0;            // 兜底：第一列
    }

    function searchTerm() {
      return searchInput ? (searchInput.value || '').trim().toLowerCase() : '';
    }

    function rowText(i) {
      var tr = data[i].el;
      var tds = tr.querySelectorAll('td');
      var td = tds[searchCol] || tds[0];
      return ((td && td.textContent) || '').toLowerCase();
    }

    function apply() {
      var on = selected();
      var ids = Object.keys(on);
      var term = searchTerm();
      var matched = 0, total = 0;
      for (var i = 0; i < data.length; i++) {
        if (data[i].head) continue;                // 表头行不参与筛选统计
        total++;
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
        if (ok && term && rowText(i).indexOf(term) < 0) ok = false;
        var el = data[i].el;
        el.classList.toggle('hide', !ok);
        // 同时设 hidden 属性：即使行上有内联 display，也能被 [hidden] 规则强制隐藏
        if (ok) { el.removeAttribute('hidden'); } else { el.setAttribute('hidden', ''); }
        if (ok) matched++;
      }
      counter.show(matched, total, ids.length || (term ? 1 : 0), broken);
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
      // 置灰（cardSelectOff）的语义：
      //  · 同组已选别的项 / 跨组无交集 —— 都只是视觉提示，仍可点：
      //    同组点了就切过去；跨组点了会连带取消冲突项（见 pruneUnreachable）。
      var info = parseOption(btn);
      if (info.group === '0') {
        for (var i = 0; i < buttons.length; i++) buttons[i].el.classList.remove('cardSelectOn');
      } else if (info.reset) {
        reset(info.group);
      } else if (single) {
        // 同组单选：先清掉本组其它选中项，再切换自己
        var wasOn = btn.classList.contains('cardSelectOn');
        for (var k = 0; k < buttons.length; k++) {
          if (buttons[k].group === info.group) buttons[k].el.classList.remove('cardSelectOn');
        }
        if (!wasOn) btn.classList.add('cardSelectOn');
      } else {
        btn.classList.toggle('cardSelectOn');
      }
      if (single) pruneUnreachable(info.group);   // 清掉被本次选择「挤掉」的旧选项
      apply();
      refreshGray();
    });

    // 搜索框：输入即时过滤；「清空」按钮复位
    if (searchInput) {
      var onSearch = function () { apply(); refreshGray(); };
      searchInput.addEventListener('input', onSearch);
      searchInput.addEventListener('search', onSearch);      // 点原生 × 也会触发
      searchInput.addEventListener('keyup', onSearch);
    }
    if (searchClear) {
      searchClear.addEventListener('click', function () {
        if (searchInput) { searchInput.value = ''; searchInput.focus(); }
        apply();
        refreshGray();
      });
    }

    apply();
    refreshGray();
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
