# 环节-Agent-Skill 速查矩阵（Stage-Agent-Skill Map）

> **定位**：库级参考文档（不落盘项目 `.qoder/`），单文件速查 better-coding 9 环节全流程的完整编排关系。
> **内容依据**：方案 §二全景表 + §一统一范式 + Alex 研究 output 的编排明细。
> **使用方法**：按环节定位行，横向查阅该步骤的 agent/skill/command/模板/门禁/输入/产出/对话建议。

---

## 阅读指南

- **环节**（Stage）：01-09，对应 SDD 主链 9 个环节
- **步骤**（Step）：步骤 token `N·k`（环节内唯一递增、跨分支连续不重置）；环节 5/9 的步骤 1 为 S0 路由/分诊别名（路由步 token 5·1/9·1 不变）；环节 4 自 v9.0.0 起单路线两步（4·1 定稿、4·2 还原核对），不再有路径分叉；分支写进步骤名（环节 5 后端/前端/全栈 5·2-5·4；环节 9 三分支 9·2-9·4，9·1/9·5 恒渲染）；复数单元按批次/模块拆行（环节 3 批次 1/N 按依赖拓扑分批，默认单批单行；环节 7 模块 1/N；深度 review 可退回逐模块）
- **Agent**：执行该步骤的**专家角色名**，不是派发指令。角色素材是本库定义的 agent 文件，但自 v9.0.0 起只有 3 个随 L0 落盘到 `.qoder/agents/`（architect / ops-agent / spec-review-agent）；planner / developer / test-runner / security-auditor 为阶段 B 可选装配，未装配时同名角色由主会话按提示词内联合成，本列语义不变
- **Skill**：调用的 skill（对应 `.qoder/skills/` 下定义）
- **Command**：触发入口命令（对应 `.qoder/commands/` 或提示词手册中的可复制提示词命令前缀）
- **模板**：依赖的 spec-template（对应 `spec-templates/` 目录，manifest.specTemplates 字段）
- **L0-L3 门禁**：4 级门禁挂载（L0=前置条件/L1=step_gate/L2=phase_gate/L3=main_gate）
- **输入**：本步骤消费的 artifact 或信息
- **产出**：本步骤生成的 artifact
- **对话建议**：推荐的执行载体（三元组：运行模式×协作模式×窗口）

---

## 环节1 需求澄清

| 步骤 | Agent | Skill | Command | 模板 | L0 前置 | L1 step_gate | L2 phase_gate | L3 main_gate | 输入 | 产出 | 对话建议 |
|------|-------|-------|---------|------|---------|-------------|--------------|-------------|------|------|-----------|
| 1·1 idea-MRD | 主Agent(TL)+N专家 | create-proposal | /create-proposal | MRD-template | 用户一句话想法 | 8章节齐/>=3量化目标/>=2画像/>=5场景/模糊语0/grill-me争议全裁/名单经Q1选定/代号经Q2确认 | MRD冻结清单12项全过 | spec | 一句话想法(+可选参考资料) | docs/prd/MRD-{项目代号}.md | 多专家并行 + dispatching-parallel-agents |
| 1·2 MRD-PRD | 主 Agent | create-proposal | /create-proposal | PRD-template | MRD已冻结 | 每应用PRD含功能/模块/US/交互流程/验收；无架构与技术选型；Full-Stack应用风格要求与视觉方向已记进docs/项目交接.md | US前缀正确；ARCH前向引用齐 | spec | MRD | docs/prd/PRD-{应用}.md（每应用一份） | 智能体 |
| 1·3 MRD+PRD-交互原型工程 | developer | ui-design | /ui-design | 无 | PRD已冻结；appType=Full-Stack；风格要求已登记 | npm build+tsc+lint 0错；路由100%覆盖；异常分支可触达；非单HTML；视觉六条底线（①-⑤机检 prototype_visual_floor，⑥+界面文案走收口卡）；收口卡8问逐条有结论 | 原型与PRD Section4 1:1 | spec | MRD+PRD | docs/prd/PRD-{应用}-交互原型/ + design-system/{项目代号}/MASTER.md | IDE |

---

## 环节2 架构设计

| 步骤 | Agent | Skill | Command | 模板 | L0 前置 | L1 step_gate | L2 phase_gate | L3 main_gate | 输入 | 产出 | 对话建议 |
|------|-------|-------|---------|------|---------|-------------|--------------|-------------|------|------|-----------|
| 2·1 架构设计(C4双图+选型ADR+部署容量三合一) | architect | create-architecture+create-adr | /create-architecture | ARCH-template | PRD已就绪 | 三类NFR全量化；外部集成完整；>=3高风险决策点；SE审查5维通过；每项选型>=2候选对比；>=2篇ADR含完整替代方案；选型覆盖100%；容量对齐PRD/MRD量化指标；含回滚策略；部署方案含环境/拓扑/容量 | ARCH完整性 | spec | MRD+PRD+环境约束 | docs/arch/ARCH-{项目代号}.md+ADR-*.md(>=2篇) | 交互确认/单会话 |
| 2·2 质量验证+红队+冻结 | architect+多专家并行 | architecture-governance | /create-architecture | ARCH-template | 2·1完成 | 红队无Critical；跨应用一致性0矛盾；数据模型概要齐；模块间依赖矩阵齐备（共享DTO/错误码分段/事件归属）；冻结签批留痕 | ARCH冻结签批 | spec | ARCH全文 | 冻结版ARCH+架构验证报告 | 多专家并行(红队) |

---

## 环节3 模块设计（复数单元：模块批次）

| 步骤 | Agent | Skill | Command | 模板 | L0 前置 | L1 step_gate | L2 phase_gate | L3 main_gate | 输入 | 产出 | 对话建议 |
|------|-------|-------|---------|------|---------|-------------|--------------|-------------|------|------|-----------|
| 3·1 批次生成六件套（批次1/N…，按依赖拓扑分层） | architect | create-module-spec | /create-module-spec | SPEC-BE/FE/API/DDL/TEST/task | ARCH已冻结(含依赖矩阵) | 每API有路径/方法/请求响应/错误码/示例；异常场景四类覆盖；测试计划含正常/异常/边界；任务含优先级与依赖 | 模块设计完整性 | spec | ARCH+PRD | docs/spec/{NNN}-{slug}/六件套（逐模块目录） | 批内无依赖并行 subagent（Provider 先行）；深度 review 可逐模块 |
| 3·2 统一一致性校验(模块内+完备性+模块间三合一) | 多专家并行(开发+测试)+spec-review-agent | spec-aligned-review+architecture-governance | /create-module-spec | 无 | 3·1完成 | 一致性0偏差；测试计划覆盖所有P0/P1 US；任务含优先级与依赖；越界设计移除或下沉；两遍校验（Provider 产出即对 Consumer 占位对称预检+收尾全量）；API schema Provider=Consumer 对称 0 diff；共享 DTO/枚举单点一致；事件 Schema 生产端=消费端；错误码无撞号；跨模块引用无环 | 全局一致性 | spec | 所有模块六件套 | 统一一致性校验记录 | IDE；可派 spec-review-agent 对抗复核 |

---

## 环节4 UI设计（v9.0.0 单路线两步）

| 步骤 | Agent | Skill | Command | 模板 | L0 前置 | L1 step_gate | L2 phase_gate | L3 main_gate | 输入 | 产出 | 对话建议 |
|------|-------|-------|---------|------|---------|-------------|--------------|-------------|------|------|-----------|
| 4·1 UI 设计与定稿(G2) | architect+developer | ui-design | /ui-design | 无 | 1·3 原型就位 | 设计计划三项经确认；references/ui/ 逐页可点；SPEC-UI 六章节齐备一致；构建+类型+lint 0 错；截图证据已登记 | G2 通过记录 | design | 原型工程+PRD 第4章 | references/ui/ + docs/spec/SPEC-UI-{模块名}.md | 交互确认/单会话 |
| 4·2 还原核对与归档(G3 基准建立) | developer+spec-review-agent | ui-design | /ui-design | SPEC-UI-template | 4·1 定稿（G2 已过）且环节 5 前端有产出 | 逐页还原判定完成；差异清单经用户裁定；严重与重要视觉问题清零；构建+类型+lint 0 错 | G3 基准记录 | design | SPEC-UI + references/ui/ + 前端实现 | docs/spec/还原核对-{模块名}.md | 交互确认/单会话 |
---

## 环节5 开发实现（S0 应用类型路由，分支型）

| 步骤 | Agent | Skill | Command | 模板 | L0 前置 | L1 step_gate | L2 phase_gate | L3 main_gate | 输入 | 产出 | 对话建议 |
|------|-------|-------|---------|------|---------|-------------|--------------|-------------|------|------|-----------|
| 5·1 路由决策(S0应用类型) | planner | implement-feature | /implement-feature | 无 | tasks已就绪 | 路由判定(Backend/Full-Stack/Frontend，读设计文档不猜) | 路由正确 | implement | tasks+spec六件套 | 路由决策 | IDE |
| 5·2 后端实现(任务拆分+Coding Loop+完成处理) | developer | implement-feature | /implement-feature | 无 | 5·1=Backend/Full-Stack | 每层验证通过再进下层；Phase Gate 5级审计；连续失败>=2次标[B]请求人工介入；ALL_DONE+整体验证通过 | 编译/测试/Lint通过 | implement | SPEC-BE+API+DDL+tasks | 后端工程代码+单测+tasks.md[x] | 连续执行(中大型)；主agent编排+subagent |
| 5·3 前端实现(五阶段渐进+交付审核) | developer | implement-feature | /implement-feature | 无 | 5·1=Full-Stack/Frontend | 6-Pre-Check 6项全过；阶段1框架-阶段5优化逐阶段通过；交付审核清单全通过；visual-gate required | 编译/测试/Lint通过 | implement | SPEC-FE+UI+tasks | 前端工程代码+单测 | 连续执行(中大型)；五阶段渐进 |
| 5·4 全栈并行(前后端解耦) | developer×2 | implement-feature | /implement-feature | 无 | 5·1=全栈且前后端可解耦 | 前后端各自step_gate通过；共享契约(API schema)先冻结且0 diff | 编译/测试/Lint通过 | implement | SPEC+输出目录 | 后端+前端代码（并行产出） | 连续执行/多专家并行；dispatching-parallel-agents |

---

## 环节6 联调（复数）

| 步骤 | Agent | Skill | Command | 模板 | L0 前置 | L1 step_gate | L2 phase_gate | L3 main_gate | 输入 | 产出 | 对话建议 |
|------|-------|-------|---------|------|---------|-------------|--------------|-------------|------|------|-----------|
| 6·1 联调一次到底(预检+执行+归档收尾，v9.0.0 三步合一) | ops-agent+developer | integrate-modules+branch-workflow+retrospective | /integrate-modules | 无 | 环节5各模块编译/单测通过 | 模式确认(辐射式/并行式)；stash hash已记录；模块范围表四列+契约表就位；服务健康检查通过；端口无冲突；同轮派发不嵌套；一次一改；契约测试100%通过；契约0 diff；报告4段完整；破坏性操作清单确认后执行；incidents已写入；合并无冲突；CI通过 | 联调通过+集成报告完整 | implement | harness-profile+docs/spec/+techstack-commands.json+SPEC-API+Mock代码 | 联调分支+模块范围表+运行中服务+专家报告+真实调用代码+docs/spec/联调记录-{日期}.md+归档commit+反思报告与门禁建议+master合并 | 交互确认/连续执行；多模块并行subagent；IDE |

---

## 环节7 集成测试（复数）

| 步骤 | Agent | Skill | Command | 模板 | L0 前置 | L1 step_gate | L2 phase_gate | L3 main_gate | 输入 | 产出 | 对话建议 |
|------|-------|-------|---------|------|---------|-------------|--------------|-------------|------|------|-----------|
| 7·1 测试计划与执行合一（模块1/N…） | test-runner | run-tests | /run-tests | SPEC-TEST-template | 联调完成+代码可运行 | 章数与检查点项数以骨架 7·1 判据为准（机检 `checks/39`；本表刻意不抄数字，抄一份就漂一份）；集成场景覆盖；端到端链路；用例质量 | - | implement | PRD+SPEC-API+代码 | docs/test/spec-{业务}-测试计划.md+tests/下API+E2E脚本+执行日志 | 多专家并行 |
| 7·2 迭代审查与决策(根因+报告+五轴+GO/NO-GO四合一) | test-runner+spec-review-agent+security-auditor | run-tests+spec-aligned-review+performance-optimization | /run-tests（五轴审查主trigger /spec-aligned-review，联动内置 security-scan+/performance-optimization） | 无 | 7·1完成 | 覆盖率>=80%；契约0 diff；无Flaky；报告8章齐备；五轴(正确/可读/架构/安全/性能)Critical必修；3 persona并行不互调；回滚强制；Critical=NO-GO | 覆盖率>=80%+P0/P1=0+契约0diff | implement | 执行结果+git diff+测试报告 | 修复补丁+docs/test/spec-{业务}-测试报告.md(8章)+Ship Decision(含回滚方案) | 多专家并行续跑+单轮3 subagent fan-out |

---

## 环节8 部署上线

| 步骤 | Agent | Skill | Command | 模板 | L0 前置 | L1 step_gate | L2 phase_gate | L3 main_gate | 输入 | 产出 | 对话建议 |
|------|-------|-------|---------|------|---------|-------------|--------------|-------------|------|------|-----------|
| 8·1 上线一次到底(检查+部署+健康+记录，v9.0.0 四件合一) | ops-agent | deploy | /deploy | 无 | 7·2 Ship Decision=GO | 清单6项逐项通过(CI/迁移/环境变量/依赖服务/磁盘/回滚预案)；用户已确认；进程Running；启动日志无ERROR/FATAL；端口已监听；/health=200 healthy；/ready=200；DB+缓存连通；核心API冒烟通过；响应<SLA；上线记录字段齐备；回滚命令已记录并验证 | 上线记录完整 | release | Ship Decision+测试报告+techstack-commands.json+部署产物 | 部署前检查清单+目标环境运行服务/镜像+健康检查报告+docs/spec/上线记录-{日期}.md(含回滚命令) | IDE；破坏性二次确认 |

---

## 环节9 迭代回顾（分支）

| 步骤 | Agent | Skill | Command | 模板 | L0 前置 | L1 step_gate | L2 phase_gate | L3 main_gate | 输入 | 产出 | 对话建议 |
|------|-------|-------|---------|------|---------|-------------|--------------|-------------|------|------|-----------|
| 9·1 变更分诊(S0) | planner | - | 自然语言（手册 9·1 分诊提示词） | 无 | 用户迭代需求/运行时信息 | 分诊判定合理；未介入阶段豁免说明 | - | implement | 用户需求+运行时信息 | 分支决策+介入范围+变更影响清单 | IDE对话 |
| 9·2 新功能(spec-delta→plan→build→archive编排链) | architect+developer | spec-delta+implement-feature | /spec-delta | 无 | 9·1=新功能 | Delta标注清晰；MODIFIED完整块；Scenario 4-hashtag；Phase Gate 5级验证；archive 6步全过；连续失败>=2次标[B] | Delta标注清晰 | implement | 已有spec+需求 | docs/changes/{name}/proposal.md+specs+tasks+代码+归档commit | 交互确认或多专家并行 |
| 9·3 缺陷修复(bugfix 7步内嵌) | developer | run-tests+spec-aligned-review | 无（自然语言触发，纪律内嵌本步） | 无 | 9·1=缺陷 | Prove-It(复现FAIL-PASS-回归)；MUST NOT skip verification；无Flaky | 修复验证通过 | implement | 错误日志+代码 | 修复代码+回归报告+commit | IDE |
| 9·4 重构简化(行为不变) | developer | code-simplification | /code-simplification | 无 | 9·1=重构 | 每次简化后跑测试；失败回退；行为不变；Prove-It回环按9·3语义执行 | 全测试过+构建成功+diff干净 | implement | 已有代码 | 简化代码+测试结果 | IDE |
| 9·5 retrospective(经验沉淀) | planner | retrospective | /retrospective | 无 | 分支完成 | 产物一致性；版本号语义化；历史归档可回滚 | 经验沉淀完整 | implement | 迭代全过程 | incidents+经验条目 | 人工/IDE |

---

## 横切层：Hooks 配置（H1-H5，非编号环节）

| 步骤 | Agent | Skill | Command | 模板 | L0 前置 | L1 step_gate | L2 phase_gate | L3 main_gate | 输入 | 产出 | 对话建议 |
|------|-------|-------|---------|------|---------|-------------|--------------|-------------|------|------|-----------|
| H1 清单设计 | ops-agent | - | 对话 | 无 | 项目工程就绪 | 覆盖质量/安全/规范场景；事件选型合理 | - | 无(基础设施) | 项目+场景需求 | Hooks清单表 | IDE对话 |
| H2 编写脚本 | developer | - | 对话 | 无 | H1完成 | 实现落在 `.qoder/scripts/harness.mjs` 的 `hook <name>` 分支（不新增独立脚本文件）；正确解析 stdin JSON；exit码语义正确 | - | 无 | Hooks清单 | harness.mjs 新增 `hook <name>` 分支 | IDE+终端 |
| H3 settings绑定 | developer | - | 对话 | 无 | H2完成 | hooks字段格式正确；事件与matcher绑定准确；`command` 一律 `node .qoder/scripts/harness.mjs hook <name>`（三平台同一条命令） | - | 无 | 分支实现 | settings.json hooks配置 | IDE |
| H4 触发验证 | ops-agent | - | 对话 | 无 | H3完成 | 指定场景正常触发；结果符合预期；跨OS一致 | - | 无 | 注册完成+prompt | 触发结果(文本/截图) | IDE对话框 |
| H5 宁缺毋假 | ops-agent | - | 对话 | 无 | H4有异常 | 假阳性/假阴性清零；不稳定hook移除 | Hooks全量通过 | 无 | H4验证结果 | 修复/移除决策 | IDE+终端调试 |

---

## 快速通道（不占环节行）

| 名称 | 触发条件 | Command | Skill | 门禁 |
|------|---------|---------|-------|------|
| /quick-spec | <=5文件轻量变更 | /quick-spec | quick-spec | 免门禁全链 |
| 核心逻辑/算法逐层实现 | 金额计算/状态机/权限判断/算法类改动 | /implement-feature | implement-feature | 规格验收节律门禁(判据-实现-验证-回归-收口) |

---

## 统计摘要

| 维度 | 数量 |
|------|------|
| 环节总数 | 9（+ Hooks 横切层） |
| 步骤总数（含分支/子阶段） | 22 行速查行（骨架库权威口径：22 个步骤子块，逐环节 3/2/2/2/4/1/2/1/5） |
| Agent 角色 | 3（随 L0 落盘：architect/ops-agent/spec-review-agent）+ 4 个阶段 B 可选装配（planner/developer/test-runner/security-auditor）= 本表 Agent 列共出现 8 个专家角色名 |
| Skill 总数 | 26（L0 基础；v8.0.0 新增 ui-design/integrate-modules，v9.0.0 起 5.3 五组聚类合并净减） |
| Command 总数 | 6（v9.0.0 起 integrate/iterate 两个环节入口退役并入 skill 与手册） |
| 模板总数 | 11（spec-templates/） |
| 主门禁 | 3 道（spec/implement/release） |

> **多专家并行 = 主会话用 `Agent` 工具同轮并行派生 subagent**（subagent 无 `Agent` 不能再嵌套、无 `AskUserQuestion` 不能向用户发卡）；平台依据见 `skills/platform-profile/SKILL.md` §一。