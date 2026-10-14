---
name: harness-next
description: Harness 进度导航——判定当前所处阶段，给出下一步可直接执行的指令，并按变更规模分诊
---

# Harness 进度导航

> **兜底说明**：本命令是阶段 A 装配到 `.qoder/commands/` 的项目级命令。若尚未装配、或 `/harness-next` 无响应，或直接说"下一步做什么"（或"现在到哪一步了"），效果等同。


## 执行步骤

1. 读取 `.qoder/harness-profile.json`
   - [ ] 文件不存在 → 说明 Harness 尚未初始化，提示用户先说"初始化 Harness"（执行阶段 A），完成后再用本命令导航；本次导航到此结束

2. 判定当前阶段（依据 `maturity` 字段 + `knownDocs` + 扫描 `docs/prd/`、`docs/arch/`、`docs/spec/` 目录；其中 `docs/spec/` 兼容两种布局：旧扁平文件 `SPEC-*.md` 与新「一功能一目录」`NNN-slug/`）
   - **artifact 依赖判定（v8.0.0）**：读取 `profile.schemas.activeArtifactGraph`（默认读 better-coding skill 根下的 `assets/library/schemas/sdd-artifacts.yaml`：项目级安装 = `.qoder/skills/better-coding/assets/library/schemas/sdd-artifacts.yaml`，用户级安装 = `~/.qoder-cn/skills/better-coding/assets/library/schemas/sdd-artifacts.yaml`；两处都取第一个真实存在的），按其 artifacts 的 `requires`/`unlocks` 状态机与 4 级门禁（L0-L3）判定已就绪 artifact、当前环节/步骤与下一步门禁前置；与下方 maturity 条件表互为佐证（schemas 为 artifact 依赖权威源、条件表为快速判定），并按 9 环节 × 多步骤定位当前步骤 token（N·k）

   | 判定条件 | 当前阶段 | 下一步指令 |
   |----------|----------|------------|
   | `maturity.prd = false` | 需求分析未完成 | `/create-proposal` |
   | `maturity.prd = true` 且 `maturity.arch = false` | 架构设计未完成 | `/create-architecture`（关键决策配 `/create-adr`） |
   | `maturity.arch = true` 且 `docs/spec/` 无 SPEC 文档（扁平文件或 `NNN-slug/` 目录均未命中） | 模块设计未完成 | `/create-module-spec`（每模块一次） |
   | SPEC 已就绪且 `maturity.techstack = true` | 开发实现阶段 | `/implement-feature`（核心业务逻辑按其「逐层验收基线」实现，判据取自 SPEC） |
   | SPEC 已就绪但 `maturity.techstack = false` | 技术栈未声明（兜底） | 建议先声明技术栈/执行 `/harness-assemble`（或说"装配组件"），随后进入 `/implement-feature` |
   | `docs/test/` 已有 spec-*-测试报告.md | 测试与交付阶段 | `/run-tests` → `/deploy` |
   | 含前端且无 SPEC-UI | UI 设计待补 | `/ui-design` |

3. 按变更规模分诊（用户说明了想做的事时）
   - **≤5 个文件的改动**：建议 `/quick-spec`，免门禁全链
   - **常规功能**：建议完整环节链（`/create-module-spec` → `/implement-feature` → `/run-tests`）
   - **中大型特性**：建议走 SDD 全链（`/create-proposal` → `/create-architecture` → `/create-module-spec` → `/implement-feature`），门禁依据见 references/sdd-gates-checklist.md

4. 渲染下一步提示词与使用建议（与 `docs/PROJECT-LIVE.md` **提示词手册**同源；推导规则与渲染纪律以 `/live-refresh` 为唯一规范）
   - 以 `.qoder/briefing-skeletons.md` 的环节骨架 + 参数绑定表为准，定位当前环节区块并渲染其**整段形状 B 提示词**（这一步我要拿到 / 为什么要单独做 / 我能提供的材料 / 参考格式 / 请交付到 / 请按下面顺序做 / 红线（绝对不能做）/ 怎样算做完（请逐条打勾） 八个白话标签 + 「做完之后」收尾行；**v9.6.0 起 1·1 首行之下另渲染一行可选材料槽**（`我有参考资料：无 ←…`，仅该步、非标签段，八个标签与段序不变）），**只绑定可推导的事实参数**；事实绑定渲染（逐字复制骨架模板后逐参数替换），渲染后按骨架「参数清单」逐参数对账，无来源参数保留 `{占位}` 并标“待检测”，禁止演绎文字、禁止静默省略任何参数；**内部编排协议（迭代常量、subagent 派发、Phase 编号、profile 字段写入、内部工具与 skill 名）与骨架『用户语言禁词表』命中项不得出现在提示词里**；半自动参数（模块名/功能名）推导后需用户确认；复数单元环节（环节 3/5/7）逐模块展开并编号；若渲染结果与提示词手册不一致，顺手同步刷新（managed-dynamic 分区）
   - 按骨架库使用建议表给出本环节建议（新开窗口/连续执行/多专家并行/交互确认单会话；以当前环境实际可用为准）；遇领域词先查 `.qoder/rules/project-domain-glossary.md`
   - PROJECT-LIVE.md 不存在 → 说明尚未初始化（同步骤 1 兜底）

5. 输出格式

   ```
   📍 当前阶段：[阶段名]（依据：[maturity/knownDocs 信号]）
   ⏭️ 下一步：直接输入 [指令]，[一句话用法]
   📊 规模分诊：[小改/常规/中大型] → [对应路线]
   📋 下一步提示词（与提示词手册当前环节区块同源；下列标签段整段拷成一个 ```text 代码框输出；1·1 另有首行下材料槽一行）：
      ▶ 直接复制执行（首行 +〔可选材料槽，仅 1·1〕+ 八个标签段，代码框内均为可复制内容）：
         {命令} {目标一句}
         【仅 1·1】我有参考资料：无 ←有就把「无」换成文件路径（多个用、隔开）；保持「无」就是本次不提供
         这一步我要拿到：{用户语言一句}
         为什么要单独做：{不做的后果}
         我能提供的材料：{完整路径，顿号分隔}
         参考格式：{模板完整路径；该步无模板则省略本行}
         请交付到：{完整落盘路径 + 内容要点}
         请按下面顺序做，每步做完给我看一眼再继续：1)…
         红线（绝对不能做）：{用户语言禁令}
         怎样算做完（请逐条打勾）：- [ ] {合格线}
         做完之后：{同步} → 下一步 {N·k}（{下一条命令}）
      ▸ 补充说明：{为什么做这步；无来源参数保留 {占位} 并标待检测；内部编排协议与验收阈值由 AI 自动遵循，不重复粘贴进提示词正文}
   💡 使用建议：[模式/窗口建议，源自 .qoder/briefing-skeletons.md 使用建议表]
   ```

> 项目全景（提示词手册 / 进度表 / 项目概况）随时查看 `docs/PROJECT-LIVE.md`，接着上次干要读的交接面看 `docs/项目交接.md`；架构拓扑（节点含状态徽标：待开发/进行中/已完成/存在Bug）与技术栈详情用浏览器打开 `docs/PROJECT-LIVE.html`（仓库内文件树可见，双击即开）；**提示词手册打开即可复制任一环节提示词**，本命令输出与其保持同源；显示滞后时执行 `/live-refresh` 手动刷新。

## 核心指令速查（组件实际装配以 `.qoder/` 目录为准）

> 以 `.qoder/skills/` 实际装配为准，常用指令：

| 指令 | 用途 |
|------|------|
| `/create-proposal` | 需求分析，产出 MRD/PRD |
| `/create-architecture` | 架构设计，产出 ARCH |
| `/create-adr` | 记录关键技术决策 |
| `/create-module-spec` | 模块设计，产出 SPEC 文档族 |
| `/ui-design` | UI 设计规范（含前端时） |
| `/implement-feature` | 按 SPEC 逐层实现（判据取自 SPEC + 每层留证据） |
| `/run-tests` | 运行测试套件 |
| `/quick-spec` | 小改动快速规格（≤5 文件，免门禁全链） |
| `/spec-delta` | 需求/规格变更归档 |
| `/integrate-modules` | 环节6 联调（7 步引擎，含归档合并与破坏性操作确认） |
| 说「迭代一轮」（自然语言） | 环节9 迭代：三路分诊见手册 9·1，分支用 /spec-delta、手册 9·3（缺陷，先写复现测试）、/code-simplification |
| `/deploy` | 部署上线 |
| `/release` | 版本发布 |

## 适用场景

- 不确定当前进展到哪一步、下一步该做什么
- 新会话开始时快速恢复流程上下文
- 拿到一个新需求，需要判断走快速规格还是完整环节链
