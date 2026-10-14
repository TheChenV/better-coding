# 面板引擎重建指南（panel-engine-rebuild）

> 定位：SKILL 库级操作手册，仅供 AI 在 `/harness-upgrade` 的 U.4.5 引擎比对步骤或引擎故障修复时按需引用；**不落盘到项目**，用户无需感知。
> 适用对象：`assets/templates/docs/PROJECT-LIVE.template.html`（结构壳）+ `PROJECT-LIVE.bundle.js.br`（Mermaid+ELK 引擎的压缩分发件）这对双资产，构建工程在 `tools/panel-build/`。

## 1. 资产构成与契约

| 资产 | 体积 | 变更频率 | 内容 |
|------|------|---------|------|
| `PROJECT-LIVE.template.html` | ~45KB | 交互/样式演进时 | 完整 HTML 骨架 + 样式 + 交互逻辑 + 数据契约占位 |
| `PROJECT-LIVE.bundle.js.br` | 545,624B（明文 2,916,204B） | 仅升级 Mermaid/ELK 版本时 | brotli 压缩的 Mermaid 11（仅 flowchart 路径）+ @mermaid-js/layout-elk，暴露 `window.__mermaidElk.mermaid` |
| `tools/panel-build/`（不随库分发） | — | 引擎换版本时 | npm 工程：精确 pin + `overrides.mermaid` + vite lean 裁剪 + `build.mjs`/`verify.mjs`/`verify-product.mjs` |

**明文引擎为什么不进库**：分发集实测带明文 5.64MB，超 §4.5 的 5MB 预算；换 .br 后 3.29MB。`build-panel.mjs` 首次用到时把 .br 膨胀进用户级缓存 `~/.qoder-cn/cache/better-coding/`（可用环境变量 `PANEL_ENGINE_CACHE` 改落点）并按 SHA256 校验后复用——**离线可用、不联网、不依赖 npm**，同一用户下 N 个项目只膨胀一次。

**模板占位符契约（重建时必须保留）**：

- `/*__MERMAID_BUNDLE__*/`：位于独立 `<script>` 块内，阶段 A 拼接时整体替换为明文引擎内容。

  > 实测说明（2026-09-03 立、2026-09-09 复核）：bundle 内 `/*__MERMAID_BUNDLE__*/` 出现 **0 次**，因此**成品校验不做该占位符的全文 Contains 检测**（harness-verify Check 7 已移除）。原先兜底这条的 build-panel V2「产物计数 M == bundle 计数 N」已于 v9.0.0 删除——N 可为 0 时 M==N 恒真，是一条假断言（同期删掉的还有 V5 体积 ±5%，它比的是自己刚写出的文件）。今天真正的兜底是三件：产物侧 `__mermaidElk` 引擎存在性 + SYNC_DATA 结构（build-panel V1/V6，缺引擎则 V1 必红）、分发侧 `tools/checks/30` 的体积天花板 / 解压 SHA256 钉值对账 / 端到端活体拼接。
- `{{PROJECT_NAME}}`：出现在 `<title>` 与 `#pageTitle`，阶段 A 替换为项目名。
- `@@CLASSES@@`：位于 `DIAGRAMS` 三段源码内，运行时由 `classDefs(theme)` 注入 `classDef` 色板，**不是**拼接期占位符，重建后必须保留。
- `<!-- SYNC_DATA:BEGIN -->` / `<!-- SYNC_DATA:END -->`：之间的 `<script>` 数据块（`DIAGRAMS`/`LEGENDS`/`ACARDS`/`techStacks`）由 3 步同步整体再生成。两个标记注释本身不得删除或更名（harness-verify Check 7 依赖）。

**固定区与再生成区的边界**：`PALETTES`/`classDefs`/`currentPalette` 为固定区（色板演进随模板整体回刷）；交互逻辑（悬停链路/透镜/搜索/缩放/主题）全部在标记外，同步永不触碰。

## 2. 阶段 A 拼接步骤（生成项目内单文件）

**构建已脚本化（v9.0.0 起单实现）**：一律使用 `assets/templates/scripts/build-panel.mjs`（阶段 A 已随落盘清单复制到项目 `.qoder/scripts/`；三平台同一条 `node` 命令，旧 `.ps1`/`.sh` 孪生已删）执行拼接，**禁止 AI 现写拼接命令**（根因与教训见 §4 执行禁忌）。脚本已内置：`/*__MERMAID_BUNDLE__*/` 占位整体替换（字面量 `split`/`join`，规避 JS `replace`/`replaceAll` 的 `$&`/`$1`/`$<name>` 替换模式陷阱——实测坑，已有夹具覆盖）、`.br` 载体按需膨胀 + SHA256 校验、UTF-8 无 BOM 写入、**五条真自验 V1/V3/V4/V6/V7**（引擎注入 / 项目名占位符消失 / 项目名已写入 / SYNC_DATA 成对 / 无 BOM），失败响亮报错（exit 1 参数或哈希错误 / exit 2 自验失败），严禁静默跳过。V2（占位符对账，恒真）与 V5（体积 ±5%，自证）已于 v9.0.0 删除，体积判据改由分发侧闸门 `tools/checks/30` 承担。

1. 在项目根目录执行完整拼接（三平台同一条命令）：

```bash
# 完整拼接（阶段 A 初始化）——引擎给压缩件即可，脚本自行膨胀
node .qoder/scripts/build-panel.mjs \
  --template <SKILL 库根>/assets/templates/docs/PROJECT-LIVE.template.html \
  --bundle <SKILL 库根>/assets/templates/docs/PROJECT-LIVE.bundle.js.br \
  --out docs/PROJECT-LIVE.html \
  --project-name "{项目名}"
```

> `--bundle` 两种载体都收：`.js.br`（随库分发的那件）或明文 `.js`（手工指定时原样读）。冷启动实测整条拼接 144ms 墙钟（内部计时 51ms，含解压出 2,916,204B 明文与写出 2.96MB 产物）；命中缓存时报告逐字写「缓存复用，未重新解压」。

> **SKILL 库根** = 已安装位置 `.qoder/skills/better-coding/`（仓库根另有源码副本时以安装副本为准）；示例命令中的 `<SKILL 库根>` 按此展开，与 `upgrade-protocol.md`/`phase-b-protocol.md` 既有抽象前缀惯例对齐。
>
> **`--project-name` 项目名取值优先级**：① 对话已确认的项目名/项目代号 → ② 零信息时用工作区目录名（临时值，登记进 AGENTS.md 待补充清单）→ ③ 环节 1 确认 {项目代号} 后按下方「面板标题（项目名）变更程序」更新。**v9.6.0 起 ② 的窗口收窄**：{项目代号} 在 1·1 是 Q2 必问项，工作区目录名只能存在于 Q2 之前（1·1 之后仍在用临时值 = 该问没问，属执行缺陷而非兜底）。

2. 确认退出码 0 且五条拼接自验（V1/V3/V4/V6/V7）全部通过（脚本输出报告）；失败按报告修复后重跑。更新模式另跑 **V8 数据块 lint**（v9.3.0：对 AI 手写 DIAGRAMS 查反引号与单引号配对、subgraph 与 end 等数、classDef 禁 rgba() 逗号、节点 id 唯一、类名须在色板内、data-status 限四值、nsub 单行不超 40 CJK；首发警告级，零误报一轮后升 FAIL）。
3. 项目内只保留拼接后的单文件，不保留 bundle 副本。

> 成品口径：不得残留 `{{PROJECT_NAME}}`；必须包含 `__mermaidElk`、`SYNC_DATA:BEGIN`、`SYNC_DATA:END`、`flowchart`；**不做 `/*__MERMAID_BUNDLE__*/` 全文残留检测**（实测 bundle 内该字符串出现 0 次，全文件 Contains 无判别力；兜底在 build-panel V1 引擎存在性与分发侧闸门 `tools/checks/30` 的活体拼接——真跑一次并判产物含引擎标记）。

## 3. SYNC_DATA 数据块更新（/live-refresh 同步时）

**严禁对 3MB 级成品 `docs/PROJECT-LIVE.html`（实测 2,963,399 字节 / 1,631 行 / 最长行 299,852 字符）直接使用 Edit / 编辑工具 / 整体重写**（成本极高甚至失败）。同步时只再生成标记之间的数据块内容，注入交给脚本：

1. AI 生成临时数据块文件：内容 = `<!-- SYNC_DATA:BEGIN -->` 与 `<!-- SYNC_DATA:END -->` 两标记之间的完整内层（含 `<script>...</script>`），**不含**两标记行本身（脚本保留原标记，并防御性剥离误带入的标记行）。
2. 调用脚本更新模式注入：

```bash
# SYNC_DATA 更新模式（/live-refresh 同步时：AI 只生成小数据块文件，脚本注入 10MB 级成品）
node .qoder/scripts/build-panel.mjs \
  --out docs/PROJECT-LIVE.html \
  --sync-data-file <临时数据块文件路径>
```

3. 确认退出码 0（更新模式跳过 V3/V4，跑 V1/V6/V7 三条：引擎仍在、数据块标记成对、无 BOM）；临时数据块文件用完即删。

## 4. ⛔ 执行禁忌（实测踩坑，违反必失败）

### 禁忌 1：严禁 PowerShell `-Command` 内联拼接

**历史事故**：`PROJECT-LIVE.bundle.js` 曾是 **8.46MB** 明文。用 `powershell -Command "$tpl = Get-Content ...; $bundle = Get-Content ...; ..."` 内联拼接时，`$bundle` 变量在 **-Command 参数解析阶段**就被展开为 8MB 文本内联到命令行，超出 PowerShell 解析限制，报 `MissingExpressionAfterToken`（缺少表达式）。

**当前量级（2026-09-09 实测）**：明文引擎 2,916,204B（已不随库分发）、brotli 压缩件 545,624B（分发的那件）、项目内成品 `docs/PROJECT-LIVE.html` 2,963,399B。

✅ **正确做法**：一律使用脚本执行（`.qoder/scripts/build-panel.mjs`），命令行只传路径参数；引擎载体给 `PROJECT-LIVE.bundle.js.br` 即可，解压与缓存由脚本负责。v9.0.0 起面板构建已是 Node 单实现，`process.argv` 结构上不可能把文件内容带进命令行 —— 本条禁忌的历史根因（PowerShell 参数解析期展开）随之消除，但"超大内容不进命令行"的原则对任何载体都成立。

### 禁忌 2：严禁用 ripgrep 类 Grep 工具验证 bundle / 拼接产物内容

Qoder 的 Grep 工具（ripgrep 引擎）在含超长 minified 行的文件上会**整批跳过大量行**（历史取证，测于 8.46MB 旧 bundle：`mermaid` 实际出现 134 次仅返回 1 次、`function` 实际 28,385 次仅返回 5 次、`elk` 实际 426 次返回 0 次），**假阴性率极高**，会导致“明明拼接成功却搜不到关键字”的误判。

⚠️ **口径提醒（当前产物复核）**：Grep 的 count 模式报的是**命中行数**，不是命中次数。同一份成品实测 `elk` 命中 21 行、全文出现 411 次（成品共 1,631 行、最长行 299,852 字符）——**两个数字不是同一口径**，不能拿其中一个去证伪另一个。要"出现多少次"只能自己按字符串切分计数。

✅ **正确做法**：验证一律使用

- Node：`fs.readFileSync(path, 'utf8').includes(needle)`，计数用 `content.split(needle).length - 1`（**不要**用 `replace` 系列，会踩 `$&` 陷阱）
- PowerShell：`[System.IO.File]::ReadAllText($path).Contains("__mermaidElk")` 或 `[regex]::Matches($c, [regex]::Escape($needle)).Count`（**注意 Escape**，占位符含正则元字符）

  > 本禁忌与 `references/phase-a-checklist.md` A.2「AI 现写脚本纪律」互为引用：那边的第 3/5 条把这里的一般情形（超长行文件）与中文输出判定一起纳为硬约束；现写校验脚本若含中文字面量，还须按 A.2 编码口径带 BOM，否则 PS 5.1 按 GBK 解码会得出假阴性。
- 或直接使用 build-panel 脚本的内置自验（V1/V3/V4/V6/V7），不要自己另写验证命令

ℹ️ 实测参考（不必自行复测）：GNU grep `-qF` 与 PowerShell `.Contains()` 在大产物（最长行 299,852 字符）上均能正确命中；`__mermaidElk` 在成品中首次出现于第 662 行，最长行是第 1166 行。

## 5. 回退口径

引擎重建失败且无法短期修复时：保留项目内现有 `docs/PROJECT-LIVE.html` 不动（其数据块仍按现行契约由同步维护），仅暂停模板侧升级，不得把半成品引擎拼接进项目。

## 6. 引擎升级流程（Mermaid / ELK 换版本）

1. 在 `tools/panel-build/`（v9.0.0 起的构建工程，`npm ci` 后 `node build.mjs [full|lean|both]`）用目标版本 Mermaid + @mermaid-js/layout-elk 构建自包含 bundle（vite 打包，lean 变体只留 flowchart 渲染路径），入口必须暴露 `window.__mermaidElk = { mermaid }`。锁版本靠两件事：`package.json` 精确 pin（禁 `^`/`~`）与 `overrides.mermaid = "$mermaid"`（后者是护栏——实跑证明双副本的真正来源是 `@mermaid-js/layout-elk` 已发布 dist 内联的 mermaid 副本，npm 管不到打进产物的源码）。
2. 用浏览器实测三项兼容基线（任一项失败则修复渲染适配层后再入库）：
   - `mermaid.initialize` + `flowchart` 渲染三图零报错；
   - 边 DOM 结构：若边为裸 `path`（v11 行为），确认模板内 `normalizeEdges()` 仍能包裹为 `g.edgePath`；
   - 节点 id 可经 `nodeIdOf()` 正则反解出原始节点 id（悬停链路依赖）。
3. 入库走（以下 `tools/` 均为仓库侧构建期工装，不随本库交付，只在 SKILL 库仓库内可跑）`node tools/panel-build/build.mjs lean --twice --install`：`--twice` 证明确定性（连跑两次 SHA256 相同），`--install` 先校验"压缩必须显著变小 + 回环解压逐字节相等"再写 `assets/templates/docs/PROJECT-LIVE.bundle.js.br` 并删除库内明文。命令行会回显明文 SHA256，**必须同步两处钉值**：`assets/templates/scripts/build-panel.mjs` 的 `ENGINE_SHA256` 与 `tools/checks/30-panel-bundle-size.mjs` 的 `PINNED_SHA`/`INFLATED_BYTES`；随后删除用户级缓存 `~/.qoder-cn/cache/better-coding/` 下的旧 `mermaid-elk-*.js`（否则老缓存按哈希不命中会被判成"引擎哈希不符"而不是复用）。更新本文件第 1 节体积描述。
4. 对任一存量项目重新执行第 2 节拼接步骤生成新面板，回归验证：悬停链路、流动动画、透镜、搜索、亮暗主题、状态徽标。

## 7. 已知兼容性修复（模板内已固化，重建时不得回退）

| 问题现象 | 根因 | 修复 | 禁止回退 |
|---------|------|------|----------|
| Mermaid classDef 词法器不支持 `rgba()` 逗号语法 | 词法器把逗号解析为参数分隔符 | 色板一律使用 8 位 hex 透明色（如 `#A78BFA33`） | 不得在 classDef 中使用 rgba() |
| Mermaid v11 边为裸 `path.flowchart-link` | v11 移除了 `g.edgePath` 包裹层 | `normalizeEdges()` 渲染后包裹为 `g.edgePath`，保证边定位/信号流克隆可用 | 不得删除 normalizeEdges 逻辑 |
| 悬停时选中节点被整体压暗规则误伤 | .trace-active 统一降低 opacity | `.trace-active .node.trace-sel` 显式 `opacity: 1` | 不得移除 trace-sel 豁免规则 |
| 状态徽标四色被 Mermaid 主题规则压成节点文字色 | Mermaid 注入的 `#mmd-* .<类> span` 特异性 (1,1,1) 压过普通选择器 | 宿主容器 ID 提权 `#diagram-context/container/component .nodeLabel .nst[data-status]`（(1,3,0)）+ `!important` | 不得降低选择器特异性或移除 ID 提权 |
| Mermaid v11 htmlLabels 节点长文本被裁剪无省略号 | wrappingWidth 默认 200 + foreignObject overflow:hidden + white-space:nowrap + 逃生阀严格相等永不触发 | flowchart.wrappingWidth=2000 + g.node foreignObject>div break-spaces CSS 覆盖 + nsub≤20字数据侧预算 | 不得删除 wrappingWidth 配置或 CSS 覆盖规则 |

## 8. 面板标题（项目名）变更程序（低频事件）

> 适用场景：项目名/项目代号在环节 1 确认（或工作区目录名临时值需替换为正式名）后，需更新 `docs/PROJECT-LIVE.html` 顶部标题。标题（`{{PROJECT_NAME}}` 实例化后的值）是**构建期常量**，位于 SYNC_DATA 标记外的固定区，不随 3 步同步再生成。项目生命周期内通常仅发生 1-2 次，故程序放本按需文档而非 always-on 规则。

**⚠️ 陷阱警告**：**不可**直接对现有产物跑完整拼接模式来改标题——完整拼接会把 SYNC_DATA 重置为模板自带的三张“示意”前缀最小示意图；若 `docs/arch/` 已有 ARCH，`Check 7a panel_topo_lag` 立即 FAIL。必须按下方 3 步保留现有数据块。

**3 步程序**：

1. **提取现有数据块**：从当前 `docs/PROJECT-LIVE.html` 提取 `<!-- SYNC_DATA:BEGIN -->` 与 `<!-- SYNC_DATA:END -->` 之间的完整内层（含 `<script>...</script>`，不含两标记行），存为临时数据块文件（实测仅约 2.4KB，提取/回注极廉价）。
2. **用新项目名跑完整拼接**：按 §2 完整拼接模式，`--project-name` 传新值，生成标题已更新的新产物（此时 SYNC_DATA 为模板占位图）。
3. **回注数据块**：按 §3 更新模式（`--out` + `--sync-data-file`）把步骤 1 提取的数据块注入步骤 2 的产物，恢复真实拓扑；临时文件用完即删。

> `/live-refresh` “顶部项目名/标题不属数据块，不修改”为**正确的默认行为**（同步永不触碰标题固定区）；标题变更是本节所述的独立低频程序，与常规同步解耦。

