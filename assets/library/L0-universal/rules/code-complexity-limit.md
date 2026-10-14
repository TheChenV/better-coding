---
description: 代码复杂度限制 - 函数不超过50行、圈复杂度不超过10、嵌套不超过3层、文件不超过500行（新增函数/拆分大文件/重构或评审代码复杂度时触发）
trigger: model_decision
---

# 代码复杂度限制

> 来源：Addy Osmani agent-skills + Harness 课程第 2 课 — 复杂度是架构腐化的起点。

## 量化阈值（硬性约束）

| 指标 | 阈值 | 超过时行动 |
|------|------|-----------|
| 函数/方法行数 | <= 50 行 | 提取子函数 |
| 文件总行数 | <= 500 行 | 按职责拆分文件 |
| 圈复杂度 | <= 10 | 简化条件逻辑，提取函数 |
| 嵌套深度 | <= 3 层 | 用 guard clause 提前返回 |
| 函数参数个数 | <= 5 个 | 用对象参数替代 |
| 继承深度 | <= 3 层 | 用组合替代继承 |

> **口径分列（避免与 L1 互斥）**：上表的"函数/方法行数 ≤ 50"量的是**单个逻辑函数**。整个 UI 组件文件的行数上限不套这一行——React/Vue 组件按 L1 各自口径走（如 `react-component` 的 150 行），因为组件体是"声明 + 若干 handler"的容器，与逻辑函数不是同一测量对象。两者同时在场时以**各自适用的测量对象**为准，不互相覆盖。

## Guard Clause 模式（替代深层嵌套）

```
// ❌ 深层嵌套
if (user != null) {
    if (user.isActive()) {
        if (user.hasPermission()) {
            // 业务逻辑
        }
    }
}

// ✅ Guard Clause
if (user == null) return;
if (!user.isActive()) return;
if (!user.hasPermission()) return;
// 业务逻辑
```

## 检查方式

- Code Review 时检查函数长度和嵌套深度
- 使用 Lint 工具配置圈复杂度阈值
- 定期运行 `/architecture-governance` 架构治理检查
