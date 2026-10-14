---
description: Git提交信息规范 - Conventional Commits格式，原子提交，关联Issue，subject不超50字符（生成或修改 git commit message 时触发）
trigger: model_decision
---

# Git 提交信息规范

> 来源：Conventional Commits + Superpowers finishing-a-development-branch + Harness 课程。

## 格式

```
<type>(<scope>): <subject>

[body]

[footer]
```

## Type 枚举

| Type | 含义 | 示例 |
|------|------|------|
| feat | 新功能 | feat(auth): 添加 JWT 刷新 Token |
| fix | Bug 修复 | fix(order): 修复金额计算精度丢失 |
| refactor | 重构（不改变行为） | refactor(user): 提取校验逻辑为独立函数 |
| docs | 文档变更 | docs(api): 更新用户接口文档 |
| test | 测试相关 | test(order): 补充订单创建边界测试 |
| chore | 构建/工具变更 | chore(deps): 升级 express 到 4.18.2 |
| perf | 性能优化 | perf(query): 添加索引优化列表查询 |
| style | 格式调整（不改变逻辑） | style: 统一 import 排序 |

## 强制规则

1. **subject 不超过 50 字符** — 用祈使语气（"add" 而非 "added"）
2. **每个 commit 只做一件事**（原子提交） — 不在一个 commit 中混合功能和修复
3. **body 说明"为什么"** — 而非"做了什么"（diff 已经展示了做了什么）
4. **关联 Issue** — `Closes #123` 或 `Refs #456`
5. **禁止无意义提交信息** — "update"、"fix"、"wip" 不可接受

## 原子提交原则

- 一个 commit = 一个逻辑变更
- 功能开发和重构分开的 commit
- 格式化调整单独 commit
- 依赖更新单独 commit
