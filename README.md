# better-coding — Qoder 项目 Harness 工程框架

> 一句话定义：better-coding 将 Harness 组件库一键封装进你的项目（`.qoder/` + `docs/`），植入 3 步持续自维护机制，让 AI 按规格开发、按门禁交付，框架文件自己维护自己。

## 怎么装（30 秒）

1. 把本仓库放进你项目的 `.qoder/skills/better-coding/`。🔴 **目录名必须正好是 `better-coding`**——Qoder 按目录名识别技能，改名就认不出来：

   ```bash
   git clone https://github.com/TheChenV/better-coding.git 你的项目/.qoder/skills/better-coding
   ```

2. 在该项目里对 AI 说一句 **「用 better-coding 初始化这个项目」**。这是阶段 A：零提问装配，落盘 `.qoder/`（规则/技能/子代理/命令/hooks/脚本）+ `docs/`（提示词手册与可视化面板）。

3. 之后按 SDD 九环节推进（需求澄清 → 架构 → 模块规格 → 实现 → 联调 → 测试 → 上线 → 迭代），每一步在 `docs/PROJECT-LIVE.md` 里都有可直接复制的提示词；框架自己维护自己——3 步同步 + 46 条机器判据兜底。

前置要求：**Node ≥ 18**（脚本层三平台同一语言，不依赖 Python/PowerShell）。当前版本号以 `manifest.json` 的 `version` 为唯一事实源，本文件不复制数字。

> 💡 网络提示：在部分网络环境下 `git clone` 需要代理。命令行走不通时，也可以直接下载 ZIP 后把根目录改名为 `better-coding` 放进 `.qoder/skills/`。

## 〇、谁是当前状态的事实源

> 这三件事在库里各只有一处权威定义，本节只回答「看哪一处」，不复制内容。

| 你要问的是 | 唯一权威源 | 谁在守它 |
|---|---|---|
| 库里有多少组件、什么版本 | manifest.json#componentCounts + migration-map.json#finalCounts（两本账键名不同域，按短键与 L0_ 长键的映射对账） | harness-verify 的 component_counts / version_single_source / literal_single_source |
| 某个项目现在到哪一步 | 该项目内的 .qoder/harness-profile.json（maturity / assembled / sync / incidents） | maturity_vs_disk（声称的进度必须有产物背书）+ live_profile_drift |
| 为什么变成这样（历史） | migration-map.json#migrations —— 历史留痕，只答「为什么」，不答「现在是什么」 | 台账，永不机械重写 |

库的元说明不放 docs/harness-templates/：那个目录是给用户改的 SPEC 模板目录，且随阶段 A 落进每一个用户项目，把库说明放进去等于造出第三份事实源拷贝——正是本框架要杀的双源。

## 一、这是什么

| 能力 | 说明 |
|------|------|
| 两阶段装配 | 阶段 A 零信息依赖初始化通用骨架；阶段 B 随项目信息成熟度演进式装配技术栈（L1）与项目定制（L2）组件 |
| 6 命令入口 | `/start-dev`、`/check-project`、`/harness-next`、`/harness-assemble`、`/harness-upgrade`、`/live-refresh`（手动兜底刷新）；环节 6 联调与环节 9 迭代直接用 skill 指令与手册步骤 |
| 26 个 L0 skills | 覆盖需求→架构→模块设计→UI→实现→联调→测试→部署→迭代全链路（**引用一律用 `/` + skill 目录名**，对照表见下方） |
| 3 道门禁 | spec 门禁 / implement 门禁 / release 门禁（原多道 gate 已合并为 3 道主门禁） |
| 规模分诊 3 路线 | ≤5 文件走 `/quick-spec` 免门禁全链；常规功能走 3 道门禁；中大型特性走门禁 + 追加检查 |
| 3 步自动同步 | always-on 规则感知项目变化 → ① 更新 AGENTS.md + harness-profile.json + PROJECT-LIVE.md（含提示词手册渲染）+ HTML 面板数据块 → ② 输出同步报告 → ③ 运行 harness-verify 并记录结果 |
| 漂移检测 | sync-detector hook 检测代码-规格漂移（不阻断，引导 `/spec-delta` 收敛） |
| 契约漂移检测（机械门禁） | 环节 3 末按 `docs/harness-templates/deps-template.yaml` 逐模块登记接口版本 → 环节 6 开工前跑 `node .qoder/scripts/contract-drift.mjs --all`；provides 与 pinned 按 semver 比对，major 不等即 `breaking_drift` **退出码 1 阻断**（本库唯一以退出码为判据的门禁，散文红线不算检查） |
| 单文件指导中心 + HTML 可视化 | `docs/PROJECT-LIVE.md`（阶段 A 落盘，**由 `tools/build-manual.mjs` （构建期工装，不随本库交付）从骨架确定性生成，不手工编辑**）：SDD 提示词手册（**9 环节 × 22 步骤子块**，每环节一个标题（###）+ 步骤区块（####）；提示词整段可复制、自包含，复制到新会话不丢信息，八段白话标签：这一步我要拿到 / 为什么要单独做 / 我能提供的材料 / 参考格式 / 请交付到 / 请按下面顺序做 / 红线（绝对不能做）/ 怎样算做完（请逐条打勾），格式与禁词表基准 `.qoder/briefing-skeletons.md`『提示词自包含契约』；产出型步骤按批次/模块拆区块，分支型环节（5/9）只渲选中分支）+ 进度表 + 项目概况；**任务上下文已拆成独立文件 `docs/项目交接.md`**（换会话、换话题时先看它）；配套 `docs/PROJECT-LIVE.html` 可视化面板（仓库内文件树可见，浏览器双击直接打开，自包含单文件零外部依赖；C4 三视图架构拓扑：Mermaid+ELK 自动布局，节点带状态徽标（待开发/进行中/已完成/存在Bug）+ 悬停关联链路高亮 + 技术栈详情；初态即有三张最小示意图，标签一律带"示意"前缀以免被误认真拓扑），两者同源自动更新，滞后时 `/live-refresh` 手动刷新 |

**组件规模（单一事实源：`manifest.json#componentCounts` 与 `migration-map.json#finalCounts`，两处必须一致）**：16 rules（含领域词汇本、ask-card-option-quality 选择卡选项质量与 harness-runtime-gates 运行时门禁内幕；落盘 `.qoder/rules/` 为 17，多的那 1 条是自维护规则 harness-continuous-sync）/ 26 skills / 3 agents / 6 commands / 11 hooks（含 ask-card-guard 选择卡质量守卫，PreToolUse / matcher=AskUserQuestion；含 auto-finalize——交付物一落盘就按磁盘事实登记定稿事实。全部只有一个 Node 入口 `harness.mjs hook <子命令>`；本维度数的是注册子命令去重集，与 `hook-registry.md` 主表行数不同口径）/ 10 个 spec 模板 / 5 个脚本（`assets/templates/scripts/*.mjs`，原样落盘 `.qoder/scripts/`：`phase-a-init` + `harness`（hook 单入口）+ `hook-ask-card` + `harness-verify` + `build-panel`）/ 1 份 schemas（`sdd-artifacts.yaml`，reference-only 声明式 artifact 依赖图，库级不落盘）；另有 5 个技术栈的 L1 组件与 3 rules + 3 skills + 7 agents 的 L2 模板（其中 4 个 agent 为阶段 B 可选装配的专职专家：planner / developer / test-runner / security-auditor）。（落盘 `.qoder/rules` 为 17 = 库 L0 16 + 1 条自维护 `harness-continuous-sync`，harness-verify 期望值同为 17；`docs/harness-templates/` 落盘 11 件 = 10 个 spec 模板 + 1 份 `deps-template.yaml`，两个口径别混。）

**SDD 9 环节 × 多步骤子块**：①需求澄清（3 步骤：多专家并行产统一 MRD → 按应用多份统一 PRD → Full-Stack 交互原型工程）、②架构设计（2）、③模块设计（2，六件套齐备后按 `deps-template.yaml` 逐模块登记接口版本）、④UI 设计（2 步骤：4·1 定稿（含原型与视觉方向，单路线无选路）+ 4·2 还原核对）、⑤开发实现（S0 应用类型路由，4 步骤：后端/前端/全栈）、⑥联调（1 步；开工前先跑接口版本比对，漂移即停）、⑦集成测试（2）、⑧部署上线（1，四件合一）、⑨迭代回顾（S0 三路分诊，5）；骨架库共 **22 个步骤子块**，每子块自带可复制提示词 + 参数清单 + 对话建议 + next_hint 下一步衍接。

### 装配分层一览

| 层级 | 装配阶段 | 内容 | 触发条件 |
|------|---------|------|---------|
| L0 通用层 | 阶段 A | 16 rules（含领域词汇本与选择卡选项质量）/ 26 skills / 3 agents / 6 commands / 11 hooks（注册项，非文件）/ 10 个 spec 模板/ 5 个 `.mjs` 脚本 | 初始化即落盘，零信息依赖 |
| L1 技术栈层 | 阶段 B | Python / TypeScript / Java / Go / React 各自的 rules、skills、hooks | 脚手架文件信号或用户声明技术栈 |
| L2 项目定制层 | 阶段 B | 领域术语表、分层依赖、API 约定等项目级组件 | PRD/ARCH/SPEC 等文档信号出现 |

### 命令与指令：目录名对照

> Commands 固定为 **6 个**（日常 `/start-dev`、`/check-project`；框架 `/harness-next`、`/harness-assemble`、`/harness-upgrade`、`/live-refresh`）——命令只在"承载独立于 skill 的编排步骤"时才存在，两个 SDD 环节入口外壳已并入 skill 与手册；下表九项是**已退役的旧名**——能力已并入现行指令，且新版**没有别名层**，敲旧名会直接 `Skill "..." not found`，必须改用右列的目录名。

常用 skill 指令**一律写 `/` + skill 目录名**（新版按目录名解析；frontmatter 的 `name` 与 `trigger` 都不是解析键，写它们会静默失败），组件实际装配以 `.qoder/` 目录为准：

| 现行指令（= skill 目录名） | 归属 skill | 功能 |
|---------|------|------|
| `/create-architecture` | create-architecture | 架构设计与 C4 双图 |
| `/implement-feature` | implement-feature | 基于 Spec 的逐层功能实现 |
| `/spec-aligned-review` | spec-aligned-review | 双轴代码审查（标准轴 + 规格轴） |
| `/code-simplification` | code-simplification | 代码简化（Chesterton's Fence） |
| `/retrospective` | retrospective | 迭代回顾与 Harness 改进提案 |
| `/context-handoff` | context-handoff | 会话上下文交接 |
| `/web-e2e-test` | web-e2e-test | Web E2E 测试（Playwright） |
| `/architecture-governance` | architecture-governance | 架构治理审查 |
| `/spec-delta` | spec-delta | 增量变更管理（delta spec） |
| `/integrate-modules` | integrate-modules | 环节 6 模块联调编排（环节 6 唯一入口；含归档合并与破坏性操作确认清单） |
| `/ui-design` | ui-design | 环节 1·步骤 3 交互原型工程脚手架（仅 Full-Stack） |
| `/ui-design` | ui-design | 环节 4 UI 设计编排（单路线两步：4·1 定稿 + 4·2 还原核对） |
| `/ui-ux-pro-max` | 界面设计引擎（吸收自上游 ui-ux-pro-max 2.13.0）：风格 / 配色 / 字体 / 图表候选查询 | 环节 1·3 与 4 的设计取值查询 |

> 其余 14 个 skill 的指令名一律 = `/` + skill 目录名（`/create-proposal`、`/create-module-spec`、`/create-adr`、`/run-tests`、`/deploy`、`/release`、`/rollback`、`/precode-alignment`、`/quick-spec`、`/branch-workflow`、`/harness-analyze`、`/platform-profile`、`/migrate-legacy`、`/performance-optimization`）。

### 3 步同步的触发事件（5 类，发生即执行，不可跳过）

| # | 触发事件 |
|---|---------|
| 1 | 刚生成了 MRD、PRD、ARCH、SPEC 等文档 |
| 2 | 用户在对话中声明了技术栈 |
| 3 | `docs/prd/`、`docs/arch/`、`docs/spec/` 新增文件或目录，或收到 sync-detector 漂移提示 |
| 4 | 检测到脚手架文件出现（package.json / requirements.txt / pom.xml / go.mod 等） |
| 5 | 阶段 B 装配完成后 |

执行细节（每步操作、校验与熔断）以 `/live-refresh` 规则为唯一规范；缺信息项转 `pendingPlaceholders` 待补，禁止编造。


## 二、核心思想

1. **Spec 是第一公民**：代码编写前必须有对应 Spec 文档，门禁先于代码。
2. **规范的重量应与变更的重量匹配**：≤5 文件的小改走快速通道，中大型特性才走 SDD 全链。
3. **证据驱动**：宣称完成必须附带验证证据（编译/测试/Lint/覆盖率输出）。
4. **框架自维护**：初始化后框架文件由 always-on 规则自动同步，用户只管开发。
5. **装配跟随信息成熟度**：能推导则自动填并标注来源，不可推导的保持待检测，禁止编造。

## 三、效果承诺

| 承诺 | 内容 | 验证方式 |
|------|------|---------|
| 零提问初始化 | 阶段 A 不向用户提问，零信息依赖落盘通用骨架 | 初始化报告 |
| 小改动免全链 | ≤5 文件改动走 `/quick-spec`，免门禁全链 | `/harness-next` 规模分诊输出 |
| 门禁量化指标 | implement 门禁：单测覆盖率 ≥70%，集成回归后 ≥80%；无 Critical 问题、无 Major 安全问题 | 门禁检查清单逐条核对 |
| 框架文件永不手维护 | AGENTS.md、PROJECT-LIVE.md（managed-dynamic 分区）与 PROJECT-LIVE.html（SYNC_DATA 数据块）由 3 步同步自动维护，不依赖用户触发；滞后时 `/live-refresh` 手动兜底 | harness-verify 输出 `status: PASS` |
| 组件计数可查 | `.qoder/` 组件计数与 manifest 期望一致（组件防丢由 harness-verify Check 2 兜底） | `/check-project` 体检 + harness-verify PASS |
| 提示词手册逐步自动就绪 | 用户唯一输入是环节 1 的一句话想法；**9 环节 × 多步骤子块**的提示词一次性全量列出（每步骤自带扫读字段、状态与一条可复制提示词），每完成一步，下次同步自动回填后续步骤参数并刷新状态（只绑定可推导事实，禁止演绎；产出型步骤按批次/模块拆区块（环节 3 按依赖拓扑分批，默认单批单区块）、校验型步骤折叠单区块、分支环节（5/9）折叠式渲染、UI 环节单路线两步不折叠） | 同步报告 + 提示词手册 |

**3 道门禁速览**（门禁由 AI 自检 + 用户确认完成，详细条目见门禁检查清单）：

| 门禁 | 核心检查点 | 失败处理 |
|------|-----------|---------|
| spec 门禁 | 决策已确认、成功指标符合 SMART、P0/P1 用户故事有 Gherkin 验收标准、API 契约完整 | 带反馈重试（≤2 次） |
| implement 门禁 | 编译/Lint/单测全部通过、覆盖率 ≥70%→集成回归后 ≥80%、无 Flaky、实现与 SPEC 一致 | 修复重试（≤5 次） |
| release 门禁 | 健康检查通过、回滚方案已验证、无调试代码与硬编码敏感信息 | 自动回滚（≤1 次重试） |

**验证方式**：随时用 `/check-project` 体检（组件统计与指令集覆盖率）；同步与升级均以独立校验脚本输出 PASS 为准：

```
# 三平台同一条命令（校验器只有 Node 一个入口）
node .qoder/scripts/harness-verify.mjs
```

阶段 A 落盘本身也已脚本化（单语言 Node，三平台同一条命令）——复制、机械字段注入、profile 生成、面板拼接、计数对账均由库内执行器完成，AI 不再重抄复制逻辑：

```
# --project-root 必填（仅项目级安装形态可缺省推导）；SKILL_ROOT 由脚本自身位置回推，不接受参数覆盖
node <SKILL 库根>/assets/templates/scripts/phase-a-init.mjs --project-root <项目根>
```

成功输出 `PHASE-A-COPY-OK`，失败输出 `PHASE-A-COPY-FAIL:<原因>`，面板失败输出 `PHASE-A-PANEL-FAIL`（退出码 0/1/2）。执行器或其资产缺失时输出 `PHASE-A-NO-EXECUTOR` 并以退出码 1 停止：把令牌与缺失路径回显给用户、问明安装位置，**不要**现场手写复制命令。

## 四、5 分钟上手

### 安装与入口模型

| 环节 | 入口 | 说明 |
|------|------|------|
| 安装/初始化（一次性） | `/better-coding`（或说"初始化 Harness"） | 唯一的 SKILL 级斜杠指令，执行阶段 A；裸调用时按 `.qoder/harness-profile.json` 存在性自动判定，绝不报错 |
| 之后全部操作用项目命令 | 阶段 A 落盘 `.qoder/commands/` 的 6 个命令 | `/start-dev`、`/check-project`、`/harness-next`、`/harness-assemble`、`/harness-upgrade`、`/live-refresh` + 26 个 skills 指令 |

> 用户心智：**初始化只需 `/better-coding` 一次，之后全部用项目命令；迷路用 `/harness-next`**。项目命令无响应时，说自然语言意图（如"装配组件"/"升级 Harness 组件"/"下一步做什么"）同样有效。

### 三步起步

1. **初始化**：输入 `/better-coding`（或说“初始化 Harness”）——**零提问**完成阶段 A（清单展示不阻断，“防误覆盖”由脚本的哈希比对承担而不靠确认卡），落盘 `.qoder/` 骨架（含提示词手册骨架库）、`docs/PROJECT-LIVE.md` 指导中心、`docs/PROJECT-LIVE.html` 可视化面板（模板+引擎拼接生成，浏览器双击即开）与自维护种子；复跑时用户定制文件与已有 profile 自动跳过并报告。
2. **声明技术栈**：直接说「用 FastAPI」「用 React」等，或输入 `/harness-assemble`——立即装配 L1 技术栈组件。
3. **开工**：用一句话想法跑 `/create-proposal`，产出 MRD/PRD，后续环节由框架导航。

> **迷路就输 `/harness-next`**：判定当前所处阶段，给出下一步可直接执行的指令，并按变更规模分诊。

拿到新需求时，先按规模选路线：

| 变更规模 | 路线 |
|---------|------|
| ≤5 个文件的改动 | `/quick-spec`，免门禁全链 |
| 常规功能 | `/create-module-spec` → `/implement-feature` → `/run-tests`，过 3 道门禁；多模块联调补 `/integrate-modules` |
| 中大型特性 | SDD 9 环节全链（`/create-proposal` → `/create-architecture` → `/create-module-spec` → `/ui-design` → `/implement-feature` → `/integrate-modules` → `/run-tests` → `/deploy` → 环节 9 迭代（手册 9·1 分诊）），可用连续执行承载（以当前环境实际可用为准） |

**指令说明**：`/better-coding` 是唯一的 SKILL 级斜杠指令，仅承担安装与初始化；`/start-dev`、`/check-project`、`/harness-next`、`/harness-assemble`、`/harness-upgrade`、`/live-refresh` 为 6 个项目级命令，阶段 A 装配到 `.qoder/commands/` 后生效。**引用 skill 一律写 `/` + skill 目录名**（frontmatter 里没有 `trigger`；如 `/create-architecture`、`/implement-feature`、`/spec-aligned-review`、`/code-simplification`、`/retrospective`、`/context-handoff`、`/web-e2e-test`、`/architecture-governance`、`/spec-delta`、`/integrate-modules`、`/ui-design`），完整清单见上方「命令与指令」表；组件实际装配以 `.qoder/` 目录为准，此处不复述。

## 五、与 Qoder 平台能力组合

> 分工原则：本框架负责规格质量与门禁；长任务执行、并行调度、上下文供给交给 Qoder 平台能力，互补不重复。
> 下表所有能力均以**当前环境实际可用为准**，可能随 Qoder 版本变化。

| 场景 | 推荐能力 | 分工说明 |
|------|----------|----------|
| 完整流水线长任务 / 中大型特性 | 连续执行 | 走 SDD 全链时用连续执行把 9 环节在一次会话里串完；门禁仍按 spec/implement/release 3 道把关（以当前环境实际可用为准） |
| 多模块并行实现 | 多专家并行 + 内置 `dispatching-parallel-agents` | 模块间无依赖时并行派发；本库 3 个 agent（architect / ops-agent / spec-review-agent）随 L0 落盘，另有 planner / developer / test-runner / security-auditor 4 个为阶段 B 可选装配；全部按环节映射到可派生的专家角色（不依赖任何平台面板）（以当前环境实际可用为准） |
| 需求环节多专家并行协同（环节 1·步骤 1） | 多专家并行（可配置面板） | `/create-proposal` 由主 Agent 兼任 TL，同轮并行派遣 N 个领域专家独立 subagent（默认 6 专家设定由 create-proposal 编排五要素权威承载，1·1 提示词仅引用；规模与种类由 profile 的 `mrdPanelMode`/`mrdPanelSize`/`mrdPanelRoles` 配置；token 受限或 subagent 不可用时降级 `frontier`） |
| UI 设计协作 / 非技术干系人评审原型 | **单路线：内置设计能力** | 环节 4 `/ui-design` 为**单路线两步**：4·1 定稿（含交互原型与视觉方向，给它风格要求即可）、4·2 还原核对；不接 Figma、不收参考图、不依赖外部设计工具（原 A/B/C/D 四路径决策与 `ui-to-code` agent、`docs/spec/UI-路径决策-*.md` 产物均已退役，去向见下方旧名表） |
| 每环节的执行形态选型 | **建议字段**（环节级「本环节建议」+ 步骤级「建议怎么用」） | `docs/PROJECT-LIVE.md` 每个环节标题与步骤区块直接给出推荐执行形态（连续执行 / 交互确认 / 多专家并行 / 新窗口 / 内置设计类能力）；三元组口径（运行模式×协作模式×窗口）留在骨架「形态建议」执行契约；取数来源为库级 `references/stage-agent-skill-map.md`（reference-only，不落盘项目） |
| 架构理解 / 代码库导航 | RepoWiki | 作为架构上下文来源，优先于全库扫描；新会话开始建议先查阅（以当前环境实际可用为准） |
| 上下文衰减 / 长会话 | 新窗口会话 + `/context-handoff` 衍接 | 出现重复行为/方案锚定/回答变泛信号时，先 `/context-handoff` 生成交接文档再开新会话（以当前环境实际可用为准） |
| 与内置 `/better-harness` 分工 | 各司其职 | 本框架负责装配与日常同步（不产生晋升/降级候选）；`/better-harness` 负责周期性 harness 好坏审计与处置建议，并已纳入本库**版本升级验收门禁**（升级后必须跑一次，见 `references/upgrade-protocol.md`）（以当前环境实际可用为准） |

## 六、文档地图

| 文档 | 回答什么问题 | 谁维护 | 何时看 |
|------|--------------|--------|--------|
| `README.md`（本文件） | 这个框架是什么、承诺什么、怎么起步 | SKILL 升级时回刷 | 第一次接触本框架 |
| `docs/PROJECT-LIVE.md`（阶段 A 随初始化落盘，**由 `tools/build-manual.mjs` （构建期工装，不随本库交付）从骨架 + 静态壳生成**） | SDD 提示词手册（**9 环节 × 22 步骤子块**：每环节一个标题（###）+ 步骤区块（####），区块内是一条可复制提示词（形状 B 八个白话标签）+ 人话扫读字段）+ 顶部进度表 + 项目概况（3 分区：workflow/snapshot/footer） | 3 步同步自动维护（managed-dynamic 分区）；提示词区按骨架整段重渲 | 每次开工打开文件先看提示词手册；查进展/查指令/查环节做法 |
| `docs/项目交接.md`（阶段 A 随初始化落盘） | 下一次会话接着干要读什么：目标与验收、已完成（附证据）、已决策（含否决项）、未决问题、下一步、关键文件清单 | 3 步同步增量维护（手工修正保留）；`/context-handoff` 随时刷新 | 换会话、换话题、隔天回来时先读它 |
| `docs/PROJECT-LIVE.html`（阶段 A 随初始化拼接落盘仓库 `docs/`） | C4 三视图架构拓扑（Mermaid+ELK 自动布局，节点带状态徽标：待开发/进行中/已完成/存在Bug）+ 技术栈详情（面向架构师的可视化面板，浏览器双击直接打开，文件树可见） | 3 步同步自动再生成 SYNC_DATA 数据块；拓扑仅随 ARCH 产出/变更更新（ARCH 已产出时不得保留占位图），状态徽标随提示词手册状态/事故记录刷新 | 需要看架构全貌/模块状态/技术栈详情时；滞后时 `/live-refresh` |
| `.qoder/briefing-skeletons.md`（阶段 A 随初始化落盘） | 提示词手册渲染引擎基准（**9 环节 × 22 个步骤子块**，每子块含含义说明 + 参数清单 + 可复制提示词 + 对话建议 + next_hint），用户无需阅读 | 升级时整体回刷 | 无需主动查看 |
| 根目录 `AGENTS.md` | 项目是什么、技术栈/结构/命令/约束有哪些（agents.md 标准位置，单一事实源）。「运行时前置」只留 2 行，框架故障模式细节在 `.qoder/rules/harness-runtime-gates.md` | 3 步同步自动维护（Setup/测试两表的首装命令由阶段 A 按脚手架事实代填，出处记 profile） | 每次会话开始自动加载；核对项目事实；长度套 `agents_context_budget` 官方四档 |
| `.qoder/harness-profile.json` | 项目成熟度、装配状态、同步记录与最近校验结论（机器权威源） | 3 步同步（AI）+ stop-verify hook 回写 profile | `/harness-next` 导航与装配评估时读取 |

**目录约定**：spec 布局为 `docs/spec/NNN-slug/`（一功能一目录，NNN 三位递增编号，兼容旧扁平文件 `SPEC-*.md`）；ADR 存放于 `docs/arch/adr/`。

**建议阅读顺序**：本文件 → `docs/PROJECT-LIVE.md`（提示词手册起步，含义说明理解每步为什么这样做）→ 架构/技术栈全貌用浏览器打开 `docs/PROJECT-LIVE.html`（仓库内文件树可见）。

## 七、要改这个库本身？

看 [CONTRIBUTING.md](CONTRIBUTING.md) —— 那里有库维护约定（版本三处同源、台账仪式、判据与阈值纪律）和历史台账文件的去留说明。日常使用不需要读。

## 八、版本与升级

- **版本号唯一事实源**：`manifest.json` 的 `version`。本文件不复制数字，复制必然过期。
- **版本策略**：语义化版本（SemVer）。MAJOR = 有破坏性变更（旧项目需按台账升级动作处理）；MINOR = 新增能力或成批缺陷修复；PATCH = 文案与判据字面量订正。
- **升级台账**：每个版本改了什么、旧项目要做什么，记在 `migration-map.json` 的 `migrations` 数组里（机器可读，见上一节）。
- **兼容性口径**：本框架只保证"按 `migration-map.json` 升级动作执行后"的行为一致；未列出的历史版本不做兼容承诺。

- **升级入口**：`/harness-upgrade`（或说"升级 Harness 组件"）。
- **升级路径**：版本比对 → 按 `migration-map.json` 生成升级动作清单 → 用户确认 → 回刷项目内框架文件 → 运行 harness-verify 直至输出 `status: PASS`。
- **升级边界**：只刷新 L0 通用部分；用户已定制的内容不覆盖（存在且与 assets 版本不同则跳过）。
- **执行协议**：升级回源的完整流程见 `references/upgrade-protocol.md`。
