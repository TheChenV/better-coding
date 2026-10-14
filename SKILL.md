---
name: better-coding
description: >-
  一键为项目初始化 Qoder Coding Harness 并植入持续自维护机制。封装 L0 通用 / L1 技术栈 / L2 项目三层组件库
  （Rules / Skills / Agents / Commands / Hooks）与 SDD 九环节 × 22 步骤提示词手册；阶段 A 零提问落盘
  .qoder/ 骨架与 docs/PROJECT-LIVE 指导中心，之后由 always-on 规则按 3 步流程持续同步、/harness-upgrade
  按版本台账回源升级。
  Use when starting or scaffolding a project, when .qoder configuration is missing, or when the user says
  初始化 Harness, 搭建项目框架, 装配组件, 技术栈变了, 升级 Harness 组件, 刷新项目状态,
  /harness-assemble, /harness-upgrade, /harness-next, /live-refresh.
metadata:
  version: "9.12.0"   # 人读装饰：Qoder 不解析 metadata，版本唯一事实源 = manifest.json
  author: "Harness 组件库"
  tags:
    - harness
    - spec-driven-development
    - continuous-sync
---

# better-coding — Qoder 项目 Harness 框架封装

## 概述

本 SKILL 把 Harness 组件库（L0 通用层 + L1 技术栈层 + L2 项目模板）封装为"一键安装"，并在初始化时植入**持续自维护**：

- **阶段 A（初始化）**：零信息依赖，落盘 `.qoder/` 通用骨架（含领域词汇本 + 提示词手册骨架库）+ `docs/PROJECT-LIVE.md` 指导中心（提示词手册 + 进度表 + 项目概况，3 分区）+ `docs/项目交接.md` 交接面 + `docs/PROJECT-LIVE.html` 可视化面板 + **自维护种子**
- **阶段 B（演进式装配）**：`/harness-assemble`（或说"装配组件"）时从本 SKILL assets 读取模板，装配 L1/L2 定制组件
- **持续自维护**：always-on 规则在每次会话感知项目信息变化，按 3 步流程同步框架文件

**核心设计**：模板与参考组件留在本 SKILL 的 `assets/`，装配时直接读取；`.qoder/` 只放"正在生效"的组件与自维护规则。

> **计数与版本的唯一事实源**：`manifest.json#componentCounts` + `migration-map.json#finalCounts`（口径差见 `componentCountsNote`）。两本账键名不同域（短键 ↔ `L0_*` 长键），其一致性自 v9.3.0 起由 `harness-verify` 的 `literal_single_source` 机器兑现——此前"两处必须一致"只是散文承诺。**本文件不复制任何具体数字与版本标注**（历史教训：本段曾长期停在"引自 manifest.json，v8.1.1"而库已至 8.2.1）。
> **SDD 9 环节 × 22 步骤、形状 B 八标签、用户语言禁词表**：唯一基准是 `.qoder/briefing-skeletons.md`（骨架『提示词自包含契约』）与手册的「不变式」行；机器兜底为 Check 7e/7f/7g。本文不重述步数分布与标签清单——重述即第二事实源。
> 细则按需读：[阶段 A 落盘清单](references/phase-a-checklist.md) ｜ [阶段 B 装配协议](references/phase-b-protocol.md) ｜ [升级回源协议](references/upgrade-protocol.md)

**设计原则**：P1 阶段 A 零提问起步｜P2 装配跟随信息成熟度，绝不猜项目内容｜P3 从 SKILL assets 读取｜P4 能推导则自动填并标注来源，不可推导保持"待检测"、**禁止编造**｜P5 组件清单 AI 建议 + 用户确认｜P6 增量装配只补缺失只更新变化｜P7 框架文件同步由 always-on 规则驱动，不依赖用户触发

## 指令引用规范（全文唯一表述）

引用 skill **一律写 `/` + skill 目录名**：新版解析键就是目录名，`name` 与 `trigger` 都不是解析键，frontmatter 里也不该有 `trigger`。因此"指令名 = 目录名"，无需对照表；旧版短别名（`/architect`、`/implement`、`/review`、`/tdd`、`/retro`、`/simplify`、`/handoff`、`/migrate`、`/govern-arch`、`/optimize-perf`、`/e2e-test`）**均已失效**，出现即改为目录名。`/better-coding` 只承担安装与初始化；项目命令无响应时，说自然语言意图同样有效。

## 提问优先级裁决（歧义时的唯一判定）

P1「阶段 A 不提问」与边界#4「落盘前展示清单」历史上互相拉扯（实测教训：阶段 A 曾误发确认卡，违反 P1 且对产出零收益）。v8.3.0 起固定裁决：

1. **零提问优先**：未初始化 + 用户已明示初始化时，清单为**非阻断**——同一轮输出并立即执行，不等回复（阶段 A 幂等增量，A.5 报告附回退说明）。原因：阶段 A 不依赖任何用户信息，等待不改变产出。
2. **仅四类允许发卡/追问**：① 参数与项目状态冲突（见「状态检测与入口」）；② 阶段 B 装配清单确认（P5）；③ 半自动参数（模块名/功能名）推导后的确认，以及 **git 方式**（`profile.git.mode`）的首次询问与改档确认——v9.5.0 起生效：只问一次，位置＝环节 5 开工前（主）／阶段 B 装配清单（兜底），两处都没问到就保持 `pending` 转「待你补充」，**禁止设默认值**（默认要远端可能把代码推去用户不想去的地方，默认不纳管会让环节 6 的快照前置卡死）；取值域与四条"不代做"边界只在 `manifest#gitGovernance`，本文不复述；④ **运行时门槛缺失或过旧**（见「阶段 A · 第 0 步」——此时零落盘，等待确实改变产出，故不受第 1 条约束）。四类之外的"礼仪式确认"一律禁止。**「这套可以定稿了吗 / 请确认定稿锁定」不属于这四类中的任何一类**，即属本条所禁的礼仪式确认：定稿由交付物在场 + 该步清单全过成立，拿定稿口令当 3 步同步的前置即违反 P7（定义见 `.qoder/commands/live-refresh.md`）。
3. 发卡即遵守 `ask-card-option-quality` 规则（候选值进 label、推荐项置首、description 不重复 label），不得盲选。
4. **防覆盖由脚本承担**：`phase-a-init` 复制前做 SHA256 比对，内容不同则跳过并列入 `customized_skipped`——不靠确认卡。

## 状态检测与入口（先于触发判定执行）

`/better-coding` 被触发时（含自然语言"初始化 Harness"等效）：

- 意图为初始化（或尚未初始化）→ 执行**阶段 A**（零信息依赖）
- 裸调用或意图不明 → 查 `.qoder/harness-profile.json`：不存在 → 引导执行阶段 A（用户同时声明了技术栈则 A 后衔接 B）；存在 → 告知已初始化，输出 maturity / 装配进度 + 项目命令建议（`/harness-next` 导航、`/harness-assemble` 装配、`/harness-upgrade` 升级、`/live-refresh` 兜底刷新；环节 6 用 `/integrate-modules`、环节 9 说「迭代一轮」）；**绝不报错**
- 参数与状态冲突（已初始化仍要求重新初始化）→ 先问意图，按 P6 只补缺失、不静默覆盖

## 触发与入口判定

| 入口 | 自然语言别名 | 动作 |
|------|--------------|------|
| `/better-coding` | "初始化 Harness" / "搭建项目框架" / "新建项目" | 执行阶段 A |
| `/harness-assemble` | "装配组件" / "运行装配" | 阶段 B 装配协议 |
| `/harness-upgrade` | "升级 Harness 组件" | 升级回源协议，从 SKILL assets 刷新 L0 通用部分 |
| `/harness-next` | "现在到哪一步了" / "下一步做什么" | 进度导航（命令文件 `assets/library/L0-universal/commands/harness-next.md`） |
| `/live-refresh` | "刷新项目状态" / "刷新可视化面板" | 手动兜底：完整跑一次 3 步同步，重点刷手册与面板数据块 |
| `/integrate-modules` | "开始联调" / "打通模块调用" | 环节 6 引擎（v9.0.0 起命令外壳退役，本 skill 即唯一入口）：Git 检查点 + 并行专家 + 一次一个 Mock→真实 + 契约测试循环至全绿 + 归档 |
| 手册 9·1 分诊提示词 | "加个需求" / "修个缺陷" / "迭代一轮" | 环节 9 三路分诊：新功能 `/spec-delta` / 缺陷走手册 9·3 先写复现测试 / 重构 `/code-simplification` + Prove-It 闭环 + `/retrospective` 收尾 |
| —（自然语言） | "技术栈变了" / "重新配置" | 停用不匹配组件，装配新组件 |
| —（快速模式） | 初始化时主动声明技术栈 | 阶段 A 后立即执行装配引擎 |
| —（日常对话） | 无需触发词 | 持续自维护规则自动感知并同步 |

## Qoder 平台能力映射

> 本 SKILL 专注规格质量与门禁；长任务执行、并行调度、上下文供给交给平台能力。所有平台能力以**当前环境实际可用为准**（平台事实的唯一源是 `skills/platform-profile/SKILL.md`）。

| 场景 | 推荐能力 | 分工 |
|------|----------|------|
| 完整流水线 / 中大型特性 | **连续执行（长任务）** | 本 SKILL 管规格与 3 道门禁，连续执行作长任务载体；走 SDD 全链时一次会话串完 9 环节 |
| 多模块并行实现 | **多专家并行** + 内置 `dispatching-parallel-agents` | 模块无依赖时并行派发；本库 agent 的角色映射见下表 |
| 环节 1·步骤 1 需求协同 | **多专家并行** + 可配置面板 | `/create-proposal` 由主 Agent 兼任 TL，同轮并行派 N 个专家 subagent；默认 6 专家设定由 create-proposal 编排五要素权威承载（v8.2.0 起自骨架 1·1 下沉，1·1 仅引用）；规模种类由 profile 的 `mrdPanel*` 配置；token 受限或 subagent 不可用时降级 `frontier` |
| UI 设计 / 干系人评审原型 | **单路线：内置设计能力** | 环节 4 自 v9.0.0 起两步（4·1 定稿含交互原型与视觉方向、4·2 还原核对），给风格要求即可；不接 Figma、不收参考图（原 A/B/C/D 四路径、`ui-to-code` agent、`UI-路径决策` 产物已退役） |
| 每环节执行形态 | **建议字段**（环节级「本环节建议」+ 步骤级「建议怎么用」） | 手册直接给出推荐形态；三元组口径（运行×协作×窗口）留在骨架「形态建议」；取数来源库级 `references/stage-agent-skill-map.md`（reference-only，不落盘） |
| 架构理解 / 代码库导航 | **RepoWiki** | 架构上下文优先于全库扫描；会话开始先查阅（若已生成） |
| 上下文衰减 / 长会话 | 新窗口 + `/context-handoff` | 熔断见 `references/debugging-supplement.md`：调试超 2 小时无进展必须暂停；重复行为/方案锚定/回答变泛时先交接再开新会话 |
| 与内置 `/better-harness` 分工 | 各司其职 | 本 SKILL 管装配与日常同步；`/better-harness` 管周期性 harness 好坏审计，已纳入**升级验收门禁**（升级后必跑一次，见 `references/upgrade-protocol.md`） |

**本库 agent → 并行专家角色**（专家角色由提示词内联合成，本库 agent 作角色素材；完整映射见 `references/stage-agent-skill-map.md`）。3 个随 L0 落盘，标「可选装配」的 4 个自 v9.0.0 起需阶段 B 确认——未装配时同名专家仍由主会话内联合成，能力不因此缺失：

| 本库 agent | 适用环节 | 适用场景 |
|------------|----------|----------|
| planner `可选装配` | 1 | 需求对齐 / 计划拆解（环节 1 的 TL 由主 Agent 担任） |
| architect | 2/3/4 | 架构评审 / 选型对比 / 架构治理 |
| developer `可选装配` | 5 | 功能实现 / 骨架生成 / 冲突解决 |
| ops-agent | 6/8 | 部署 / 发布 / 回滚 / 联调服务启停 |
| test-runner `可选装配` ｜ security-auditor `可选装配` | 7 | 测试生成与执行 / 覆盖率；安全审计与漏洞扫描 |
| spec-review-agent | 3/5/7 | 规格轴代码审查 |

---

## 阶段 A：初始化封装（零信息依赖）

**第 0 步 · 运行时门槛（先于任何落盘动作）**：以**退出码**探 `node -v` 且版本可解析（**禁止单用 `command -v`**——本平台实测教训：`command -v python3` 命中微软商店的应用执行别名，`-v` 通过而实跑退出码 49、零输出；同一形状可发生在任何解释器名上）。主版本 ≥ `manifest.json#runtime.nodeMinMajor` → 进入执行序第 1 步；探不到或过旧 → **不落盘**，按「提问优先级裁决」第 ④ 类发选择卡：① 用户自装 LTS（推荐）；② AI 代装便携版到用户目录——选项描述**必须写死"只救阶段 A，全部 hook 仍需重启 App 后才生效"**（App 不提供可独立调用的 node 二进制，安装器改的 PATH 也不被已运行的进程读到）；③ 暂不初始化。**本库无 no-Node 降级路径**：脚本层与全部注册 hook 均为 Node 实现，"跳过 Node 继续"不是配置开关而是换载体重做，禁止把它当降级方案说出来。执行器侧有同名门槛（`PHASE-A-COPY-FAIL:runtime-missing` / `:runtime-too-old`，另加一次 `harness.mjs selftest` 真探活）——同一事实只在脚本先判，不依赖 AI 自觉。

**执行序 5 步**（落盘清单、脚本内部 13 小步、人工核对项与报告模板全部在 [references/phase-a-checklist.md](references/phase-a-checklist.md)——本文不重述，重述即第二事实源）：

1. **落盘**：`node <SKILL 库根>/assets/templates/scripts/phase-a-init.mjs --project-root <项目根>`（库装在 `<项目>/.qoder/skills/better-coding` 时可省 `--project-root`，脚本自推并回显；用户级安装必须显式传入，不猜）。**禁止现写复制逻辑**：执行器或其资产缺失即 `PHASE-A-NO-EXECUTOR` 退出码 1，唯一正确动作是把令牌与缺失路径回显给用户问明安装位置，**不降级为手工复制**。三平台同一条 `node` 命令。**主令牌三条**：`PHASE-A-COPY-OK`(0) / `PHASE-A-COPY-FAIL:<原因>`(1) / `PHASE-A-PANEL-FAIL`(2)；另有一个**前置串** `PHASE-A-NO-EXECUTOR`（四件套缺失时在任何写入之前打印并 exit 1，不进 `die()` 原因枚举，因此不算第四条主令牌）——报告侧如何按这些可观测串选结论行见 `A.5-②`，人话说法见 `A.5-④`。执行器另会**只读探测** git 现场事实（仓库在不在、仓库根在哪、主干名、身份配没配、行尾钉在不在）写进 `profile.git`，并打一行 `[git-probe]` 日志——探测不等于决策，`mode` 未被问过就保持 `pending`。⚠️ v9.5.0 起**不再无条件在项目根写 `.gitattributes`**：只有"已找到仓库"或"用户已选建仓档"才写，其余情形交给建仓那一步（`/branch-workflow` Step 0，先钉后 init）。条件与边界见 `manifest#gitGovernance`。⚠️ **复跑/升级场景必须加 `--skip-panel`**：面板走的是全量拼接而非复制，不加会把已按 ARCH 推导出的 `SYNC_DATA` 拓扑退回模板占位（实测：手改后的面板 md5 被重建回初装态、21 个占位标记回潮；旧内容仅另存 `.bak`，不自动回灌）。**首装不加**（不加才有面板）。已知缺陷与根治方向见 `README.md` §七。
2. **首次同步**：读 `.qoder/logs/sync-scope.json`——`scriptedFirstSync` 内各项已由脚本代做，**不得重做**；`scriptedFirstSyncSkipped` 内的项脚本主动放弃（多为该节已被定制），必须由 AI 补做。AI 在本步只做 `aiDecided` 四项（词汇本 / 交接面 / 团队规范 / 经验索引——空项目上按规则多为"无"，仍要如实写"无新增"，不得静默省略）；`notDerivable` 项保持"待检测"，禁止编造。随后跑校验、出报告。**只有「阶段 A 首次同步 + 空项目」这一种组合允许步骤 1 的确定性动作由脚本代做；其余任何触发事件命中时，仍按 `live-refresh.md` 细则完整执行——`skipRender` 未覆盖的任一区必须全量重渲，`derivable` 中不在 `scriptedFirstSync` 内的项仍由 AI 填并标来源。**
3. **校验**：`node .qoder/scripts/harness-verify.mjs`（三平台同一条命令）确认 `status: PASS`。
4. **报告**（v9.6.1：**按事实生成，模板只管形状**——六槽与取数规则见 `A.5-①`、结论行真值表见 `A.5-②`，先判态再落笔）：第一条输出就是结论行，符号与措辞由「执行器打印串 + 校验 `status` + 产物 `stat`」三件事实推导，**三件没全好不得出现 `✅`**；结构树只列磁盘上真存在的条目（让虚报在结构上不可能，而不是靠纪律）；「没做成的事」逐条点名应落盘差集、非 PASS 行与未验证项（**未验证不得写成通过**），失败原因的说法一律取 `A.5-④` 人话表（18 种全覆盖，漏配由判据 `report_reason_coverage` 当场报红）。机器口径与完整计数落明细 `.qoder/logs/init-report.md`，末尾给一行指针。排版过 `A.5-⑤` 五条（树进 `text` 围栏、**不得写导语**、12 个禁用 token、不给门禁道数）。脚本 stdout 与校验行文案一字不改（K3：换形状不减披露）。
5. **全程零提问**（判定见「提问优先级裁决」）。

> **面板产物体积预期**：`docs/PROJECT-LIVE.html` 拼接后约 3MB 量级（精确值以 build-panel 输出为准），几乎全部由 Mermaid+ELK 引擎明文贡献；随库分发的是 brotli 压缩件，明文由脚本首次使用时按需膨胀进用户级缓存并按 SHA256 校验。这是"自包含零外部依赖、双击即开、离线可用"的既定取舍，非异常。
> **面板构建单实现**：由 `assets/templates/scripts/build-panel.mjs` 承担（随阶段 A 落 `.qoder/scripts/`，旧 `.ps1`/`.sh` 孪生已删）；完整拼接与 SYNC_DATA 数据块注入双模式，自验为拼接模式 V1/V3/V4/V6/V7 **+ 更新模式 V8 数据块 lint**（v9.3.0 新增，首发警告级）。调用命令与禁忌见 `references/panel-engine-rebuild.md` §2-§4，**AI 不得现写拼接/验证命令，也不得用浏览器截图代替 V8**。
> **旧 PowerShell 终端中文乱码**：以 `powershell -File` 执行 v9.0.0 前的面板脚本可能显示乱码（控制台编码 ≠ UTF-8），不影响执行与文件正确性；需正确显示先 `chcp 65001` 或用 PowerShell 7+。

## 阶段 B：演进式装配协议

读 [references/phase-b-protocol.md](references/phase-b-protocol.md) 获取完整流程：B.1 信号扫描 → B.2 建议清单 → **用户确认** → B.3 执行装配 → B.5-B.6 指令集同步 + 覆盖检查 → B.7 报告。

## 持续自维护（唯一执行规范在 `/live-refresh`）

触发事件（文档产出 / 技术栈声明 / docs 新增文件或目录或 sync-detector 漂移提示 / 脚手架出现 / 装配完成 / UI 设计工程或交互原型产出）发生后**必须立即完整执行 3 步同步**，只更新部分产物不算同步。每步操作、渲染纪律、拓扑判据、状态标注、熔断与校验细则的唯一规范源 = `.qoder/commands/live-refresh.md` 的「同步执行细则」节（按需加载，不占常驻上下文）。本文只留步骤骨架：① 更新 AGENTS.md + profile + 手册 managed-dynamic 分区 + 面板 SYNC_DATA 数据块 → ② 输出同步报告 → ③ 跑 harness-verify 并记录。**定稿不前置（v9.8.0）**：交付物落盘且该步「怎样算做完」清单全过＝已定稿，同步不等待任何用户口令；用户之后改交付物，改完即重新定稿并再跑一次同步（唯一定义见 `.qoder/commands/live-refresh.md`）。**参数单源与当轮回填（v9.10.0）**：应用清单的唯一权威源是 `profile.project.apps`（每项 `{name,type,source}`，1·1 Step 0 写入），提示词值段只准照抄应用名——分类与"这步做不做"的结论留在 MRD 那一章，复述进值段即第二事实源；权威值已在场的参数（骨架『参数绑定表』第 4 格标「机检」的那些）必须当轮绑掉，不得以下游"还没到"为由留 `{占位}`。两条各有判据（`apps_single_source` / `binding_stale`），字节层另有一条 `byte_hygiene` 守行尾与 BOM（历史教训：`\r\r\n` 会让宿主整段读不到 frontmatter，而所有走文本归一化的判据全程绿灯）。

**产文档的 skill 必须在最后一步之后追加同一套 3 步同步**（写作 `harness-continuous-sync 步骤 1-3`，不另写一份流程）：`/create-proposal`、`/create-architecture`、`/create-module-spec`、`/create-adr`、`/ui-design`、`/spec-delta`（归档后）。输出格式：

```
✅ [任务名称]完成
[原有输出...]

---
🔄 Harness 同步完成：
- AGENTS.md：[更新内容]
- harness-profile.json：[更新内容]
- harness-verify：PASS/FAIL
```

## 边界与禁止事项

1. **不覆盖用户已定制内容**：装配前比对目标文件与 assets 版本，不同则跳过（脚本内置 SHA256 保障，不靠确认卡）。🔴 **唯一例外**：`docs/PROJECT-LIVE.html` 是**拼接产物**、不在复制面内，SHA256 两态只决定"是否先另存 `.bak`"，**不决定是否重建**——复跑须带 `--skip-panel` 才谈得上保护，见「阶段 A · 执行序 1」。
2. **不假设技术栈**：无信号则装配清单留空并说明
3. **不动业务代码**：只操作 `.qoder/` 与 `docs/`
4. **落盘前展示清单**：阶段 A 非阻断（同轮展示即执行）；阶段 B 须用户确认
5. **指令引用**：见上文「指令引用规范（全文唯一表述）」，不再此重述
6. **敏感信息**：任何落盘文件不得含密钥/密码
7. **持续自维护边界**：自动同步只更新框架文件（AGENTS.md、手册与面板的再生成区），不自动装配新组件
   - **文件名与写法（v9.9.0）**：框架文件路径逐字照抄、只做定点编辑，禁止"删掉整文件重写"；承重清单以 `manifest#loadBearingFiles` 为准，漂移由 `filename_case` 判据点名。

## 完成自检（每次执行结束前）

- [ ] profile 已更新且 JSON 合法；所有预填项已标注来源；报告中无未确认的假设性内容
- [ ] 手册 3 分区标记成对完整（workflow/snapshot/footer）+ 独立交接面 `docs/项目交接.md`；workflow 区含 mermaid 进展图、进度表与提示词代码；面板含 SYNC_DATA 与引擎（无拼接占位残留、无 `DASH_DATA` 回潮；ARCH 已产出时拓扑含真实连线且 V8 绿）；组件计数与 `.qoder/` 实际一致
- [ ] 22 个步骤提示词形状 B 自包含（7e）、未命中用户语言禁词表（7f）、1·1 专家设定内联可见（7g）
- [ ] 持续自维护规则已植入（阶段 A）或正常运行（阶段 B）
- [ ] **harness-verify `status: PASS`**（含 Check 1 `{{TOKEN}}` 残留、Check 7d 机械字段同源、`literal_single_source` 跨文件字面量对账）
- [ ] **无静默覆盖**：复跑场景 `customized_skipped` 已如实输出且用户定制未被改写
