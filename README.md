# 星布谷地 · 图鉴 WIKI

《星布谷地》的玩家自制资料页，**GitHub Pages 静态托管**，没有后端、不收集任何数据。

站点内容：机制攻略（种植 / 杂交 / 烹饪）、图鉴总览（生物 297 / 植物 202 / 菜肴 121 /
露卡果实 23 / 星湾 / 杂物）、图鉴原始数据页、友邻档案（喜好 / 日记 / 纪念日）、排版模板说明。

**首页为三栏布局**：

| 栏位 | 内容 |
| --- | --- |
| 左：公告 | 内容区**留空占位**（`ANNOUNCEMENTS` 为空），有内容时自动渲染成带类型标签的条目列表 |
| 中：主内容 | 无横幅（`BANNER` 为空）；**常用内容**（种植 / 杂交 / 烹饪 / 星湾）、**图鉴一览**、**数据与模板** |
| 右：信息栏 | **本期 UP**（`UP_ITEMS` 为空，留空占位）、本站速览、友邻一览、关于本站 |

**图鉴一览**收录全部图鉴类目：生物图鉴、植物图鉴、菜肴图鉴、露卡果实、杂物（以上已有页面），
以及服饰、家具、小栖地、米友家装、创想卡集——后五类暂无数据，渲染为「待补充」占位卡片，
将来建好对应页面（`slugs` 里出现同名页面）就会自动变成链接。

首页那几个留空的区块都由 `site/build_site.py` 顶部的常量控制，填上内容即可生效：
`ANNOUNCEMENTS`（公告条目）、`BANNER`（横幅图片路径）、`UP_ITEMS`（本期 UP 条目）。

- **生物 / 烹饪 / 杂交** 三个页面支持点击筛选（多选，「组内取或、组间取与」，点「全部」重置）
- 顶栏搜索框：先匹配页面名，再就地检索当前页的表格条目（快捷键 `/`）
- 218 张物种图标 / 8 张友邻头像已随站托管；源站缺失的图标显示为「暂未收录」占位
- 响应式：窄屏侧栏收起为抽屉，宽表格可横向滑动

## 站点结构

```
docs/                      ← GitHub Pages 发布的目录（由脚本生成，请勿手改）
  index.html               首页（三栏布局）
  首页.html                与 index.html 内容相同，供离线单文件预览按文件名聚合
  p02.html … p37.html      内容页（ASCII 文件名，避免中文 URL 百分号编码问题）
  style.css                样式
  search.js                顶栏搜索
  filters.js               可筛选表格（等价 BWIKI 的 CardSelect 组件）
  search-index.json        页面清单（搜索用）
  assets/creature/…        218 张物种图标
  assets/avatar/…          好友头像
  assets/impression/…      印记 / 道具图标
  .nojekyll                跳过 Jekyll 处理
site/                      ← 站点生成器（源文件）
  build_site.py            复用 target/ 内容渲染整站
  make_preview.py          产出离线单文件预览
  push_github.js           用 Git Data API 推送到 GitHub（无需本机 git）
  check_live_filters.js    线上验收：比对线上产物与本地是否一致
  style.css search.js filters.js   站点资源（会复制进 docs/）
  tests/                   筛选功能的测试（linkedom 真实 DOM）
target/                    ← 内容源：pages/*.wiki（37 页）+ templates/*.wiki（14 个模板）
source/                    ← 原始抓取数据（源站 wikitext、模板规范）
```

## 重新生成站点

```powershell
$py = 'C:\Users\27445\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$node = 'C:\Users\27445\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'

& $py site/build_site.py      # 渲染 37 页 -> docs/（会先清空 docs/）
& $py site/make_preview.py    # 额外产出一个离线单文件预览（双击即可看整站）
& $node site/tests/run_all.js # 筛选功能的全部测试
```

`build_site.py` **真正执行** `target/templates/*.wiki`（复用 `preview_local.py` 的
`MiniWiki` 渲染器：`{{{参数|默认}}}`、`#if/#ifeq/#switch/#replace/#ifexist`、
`{{:页面}}` 转写、表格、行内语法），并在此之上做四件事：

1. 页面名映射成 ASCII slug，所有 `[[链接]]` 改写成真实文件名（不再是同名占位）；
2. 接管 `{{图片}}` / `{{图标}}`：源站模板靠 `#ifexist:File:头像_<id>.png` 判存在，
   而 id 是「名字」（如 `云果`）不是文件名的 UUID，静态站上必然判负、图片会静默消失，
   因此改为直接查本地资产表，缺图时给出可辨认的占位；
3. `[[File:生物_银鱼.png|48px]]` 解析成 `assets/` 下的真实 `<img>`；
4. 表格包 `.table-scroll`、筛选容器补 `.filter-box`，并生成页面外壳（侧栏 / 顶栏 / 面包屑）。

只复制**实际被引用**的图片到 `docs/assets/`，所以仓库里不会堆用不到的文件。

## 筛选功能的测试

筛选功能出过两次「测试全绿但线上是坏的」事故，根因都是**手写 DOM 桩的保真度不足**
（桩里自己塞进去的类集合，掩盖了「容器类根本没写成 class」这类错误）。
现在测试改用 `linkedom`（真实的 DOM 实现）：加载 `docs/` 里生成的页面，
执行线上同一个 `site/filters.js`，并通过派发真实 `click` 事件驱动。

| 测试 | 作用 |
| --- | --- |
| `tests/test_linkedom_fidelity.js` | **先证明测试环境可信**：逐项断言筛选代码依赖的 DOM 语义（`classList` 与 `className` 是否同一份集合、事件冒泡、`closest`、`table.tBodies` 是否存在等） |
| `tests/test_html_invariants.js` | 结构约束：`filter-box` 必须是合法 class（不能是裸属性）、HTML 不得预置计数器、每个 `data-group` 都要有对应的 `data-paramN` 列 |
| `tests/test_filters.js` | 交互：点击后的行数与「独立于被测代码、按 `data-param` 自行计算」的结果逐一比对；覆盖组内取或、组间取与、重置键、初始化幂等 |

`tests/run_all.js` 按上述顺序跑完，任一步失败即非零退出。
（测试依赖只装在本地：`cd site/tests && pnpm install --shamefully-hoist`。）

## 本地预览

```powershell
& $py -m http.server 19388 --bind 127.0.0.1 --directory docs
# 打开 http://127.0.0.1:19388/
```

必须走 HTTP 而不是直接双击 `index.html`：搜索框用 `fetch('search-index.json')`
读取页面清单，`file://` 下会被浏览器的同源策略拦住（表内检索仍可用，只是搜不到别的页面）。

## 部署到 GitHub Pages

`docs/` 已包含 `.nojekyll`，直接把它作为 Pages 的发布源即可：

1. 仓库 **Settings → Pages**；
2. **Source** 选 `Deploy from a branch`，**Branch** 选 `main`、目录选 `/docs`，保存；
3. 等 1–2 分钟，访问 `https://<用户名>.github.io/<仓库名>/`。

也可以用 GitHub Actions 发布（若改用 Actions，请把 Source 切成 `GitHub Actions`）。

## 数据来源与说明

- 内容由 `target/`（源站 xbgdwiki.com 的页面与模板反向工程结果）渲染而来，
  另参考 `星布谷地图鉴.xlsx` 的图鉴数据；
- 本站是**玩家自制**资料站，与游戏官方、B 站 WIKI 均无隶属关系；
  游戏名称、图像与数据版权归原权方所有，本站仅作非营利用途；
- 数据整理自游戏实测与玩家社区，版本更新后可能滞后，欢迎提 Issue 纠错补漏。

## 许可证

站点**代码**（`site/` 下的生成器与脚本）以 MIT 许可发布；
图鉴**数据与图片素材**版权归原权方，不在 MIT 许可范围内。
