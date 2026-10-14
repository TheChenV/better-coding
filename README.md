# better-coding — Qoder 项目 Harness 工程框架

> 一句话定义：better-coding 将 Harness 组件库一键封装进你的项目（`.qoder/` + `docs/`），植入 3 步持续自维护机制，让 AI 按规格开发、按门禁交付，框架文件自己维护自己。

## 〇、谁是当前状态的事实源

> v9.3.0 S8 成文。此前这三件事在库里从未写明，全靠读者从散落表述里推。补一份新说明就是第三份拷贝，所以这里只回答「看哪一处」。

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
| 6 命令入口 | `/start-dev`、`/check-project`、`/harness-next`、`/harness-assemble`、`/harness-upgrade`、`/live-refresh`（手动兜底刷新）；环节 6 联调、环节 9 迭代自 v9.0.0 起直接用 skill 指令与手册步骤（见下方旧名表末两行） |
| 26 个 L0 skills | 覆盖需求→架构→模块设计→UI→实现→联调→测试→部署→迭代全链路（**引用一律用 `/` + skill 目录名**，对照表见下方） |
| 3 道门禁 | spec 门禁 / implement 门禁 / release 门禁（原多道 gate 已合并为 3 道主门禁） |
| 规模分诊 3 路线 | ≤5 文件走 `/quick-spec` 免门禁全链；常规功能走 3 道门禁；中大型特性走门禁 + 追加检查 |
| 3 步自动同步 | always-on 规则感知项目变化 → ① 更新 AGENTS.md + harness-profile.json + PROJECT-LIVE.md（含提示词手册渲染）+ HTML 面板数据块 → ② 输出同步报告 → ③ 运行 harness-verify 并记录结果 |
| 漂移检测 | sync-detector hook 检测代码-规格漂移（不阻断，引导 `/spec-delta` 收敛） |
| 契约漂移检测（机械门禁） | 环节 3 末按 `docs/harness-templates/deps-template.yaml` 逐模块登记接口版本 → 环节 6 开工前跑 `node .qoder/scripts/contract-drift.mjs --all`；provides 与 pinned 按 semver 比对，major 不等即 `breaking_drift` **退出码 1 阻断**（本库唯一以退出码为判据的门禁，散文红线不算检查） |
| 单文件指导中心 + HTML 可视化 | `docs/PROJECT-LIVE.md`（阶段 A 落盘，**由 `tools/build-manual.mjs` （构建期工装，不随本库交付）从骨架确定性生成，不手工编辑**）：SDD 提示词手册（**9 环节 × 22 步骤子块**，每环节一个标题（###）+ 步骤区块（####）；提示词整段可复制、自包含，复制到新会话不丢信息，八段白话标签：这一步我要拿到 / 为什么要单独做 / 我能提供的材料 / 参考格式 / 请交付到 / 请按下面顺序做 / 红线（绝对不能做）/ 怎样算做完（请逐条打勾），格式与禁词表基准 `.qoder/briefing-skeletons.md`『提示词自包含契约』；产出型步骤按批次/模块拆区块，分支型环节（5/9）只渲选中分支）+ 进度表 + 项目概况；**任务上下文已拆成独立文件 `docs/项目交接.md`**（换会话、换话题时先看它）；配套 `docs/PROJECT-LIVE.html` 可视化面板（仓库内文件树可见，浏览器双击直接打开，自包含单文件零外部依赖；C4 三视图架构拓扑：Mermaid+ELK 自动布局，节点带状态徽标（待开发/进行中/已完成/存在Bug）+ 悬停关联链路高亮 + 技术栈详情；初态即有三张最小示意图，标签一律带"示意"前缀以免被误认真拓扑），两者同源自动更新，滞后时 `/live-refresh` 手动刷新 |

**组件规模（单一事实源：`manifest.json#componentCounts` 与 `migration-map.json#finalCounts`，两处必须一致）**：16 rules（含领域词汇本、ask-card-option-quality 选择卡选项质量与 v9.7.0 的 harness-runtime-gates 运行时门禁内幕；落盘 `.qoder/rules/` 为 17，多的那 1 条是自维护规则 harness-continuous-sync）/ 26 skills / 3 agents / 6 commands / 11 hooks（含 ask-card-guard 选择卡质量守卫，PreToolUse / matcher=AskUserQuestion；v9.8.0 新增 auto-finalize —— 交付物一落盘就按磁盘事实登记定稿事实。全部只有一个 Node 入口 `harness.mjs hook <子命令>`；本维度数的是注册子命令去重集，与 `hook-registry.md` 主表行数不同口径）/ 10 个 spec 模板 / 5 个脚本（`assets/templates/scripts/*.mjs`，原样落盘 `.qoder/scripts/`：`phase-a-init` + `harness`（hook 单入口）+ `hook-ask-card` + `harness-verify` + `build-panel`）/ 1 份 schemas（`sdd-artifacts.yaml`，reference-only 声明式 artifact 依赖图，库级不落盘）；另有 5 个技术栈的 L1 组件与 3 rules + 3 skills + 7 agents 的 L2 模板（其中 4 个 agent 自 v9.0.0 起为阶段 B 可选装配的专职专家：planner / developer / test-runner / security-auditor）。（🔴 v9.12.0 全局 review 修掉本行自相矛盾：句尾旧括注写「落盘 `.qoder/rules` 实为 16 = 库 L0 15 + 1 条自维护，期望值同为 16」，与本行前半句已写的「落盘为 17」直接打架——正解是 **17 = 库 L0 16 + 1 条自维护 `harness-continuous-sync`**，harness-verify 期望值同为 17。`spec 模板` 也从 11 改 10：v9.12.0 删宪法模板后为 10，`docs/harness-templates/` 落盘数另加 1 份 `deps-template.yaml`＝11，两个口径别混。）

**SDD 9 环节 × 多步骤子块**：①需求澄清（3 步骤：多专家并行产统一 MRD → 按应用多份统一 PRD → Full-Stack 交互原型工程）、②架构设计（2）、③模块设计（2，六件套齐备后按 `deps-template.yaml` 逐模块登记接口版本）、④UI 设计（2 步骤：4·1 定稿（含原型与视觉方向，单路线无选路）+ 4·2 还原核对）、⑤开发实现（S0 应用类型路由，4 步骤：后端/前端/全栈）、⑥联调（1，v9.0.0 三步合一；开工前先跑接口版本比对，漂移即停）、⑦集成测试（2）、⑧部署上线（1，四件合一）、⑨迭代回顾（S0 三路分诊，5）；骨架库共 **22 个步骤子块**，每子块自带可复制提示词 + 参数清单 + 对话建议 + next_hint 下一步衍接。

### 装配分层一览

| 层级 | 装配阶段 | 内容 | 触发条件 |
|------|---------|------|---------|
| L0 通用层 | 阶段 A | 16 rules（含领域词汇本与选择卡选项质量；🔴 旧值 15 是 v9.7.0 抬维时漏改）/ 26 skills / 3 agents / 6 commands / 11 hooks（注册项，非文件；旧值 10 漏计 v9.8.0 的 auto-finalize）/ 10 spec 模板（旧值 11 含 v9.12.0 已删的宪法模板）/ 5 个 `.mjs` 脚本 | 初始化即落盘，零信息依赖 |
| L1 技术栈层 | 阶段 B | Python / TypeScript / Java / Go / React 各自的 rules、skills、hooks | 脚手架文件信号或用户声明技术栈 |
| L2 项目定制层 | 阶段 B | 领域术语表、分层依赖、API 约定等项目级组件 | PRD/ARCH/SPEC 等文档信号出现 |

### 命令与指令：目录名对照

> Commands 固定为 **6 个**（日常 `/start-dev`、`/check-project`；框架 `/harness-next`、`/harness-assemble`、`/harness-upgrade`、`/live-refresh`）——命令只在"承载独立于 skill 的编排步骤"时才存在，两个 SDD 环节入口外壳已并入 skill 与手册；下表九项是**已退役的旧名**——能力已并入现行指令，且新版**没有别名层**，敲旧名会直接 `Skill "..." not found`，必须改用右列的目录名。

| 旧名（已失效） | 现行指令／入口 | 说明 |
|---------|---------|------|
| `/arch-check` | `/architecture-governance` | 架构治理与合规检查 |
| `/run-test` | `/run-tests` | 测试执行与报告 |
| `/create-test` | `/run-tests` | 测试计划与用例构造（判据在其 Step 1a，v9.0.0 起并入） |
| `/contract-test` | `/integrate-modules` | 契约测试判据（其 Step 6a 可单跑，v9.0.0 起并入） |
| `/git-commit-all` | `/branch-workflow` | 一键全量提交（快捷路径） |
| `/merge-conflicts` | `/branch-workflow` | 合并冲突逐 hunk 处置（其 Step 4a，v9.0.0 起并入） |
| `/security-review` | `/spec-aligned-review` | 安全需求逐条对齐 + 三层边界（v9.0.0 起并入）；OWASP 逐项/密钥/依赖 CVE 交内置 `security-scan` |
| `/integrate` | `/integrate-modules` | 环节 6 联调（v9.0.0 起命令外壳退役，直接调该 skill；归档合并与破坏性操作确认清单已并入其第 8 步） |
| `/iterate` | 手册 9·1 分诊提示词 | 环节 9 迭代三路分诊（新功能 `/spec-delta` / 缺陷走手册 9·3 先写复现测试 / 重构 `/code-simplification`），收尾 `/retrospective`；v9.0.0 起不再有命令外壳 |
| `/hc-tdd-cycle` | 已退役（本库不再教学/派发 TDD） | 垂直切片红-绿-重构循环整件退役：逐层实现的判据改由 `/implement-feature` 的「逐层验收基线」承载（判据取自 SPEC、每层留证据）；缺陷修复的复现纪律仍在手册 9·3（先写复现测试、确认它失败、再改代码）。新版无别名层，敲旧名直接 `Skill "..." not found` |

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
| `/integrate-modules` | integrate-modules | 环节 6 模块联调编排（v9.0.0 起兼作环节 6 唯一入口，命令外壳已退役；含归档合并与破坏性操作确认清单） |
| `/ui-design` | ui-design | 环节 1·步骤 3 交互原型工程脚手架（仅 Full-Stack） |
| `/ui-design` | ui-design | 环节 4 UI 设计编排（v9.0.0 单路线两步：4·1 定稿 + 4·2 还原核对） |
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
# 三平台同一条命令（v9.0.0 起校验器只有 Node 一个入口）
node .qoder/scripts/harness-verify.mjs
```

阶段 A 落盘本身也已脚本化（v8.3.0 起脚本化，v9.0.0 起单语言 Node，三平台同一条命令）——复制、机械字段注入、profile 生成、面板拼接、计数对账均由库内执行器完成，AI 不再重抄复制逻辑：

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
| 多模块并行实现 | 多专家并行 + 内置 `dispatching-parallel-agents` | 模块间无依赖时并行派发；本库 3 个 agent（architect / ops-agent / spec-review-agent）随 L0 落盘，另有 planner / developer / test-runner / security-auditor 4 个自 v9.0.0 起为阶段 B 可选装配；全部按环节映射到可派生的专家角色（不依赖任何平台面板）（以当前环境实际可用为准） |
| 需求环节多专家并行协同（环节 1·步骤 1） | 多专家并行（可配置面板） | `/create-proposal` 由主 Agent 兼任 TL，同轮并行派遣 N 个领域专家独立 subagent（默认 6 专家设定由 create-proposal 编排五要素权威承载——v8.2.0 起自骨架 1·1 提示词下沉，1·1 提示词仅引用；规模与种类由 profile 的 `mrdPanelMode`/`mrdPanelSize`/`mrdPanelRoles` 配置；token 受限或 subagent 不可用时降级 `frontier`） |
| UI 设计协作 / 非技术干系人评审原型 | **单路线：内置设计能力** | 环节 4 `/ui-design` 自 v9.0.0 起**单路线两步**：4·1 定稿（含交互原型与视觉方向，给它风格要求即可）、4·2 还原核对；不接 Figma、不收参考图、不依赖外部设计工具（原 A/B/C/D 四路径决策与 `ui-to-code` agent、`docs/spec/UI-路径决策-*.md` 产物均已退役，去向见下方旧名表） |
| 每环节的执行形态选型 | **建议字段**（环节级「本环节建议」+ 步骤级「建议怎么用」） | `docs/PROJECT-LIVE.md` 每个环节标题与步骤区块直接给出推荐执行形态（连续执行 / 交互确认 / 多专家并行 / 新窗口 / 内置设计类能力）；三元组口径（运行模式×协作模式×窗口）留在骨架「形态建议」执行契约；取数来源为库级 `references/stage-agent-skill-map.md`（reference-only，不落盘项目） |
| 架构理解 / 代码库导航 | RepoWiki | 作为架构上下文来源，优先于全库扫描；新会话开始建议先查阅（以当前环境实际可用为准） |
| 上下文衰减 / 长会话 | 新窗口会话 + `/context-handoff` 衍接 | 出现重复行为/方案锚定/回答变泛信号时，先 `/context-handoff` 生成交接文档再开新会话（以当前环境实际可用为准） |
| 与内置 `/better-harness` 分工 | 各司其职 | 本框架负责装配与日常同步（遥测分区自 v9.0.0 已删除，不再产生晋升/降级候选）；`/better-harness` 负责周期性 harness 好坏审计与处置建议，并已纳入本库**版本升级验收门禁**（升级后必须跑一次，见 `references/upgrade-protocol.md`）（以当前环境实际可用为准） |

## 六、文档地图

| 文档 | 回答什么问题 | 谁维护 | 何时看 |
|------|--------------|--------|--------|
| `README.md`（本文件） | 这个框架是什么、承诺什么、怎么起步 | SKILL 升级时回刷 | 第一次接触本框架 |
| `docs/PROJECT-LIVE.md`（阶段 A 随初始化落盘，**由 `tools/build-manual.mjs` （构建期工装，不随本库交付）从骨架 + 静态壳生成**） | SDD 提示词手册（**9 环节 × 22 步骤子块**：每环节一个标题（###）+ 步骤区块（####），区块内是一条可复制提示词（形状 B 八个白话标签）+ 人话扫读字段）+ 顶部进度表 + 项目概况（3 分区：workflow/snapshot/footer） | 3 步同步自动维护（managed-dynamic 分区）；提示词区按骨架整段重渲 | 每次开工打开文件先看提示词手册；查进展/查指令/查环节做法 |
| `docs/项目交接.md`（阶段 A 随初始化落盘） | 下一次会话接着干要读什么：目标与验收、已完成（附证据）、已决策（含否决项）、未决问题、下一步、关键文件清单 | 3 步同步增量维护（手工修正保留）；`/context-handoff` 随时刷新 | 换会话、换话题、隔天回来时先读它 |
| `docs/PROJECT-LIVE.html`（阶段 A 随初始化拼接落盘仓库 `docs/`） | C4 三视图架构拓扑（Mermaid+ELK 自动布局，节点带状态徽标：待开发/进行中/已完成/存在Bug）+ 技术栈详情（面向架构师的可视化面板，浏览器双击直接打开，文件树可见） | 3 步同步自动再生成 SYNC_DATA 数据块；拓扑仅随 ARCH 产出/变更更新（ARCH 已产出时不得保留占位图），状态徽标随提示词手册状态/事故记录刷新 | 需要看架构全貌/模块状态/技术栈详情时；滞后时 `/live-refresh` |
| `.qoder/briefing-skeletons.md`（阶段 A 随初始化落盘） | 提示词手册渲染引擎基准（**9 环节 × 22 个步骤子块**，每子块含含义说明 + 参数清单 + 可复制提示词 + 对话建议 + next_hint），用户无需阅读 | 升级时整体回刷 | 无需主动查看 |
| 根目录 `AGENTS.md` | 项目是什么、技术栈/结构/命令/约束有哪些（agents.md 标准位置，单一事实源）。v9.7.0 起只留常驻该留的：「运行时前置」压成 2 行，框架故障模式细节在 `.qoder/rules/harness-runtime-gates.md` | 3 步同步自动维护（Setup/测试两表的首装命令由阶段 A 按脚手架事实代填，出处记 profile） | 每次会话开始自动加载；核对项目事实；长度套 `agents_context_budget` 官方四档 |
| `.qoder/harness-profile.json` | 项目成熟度、装配状态、同步记录与最近校验结论（机器权威源） | 3 步同步（AI）+ stop-verify hook 回写 profile | `/harness-next` 导航与装配评估时读取 |

**目录约定**：spec 布局为 `docs/spec/NNN-slug/`（一功能一目录，NNN 三位递增编号，兼容旧扁平文件 `SPEC-*.md`）；ADR 存放于 `docs/arch/adr/`。

**建议阅读顺序**：本文件 → `docs/PROJECT-LIVE.md`（提示词手册起步，含义说明理解每步为什么这样做）→ 架构/技术栈全貌用浏览器打开 `docs/PROJECT-LIVE.html`（仓库内文件树可见）。

## 七、库维护约定（仅改库时需要看）

> **交付面不含开发侧工装**：本库的回归闸门、判据基线与手册构建器（`tools/`）属开发侧，不随本库交付。
> 文档中凡点到 `tools/...` 的闸门或夹具，都指这套工装；本交付**不附带版本库**，所以历史里的工装无法在本副本内取回：需要改这个库时，请另行获取带完整历史的仓库副本，否则任何改动都没有自动回归可跑（本节末尾那条升级路径遗留缺陷即在此前提下记录）。
>
> **与 Qoder 官方 better-harness 评审器的关系**：Qoder 自带官方 harness 评审器，其 references/agent-customize/agents-md-review.md:57-66 给的是**分带而非分数**（≤80 健康 / 81-120 多栈可接受 / 121-180 须给拆分理由 / >180 默认过载 / 200+ 即 finding），本库根 AGENTS.md 的长度由同口径的落盘判据 agents_context_budget 自证（v9.7.0 起）。**定位是 SDD 流程的编排者，不是该评审器的竞争者**：评审器判「这个项目的 agent 指令文件写得好不好」，本库判「SDD 九环节有没有按规格走完并留下证据」。

> **已知未修缺陷（升级路径）**：阶段 A 整份重建会把项目里**已按 ARCH 推导过**的面板 `SYNC_DATA` 换成模板占位
> （实测 3,851B/10 连线/0 占位 → 3,216B/9 连线/21 占位，`panel_topo_lag` 由 PASS 转 FAIL，同一病灶复现两次）。
> 规避：升级只走 `--skip-panel`（拓扑实测完好）+ 脚本层用 `--repush-scripts-only`；根治方向是升级改走 `build-panel` 的数据块注入模式（v8.1.2 起即支持），或重建前判定旧块无占位标记则保留。

- **`hooks/` 与 `scripts/` 的分工（已裁定，勿再议）**：`.qoder/hooks/` 只放文档（`hook-registry.md`），`.qoder/scripts/` 放全部可执行件。新版无 hooks 目录自动发现，脚本放哪儿都能跑（settings.json 里路径是自由写的），所以这只是可读性取舍：`scripts/` 里 6 个文件有 4 个本就不是 hook 代码（校验器 / 面板拼接 / 契约比对 / 安装器），把它们搬进"事件目录"会制造四处新错位；而只搬 `harness.mjs` + `hook-ask-card.mjs` 两个真事件脚本，实测要改 97 处引用 + `settings.json` 的 12 条命令 + 三处计数口径，零功能收益。**裁定 = 不搬**，可读性由 `hook-registry.md` 首行的目录职责声明兑现（成本账与实测引用数见 `migration-map.json` 的 `_of: 9.2.1` 条目）。
- **三条 v9.4.0 裁定（已量过，勿再议）**：① **不把执行体换成 shell / perl**——能力其实够（Git-Bash 自带 `brotli.exe`，解压与 Node 逐字节同 SHA256；`perl 5.38.2` 带 `JSON::PP`/`Digest::SHA`），否决是方向性的：换底座不解决"宿主 spawn 得到吗"，只是把赌注从"用户装的 node"挪到"宿主内部怎么起进程"；且该结构 v9.0.0 已试删过一次（删前 bash 腿是"3 个有拦截力 + 7 个 exit 0 占位，而旧 shell 校验器只数文件数故占位版照样 PASS"）。② **不在阶段 A 自动装 Node**——App 不提供可独立调用的 `node.exe`，安装器改的 PATH 也不被已运行的进程读到，装了本会话仍零拦截力；"AI 代装"只可作为用户选定次选且卡片须写"只救阶段 A"。③ **stop-verify 不写项目文档**——footer 的镜像义务归同步，破例会让文档出现第二个写入者；已知成本（每轮多一次同步闭合滞后）按现状接受，v9.2.1 的"恰为 `{live_profile_drift}` 时不唤醒"已把打断降到零。三条的实测账目见 `migration-map.json` 的 `_of: 9.4.0` 条目。
- **唯一编辑源**：本目录 `better-coding/`（SKILL 源库）。项目内 `.qoder/skills/better-coding/` 是它的**安装副本**，不直接编辑；改完由 `/harness-upgrade`（升级回源）或整目录复制回刷新。
- **双副本一致性校验**（怀疑两副本漂移时跑，差集应为空）：

```
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compare-Object (Get-ChildItem <库根> -Recurse -File | ForEach-Object { $_.FullName.Substring(<库根>.Length) + '|' + (Get-FileHash $_.FullName).Hash }) (Get-ChildItem <项目>\.qoder\skills\better-coding -Recurse -File | ForEach-Object { $_.FullName.Substring((<项目> + '\.qoder\skills\better-coding').Length) + '|' + (Get-FileHash $_.FullName).Hash })"
```

- **计数台账单源**：组件数量只写 `manifest.json#componentCounts` 与 `migration-map.json#finalCounts` 两处（必须一致）+ 各自 Note 字段说明口径差；SKILL.md/README 不再复制具体数字。
- **排障：非本项目来源的 hook 报错甄别**。若会话中出现指向其他项目路径的报错（典型：某条 `[Hook] Err: ...` 的路径不在当前工作区、或报 `missing end match` 而本仓库内 `grep` 不到该函数名），则它来自用户级/IDE 侧残留的 hook 注册，与本项目 Harness 无关：先核 `\.qoder\settings.json` 与用户级 `~/.qoder/`、`~/.qoder-cn/` 配置里是否引用了已删除或他项目的脚本，清理该注册即可；不要试图通过改本库代码“修好”它，也不要因此判定初始化失败（本库组件是否正常以 `harness-verify` 退出码与输出为准）。
- **改脚本的编码与换行口径**（v9.0.0 单语言化后重写）：库内脚本一律 `.mjs`（UTF-8 无 BOM + LF）。旧的双实现同代维护负担已随 Task 3.4 删除孪生而消失；`L1-techstack/*/hooks/` 下最后 3 个从未注册的栈级占位脚本也已随 Task 5.6 删除，库内 `.ps1` / `.sh` 自此归零。两条仍然承重的事实：① 若将来因宿主适配需要新增 `.ps1`，必须 UTF-8 with BOM（PS 5.1 无 BOM 会按 GBK 解码中文，实测导致比对假阴性）；② `.gitattributes` 的 `* -text` 不许动（本机 `core.autocrlf=true` 会把 LF 文件在 checkout 时改成 CRLF，Node 脚本与逐字比对基准的行尾同样会被破坏）——v9.5.0 S3 起这份钉改为**按需写**（无仓库且 git 方式未定时装机不再落这个文件），但"有仓库就一定得有它"改由双层守：判据 `git_ready`（缺即 FAIL）+ `pre-commit-lint`（提交前见仓库无钉即 `exit 2`）。同一批新增四条 git 边界裁定：**不代跑 `git init`、不代配全局身份、不代推送、不把令牌写进 remote URL**，全集与取值域只在 `manifest#gitGovernance`（本文只指不抄）。
- **大资产事实**：面板相关的两处体积现在是——分发侧引擎 `assets/templates/docs/PROJECT-LIVE.bundle.js.br`（brotli 压缩 **545,624B**；明文 2,916,204B 不再随库分发，首次拼接时按需膨胀进 `~/.qoder-cn/cache/better-coding/` 并按 SHA256 校验复用）与项目内成品 `docs/PROJECT-LIVE.html`（实测 **2,963,399B ≈ 2.96MB**）。引擎不注入项目，但随 SKILL 安装副本入仓，所以同时存在编辑源库副本与 `.qoder/skills/better-coding` 安装副本的工作区会有两份库内容。`.gitattributes` 已把面板产物按二进制处理（`-diff binary linguist-generated`），重建面板不再产生 3MB 级文本 diff。

## 八、版本与升级

- **当前版本**：**9.12.0**（见 manifest.json）。v9.12.0 = **缺陷修复批**（外部评估报告第一期 52 项全量落地；🔴 **判据仍 46 条，一条未增未删**；阈值 8000/45KB/160-1200/900-300/30000ms 一个没动；步骤提示词正文一字未加）。一处致命：**一份坏 `package.json` 击穿整个 46 条判据门禁**——`prototype_visual_floor` 里的裸 `JSON.parse` 抛出后 status 行与判据行总数实测为 **0**，即"无关文件的一个字节问题让全部门禁集体失声"；修法是 try/catch + 降级按 `<svg>` 计数，警告写进**该行 detail 而非 hits**（JSON 病不许伪装成视觉缺陷），并如实标"本行是未验证不是已通过"。两处高危：`--workflow` 命中恰好 1 条时 `hit.slice` 在 undefined 上抛错（用户写 `01` 这种**合法简写**看到的是堆栈而不是执行）。六处中危含 🔴 **评估报告自己开的药方是错的**——它建议格式化 hook 改 `shell:false`，而 Node v24/win32 实测对 `.cmd` 垫片直接 `EINVAL`，`which()`/`binIn()` 按 `PATHEXT` 返回的正是垫片，照做等于把"低概率注入"换成"格式化必然故障"；真修法是路径双闸（越界 + shell 元字符）+ prettier 走 `process.execPath` 与 `prettier/bin/prettier.cjs` JS 入口绕开垫片。十二处低危（🔴 报告 chapter 八 原本一条建议都没给，是报告的自缺陷）三条属"结构性看不见"型：`existsSync(root/.git)` 只看一层 ⇒ monorepo 下精确判定退化成 7 天 mtime 猜测；`pre-merge-review` 硬写 `main/master` ⇒ 主干叫 develop 时"变更统计"静默消失；`.gitattributes` 承重两行有 **4 份硬编码而 manifest 自述"只在本文"**——没让钩子热路径运行时读 manifest（用户级安装下它可合法缺席，读不到即 die 会把 `pre-commit-lint` 变成新故障源），改给 `literal_single_source` 加第③段机检三份字面量与台账同值，并**反向验证**：改台账一行 → 判据当场红并点名三个文件。内容互斥批的关键转折是 🔴 **打击面实测比方案写的宽**：覆盖率七个值（60/70/75/80/85/90/100）真实落点有 ~20 处而非 3 处，逐点重写属 P3-39 重构不属修缺陷，故改为在权威源本身（SPEC-TEST §4.2）加"单源声明"、把 L0/L1 写死数字统一降格为"未定稿前的缺省初值"——**1 处声明止住 20 处打脸**，机器可核对的单源化如实挂账。另有两处"修法本身是缺陷"：官方 skill 原文明写 `scope` 块 "parsed, reported as a warning, and then ignored. **Do not write one.**"，而方案初版与库内注释都在教人写它（顺带查出报告漏掉的 N-1）；16 条规则的逗号 glob 经探针项目实测判为**非缺陷出列**（宿主自写的加载记录证明逗号串被正确拆开、规则一直在正常注入），"改缩进列表"的判断作废——照改会重写 16 个文件、牵动常驻预算与多处口径，把本来能用的东西动一遍。按用户裁定删除"项目宪法"模板：🔴 方案原写"7 处引用点"、实测 **9 处**，漏掉的两处比模板本身要紧（release 门禁里一条**无人能勾**的可勾选项 + 升级协议里的模板计数）。**台账**（🔴 本版真正的高风险项是记账本身）：分发集 **240 → 245**（+3 许可件 / −1 宪法 / −1 孤儿示例，🔴 再 **+3 仓库卫生件** `LICENSE`·`.gitignore`·`.gitattributes`——为公开发布所加，MIT 正文署名 TheChenV；实测**不进阶段 A 复制清单**，装机件三件全无、`copied` 仍 125），而宣称的 240 本身是旧的——v9.11.0 称"分发集 240 不变、零新增落盘件"，实际该批新增 `CHANGELOG.md` 未入账、磁盘当时已是 241，按本库纪律**不回改历史条目**只在此校正；`copied` 123→**125**、`skills-allfiles` 71→74、`docs/harness-templates/` 12→11、`L0_specTemplates`/`finalCounts.specTemplates` 11→10、`always_on_budget` 6266→6296/8000（+30 字是全批唯一动常驻面的一处，余量 1704）、`retiredComponents` 1→**9**、`AUDIENCE.artifact` 10→12、`die()` 原因枚举与 A.5 白话表同步 +1（🔴 该库有"枚举三处同批"纪律，漏一处就是新脱账）、migrations 85→86。新发现三条如实挂账不假装修完：**N-3** 两个 `references/` 文件带 UTF-8 BOM——本库 `byte_hygiene` 判据断言"BOM 0"却只在装机后的项目侧跑、**从不回扫库自己**，判据设计对而射程缺一半；**N-4** 六份栈计划的版权行模板 `Copyright (c) __YEAR__-__DATE__` 必然渲染成 `2026-2026-10-14` 重复串（17 处命中），本版**未修**待裁定；**N-5** `CHANGELOG.md:3` 出处声明已失实（称内容逐字来自 `manifest#description`，实测该字段现是 85 字的库描述），本版一并修。实施过程另有两处自造冲突当场纠出留档：给 L2 写优先级时先误写"本文件 > SPEC-API"（与刚定的权威源打脸），以及 `/harness-upgrade` 抽取命令的版本号比较器——把版本号当字符串或"连接后右补零"比都会把 9.4.0 判成高于 9.10.0（命中 15 条历史），正解是逐段补零到 3 位。⚠️ 只在 Windows 实测，非 Windows 侧标注「未实测」且本批无法消除。逐条资产见 `migration-map.json` 的 `_of: 9.12.0` 条目。
- **v9.11.0**（历史）（见 manifest.json）。v9.11.0 = 交互原型的设计情报接线与视觉底线批：**判据行 45→46**（新增 `prototype_visual_floor`，一条判据机检八件——真 SVG 图标／字阶≥4／间距阶≥4／圆角阶≥3／海拔阶≥2／正文行长上限且要求 Vite 工程与 `预览.html` 两份同宽／焦点可见／有动效声明才要求 `prefers-reduced-motion`），归 `AUDIENCE.artifact` 9→10。动因是用户在 Work010 实测环节 1·3：原型被属主**两度判不合格**（不美观、布局奇怪、图标差、两个 HTML 不知点哪个）而 45 条判据每轮全绿——库里 grep 视觉类判据 **0 命中**，失败零留痕。根因不是执行失误是口径与接线：`ui-design` 保真度分层表原文写着 1·3「图标占位」，被忠实执行成 Unicode 字形顶替（原型 `<svg>` 出现 0 次，回收站用 ␡ 于是渲染成英文字面「DEL」），而 `ui-ux-pro-max` 规则 4 明写「应避免 emoji 当图标」——**规则在场无人执行**；同库的 `ui-ux-pro-max`（46 文件）自 v9.0.0 起装进每个项目，1·3 执行引擎却一个字没引用它（真环境 audit grep `search.py` **0 命中**）。五处整改：**S0** 界定「低保真＝视觉决策尚未定稿，不是可以不好看」，把没有承担者的「美化不可省」换成六条底线 + 界面文案纪律（每条当场写明承担者）；**S1** 新增步骤 **P2.5 取设计基调**（检索出 `design-system/{项目代号}/MASTER.md`，必须含 Color/Type/**Layout 带 ASCII 框线图**/Principles 四块，登记进既有 `knownDocs` 不新增字段）；**S5** 新增**两维度投入度**判定（体系底座恒开、独一性与文案按品类调档、判不出发卡**不设默认值**）——依据是实测撞车：库给 notebase 推荐的奶油 `#FFFBEB` + 琥珀 `#D97706` 正是上游设计 skill 点名的「AI 生成页默认特征 #1」，故「属主裁定优先」由礼貌规则升为**正确性规则**；**S4** 新增 **1·3 视觉收口卡 8 问**，把「拒于第几问 + 属主原话」记进项目交接，环节 4 才读得到；**S3** 入口唯一（骨架补 `vite.config.ts` 令 base 取相对值、删「或直接双击入口 HTML」那句把用户推向白屏的指引、**扩 `preview_self_contained` 扫描对象而非另加判据**——它文案本就写着「离线双击会白屏」却只扫 `预览.html` 一个文件名）。**分发集 240 不变、`copied` 123 不变、`componentCounts` 六维不变、`always_on_budget` 6266/8000 零新增文字、migrations 84→85、阈值 8000/45KB/160-1200/900-300 一个没动。** 🔴 已知局限如实登记：本条只判「在场」判不了「好看」（声明 4 个 `--text-*` 而页面不引用也能过），真兜底是收口卡；Tailwind 内建字阶会被误判字阶 0 档，本批刻意不加豁免（写错的豁免会从 FAIL 退化成永久 SKIP），挂账 D2。`frontend-design` 本体不入库（Apache-2.0 条款已在场但 LICENSE 的 APPENDIX 被裁、无署名许可方 ⇒ 写不出真实 `data-provenance.json`），只吸收其方法成库内纪律，挂账 D1；另挂 D3（布局采方法弃模板）、D4（投入度判错无门禁可见）。⚠️ 只在 Windows 实测，非 Windows 侧标注「未实测」。逐条资产见 `migration-map.json` 的 `_of: 9.11.0` 条目。
- **v9.10.0**（历史）（见 manifest.json）。v9.10.0 = 应用清单单源 + 占位回填门禁 + 字节层体检：**判据行 42→45**（新增 `byte_hygiene`——一律 Buffer 直读核双回车/BOM/frontmatter 首行，补上"校验器自己的 `readText` 把 `\r\n` 归一、于是 `\r\r\n` 对判据永久隐形而宿主整段读不到 frontmatter"这一类盲区；新增 `apps_single_source`——应用清单唯一权威＝新字段 `profile.project.apps`；新增 `binding_stale`——权威值已在场却仍留 `{占位}` 的下游提示词判红）；骨架『参数绑定表』加第 4 列「机检」并与代码侧谓词双向对账；1·2 的「前序产出」不再挂应用清单、值段禁复述分类。v9.9.0 = 文件名大小写防漂 + 真环境同步反馈整改批：**判据行 41→42**（新增 `filename_case`——只认 `readdirSync` 的磁盘真名，禁止用"能否打开"定案；另给 `maturity_vs_disk` 补反向断言）、新增 `manifest#loadBearingFiles` 作为承重文件名单的唯一事实源（阶段 A 对账与该校验共用）、阶段 A 落盘前自动两跳纠名且逐字节校验"只改名不改内容"（摘要新增 `case_fixed`）；并把 Work008 那次 MRD 3 步同步会话复验出的 8+1 条缺陷就地修掉：`prompt_params` 的标签白名单认不出在用标签（**认真绑定必红、占位与真值双写反而绿**）→ 改动态回溯 + 双写判红、`prompt_path_stale` 顿号口径不一致、`always_on_budget` 混算框架自有与项目自长且无顶格策略、`verify_stamp` 把"本会话还没 Stop 过"断成故障并建议重启 Qoder、footer 无权威值时缺合法写法、`auto-finalize` 的 history 逗号落在行首、AI 整文件重写 profile 会抹掉 hook 的结果。历史项目不回刷（用户裁定）；阈值 8000/45KB/160-1200/900-300 仍一个没动、分发集 240 不变。
- **v9.8.0**（历史）（见 manifest.json）。v9.8.0 = 定稿自动化与 3 步同步解耦批，**判据行 40→41**（新增 `sync_freshness`：承重交付物落盘时间晚于 `sync.lastSyncAt` 即 FAIL）、**hook 子命令 10→11**（新增 `auto-finalize`，只写 `maturity.mrd/prd` 与 `history`）、migrations +2、分发集 240 不变、阈值 8000/45KB/160-1200/900-300 一个没动。动因是用户异地实测：MRD 产出后 AI 回「3 步同步我压住了，等你说定稿锁定再跑」——1·1 提示词里「我说定稿锁定之前不要进下一步」与同块「做完之后：自动同步进度」「完成后：3 步同步」同块冲突且无优先级裁决，而「定稿锁定」一个词同时压着「内容口径冻结」（该用户裁定）与「流程位推进」（纯机械事实）两件事，用户一沉默，三本账跟着一起冻，且这份滞后对既有 40 条判据**完全隐形**（全在比"账本 vs 账本"）。改法按五裁定三层齐下：话术拆开两义 + 常驻规则加 1 行裁决 + 脚本按磁盘事实登记机械位 + 新判据让漏记同步不再零代价（同一漂移指纹只唤醒一次，`HARNESS_SYNC_REWAKE=0` 可降级为只留红字）。附带补齐两处"从无出处"的即兴动作：`maturity.mrd` 的赋值规则、9 份规格模板状态行「已批准/已冻结」由谁在何时写。不动的部分：需要用户裁定的内容类提问（代号、名单、差异、分诊、部署清单、改规则）照旧问，且不自动开跑下一环节——仍由用户复制提示词驱动，只保证提示词一定已回填好。
- **v9.7.0**（历史）（见 manifest.json）。v9.7.0 = AGENTS.md 初始化产物合规整改批，**判据行 38→40**（新增 `agents_context_budget` + `agents_command_fill`，分组 12|8|18 → 14|8|18）、组件计数 rules 15→16（落盘 16→17）、`copied` 122→123、分发集 239→240、migrations +2、阈值 160-1200 / 900-300 / 45KB / 8000 一个没动。动因是用户实测装机产物：生成的 AGENTS.md 133 行、非空 87 行里 46% 是零信息行（23 行待检测 + 17 行元信息），其中「运行时前置」一节 829 字讲的全是框架故障模式（占全文中文 22%），而 `agents_fields` 仍报「10/10 sections present」——那数字是硬写的，required 只有 8 项，且子串匹配下把整个「禁区」节删掉照样绿。改法按四项裁定：R1 空节与待检测保持现状（⇒ 本版不引入任何把占位判红的判据，官方 C 里「生成内容未经人工确认」仍未解，属已知被接受的上限）；R2 命令表由脚本按 package.json scripts / 栈信号 + techstack-commands.json 代填真命令（含【 或 CJK 的值一律不可用，禁把 _fallback 占位串写成命令），把「脚本不猜项目内容」收窄为「不猜语义」；R3 运行时前置压 2 行、细节外迁新 L0 规则 harness-runtime-gates.md（model_decision ⇒ 不进 8000 常驻预算，减的是真常驻量）；R4 只管新项目，两条新判据一律按文件内 `harness:agents-schema:2` 机器标记门控（不得用 profile.skillVersion 推断——老项目重跑阶段 A 会刷它而 AGENTS.md 仍是旧式），缺标记走 PASS (SKIP) 计入未验证。同时补：目录扫描不再列 .qoder 与 docs（框架自有且可发现＝官方评审的目录清单反模式）、「规范优先级」由错误的四层运行时序改为按实际装载序的三层（补用户级、删「L1 覆盖 L0」的伪含义）、AGENTS.md **不并入** 8000 常驻预算（实测 5780/8000 + AGENTS.md 约 3100 字会让每个现存项目当场 FAIL）改单独立限、component_counts 补缺件处置话术但判定不放宽。顺带修两处存量缺陷：sync-scope 日志把相对字面量喂给 rel() 导致 CWD≠项目根时打印假路径；命令表代填后 agentsSelfFilled 只认项目结构一句中文会把框架自填说成用户定制。⚠️ 只在 Windows 实测。
- **v9.6.1**（历史）（见 manifest.json）。v9.6.1 = 报告"按事实生成"批，**判据行 37→38**（新增 `report_reason_coverage`）、阈值 160-1200 / 900-300 / 45KB / 8000 一个没动、`copied=122` 与组件六维不变、分发 239 不变、1·1 提示词一字未改。动因是用户真机实装 v9.6.0 撞上的三件事：① 19 行树在聊天里糊成一行（模板从没规定排版）；② AI 在模板前自加导语，于是"校验通过"被宣告两遍、还漏出 `status: PASS`；③ **固定首屏文案本身就是漏洞**——面板没拼出来时，写死的"双击即开"是假话，而失败态有 18 种、态表永远漏第 19 种。改法：`A.5` 整节重写为**六槽形状 + 每槽取数**，模板里不再留任何可照抄的结论（唯一固定文本是明细文件路径那一行）；结论行的 `✅/⚠️` 由「执行器打印串 + 校验 status + 产物 stat」三件事实推导，三件没全好就不许 ✅；**结构树取"应落盘清单 ∩ 磁盘实存"**，让虚报在结构上不可能；"没做成的事"逐条点名差集与非 PASS 行，且条数须等于校验的 SKIP+WARNING 数（集合断言，不再断言字数行数——v9.6.0 的"首屏 1678 字/树 19 行"两条自检本批作废）。同时给 18 种失败/未完成态各配一句人话（`A.5-④`），并加**唯一一条新判据**做静态对账：谁新增失败原因却忘了配人话，当场 FAIL 点名（两侧都是仓库文本，第一轮就闭得上，不属"要本次运行自己产出证据"那类自锁判据）。顺带清掉三处写死条数/序号的脱账点，并把"输出令牌唯三"改准为"三主令牌 + 一前置串"。⚠️ 只在 Windows 实测；"AI 真会按六槽说"属宿主行为，只能文本自检 + 真机复核。逐条资产见 `migration-map.json` 的 `_of: 9.6.1` 条目。
- **v9.6.0**（历史）（见 manifest.json）。v9.6.0 = 可读性批，**判据行仍 37、阈值 160-1200 / 900-300 / 45KB / 8000 一个没动、分发文件仍 239、`copied=122` 与组件计数六维不变**。四件事：① **阶段 A 汇报换形为两段制**——会话首屏说人话（目录树 + 四个核心文件 + 下一步，实测 1678 字），完整计数与逐项自检结果落 `.qoder/logs/init-report.md`；`SKILL.md` 执行序第 4 步不再要求把 `customized_skipped`/`profile_preserved`/`stubs` 原文甩给用户，改判"三件事说清没有"，禁词表射程延伸到会话汇报。**脚本 stdout 与校验行文案一字未改**：这是换载体，不是降披露。② **1·1 提示词**：`{一句话想法}` 提到首行、材料槽预填「无」（实测空 `{}` 对占位扫描与绑定正则双双不可见，且 AI 会读成"漏填"跑去翻目录 → 空态必须是词不能是洞）、悬空的"项目代号：用于…文件名"删掉。③ **专家面板从配额改成候选池**：实派 3-6 位由用户 Q1 选定后才派遣、项目代号改 Q2 必问，`create-proposal` 里 `:100`「以 profile 裁剪」⟂ `:110`「以提示词为准」这对互斥表述裁决掉——正是它把 AI 逼成"原样派遣、只在会话里暗改产出重心"。④ **漂移护栏换形**：旧"内联关注点逐字复制默认表"实测 **6/6 行早已不一致且无任何判据守着**，改判"实际名单必须登记进 MRD 头部"；`MRD-template` §8.2 那第三份关注点副本一并砍掉。⚠️ 已知代价：1·1 计容 879→1104 字（越 900 目标带，只披露不判红；披露数 14/22→15/22），距 1200 硬顶只剩 96 字——后续再加字必须先在**豁免的专家清单段**里找位置。另校正三处上一批遗留脱账数字（旧"最长 1171 字（5·2）"实为 6·1 的 1194）。⚠️ 只在 Windows 实测。逐条资产见 `migration-map.json` 的 `_of: 9.6.0` 条目。
- **v9.5.0**（历史）（见 manifest.json）。v9.5.0 = git 机制治理：`profile.git` 成为 git 状态唯一机器权威源（`mode` 三档 `none`/`local`/`remote` 由**用户选**，装机只探测不决策、问不到就 `pending` 不设默认值），判据行 **36→37** 新增 `git_ready`（八格矩阵，有仓库缺行尾钉即 FAIL），阶段 A **不再无条件在项目根写 `.gitattributes`**（改按需写 + `pre-commit-lint` 提交前即时守门 + 判据兜底；残余窗口如实记于 migration-map 的 `_of: 9.5.0`），`hasGitRepo` 换成逐级上溯的 `findGitRoot`（修 monorepo 下三道门禁集体误报「零拦截力」），`/branch-workflow` 补 Step 0 建仓四查与 Step 9 换远程并去掉写死的 `main`/`origin`，`.gitignore` 模板 5 份进库但**不落盘**（分发集 234→239、`copied=122` 与组件计数六维不变），stop-verify 首跑自锁修好（`verify.stamp` 先落 started 行再补收尾行）。提示词面一字未加（实测 6·1 距 1200 硬上限只剩 6 字）。⚠️ 只在 Windows 实测。逐条资产见 `migration-map.json` 的 `_of: 9.5.0` 条目。
- **v9.4.0**（历史）（见 manifest.json）。v9.4.0 = 运行时门槛 + 首次同步脚本化 + 判据诚实化，组件计数六维不变、判据行仍 36、copied 仍 122。三件事最值得知道：① 装机前先真探活（`harness.mjs selftest` 在任何写入之前跑，失败即零落盘；旧的 `node=OK` 是恒真自证，已降为不计数自证行），且"宿主 spawn 不到解释器 ⇒ 全部 hook 静默空转（退出码 127 而契约只认 2）"这一类故障不再只表现为绿色 SKIP——两条心跳判据加了期限（装机超 24h 无心跳即 FAIL），"有心跳却无 verify.stamp"由 WARNING 升 FAIL；汇总新增「已验 N｜未验证 M」，未验证不再与通过同色。② 首次同步里**确定性**的部分改由执行器代做（它本来在 S0 就已扫过根目录，却把"项目结构"派给 AI 再算一遍），三处文档同写一句硬约束防止被读成"以后同步都能省"。③ 阶段 A 不再预建 `docs/test/`、`references/ui/`、`.qoder/repowiki/wiki_plan.yaml`（三处从未被清单或计数登记的脱账落盘物），并配有防回潮哨兵。⚠️ 只在 Windows 实测；`costBudget.perProjectAssemblyFiles` 因测量配方未成文而**保持原值不动**。逐条变更资产见 migration-map.json 的 _of: 9.4.0 条目。
- **v9.3.0**（历史）：v9.3.0 是「拿真实初始化当测试场」实测出来的一批：组件计数六维不变、分发集仍 234 文件、判据行 35→36。八件事——① verify_stamp 无 SessionStart 心跳时判 SKIP（与 rules_loaded_stamp 同口径：此前同一成因两种结论，初始化报告里唯一那条黄字就是它）；② 阶段 A 新建件时间戳归一到运行时刻（此前 docs/项目交接.md 显示模板生成日，按修改时间排序会被判「没生成」）；③ 追加 .gitattributes 时回显「非 git 仓库、为将来 git init 预备」；④ **脚本层改走框架通道**：普通重跑阶段 A 时项目内旧脚本会被误判「用户定制」并跳过，升级后继续跑旧校验器、新判据落不进去（实测复现并修好，被换下内容自动存进 .qoder/logs/backup/scripts/）；⑤ 首次同步条件化：phase-a-init 生成 .qoder/logs/sync-scope.json 声明本次可填项与免重渲分区，三步流程一条不删、只收渲染范围（空项目上手册 22 段无事实可绑定、面板三图无拓扑依据，读掉 81KB 手册再原样放回是纯仪式）；⑥ build-panel 新增 V8 数据块 lint（7 项子判据逐个用最小合成块实测能报点），并撤销初始化期的浏览器截图人工核对项——初始化时三图是模板占位图，看一眼不会得到新信息；⑦ 校验报告呈现三分面（项目状态 11 / 文档产物 8 / 库一致性 17）+ --brief，**一条判据都不跳**（全跑约 200ms，砍判据是白亏；单行格式逐字节不变因为 stop-verify 按它解析）；⑧ 新增 literal_single_source 跨文件字面量对账，它先抓到我自己的两个问题：两本账键名不同域（短键 rules 对长键 L0_rules）导致「两处必须一致」此前只是散文承诺，以及一处文档写了 V1/V3/V4/V6/V7 却没提 V8。同批把 SKILL.md 由 210 行收敛到 153 行（删的是重复表述，每处改指唯一权威文件并跑对账验证未丢事实）。⚠️ 只在 Windows 实测，非 Windows 侧结论仍标「未实测」。逐条变更资产见 migration-map.json 的 _of: 9.3.0 条目。
- **v9.2.x**（历史）：v9.2.0 提示词双视角换轨与 v9.2.1 hooks 纠偏，本文不逐条重述——台账唯一事实源是 migration-map.json 的 _of: 9.2.0 / _of: 9.2.1 条目（重述即造第二事实源，正是本框架要杀的双源）。
- **v9.1.2**（历史）：交付面收敛：应用户指令把开发侧工装 `tools/` 整目录移出本库交付面（205 条回归断言、198 条判据基线快照、手册构建器、度量产地、等价性配方、面板引擎构建工程），恢复只能 `git checkout c4dbbd3 -- tools`（⚠️ 该承诺以仓库存在 `.git` 为前提：在没有 .git 的工作区里这条恢复路径不存在，tools/ 即不可回取）。动因是真实误报而非洁癖——项目侧 `tool_names` 把安装副本内 `tools/baseline.json` 的幽灵名计数当指令面判红（每个装了本库的项目每轮 Stop 一条假 FAIL），而库侧同名判据按 `libFind` 排除 `./tools/`：两侧扫描域不一致。**没有改任何判据或阈值来让这条红消失**，选择移出工装是最保守的收敛法。4 处指向构建期工装的交付文档同步改口径，README §七 加一条总说明。随库能力零影响（实测：`REQUIRED_ASSETS` 不含 tools/、5 个落盘脚本无一处读它、活体配方本就跑在不含 tools/ 的安装面上）。组件计数六维不变、分发集 234 文件 / ≈3.5MB（量级表述：本版是最后一次机器采集，此后库内已无采集器）。⚠️ 本版起库内不再有自动回归能力；非 Windows 侧仍标注「未实测」。
- **v9.1.1**（历史）（见 `manifest.json`）。v9.1.1 裁定批落地（组件计数六维不变、判据基线零变更）：**D7 撤销「整文件 ≤45KB」手册目标**（用户裁定；被撤原文两条逐字留在 `migration-map.json` 的 `_of: 9.1.1` 条目），保留的「非提示词部分 ≤45KB」从 WARNING **升为落盘硬判据**（母本实测 27KB / 预算 45KB，45KB 这个数未放宽）；**D8 成本口径改判每项目装配落盘数**（`manifest.costBudget.perProjectAssemblyFiles` = 125，实测 124），仓库文件数降为参考值；**D15 字数带真正「不含专家清单」**并由新断言比较两份字面（正则 + 语义哨兵）咬住三方同源，实测出骨架声明的 8 个内联触点只有 1·1 真有统一格式清单段（落差持续显形不静默）；**D10 `hook_stubs` 回显显式放行分支**（活体 5 个，从项目自己的 harness.mjs 现算）；**D12 `--fast` 三处去歧义**并实测行集合 34 vs 34 相同；**D13 落盘脚本冒烟进默认套件**（`checks/45` 五条，注入真 TDZ 可回显原故障），同批修掉 `checks/33` 被批量替换吃掉的 `msg` 键并给运行器加「缺 msg 视同失败」不变式；**Batch 4 五项人工验收**（小队 / 非 Windows / 断网双击 / U3 两键探活 / 用户级安装）按裁定整体标「未验证」收口。断言 199 → **205**（+5 冒烟、+1 同源）。⚠️ 只在 Windows 实测，非 Windows 侧标注「未实测」。旧项目升级动作见 `migration-map.json` 的 `_of: 9.1.1` 条目。
- **v9.1.0**（历史）（见 `manifest.json`）。v9.1.0 TDD 退场转纯 SDD（组件计数 skills 27→26、分发集 234 文件 / 3.49MB、每项目装配落盘 124；**判据基线零变更**）：删除 L0 skill `hc-tdd-cycle`，「每层先写测试」的顺序律改为规格验收驱动（判据取自 SPEC + 每层留证据），**缺陷修复的复现纪律明确保留**（它不是 TDD，且冻在判据基线里），话术层清零并常驻防回潮；同批补上 `preview_self_contained` / `retired_component_residue` 两条落盘判定、G2/G3 留痕指向交接面、面板初态三视图结构分化、SPEC-TEST 示例与模板同代、拓扑节点名加引号、`checks/39` 变异 runner；两项口径经用户裁定落地：**A4** 实测「面板面积较 dagre 缩小 ≥20%」不成立（同图 A/B 实得 5.3%），该分句降为「ELK 已启用的旁证」、未调阈值；**D8** 成本口径改判为每项目装配落盘数 ≤125（实测 124；判据 `cost-metric-is-per-project-assembly`，阈值取自 `manifest.costBudget`），仓库分发文件数降为参考值。旧项目升级动作见 `migration-map.json` 的 `_of: 9.1.0` 条目。⚠️ 只在 Windows 实测，非 Windows 侧标注「未实测」。
- **v9.0.0**（历史）：v9.0.0 单语言化与指令面换轨（**破坏性变更**，旧项目升级动作序见 `migration-map.json` 的 `_of: 9.0.0` 条目）：① 库内 13 个 hook 脚本孪生（10 `.hook.ps1` + 3 `.hook.sh`）全部删除，全部注册 hook 收敛为唯一可执行入口 `node .qoder/scripts/harness.mjs hook <子命令>`，两份 settings 模板的 `command` 随之统一（修 M3①：写死 `powershell.exe` 会让非 Windows 项目拿到 0 个 hook 执行；修 E5：旧 `.sh` 侧 10 个 hook 有 7 个是 `exit 0` 空壳）；② `harness-verify` / `build-panel` / `phase-a-init` 三对孪生收敛为 `.mjs` 单份，双实现才有的两类缺陷载体随之消失（B1 bash 侧 `head` 触发 SIGPIPE 假 FAIL、B2 PowerShell 注入面与 GBK 解码崩）；③ **脚本层进组件台账**：`componentCounts.scripts` / `finalCounts.scripts` = 5，harness-verify V1 除数量对账外把项目内残留的 `scripts/*.ps1|*.sh` 判为"残留已删资产"FAIL；④ hooks 计数口径由"文件数"改为"`settings.json` 注册 command 数"，与落盘文件数彻底解耦；⑤ 旧实现行为真值在删除前冻结为可提交基准（`tools/fixtures/`：`hook-baseline/` 20 格 + `ask-card-baseline.json` 16 格 + `stop-verify-baseline.json` 7 形），等价性闸门自此比对**历史事实**而非"新实现 == 新实现"；⑥ 指令面同步换轨（M3① 的另一半：文件删了而文档还在教模型现写 shell hook），并新增 `hook-twin-instructions-retired` 断言卡住回潮。⚠️ 本轮整改只在 Windows 实测，非 Windows 侧结论一律标注"未实测"。v8.5.0 规则扩展名换轨与 L0 规则层收敛：44 个 `*.mdc` → `*.md`（`git mv` 保历史；新版运行时只加载小写 `.md` 且扫描器不做 `toLowerCase`，此前这批规则**从未注入过**）；L0 rules 17→15（`documentation-sync` 正文并入 `spec-before-code`，`mock-switch-convention` 3.2KB 下沉至 `integrate-modules` skill）；新增 `rules.stamp` + `InstructionsLoaded` 落戳，为"规则真的进了上下文"提供可核对的证据；升级协议补 U.3b（历史条目按 `manifest.rulesExtensions` 做 `.mdc`/`.md` 别名重放，两种都不存在记 SKIPPED 而非 FAIL）。v8.3.0 阶段 A 加固（新增 `phase-a-init.ps1/.sh` 与 `harness-profile.template.json` 共 3 个资产，组件计数不变）：P0-1 新增「提问优先级裁决」（修 P1 零提问与边界#4 确认后执行的规则冲突——阶段 A 清单展示改为非阻断，发卡限定三类）；P0-2 复制前 SHA256 比对，用户定制文件默认跳过（原 `Copy-Item -Force` 二次初始化会静默覆盖，现兑现 A.1 与边界#1）；P1-1 A.2 的 70 行需重抄正文物化为脚本，并修正 `skills-allfiles` 对账未排除 `.qoder/skills/better-coding` 自身导致的必 FAIL（空白项目夹具实测未暴露）；P1-2 Check 1 占位符字符类扩展 `{{TOKEN}}` + 模板机械字段 token 化（修“忘填日期也能 PASS”的假完整性）；P1-3 新增 Check 7d `live_profile_drift`（FAIL 级）：同步日期/校验计数/校验结论与 profile 权威值等值断言（拦 stop-verify hook 回写后文档滞后一个周期）；P1-4 stop-verify hook 改文本级定点回写 + 写前回读校验（不再 `ConvertTo-Json` 整文件重排，消除每会话全文件 diff 噪音与 -Depth 截断风险）；P1-5 profile 模板资产化（AI 不再手写 50 行 JSON）；P1-6 AI 现写脚本纪律成文（临时件只落 `.qoder/logs/tmp/`、现写 `.ps1` 必须带 BOM 或只含 ASCII、判定只靠退出码与文件读回、严禁 `-Command` 内联带 `$` 变量）；P2 能力计数单源化、大资产 LFS 指引扩至库侧 bundle、README 新增「库维护约定」；旧项目按 `migration-map.json` 的 `_of: 8.3.0` 条目迁移。v8.2.1 最小必要修复（0 新增资产、约 15 处单行级编辑，经三维对抗审计后从原 v8.3.0 方案收敛）：M1 stop-verify hook 无 BOM 写入修复跨平台 profile 解析故障链；M2 AGENTS.md.template 不可实现指令改可实现语义；M3 回写主体归因精确化为 stop-verify hook（消除自相矛盾）；M4 编码指引单一事实源化；M5 删除冗余日期替换指令；M6 Linux/Mac 占位版口径统一并显式披露；M7 telemetry 校验通过次数取值钉住 profile.sync.syncCount；M8 体积常量改量级表述；D9 A.2 内嵌经验证参考脚本正文；D10 -ProjectName 取值优先级成文；D11 面板标题变更 3 步程序 + Check 7a 陷阱警告；D12 A.4 头部机器覆盖项说明；D13 路径口径改抽象前缀（组件计数不变，旧项目按 `migration-map.json` 的 `_of: 8.2.1` 条目迁移）。v8.2.0 骨架压缩与口径同步：`briefing-skeletons.md` 由 84 步压缩为 **29 个步骤子块**（逐环节 3/2/2/6/4/3/2/2/5；环节 1·3 升格为 UI 路线主决策点——决策卡双写 profile.ui.designRoute+evidence，环节 4 的 4·1 降级为复检步，A/B/C/D 四路径执行 + 4·6 收口；环节 6 压缩为 6·1-6·3、环节 7 为 7·1-7·2、环节 9 收敛为 9·1-9·5）；路径 B 环境精确化：Qoder 内自定义配置社区版 figma-developer-mcp（前置 Node≥20+npx）；路径 D 输入包显式化：千问办公输入包 + 对话回流；sdd-gates-checklist.md 门禁检查项下沉至对应步骤子块；测试报告路径统一 `docs/test/spec-{业务}-测试报告.md`（组件计数不变，旧项目按 `migration-map.json` 的 `_of: 8.2.0` 条目迁移）。v8.1.6 环节 1·1 专家团口径修正：MRD 专家团改由主 Agent 兼任 TL（不再复用 planner 为 TL），默认 6 位领域专家设定内联于 1·1 提示词模板（profile.mrdPanelRoles/mrdPanelSize 运行时可收窄/自定义），选择卡契约细节从提示词下沉至 create-proposal 编排五要素与 ask-card-option-quality 规则，专家 subagent 只读产草稿、MRD 由主 Agent 合并落盘（组件计数不变）。v8.1.3 AGENTS.md 单一事实源改造：AGENTS.md 收敛为根目录单一事实源，移除 `.qoder/AGENTS.md` 双写（决策依据：Qoder IDE/CLI 官方文档均确认仅加载根目录 AGENTS.md，agents.md 开放标准亦为项目根目录）；session-start-context hook 删除 `.qoder` 副本 fallback；harness-verify Check 4 主判定对象反转为根目录文件（缺失/缺节升 FAIL，升级动作见 `migration-map.json` 的 `_of: 8.1.3` 条目）。v8.1.2 面板构建脚本化：新建 `scripts/build-panel.ps1/.sh`（完整拼接 / SYNC_DATA 数据块注入双模式，内置 V1-V7 自验）。v8.1.1 选择卡选项质量防线（修复 grill-me 追问「选项值盲选」Bug）：新增全局 always-on 规则 `ask-card-option-quality.mdc`（选择卡渲染契约四要素：label=具体答案值、description=理由与量化影响、超长截评价不截值、中间态固定映射）与 `ask-card-guard` hook（PreToolUse / matcher=AskUserQuestion，启发式检出劣质选项标签，默认警告模式、ASK_CARD_GUARD_BLOCK=1 切硬阻断，双版本 .ps1+.sh）；create-proposal/create-architecture/planner/precode-alignment/briefing-skeletons 选择卡纪律联动强化；组件计数 rules 16→17（落盘 17→18）、hooks 9→10（旧项目按 `migration-map.json` 的 `_of: 8.1.1` 条目迁移）。v8.1.0 环节3 模块设计执行粒度优化（批次调用 + 批内并行 + Provider 先行）：环节3 复数单元由逐模块改为**模块批次**（ARCH 依赖矩阵拓扑分层，同批内模块无相互依赖；N≤5 单批，N>5 或强耦合按依赖子图拆批，深度 review 可退回逐模块）；`/create-module-spec` 入参改 `{模块清单}` 可选多值（Provider 模块 SPEC-API 先行、占位→替换协议、批内无依赖并行 subagent，tasks.md 仍逐模块目录落盘）；提示词手册渲染与治理同步——产出型步骤按批次/模块拆区块（区块数收敛为 批次数+(S-1)）、校验型折叠单区块（`{模块清单}` 多值清单型合并渲染）、3·4 模块间一致性升格两遍校验 + 4 项完整 step_gate；harness-verify Check 7c 修复复数拆区块仅校验首个的 1/M 覆盖缺口（改全部匹配区块逐一校验）并补 labelList「模块清单」；ARCH 模板新增 1.6 节模块级前置信息（依赖矩阵/共享 DTO 归属/错误码分段/事件归属）；组件计数不变（16 rules / 31 skills / 8 agents / 8 commands / 9 hooks / 11 spec 模板 + 1 schemas）（旧项目按 `migration-map.json` 的 `_of: 8.1.0` 条目迁移）。v8.0.0 SDD 融合重构：① 提示词手册与骨架库由 8 环节单步骤改为 **9 环节 × 多步骤子块**（84 个子块，各自可复制提示词 + 对话建议 + next_hint），`docs/PROJECT-LIVE.md` 改为**标题+区块格式**（5 个粗体字段：核心使命/输入物/产出物/对话建议/提示词，环节标题（###）+ 步骤区块（####）+ 步骤 token `N·k`）；② 需求环节改为**可配置专家团**产统一 MRD → 按应用多份统一 PRD → Full-Stack 交互原型工程（新增 `/ui-design`）；③ UI 环节改为 **Step0 四路径**（含**千问办公 QwenWork** 与新增 `ui-to-code` agent）；④ 新增环节 6 联调（`/integrate` + `/integrate-modules` + `mock-switch-convention` 规则）与环节 9 迭代（`/iterate`）；⑤ 新增 `schemas/sdd-artifacts.yaml` 声明式 artifact 依赖图（reference-only），modes/pipelines 降级为其渲染视图；⑥ 全库命令/skill 引用统一为**真实 trigger**。组件计数：16 rules / 31 skills / 8 agents / 8 commands / 9 hooks / 11 spec 模板 + 1 schemas（旧项目按 `migration-map.json` 的 `_of: 8.0.0` 四条条目（add / rewrite / change / profile-field）迁移，存量项目需按新标题+区块格式 + 9 环节标题/步骤区块结构整体重渲 `docs/PROJECT-LIVE.md` workflow 区，并从新模板重新拼接 `docs/PROJECT-LIVE.html`）。历史版本：v7.4.1 删除库级叙事教程 `references/大型项目全流程教程.md`（全流程入门引导改由本 README 与提示词手册承接）；v7.4.0 将可视化面板由手写 SVG + DASH_DATA 契约换轨为 Mermaid+ELK 自动布局（模板 `PROJECT-LIVE.template.html` + 引擎 `PROJECT-LIVE.bundle.js` 双资产，阶段 A 拼接生成仓库内 `docs/PROJECT-LIVE.html`），节点新增状态徽标（待开发/进行中/已完成/存在Bug）。
- **v9.0.0 结构收敛与机械门禁（本次重构主批，与上方单语言化条目同版）**：组件计数 **skills 31→27**（五组聚类合并：骨架脚手架下沉 L1、原型并入 `ui-design`、测试/审查/发布链各自合并、架构类改编排层）、**L0 agents 8→4→3**（planner/developer/test-runner/security-auditor 降为阶段 B 可选装配，`ui-to-code` 随 UI 单路线删除）、**commands 8→6**（`/integrate`、`/iterate` 退役为 skill 指令 + 手册步骤）、**SDD 步骤 29→22**（环节 6 三步合一、环节 8 四件合一、环节 4 六步收两步）、**手册由 5 分区改 3 分区**（遥测分区整块删除，任务上下文另成 `docs/项目交接.md`）；脚本层进组件台账（`componentCounts.scripts` = 5，项目侧 `.qoder/scripts/` 实落 6 个：另含 6.1 的 `contract-drift.mjs`，台账另立维度不并入 `scripts`）。提示词换 §5.3 形状 B（八段白话标签），骨架成为唯一可编辑源、母本转为 `tools/build-manual.mjs` 的生成物（V21 逐字节等值），198 条判据基线冻结可核。UI 设计改**单路线两步**（4·1 定稿含交互原型与视觉方向、4·2 还原核对），不再接 Figma、不收参考图、不依赖外部设计工具。吸收上游 `ui-ux-pro-max` 设计能力（46 文件 / 1.28MiB，`data-provenance.json` 逐条记排除理由与字体取样口径）。面板引擎重建并外置：构建工程 `tools/panel-build/`（精确 pin + lean 只留 flowchart 渲染路径）产物 8,464,218 → 2,916,204B，明文不再随库分发、改发 brotli 压缩件 545,624B，首次使用按需膨胀进 `~/.qoder-cn/cache/better-coding/` 并按 SHA256 校验复用。新增两条**机械**门禁：契约漂移检测（环节 3 末登记 `deps.yaml`、环节 6 开工前跑 `contract-drift.mjs --all`，major 不等退出码 1 阻断）与编号工作流（`vars` + `workflows/NN-name/{workflow.md,script.mjs}`，四段式 A 理解目标 / B 拼脚本 / C 执行 / D 验证，禁改用户已有 `.qoder/` 由退出码 2 兜底）。度量落进机器：分发集 **3.46MB / 235 文件**、每项目装配落盘 **125** 文件由 `tools/dump-baseline.mjs` + `checks/36` 产出。**三处不粉饰的未达成**：① 手册 ≤45KB 与"打开手册即可复制提示词"不能同时成立（内联提示词占约六成），现以 `manual_size_budget` WARNING 持续显形而非改预算数字蒙过去；② 原口径"文件数 <110"未达成（235），缺口主要来自吸收上游的 46 个数据文件，建议改判每项目装配数；③ 面板"锁版本去重"净收益为 0（第二份 mermaid 是 `@mermaid-js/layout-elk` 已发布 dist 内联副本，npm 管不到打进产物的源码），且未达 1.5–2MB（`elkjs` 1.6MB 是 ELK 布局本体，删它等于回到 dagre）。
- **升级入口**：`/harness-upgrade`（或说"升级 Harness 组件"）。
- **升级路径**：版本比对 → 按 `migration-map.json` 生成升级动作清单 → 用户确认 → 回刷项目内框架文件 → 运行 harness-verify 直至输出 `status: PASS`。
- **升级边界**：只刷新 L0 通用部分；用户已定制的内容不覆盖（存在且与 assets 版本不同则跳过）。
- **执行协议**：升级回源的完整流程见 `references/upgrade-protocol.md`。
