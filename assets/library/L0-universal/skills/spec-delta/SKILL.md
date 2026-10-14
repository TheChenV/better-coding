---
name: spec-delta
description: 增量变更管理（delta spec）。变更文件夹 docs/changes/{change-id}/（proposal + delta），delta 用 ADDED/MODIFIED/REMOVED 三区块，实施完成后 archive 合并回主 spec（docs/spec/ 为事实源）。另提供代码-规格双向收敛（converge）：代码→规格修订建议 / 规格→代码待办。补 SDD Phase 8 迭代阶段。触发方式：/spec-delta。来源：OpenSpec（propose→apply→archive + spec deltas）。
---

# 增量变更管理（Delta Spec）

## 核心理念

> **迭代阶段的规范更新只写差异，不重写全文。**
> 主 spec（docs/spec/）是事实源；每次变更是"提案 + delta"，实施验证通过后归档合并。
> 这解决了"改代码悄悄改 spec"与"spec 越写越乱"两个顽疾。
> 来源：OpenSpec — propose → apply → archive，delta 只描述变化部分。

## 触发条件

- 用户输入 `/spec-delta`
- 已上线功能需要行为变更（需求迭代）
- 实现中发现 spec 需要修正（走变更流程而非悄悄改）

## 执行步骤

### Step 1: 创建变更文件夹

```
docs/changes/{change-id}/
├── proposal.md      # 为什么改（WHY）
└── deltas/          # 改什么（WHAT，按受影响的 spec 分文件）
    └── {spec-name}.delta.md
```

change-id 用 kebab-case（如 `member-price-rework`）。

### Step 2: 编写 proposal.md

```markdown
# 变更提案: {change-id}

## Why
{1-2 句：解决什么问题，为什么是现在}

## What Changes
- {变更 1，破坏性变更标 **BREAKING**}

## Affected Specs
- {spec-name}: {ADDED / MODIFIED / REMOVED 概要}

## Impact
- 影响的代码/API/依赖/数据
```

### Step 3: 编写 delta（三区块）

每个受影响的 spec 一个 delta 文件：

```markdown
# Delta: {spec-name}

## ADDED Requirements
### REQ-{id}: {需求名}
{描述 + 验收标准}

## MODIFIED Requirements
### REQ-{id}: {需求名}
{必须包含完整更新后内容（非片段），防止归档时丢失细节}

## REMOVED Requirements
### REQ-{id}: {需求名}
- Reason: {为什么移除}
- Migration: {替代方案/迁移路径}
```

**纪律**：
- MODIFIED 必须复制完整需求块再修改，禁止只贴差异片段
- 仅新增关注点（不改既有行为）用 ADDED 而非 MODIFIED
- REMOVED 必须带 Reason + Migration

### Step 4: 用户评审

- 用户确认 proposal + deltas 后才可进入实施（apply）
- 实施阶段按 deltas 改代码；代码变更范围不得超出 deltas 声明

### Step 5: 归档合并（archive）

实施并验证通过后：
1. 将 deltas 合并回 `docs/spec/{spec-name}.md`（ADDED 追加、MODIFIED 替换、REMOVED 删除并记移除原因）
2. 变更文件夹移动到 `docs/changes/archive/{YYYY-MM-DD}-{change-id}/`
3. 主 spec 修订记录追加一行（版本/日期/变更摘要）
4. **执行 harness-continuous-sync 步骤 1-3**（唯一规范：.qoder/commands/live-refresh.md）

## 代码-规格双向收敛（converge）

> sync-detector 提示「代码变更未同步规格」时，或用户主动要求对齐代码与规格时运行。
> 收敛产出只是建议与待办，不自动改代码、不自动改 spec；确认后转入正常 delta 流程。
> 触发词：/spec-delta converge。

### 方向 a：代码→规格（实现领先）
1. 确定收敛范围：优先取近期变更面（`git status --porcelain` / 最近修改的源码文件；无 git 则由用户指定模块），回退为用户指定的模块路径
2. 对照 `docs/spec/` 下对应 SPEC 逐条检查：实现与需求/验收标准不一致（行为偏差）、规格未覆盖的新实现、已删实现对应的规格残留，各列一节（偏差项 / 未覆盖项 / 残留项）
3. 对每个偏差给出规格修订建议（MODIFIED/ADDED/REMOVED 三区块草稿），用户确认后按 Step 1-3 创建 proposal + delta 走正常流程归档，产出写入既有归档路径（docs/changes/{change-id}/ → archive）

### 方向 b：规格→代码（规格领先）
1. 扫描 `docs/spec/` 与 `docs/changes/`（未归档变更），找出规格新增/变更但代码尚未实现的项（对照实现现状与测试覆盖）
2. 输出代码待办清单：每项含对应 REQ-id、建议落点（模块/文件）、建议执行指令（/implement-feature、/run-tests 等）
3. 待办由用户挑选执行，执行走正常实施流程；完成项在下次收敛时核销，不自动执行任何代码修改

## 输出物

- docs/changes/{change-id}/（proposal + deltas）
- 归档后的主 spec 更新 + archive 记录
- converge 产出：规格修订建议（方向 a，转 delta 后走既有归档路径）/ 代码待办清单（方向 b，对话输出）

## 失败处理

| 失败场景 | 处理方式 |
|----------|----------|
| 实施中发现 delta 不足（范围扩大） | 暂停实施，回到 Step 3 补充 delta 并重新评审 |
| MODIFIED 片段不完整 | 阻断归档，补全完整需求块 |
| 归档时发现主 spec 已被其他变更更新 | 按时间序重新对齐 delta（delta 之间互不覆盖，顺序合并） |
| 用户要求跳过评审直接改 spec | 拒绝：spec 变更必须走本流程（spec-before-code 纪律） |
| converge 范围无法确定（无 git 且用户未指定模块） | 不猜测，请用户指定模块路径后再继续 |
