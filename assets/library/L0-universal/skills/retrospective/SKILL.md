---
name: retrospective
description: 迭代回顾与 Harness 改进提案（Ratchet 经验回流入口）。收集本迭代 incidents/返工/验证失败 → 分类（流程/约束/工具缺口）→ 输出 Harness 改进提案清单，用户确认后落盘为 rule/skill/hook 变更。触发方式：/retrospective。来源：BMAD retrospective + Addy Osmani "每行规则可追溯一次失败"。
---

# 迭代回顾与 Harness 改进提案（Ratchet 入口）

## 核心理念

> **经验不回流，就会重复交学费。**
> 回顾的产出不是"感想"，而是可落盘的 Harness 变更提案：每次返工/失败都要回答"哪条规则/skill/hook 的缺失导致了它"。
> 纪律：每条因回顾新增的规则，必须能追溯到 incidents[] 中的一次真实失败。

## 触发条件

- 用户输入 `/retrospective`
- 迭代/Sprint 结束
- 发生重大返工、生产事故、或 /better-harness 报告输出 findings 后

## 执行步骤

### Step 1: 收集本迭代事件

来源（全部来自真实记录，禁止编造）：
1. `.qoder/harness-profile.json` 的 `incidents[]`（已有条目）
2. 本会话/近期会话中的返工、调试修复、审查 Critical/Major 发现
3. harness-verify 历史 FAIL 记录（profile.sync.lastVerify）
4. /better-harness 报告的 findings（如有）

### Step 2: 分类与根因

对每个事件分类：

| 类别 | 判定 | 回流目标 |
|------|------|---------|
| 约束缺失 | 同类错误无规则拦截 | 新增/修改 rule（causedBy 溯源） |
| 流程缺口 | 某环节无 skill 覆盖或步骤缺失 | 新增/修改 skill |
| 纪律失效 | 有规则但未被执行 | 升级为 hook（确定性机制） |
| 工具缺口 | 缺命令/MCP/脚本 | 补 command/hook/mcp |
| 偶发个案 | 无重复模式 | 仅记 Memory，不落盘规则 |

**判定阈值**：同类事件 ≥2 次 → 必须产出落盘提案；1 次 → 记 incidents 观察。

### Step 3: 输出改进提案清单

```markdown
## Harness 改进提案（Ratchet）

| # | 溯源 incident | 类别 | 提案 | 目标资产 | 状态 |
|---|--------------|------|------|---------|------|
| 1 | INC-003 | 约束缺失 | 新增规则：金额计算禁用 float | rules/java-exception.md 追加 | proposed |

每项提案包含：变更内容草案 + 预期拦截的失败模式 + 验证方式
```

### Step 4: 用户确认与落盘

- 用户逐项确认（可全部/部分/拒绝）
- 确认项执行落盘：rule 追加条款（frontmatter 或条款注释携带 `causedBy: INC-xxx`）；skill/hook 变更走对应资产更新
- incidents[] 中对应条目 disposition.status: proposed → applied

### Step 5: 低价值规则审查（反熵增）

同时输出"候选降级/删除清单"：
- 长期未被审查意见/失败模式引用的规则
- 与项目技术栈无关的 always_on 规则
- 被新规则覆盖的旧条款

用户确认后降级（always_on→model_decision）或删除，处置记入 profile.history。

### Step 6: 效果跟踪登记

对上一轮 applied 状态的约束，检查后续可比任务是否再触发同类问题：
- 未再触发 → status: verified（Outcome-supported）
- 再次触发 → 重新进入 Step 2 分析（说明约束无效或不足）

## 输出物

- Harness 改进提案清单（含溯源与验证方式）
- 用户确认后的资产变更（rule/skill/hook）
- incidents[] 状态更新（applied/verified）
- 低价值规则处置记录

## 失败处理

| 失败场景 | 处理方式 |
|----------|----------|
| 无 incidents 记录可收集 | 提示日常需在同步时登记 incidents；本次仅基于会话内可考事件 |
| 提案无法给出验证方式 | 退回重拟，禁止"加强注意"式无效提案 |
| 用户拒绝全部提案 | 尊重决策，incidents 保持 proposed 并标注"已评审-暂不采纳" |
