# 升级回源协议

> 本文件由 SKILL.md 和 phase-b-protocol.md 引用，定义 SKILL 版本升级时已装配项目的回源策略。
> 落地构建方案 R-01~R-07 的继承覆盖语义。

## 核心原则

1. **不丢失用户定制**：用户已修改的内容必须保留，升级只补缺失、不覆盖已有。
2. **双份拷贝可治理**：已落盘资产与 SKILL assets 的版本差异必须可检测、可回刷。
3. **升级可验证**：升级完成后必须通过 `harness-verify` 校验，`status: PASS` 才算完成。

## 四类资产升级策略

| 资产类型 | 升级策略 | 覆盖规则 |
|----------|----------|----------|
| **L0 组件**（rules/skills/agents/commands/hooks） | 由 SKILL 升级触发，**整体回刷** | 两态：未改 = 直接覆盖；改过 = 保留用户版 + 提示差异 |
| **脚本层**（`.qoder/scripts/*.mjs`，v9.0.0 起进组件计数 `scripts=5`） | 由 SKILL 升级触发，**强制回刷**（`phase-a-init.mjs --repush-scripts-only`） | 与库不同即按「库升级前的旧构建」处理：直接覆盖，被换下的原内容留 `.qoder/logs/backup/scripts/<时间戳>/` 持久备份，摘要点名到文件；**不设两态豁免**——脚本不是用户定制面，按两态保护会让升级序列第一步变成空操作（`settings.json` 例外，它承载用户自加 hook，仍走两态 + 人工确认） |
| **AGENTS.md**（根目录单副本，单一事实源；v8.1.3 起 .qoder/ 下不再落盘 AGENTS.md） | AI 维护，SKILL 升级时**双向合并**（合并对象为根目录 AGENTS.md 单副本） | 模板新增字段→补入；用户已填字段→保留 |
| **PROJECT-LIVE.md**（v7.0.0 起，提示词手册母本，含原教程/指令集/CONTEXT/拓扑职能） | AI 维护，**双向合并 + 分区级处置** | `ai`（context）= 保留用户版；`managed-dynamic`（workflow/snapshot/footer 三分区）= 无需特殊处置（日常同步即再生成） |
| **PROJECT-LIVE.html 面板双资产**（v7.4.0 起：模板 `PROJECT-LIVE.template.html` + 引擎 `PROJECT-LIVE.bundle.js`，替代 v7.3.0 手写 SVG + DASH_DATA 单模板） | SKILL 托管：模板/引擎**整体回刷**；项目内 `docs/PROJECT-LIVE.html` 为拼接产物，**不整体覆盖**（仅标记间数据块由下次同步再生成） | 架构拓扑（节点含状态徽标）与技术栈可视化衍生视图；**落盘位置为仓库内 `docs/PROJECT-LIVE.html`**（浏览器双击直接打开）。升级时：① 若模板/引擎有变更，执行 U.4.5 引擎比对；② 旧契约残留（v7.3.0 的 DASH_DATA 面板、更早 canvases 目录的 canvas 文件）提示用户清理并按 `references/panel-engine-rebuild.md` §2 重新拼接生成（尽量保留旧 SYNC_DATA 数据） |
| **`.qoder/briefing-skeletons.md`**（v6.0.0 新增；v8.0.0 起为 9 环节 × 多步骤子块骨架） | SKILL 托管，**整体回刷**（两态：未改直接覆盖；改过保留用户版 + 提示差异） | 提示词手册渲染引擎基准，日常同步不重写 |
| **spec-templates**（docs/harness-templates/ 10 个模板，阶段 A 原样复制落盘） | 两态回刷：项目内未改动则直接覆盖为新版；已改动则保留用户版并提示差异 | 环节产出前必须读取模板结构、按其章节组织内容（如 MRD 8 章节）；两态判定差异记入 history |
| **schemas 参考文档**（v8.0.0 新增：`assets/library/schemas/sdd-artifacts.yaml`，同类还有 `references/naming-convention.md`、`references/stage-agent-skill-map.md`） | **reference-only、库级不落盘**：不复制到项目 `.qoder/` 或 `docs/`，因此**无两态判定、无用户版可保留、也不参与备份**；升级时随 SKILL 库整体生效（库资产即最新版），项目侧只需刷新由它们渲染出的产物 | 不做覆盖也不做合并；**随 `/harness-next` 判定消费**（读 `schemas/sdd-artifacts.yaml` 判定 artifact 就绪度与 4 级门禁前置，读 `stage-agent-skill-map.md` 取「对话建议」字段建议），并随 3 步同步（或 `/live-refresh`）驱动 `docs/PROJECT-LIVE.md` workflow 区（9 环节标题 + 步骤区块）与 `docs/PROJECT-LIVE.html` 重渲；`harness-profile.json.schemas.activeArtifactGraph` 记录当前生效的依赖图来源，供跳版本核对（9.0.0 起 modes/pipelines 渲染视图已删除，artifact 依赖只剩这一个源） |
| **settings.json** | **增量合并** | 仅按 migration-map add 条目补事件绑定，保留用户已有条目 |
| **L1/L2 定制组件** | 仅当 SKILL 提供新版本时**提示升级** | 默认不自动改，用户确认后应用 |
| **harness-profile.json** | 升级时**字段迁移** | 旧字段→新结构；缺失新字段补默认；保留 history 与 sync 历史 |

## 升级操作流程

### U.1 版本比对

1. 读取 SKILL 的 `manifest.json.version`（如 `3.3.0`）
2. 读取项目 `.qoder/harness-profile.json.skillVersion`（如 `3.2.0`）
3. 不一致 → 进入 U.2

### U.2 变更清单生成

0. **优先读取迁移映射**（v4.0.0+）：若 SKILL 根存在 `migration-map.json` 且其 version 高于项目 profile.skillVersion，按其 `migrations` 逐项生成动作（remove-replaced-by-builtin / rename / merge / rule-merge / rule-trigger-downgrade / hook-rewrite / add / remove / rewrite / change / profile-field，以 migration-map 实际使用的类型为准），并以 `finalCounts` 为校验终值
1. 对比两个版本间的资产变更（唯一事实源：`migration-map.json` 的 `migrations` 数组；也可 diff assets 目录）
2. 列出本次版本间：
   - 新增的组件（rules/skills/agents/commands/hooks）
   - 修改的组件（内容变更）
   - 删除的组件（已废弃，含被 Qoder 内置替代者）
   - 自维护规则变更（/live-refresh）
   - 校验脚本变更（harness-verify.mjs）
3. 生成升级建议清单（**不自动执行**）

### U.3 用户确认

```
📦 SKILL 升级：3.2.0 → 3.3.0
建议升级范围：
| # | 类型 | 组件 | 动作 |
|---|------|------|------|
| 1 | L0 rule | code-comment (已修改) | 合并（保留用户定制 + 补充新增条目） |
| 2 | L0 hook | audit-log (未修改) | 覆盖 |
| 3 | script | harness-verify.mjs (新增) | 新增 |
回复：全部确认 / 调整【编号】 / 跳过
```

### U.3b 规则扩展名别名重放与脚本重推（改名过渡必读，v8.5.0 前置）

`migration-map.json` 的历史条目是按**当时真实文件名**书写的，其中大量写作 `rules/xxx.mdc`；v8.5.0 起运行时只加载小写 `.md`，库内规则已全部改名。因此：

1. **历史条目不改写**（改了就是伪造升级史）。重放时按 `manifest.rulesExtensions` 做**别名解析**：条目写 `rules/x.mdc` → 依次尝试项目内 `x.mdc`、`x.md`，命中即用。
2. **两种扩展名都不存在时记 `SKIPPED (renamed-away)`，不 FAIL、不阻断升级**。规则数差量由 `harness-verify` 的 `component_counts`（按 basename 去重）兜住，不靠逐条命中。
3. **先重推脚本，再信任扩展名变更**：`component_counts` 的 scripts 校验只比文件**数量**（`>= scripts`），所以它**检测不到存量项目的 `.qoder/scripts/` 内容陈旧**。改名前必须先把库内 `assets/templates/scripts/` 的 `.mjs` 强制回刷到项目 `.qoder/scripts/`（v9.0.0 起脚本层是 SKILL 托管框架代码，与库不同即按「库升级前的旧构建」覆盖并留 `.qoder/logs/backup/scripts/` 持久备份，见上表；两份 settings 模板仍按 U.4 两态判定），否则项目仍在跑旧的单扩展名过滤逻辑 → `*.mdc` 计数归零会被误报成"缺 16 条规则"。
4. 判定顺序：回刷脚本 → 重跑一次阶段 A（六类组件复制与对账走别名层，用户定制文件按 SHA256 保护；脚本层由上一步的回刷负责） → 再执行 `harness-verify`，此时 `rules` 计数与 `always_on_budget` 两侧必须给出一致数字。

### U.4 逐类回刷

按上表逐类执行：

**L0 组件回刷（两态判定，不做内容级合并）**：
1. 对比 `.qoder/rules/xxx.md` 与 `SKILL assets/library/L0-universal/rules/xxx.md`
2. 内容完全一致（未改）→ 直接覆盖
3. 内容不同（改过）→ 保留用户版本不覆盖，向用户提示两者差异摘要，由用户自行决定取舍；差异记入 `harness-profile.json.history`

**spec-templates 回刷（docs/harness-templates/ 落盘模板，两态判定）**：
1. 对比项目 `docs/harness-templates/xxx.md` 与 SKILL `assets/library/L0-universal/spec-templates/xxx.md`
2. 内容完全一致（未改）→ 直接覆盖为新版
3. 内容不同（已改动）→ 保留用户版并提示差异摘要，差异记入 `harness-profile.json.history`

**AGENTS.md / PROJECT-LIVE.md 合并**：
1. 对比 SKILL 模板与项目现有文件
2. 模板新增的字段/节 → 补入项目文件（标注"新增-请核对"）
3. 用户已填的字段 → 保留不动
4. 模板删除的字段 → 标记"已废弃"但不删除
5. **PROJECT-LIVE.md 按分区标记注释逐区处置**（v7.0.0，原"教程处置条款"废止）：`ai`（context）分区保留用户版；`managed-dynamic`（workflow/snapshot/footer 三分区）分区不处置（下次同步自动再生成）；PROJECT-LIVE.html 缺失则按 `references/panel-engine-rebuild.md` §2 从模板+引擎拼接补生成至仓库 `docs/`（v7.4.0），旧契约残留（v7.3.0 的 DASH_DATA 面板、canvases 目录的 PROJECT-LIVE.canvas.tsx 及伴生状态文件）提示用户清理，标记外内容被用户改过则保留用户版 + 提示差异；分区标记本身必须保持成对完整（harness-verify Check 7 兜底）
6. **`.qoder/briefing-skeletons.md` 整体回刷**：两态判定（未改 = 直接覆盖；改过 = 保留用户版 + 提示差异，差异记入 history）；v8.0.0 起骨架为 9 环节 × 多步骤子块，必须与 PROJECT-LIVE.md workflow 区结构同代，否则 harness-verify Check 7c 会按旧骨架误判

**schemas 参考文档（v8.0.0，reference-only 专用）**：
1. **不落盘、不覆盖、不合并**：`assets/library/schemas/sdd-artifacts.yaml`（artifact 依赖唯一权威源）与 `references/naming-convention.md`、`references/stage-agent-skill-map.md` 仅存于 SKILL 库内，升级后自动为最新版，项目内无副本可比对；
2. **消费方式**：随 `/harness-next` 判定 artifact 就绪度与 4 级门禁（L0 trigger / L1 step_gate / L2 phase_gate / L3 main_gate）前置时被读取，并随 3 步同步驱动提示词手册（环节标题 + 步骤区块 + 对话建议字段）与面板重渲；
3. **profile 记录**：`harness-profile.json.schemas.activeArtifactGraph` 缺失时补默认值 `assets/library/schemas/sdd-artifacts.yaml`；
4. **死码清理**：9.0.0 起库不再分发 modes/pipelines 参考 yaml；项目内若仍有旧版副本一律删除（无消费者、不再渲染），artifact 依赖一律读 schemas 权威源。

**U.4.5 面板引擎比对（v7.4.0，面板双资产专用）**：
1. 对比项目内 `docs/PROJECT-LIVE.html` 的固定区与新模板：若模板交互/样式无变更且旧面板含 SYNC_DATA 标记与引擎（无 DASH_DATA 回潮）→ 不重建，数据块由下次同步维护；
2. 模板或引擎有变更 → 提取旧面板 SYNC_DATA 标记间数据块，按 `references/panel-engine-rebuild.md` §2 用新模板+新引擎重新拼接，把旧数据块回填至新面板（拓扑若已有 ARCH 依据则按规则重推），占位符残留自检通过后才替换项目内文件；
3. 引擎重建失败按 `references/panel-engine-rebuild.md` §5 回退：保留现有面板不动，报告建议项记录。

**L1/L2 定制组件**：
1. 仅当 SKILL 提供新版本时提示
2. 用户确认后覆盖（定制组件通常不自动升级）

**profile 字段迁移**：
1. 新增字段 → 补默认值
2. 废弃字段 → 保留但标记 deprecated
3. 结构变更 → 迁移旧值到新结构
4. `history` 与 `sync` 历史 → 完整保留

### U.5 校验

1. 更新 `harness-profile.json.skillVersion` 为新版本
2. 在 `history` 追加：`{"date": "当前日期", "action": "upgrade", "detail": "3.2.0 → 3.3.0"}`
3. 运行 `harness-verify` 校验：
   - `status: PASS` → 升级完成
   - `status: FAIL` → 读取 FAIL 明细，修复后重试

## 回滚策略

- 升级前自动备份：将 `.qoder/` 关键文件复制到 `.qoder/.backup/` 目录
- 若升级后发现问题，可从备份恢复
- 备份保留最近 1 次升级前的状态

## 约束

- 升级操作必须由用户显式触发（如"升级 Harness 组件"），不自动执行
- 升级过程中任何步骤失败，停止并报告，不静默跳过
- 升级后必须通过 `harness-verify` 校验，否则视为升级未完成

## 周期审计建议（v4.0.0 新增）

1. **每季度（或每 10 次同步后）运行一次 `/better-harness`**

### 升级验收门禁（v9.0.0 起，U.5 之前必过）

SKILL 版本升级的放行条件包含一次 `/better-harness` 运行：**harness 好坏不由本库自评**——
官方诊断工具是外部标尺。升级后跑一次，其 findings 中属于"变更验证/可靠交付/经验沉淀"三维的条目
必须在升级报告里逐条给出处置（采纳→走 Ratchet 落盘 / 不适用→写明为什么不适用）；
有未处置的 P0 级 finding 时，升级视为未完成，不得在 migration-map 里勾掉该版本。
（Qoder 官方开源诊断工具）：用其五维模型（任务理解/受控执行/变更验证/可靠交付/经验沉淀）的 findings 驱动库演进；每条 evidence-backed finding → 写入 profile `incidents[]` → 走 Ratchet 流程（用户确认后落盘）
2. **每半年做一次规则全量重审**（反熵增，对齐 Boris Cherny “每 6 个月清空重审”思想）：依据 `.qoder/logs/rules.stamp` 的 `load_reason` 分布执行（哪些规则真被加载过、以什么理由加载；这是 v9.9.0 起真实存在、且由 InstructionsLoaded 钩子落笔的证据源）；final:true 规则保留；处置记入 profile.history
3. **harness-verify Check 8** 输出 always_on 预算 WARNING 时，优先在审计中处理
