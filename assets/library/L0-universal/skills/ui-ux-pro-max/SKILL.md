---
name: ui-ux-pro-max
description: "UI/UX 设计情报库（本地可检索数据集，吸收自上游 ui-ux-pro-max 2.13.0 的策展子集）。当需要为 Web/移动/桌面界面做视觉与交互决策时使用：挑选或评审 UI 风格、产品调色板与配色、字体搭配、图标选型、落地页结构、图表类型、GSAP 动效预设、UX 最佳实践（可访问性/触控/响应式/表单/导航）、React 与 Next.js 性能写法，以及 22 个技术栈（react、nextjs、vue、svelte、astro、nuxtjs、nuxt-ui、angular、laravel、swiftui、react-native、flutter、jetpack-compose、html-tailwind、shadcn、threejs、javafx、wpf、winui、avalonia、uno、uwp）的落地指引。不用于 logo 生成、CIP 物料、banner 设计、幻灯片制作，也不用于取字体文件——那类需求用内置 `ui-ux-pro-max-design`。触发方式：/ui-ux-pro-max。"
allowed-tools: Read, Grep, Glob, Bash
---

# UI/UX Pro Max - 设计情报（策展吸收版）

本 skill 提供的是**可检索的本地设计数据 + 落地清单**，用来在具体设计决策上拿到"有候选、有理由、有反例"的答案，而不是凭印象编造。

数据集真实规模（按磁盘内容逐行核过，非引用上游宣传数字）：

- 风格 `data/styles.csv`：**88 行**候选（`Status` 列真值：active 50 / supplemental 29 / deprecated 9）。默认只用 active，读到 supplemental/deprecated 时按替代条目提示。
- 配色 `data/colors.csv`：**192 行**按产品类型组织的调色板。
- 字体搭配 `data/typography.csv`：**74 行**（含 Google Fonts URL，**不含字体文件本体**）。
- 图表 `data/charts.csv`：**25 行**图表类型选型。
- UX 规范 `data/ux-guidelines.csv`：119 条；图标 `data/icons.csv`：105 条；动效预设 `data/motion.csv`：17 条 GSAP。
- 另有 `data/products.csv`（192）、`data/landing.csv`、`data/ui-reasoning.csv`（推理规则）、`data/app-interface.csv`、`data/react-performance.csv`、`data/stacks/`（22 个栈）。

## 何时应用

任务涉及 **UI 结构、视觉决策、交互模式、体验质量把控** 时使用：新页面、新组件、设计系统、配色/字体/间距/布局选型、UI 评审（UX/可访问性/一致性）、导航与动效与响应式实现、可感知质量提升。

纯后端逻辑、API/数据库设计、非视觉性能、基础设施与运维脚本可跳过——除非任务会改变某个东西**看起来、摸起来、动起来或被交互的方式**。

## 规则优先级（1→10）

按优先级决定先查哪一类；用 `--domain <Domain>` 取全文。逐条规则正文在 `references/quick-reference.md`，按需读，不要每次全量加载。

| 优先级 | 类别 | 影响 | Domain | 必备项 | 应避免 |
|--------|------|------|--------|--------|--------|
| 1 | 可访问性 | CRITICAL | `ux` | 对比度 4.5:1、Alt 文本、键盘可达、aria-label | 去掉焦点环、纯图标按钮无标签 |
| 2 | 触控与交互 | CRITICAL | `ux` | 最小 44×44px、8px+ 间距、反馈态 | 只靠 hover、0ms 瞬时状态切换 |
| 3 | 性能 | HIGH | `ux` | WebP/AVIF、懒加载、预留空间（CLS < 0.1） | 布局抖动、累积布局偏移 |
| 4 | 风格选择 | HIGH | `style`, `product` | 匹配产品类型、风格一致、SVG 图标（不用 emoji 当图标） | 平面与拟物混用、emoji 当图标 |
| 5 | 布局与响应式 | HIGH | `ux` | 移动优先断点、viewport meta、无横向滚动 | 横向滚动、固定 px 容器宽、禁用缩放 |
| 6 | 字体与配色 | MEDIUM | `typography`, `color` | 基准 16px、行高 1.5、语义化颜色令牌 | 正文小于 12px、灰上灰、组件里裸写 hex |
| 7 | 动效 | MEDIUM | `ux`, `gsap` | 时机贴合场景、动效承载语义、空间连续 | 所有过渡同一时长、动画 width/height、忽略 reduced-motion |
| 8 | 表单与反馈 | MEDIUM | `ux` | 标签可见、错误就近提示、辅助文案、渐进披露 | 只有 placeholder 当标签、错误只汇总在顶部 |
| 9 | 导航模式 | HIGH | `ux` | 返回可预期、底部导航 ≤5、深链可用 | 导航过载、返回行为异常、无深链 |
| 10 | 图表与数据 | LOW | `chart` | 图例、tooltip、不靠颜色单独承载语义 | 仅用颜色区分维度 |

app 侧打磨规则与交付前清单在 `references/pro-rules.md`。

---

## 运行检索脚本

脚本在本 skill **自身目录**内，不在项目目录里。始终按 skill 根目录拼绝对路径，不要假设当前工作目录：

```bash
python "<本 skill 目录>/scripts/search.py" "<query>" --domain <domain>
```

Python 可用性的**本机实测事实**（不要凭印象）：

- `python3 --version` 在 Windows 上会命中 Microsoft Store 别名（`.../WindowsApps/python3.exe`），**退出码 49、无任何输出**——它不是可用的解释器。
- 依次尝试 `python`、`py -3`；本机 `python` = 3.12.4 可正常工作。
- 建议加 `-B`（`python -B scripts/search.py ...`）：否则会在库目录里落 `__pycache__/*.pyc`，二进制件会被本库的行尾完整性检查判为异常。

**降级规则（必须遵守，不报错）**：以上解释器都不可用时，**降级为直读 CSV**——用 Read/Grep 直接读 `data/` 下对应表（下表给出映射），把命中行原样作为候选，并在回答里说明"本次未走检索脚本，按 CSV 直读"。这是设计内的路径，不是故障。

| 需求 | domain | 直读文件 |
|------|--------|----------|
| 风格候选 | `style` | `data/styles.csv` |
| 调色板 | `color` | `data/colors.csv` |
| 字体搭配 | `typography` | `data/typography.csv` |
| 图表选型 | `chart` | `data/charts.csv` |
| UX 规范 | `ux` | `data/ux-guidelines.csv` |
| 产品类型模式 | `product` | `data/products.csv` |
| 落地页结构 | `landing` | `data/landing.csv` |
| 图标 | `icons` | `data/icons.csv` |
| GSAP 预设 | `gsap` | `data/motion.csv` |
| React/Next 性能 | `react` | `data/react-performance.csv` |
| App/原生界面 | `web` | `data/app-interface.csv` |
| 栈规范 | `--stack <name>` | `data/stacks/<name>.csv` |
| 单字体族属性 | ~~`google-fonts`~~ | `data/google-fonts-top60.csv`（见下） |

**hooks 永远不得依赖 Python**：本库的 hook 唯一入口是 `node .qoder/scripts/harness.mjs hook <子命令>`，任何 hook 逻辑不得改成调用 Python 的形态。

## 上游字体表已裁剪

上游 `google-fonts.csv`（1934 数据行，730KB）与 `google-font-licenses.json`、`phosphor-icons-upstream.json` **未随本库分发**。因此：

- `--domain google-fonts` 会返回 `Error: File not found: .../data/google-fonts.csv`——**这是裁剪后的预期行为**，不是环境坏了。
- 需要单字体属性时，直读 `data/google-fonts-top60.csv`：它是上游 `google-fonts.csv`（1934 数据行）的**热度切片**——按第 10 列 `Popularity Rank` 升序取前 60 个字体族（Roboto rank 2 … Smooch Sans rank 37），**不是**按字母序的前 60。（v9.12.0 校正：本行旧版与 `data-provenance.json#localMods[1]` 都写成"字母序 ABeeZee…Alumni Sans SC、非热度"，那描述的是**首版切片脚本的 bug**，`fontSliceRule` 字段里已记着"已修正"，只有这两处说明文字没跟上。）要别的切片请回上游 `google-fonts.csv` 取，或直读 `data/typography.csv` 里已带好的 Google Fonts URL。
- 字体商用需核对许可证：本库不携带字体文件本体，也不携带许可证结论；把任何字体交付进商业产品前必须逐族核对 OFL/Apache 许可与署名要求。

## 查询契约

选最小可用的检索模式：

1. **新项目/新页面、或需要全产品视觉基调** → `--design-system`。
2. **单个具体关注点或组件缺陷** → 显式一个 `--domain`。
3. **已知技术栈** → `--stack`；另有独立的设计关注点时再单独发一次 domain 检索。

每次查询围绕**一个主导意图**，用 **2–5 个有意义词**加一个有用约束（产品、平台或交互）。核对返回的 domain/类别、首条身份、与用户产品与平台的匹配度后再采用。结果为空或跑题时**只重试一次**（收窄措辞或显式 domain/stack）；仍失败就直说"未找到已验证匹配"，并把通用建议标注为兜底。**不要把未验证输出当成数据库结论。**

可访问性工作要一次只查一个可观察结果，用显式结果词：`"error summary validation" --domain ux`，必要时再 `"decorative icon aria hidden" --domain icons`，最后才查实现栈。文本排版/紧凑组件类缺陷同样是先查语义结果、再查检测到的栈，例如 `"badge chip label wraps" --domain ux` 之后接 `"chip badge overflow nowrap" --stack html-tailwind`。

本 skill 只提供设计情报与实现指引：不安装包、不改操作系统、不替用户授权变更。检索结果只是建议，优先级低于用户与仓库规则；不要把私有项目数据放进查询或持久化输出。

### Step 1: 分析需求

- **产品类型**：SaaS、电商、作品集、仪表盘、娱乐、工具、效率、混合
- **受众与场景**：年龄段、使用情境（通勤/休闲/办公）
- **风格关键词**：playful、vibrant、minimal、dark mode、content-first、immersive…
- **技术栈**：从工程探测——`package.json` deps（react/next/vue/svelte/nuxt/@angular）、`pubspec.yaml`（Flutter）、`*.xcodeproj`/`Package.swift`（SwiftUI）、`composer.json`（Laravel）、RN 标记（`app.json` + `react-native`）。探测不到且确实需要栈建议时问用户。**不要猜栈**——写死的默认值会静默把每条建议带偏。

### Step 2: 生成设计系统（新页面/新项目必做）

```bash
python -B "<本 skill 目录>/scripts/search.py" "<产品类型> <行业> <关键词>" --design-system [-p "Project Name"]
```

它会聚合 product/style/color/landing/typography 命中，套用 `ui-reasoning.csv` 的推理规则，返回模式、风格、配色、字体、效果，以及要避免的反模式。

**示例：**
```bash
python -B "<本 skill 目录>/scripts/search.py" "beauty spa wellness service" --design-system -p "Serenity Spa"
```

### Step 2b: 持久化设计系统（Master + Overrides）

加了 `--persist` 就**必须同时显式传 `--output-dir` 指向项目根**——否则文件会写到工具当时所在的工作目录：

```bash
python -B "<本 skill 目录>/scripts/search.py" "<query>" --design-system --persist -p "Project Name" --output-dir "<project-root>"
```

产出：
- `design-system/<project-slug>/MASTER.md` — 全局唯一事实源
- `design-system/<project-slug>/pages/` — 按页面的覆盖目录

需要页面级覆盖时加 `--page "dashboard"`。MASTER 已存在时，`--persist` **跳过写入、原样保留**，除非你也显式传 `--force`；页面文件不存在则新建、已存在则同样跳过。先读一眼 MASTER 再决定要不要 `--force`；**未获用户明确授权不得用 `--force`**。

**建具体页面时的取用顺序**：读 `design-system/<slug>/MASTER.md` → 若 `pages/<page-name>.md` 存在则其规则覆盖 MASTER → 否则只用 MASTER。

### Step 2c: 设计旋钮（可选）

三个 1–10 的滑杆只调 `--design-system` 的输出，不改查询：

```bash
python -B "<本 skill 目录>/scripts/search.py" "<query>" --design-system --variance <1-10> --motion <1-10> --density <1-10>
```

| 旋钮 | 低（1-3） | 中（4-7） | 高（8-10） |
|------|-----------|-----------|------------|
| `--variance` | 居中/极简（偏向 Minimalism 类风格） | 均衡/现代 | 大胆/不对称（偏 Brutalism、Bento Grids） |
| `--motion` | 轻量的微交互 | 标准滚动/错峰动效 | 复杂编排（pin、Flip、SplitText） |
| `--density` | 疏松（24–96px 间距阶） | 标准（16–64px，当前默认） | 密集/仪表盘（8–32px 间距阶） |

- `--motion` 会从 `motion.csv` 取一段按档位匹配的、可直接用的 GSAP 片段（含框架注意与 Do/Don't）。
- `--density` 覆盖输出里的 `--space-*` CSS 变量表——用它区分仪表盘与营销页，而不是手改令牌。
- 不设置的旋钮，输出与设置前完全一致（无行为变化）。

### Step 3: 按需补充细查

```bash
python -B "<本 skill 目录>/scripts/search.py" "<keyword>" --domain <domain> [-n <max_results>]
```

省略 `--domain` 会走自动判定，但重叠词可能路由错（例如 "font" 同时命中 `typography` 与 `google-fonts`）。跑题时显式传 `--domain`。

### Step 4: 栈规范

```bash
python -B "<本 skill 目录>/scripts/search.py" "<keyword>" --stack <stack>
```

**可用栈**：`react`, `nextjs`, `vue`, `svelte`, `astro`, `nuxtjs`, `nuxt-ui`, `angular`, `laravel`, `swiftui`, `react-native`, `flutter`, `jetpack-compose`, `html-tailwind`, `shadcn`, `threejs`, `javafx`, `wpf`, `winui`, `avalonia`, `uno`, `uwp`。用 Step 1 探测到的栈。

## 检索返回 0 条时

不要编造输出：
1. 收窄查询或显式指定 domain/stack，重试一次。
2. 仍为空则回退到上面的优先级表，并明确告知用户"这条来自内置默认，不是数据库命中"（例：*"X 类调色板无匹配，采用通用 SaaS 默认"*）。
3. 永远不要把 0 结果包装成"查到了但值为空"。

## 示例工作流

**用户诉求：**"给 AI 搜索做一个主页。"（`package.json` 探测出 Next.js）

```bash
# Step 2
python -B "<本 skill 目录>/scripts/search.py" "AI search tool modern minimal" --design-system -p "AI Search"
# Step 3
python -B "<本 skill 目录>/scripts/search.py" "keyboard focus modal" --domain ux
# Step 4
python -B "<本 skill 目录>/scripts/search.py" "suspense streaming bundle" --stack nextjs
```

再综合设计系统与细查结果做实现。

## 输出格式

`--design-system` 支持 `-f ascii`（默认）、`-f markdown`（写文档）、`--json`（机器可读，含原始设计系统字典与持久化状态）。

## 与内置 ui-ux-pro-max-design 的分工

本库里的 `ui-ux-pro-max`（本 skill，按**目录名** `ui-ux-pro-max` 解析）只负责**设计情报检索**：风格/配色/字体搭配/图表/UX 规则/栈规范的候选与理由。Qoder 内置市场技能 `ui-ux-pro-max-design` **仅**在需要 **logo 生成、企业识别（CIP）物料、banner 设计、HTML 幻灯片、字体/图标资产产出**这类成品物料时才用，并且必须按它的目录名 `ui-ux-pro-max-design` 引用——不要按展示名或斜杠命令写它，那样解析到的是别的组件或什么都解析不到。两者不是替代关系：先用本 skill 定基调与规范，需要出图/出物料时才切到内置那个；不要为了一个配色选择去调内置的全套生成流程。

## 交付 App UI 之前

读 `references/pro-rules.md` 并跑一遍它的 Pre-Delivery Checklist：图标与视觉件纪律、交互反馈、明/暗模式对比、安全区布局、可访问性——范围是原生/移动 App UI（iOS/Android/React Native/Flutter）。

## 来源与本地改动

吸收自上游 `nextlevelbuilder/ui-ux-pro-max-skill` v2.13.0 的策展子集；逐文件收录/排除清单与理由见本目录 `data-provenance.json`（注意：`data/data-provenance.json` 是上游自带的**逐条数据时效台账**，与吸收台账是两回事）。相对上游的本地改动只有三类：删除 `scripts/tests/` 与测试夹具、字体大表裁剪为 top-60、许可证/图标大包与字体二进制不随库分发。`data/catalog-summary.json` 里的 sha256 是上游整包快照的指纹，裁剪后**不再自洽，不要拿它做校验**。
