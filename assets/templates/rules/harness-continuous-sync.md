---
description: Harness continuous sync rule. Triggers on PRD/ARCH/SPEC output, UI/interactive-prototype output, techstack declaration, or scaffolding file detection.
trigger: always_on
---

# Harness 持续自维护（强制执行）

## 强制检查点（事件发生 → 立即执行 3 步同步，不可跳过）

> **同步不以任何用户确认为前置（v9.8.0）**：手册提示词里「我说定稿锁定之前不要进下一步」「确认后才进环节 N」这类话只约束**下游文档产出**，不约束本规则；读成"同步也要等点头"即为漂移——交付物已落盘且该步「怎样算做完」清单全过＝已定稿，无需任何口令。定义唯一出处见 `.qoder/commands/live-refresh.md`「定稿 ≠ 同步 ≠ 进下一环节」。

1. 刚生成了 MRD、PRD、ARCH、SPEC 等文档
2. 用户在对话中声明了技术栈（如“用 FastAPI”、“用 React”）
3. 检测到 `docs/prd/`、`docs/arch/`、`docs/spec/` 下有新增文件或新增目录（`docs/spec/` 兼容两种布局：旧扁平文件 `SPEC-*.md` 与新「一功能一目录」`NNN-slug/`），或收到 sync-detector 的「代码变更未同步规格」提示（提示不阻断；收到后引导用户运行 `/spec-delta` 做代码-规格收敛，用户拒绝时仅在同步报告备注，不强行执行）
4. 检测到脚手架文件出现（package.json / requirements.txt / pom.xml / go.mod）
5. 阶段 B 装配完成后
6. 检测到 UI 设计工程 / 交互原型产出（`references/ui/`、`docs/prd/*-交互原型/`；两者阶段 A 均不预建，**目录不存在 = 尚未产出**，不假定阶段 A 已建），或环节1·步骤3 交互原型工程、环节4 UI 设计工程落盘

> **手动兜底**：用户执行 `/live-refresh`（或说"刷新项目状态"）时，无论是否有触发事件，立即完整执行 3 步同步（`sync.lastSyncSource` 记为 `manual-refresh`）。


## 3 步同步的执行细则在哪

全过程与渲染纪律**不在本规则里**：唯一规范源 =
`.qoder/commands/live-refresh.md` 的「同步执行细则」节（按需加载，不占常驻上下文）。
本规则只管：何时必须同步、同步后必须过 verify、执行边界见下。
触发事件发生但未完整同步 = 漂移；只更新部分产物不算同步。

## 执行边界

- 不中断当前任务（同步作为文档产出后的收尾步骤）；不自动装配组件；不覆盖用户手动修改（`ai` 分区与 AGENTS.md 用户段落除外按既有语义）

- **文件名与写法（v9.9.0）**：更新框架文件时路径**逐字照抄**（`AGENTS.md` 全大写；profile 里的 `agents.md` 只是键名、不是路径），且只做定点编辑，**不得"删掉再整文件重写"**——Windows 上删+建会用本次调用的大小写重命名文件（真环境已把 AGENTS.md 漂成 agents.md，而所有"能否打开"式判据全程绿灯）。
- **缺信息转 pending**：无法回填的项在 `pendingPlaceholders` 标记 `status: "pending"`、`reason: "缺X信息"` 并输出"待用户补充"清单；**禁止编造**，禁止无限期滞留
